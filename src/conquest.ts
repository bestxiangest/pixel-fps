import * as THREE from 'three';
import { sampleHeight } from './terrain';
import type { BattleObjective, Faction } from './combatant';

export type Team = 'blue' | 'red' | 'neutral';

export interface CapturePointDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  /** 初始控制方 */
  owner: Team;
  kind: 'point' | 'hq';
}

export interface PointSnapshot {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  owner: Team;
  progress: number; // 0=全红, 100=全蓝, 50=中立争夺中
  contestable: boolean;
  contesting: boolean;
  blueCount: number;
  redCount: number;
  kind: 'point' | 'hq';
}

export interface ConquestState {
  blueTickets: number;
  redTickets: number;
  maxTickets: number;
  points: PointSnapshot[];
  breakthrough: boolean;
  winner: Team | null;
  activePrompt: {
    id: string;
    name: string;
    progress: number;
    owner: Team;
    status: 'capturing' | 'securing' | 'losing' | 'contested' | 'neutralizing';
    blueCount: number;
    redCount: number;
  } | null;
}

export interface SpawnOption {
  id: string;
  name: string;
  x: number;
  z: number;
  kind: 'point' | 'hq';
  frontline: boolean;
}

const MAX_TICKETS = 450;
/** 每控制 1 个点，对敌方每秒扣票 */
const TICKET_DRAIN_PER_POINT = 1.0;
const BASE_CAPTURE_PER_SEC = 14; // 单人每秒进度

function flagMat(color: number) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

/** 旗杆 + 旗帜标记 */
function buildFlagMarker(color: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6),
    flagMat(0x888888),
  );
  pole.position.y = 2.1;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.08),
    flagMat(color),
  );
  flag.position.set(0.75, 3.5, 0);
  flag.name = 'flagCloth';
  g.add(flag);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.7, 0.25, 8),
    flagMat(0x666666),
  );
  base.position.y = 0.12;
  g.add(base);

  // 地面圆环示意
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.1, 24),
    new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.name = 'flagRing';
  g.add(ring);

  return g;
}

function ownerColor(owner: Team): number {
  if (owner === 'blue') return 0x3388ff;
  if (owner === 'red') return 0xff4433;
  return 0x999999;
}

export class CapturePoint {
  readonly def: CapturePointDef;
  readonly mesh: THREE.Group;
  owner: Team;
  /** 0 = 红方满控, 100 = 蓝方满控 */
  progress: number;
  blueCount = 0;
  redCount = 0;
  contestable = false;
  private flagCloth: THREE.Mesh;
  private ring: THREE.Mesh;

  constructor(def: CapturePointDef, scene: THREE.Scene) {
    this.def = def;
    this.owner = def.owner;
    this.progress =
      def.owner === 'blue' ? 100 : def.owner === 'red' ? 0 : 50;

    const gy = sampleHeight(def.x, def.z);
    this.mesh = buildFlagMarker(ownerColor(this.owner));
    this.mesh.position.set(def.x, gy, def.z);
    this.mesh.userData.capturePoint = this.def.id;
    scene.add(this.mesh);

    this.flagCloth = this.mesh.getObjectByName('flagCloth') as THREE.Mesh;
    this.ring = this.mesh.getObjectByName('flagRing') as THREE.Mesh;

    // 区域地面圈（大半径半透明）
    const zone = new THREE.Mesh(
      new THREE.RingGeometry(def.radius * 0.92, def.radius, 48),
      new THREE.MeshBasicMaterial({
        color: ownerColor(this.owner),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.08;
    zone.name = 'zoneRing';
    this.mesh.add(zone);
  }

  contains(x: number, z: number): boolean {
    const dx = x - this.def.x;
    const dz = z - this.def.z;
    return dx * dx + dz * dz <= this.def.radius * this.def.radius;
  }

  refreshVisuals(time: number) {
    const c = ownerColor(this.owner);
    (this.flagCloth.material as THREE.MeshLambertMaterial).color.setHex(c);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(c);
    const zone = this.mesh.getObjectByName('zoneRing') as THREE.Mesh;
    const contesting = this.blueCount > 0 && this.redCount > 0;
    const active =
      this.contestable && (this.blueCount > 0 || this.redCount > 0);
    if (zone) {
      const zm = zone.material as THREE.MeshBasicMaterial;
      zm.color.setHex(c);
      if (contesting) {
        zm.opacity = 0.38 + Math.sin(time * 10) * 0.14;
      } else if (active) {
        zm.opacity = 0.3 + Math.sin(time * 5) * 0.1;
      } else {
        zm.opacity = this.contestable ? 0.22 : 0.12;
      }
    }
    // 旗帜轻摆；争夺时加速
    const swing = contesting ? 5 : active ? 3.2 : 2;
    this.flagCloth.rotation.y = Math.sin(time * swing + this.def.x) * (contesting ? 0.28 : 0.15);
    this.flagCloth.position.y = 3.5 + (active ? Math.sin(time * 6) * 0.06 : 0);
  }

  snapshot(contestable: boolean): PointSnapshot {
    return {
      id: this.def.id,
      name: this.def.name,
      x: this.def.x,
      z: this.def.z,
      radius: this.def.radius,
      owner: this.owner,
      progress: this.progress,
      contestable,
      contesting: this.blueCount > 0 && this.redCount > 0,
      blueCount: this.blueCount,
      redCount: this.redCount,
      kind: this.def.kind,
    };
  }
}

/** 线性推进路线 A→E + 双方 HQ（大战场拉远间距） */
export function createLinearLayout(): CapturePointDef[] {
  // 沿 -Z 方向推进：南=蓝方，北=红方；点距约 70–90m
  return [
    { id: 'A', name: 'ALPHA', x: 15, z: 140, radius: 24, owner: 'blue', kind: 'point' },
    { id: 'B', name: 'BRAVO', x: -45, z: 70, radius: 24, owner: 'neutral', kind: 'point' },
    { id: 'C', name: 'CHARLIE', x: 50, z: 0, radius: 26, owner: 'neutral', kind: 'point' },
    { id: 'D', name: 'DELTA', x: -40, z: -70, radius: 24, owner: 'neutral', kind: 'point' },
    { id: 'E', name: 'ECHO', x: 20, z: -140, radius: 24, owner: 'red', kind: 'point' },
    { id: 'HQ_BLUE', name: 'BLUE HQ', x: 0, z: 210, radius: 22, owner: 'blue', kind: 'hq' },
    { id: 'HQ_RED', name: 'RED HQ', x: 0, z: -210, radius: 22, owner: 'red', kind: 'hq' },
  ];
}

export class ConquestMode {
  readonly points: CapturePoint[] = [];
  blueTickets = MAX_TICKETS;
  redTickets = MAX_TICKETS;
  readonly maxTickets = MAX_TICKETS;
  winner: Team | null = null;
  breakthrough = false;
  private time = 0;
  private ticketAcc = 0;

  constructor(scene: THREE.Scene, layout = createLinearLayout()) {
    for (const d of layout) {
      this.points.push(new CapturePoint(d, scene));
    }
  }

  reset() {
    this.blueTickets = MAX_TICKETS;
    this.redTickets = MAX_TICKETS;
    this.winner = null;
    this.breakthrough = false;
    this.ticketAcc = 0;
    this.time = 0;
    for (const p of this.points) {
      p.owner = p.def.owner;
      p.progress =
        p.def.owner === 'blue' ? 100 : p.def.owner === 'red' ? 0 : 50;
      p.blueCount = 0;
      p.redCount = 0;
    }
  }

  get linearPoints(): CapturePoint[] {
    return this.points.filter(p => p.def.kind === 'point');
  }

  get blueHq(): CapturePoint {
    return this.points.find(p => p.def.id === 'HQ_BLUE')!;
  }

  get redHq(): CapturePoint {
    return this.points.find(p => p.def.id === 'HQ_RED')!;
  }

  /** 蓝方最前沿点索引（linear） */
  private blueFrontIndex(): number {
    const line = this.linearPoints;
    let front = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i].owner === 'blue') front = i;
    }
    return front;
  }

  private redFrontIndex(): number {
    const line = this.linearPoints;
    let front = line.length;
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i].owner === 'red') front = i;
    }
    return front;
  }

  isContestable(p: CapturePoint): boolean {
    if (this.winner) return false;

    if (p.def.kind === 'hq') {
      // 只有打穿全线后才能攻敌方 HQ
      if (p.def.id === 'HQ_RED') {
        return this.linearPoints.every(x => x.owner === 'blue');
      }
      if (p.def.id === 'HQ_BLUE') {
        return this.linearPoints.every(x => x.owner === 'red');
      }
      return false;
    }

    const line = this.linearPoints;
    const idx = line.indexOf(p);
    if (idx < 0) return false;

    const bf = this.blueFrontIndex();
    const rf = this.redFrontIndex();

    // 己方点始终可进入（防守/巩固）
    // 可争夺：紧邻己方最前沿的下一格
    const blueCan = idx === bf + 1 || (bf < 0 && idx === 0) || p.owner === 'blue';
    const redCan =
      idx === rf - 1 || (rf >= line.length && idx === line.length - 1) || p.owner === 'red';

    // 中立点：只要与任一方前沿相邻即可
    if (p.owner === 'neutral') {
      return idx === bf + 1 || idx === rf - 1;
    }
    // 敌方点：必须是前沿相邻
    if (p.owner === 'red') return idx === bf + 1;
    if (p.owner === 'blue') return idx === rf - 1;

    return blueCan || redCan;
  }

  /** 蓝方是否已打穿全线 */
  get allLineBlue(): boolean {
    return this.linearPoints.every(p => p.owner === 'blue');
  }

  get allLineRed(): boolean {
    return this.linearPoints.every(p => p.owner === 'red');
  }

  /**
   * @param units {x,z,team}[] 玩家与 AI
   */
  update(
    dt: number,
    units: { x: number; z: number; team: Team; alive: boolean }[],
  ): ConquestState {
    if (this.winner) return this.getState(null);
    this.time += dt;

    // 人数统计
    for (const p of this.points) {
      p.blueCount = 0;
      p.redCount = 0;
    }
    for (const u of units) {
      if (!u.alive || u.team === 'neutral') continue;
      for (const p of this.points) {
        if (!p.contains(u.x, u.z)) continue;
        if (!this.isContestable(p) && p.owner !== u.team) continue;
        if (u.team === 'blue') p.blueCount++;
        else p.redCount++;
      }
    }

    // 占领进度
    for (const p of this.points) {
      const cont = this.isContestable(p);
      p.contestable = cont;
      if (!cont && p.def.kind === 'point') {
        // 锁定点不转化（但可巩固己方）
        if (p.owner === 'blue' && p.blueCount > 0 && p.redCount === 0) {
          p.progress = Math.min(100, p.progress + BASE_CAPTURE_PER_SEC * 0.5 * dt);
        } else if (p.owner === 'red' && p.redCount > 0 && p.blueCount === 0) {
          p.progress = Math.max(0, p.progress - BASE_CAPTURE_PER_SEC * 0.5 * dt);
        }
        continue;
      }

      const b = p.blueCount;
      const r = p.redCount;
      if (b === 0 && r === 0) continue;

      let rate = 0;
      if (b > 0 && r === 0) {
        const mul = Math.min(3, 1 + (b - 1) * 0.5);
        rate = BASE_CAPTURE_PER_SEC * mul;
      } else if (r > 0 && b === 0) {
        const mul = Math.min(3, 1 + (r - 1) * 0.5);
        rate = -BASE_CAPTURE_PER_SEC * mul;
      } else if (b !== r) {
        // 双方都在：人数多的一方缓慢推进
        const diff = b - r;
        const mul = Math.min(2, Math.abs(diff) * 0.6);
        rate = Math.sign(diff) * BASE_CAPTURE_PER_SEC * 0.45 * mul;
      }
      // 人数相等则不动

      p.progress = THREE.MathUtils.clamp(p.progress + rate * dt, 0, 100);

      // 满控才归属；中间态为中立，便于反复争夺时进度条与票数逻辑正确
      if (p.progress >= 99.5) p.owner = 'blue';
      else if (p.progress <= 0.5) p.owner = 'red';
      else p.owner = 'neutral';
    }

    // 突破阶段
    this.breakthrough = this.allLineBlue || this.allLineRed;

    // HQ 占领判定
    if (this.redHq.owner === 'blue' && this.redHq.progress >= 100) {
      this.winner = 'blue';
    } else if (this.blueHq.owner === 'red' && this.blueHq.progress <= 0) {
      this.winner = 'red';
    }

    // 票数消耗
    this.ticketAcc += dt;
    if (this.ticketAcc >= 1) {
      const n = Math.floor(this.ticketAcc);
      this.ticketAcc -= n;
      const bluePts = this.points.filter(
        p => p.owner === 'blue' && p.def.kind === 'point',
      ).length;
      const redPts = this.points.filter(
        p => p.owner === 'red' && p.def.kind === 'point',
      ).length;
      this.redTickets = Math.max(
        0,
        this.redTickets - bluePts * TICKET_DRAIN_PER_POINT * n,
      );
      this.blueTickets = Math.max(
        0,
        this.blueTickets - redPts * TICKET_DRAIN_PER_POINT * n,
      );
      if (this.redTickets <= 0) this.winner = 'blue';
      if (this.blueTickets <= 0) this.winner = 'red';
    }

    for (const p of this.points) p.refreshVisuals(this.time);

    // 玩家提示：优先「正在争夺/转化」的点，其次己方占领点
    let prompt: ConquestState['activePrompt'] = null;
    let bestScore = -Infinity;
    for (const p of this.points) {
      if (p.blueCount <= 0) continue;
      if (!(p.contestable || p.owner === 'blue')) continue;

      const contested = p.blueCount > 0 && p.redCount > 0;
      let status: NonNullable<ConquestState['activePrompt']>['status'] =
        'capturing';
      if (contested) status = 'contested';
      else if (p.owner === 'blue' && p.redCount > 0) status = 'losing';
      else if (p.owner === 'blue' && p.progress >= 99.5) status = 'securing';
      else if (
        p.owner === 'red' ||
        (p.owner === 'neutral' && p.progress < 50) ||
        (p.owner === 'blue' && p.progress < 99.5)
      ) {
        // 含：己方点被打掉后重新拉进度、敌方/中立点推进
        status =
          p.progress > 40 && p.progress < 60 && p.owner !== 'blue'
            ? 'neutralizing'
            : p.owner === 'blue'
              ? 'capturing'
              : 'capturing';
      } else if (p.owner === 'blue') {
        status = 'securing';
      }

      // 正在变化的进度优先显示，避免多次占领后卡在 SECURING 100%
      let score = 0;
      if (contested) score += 100;
      if (status === 'capturing' || status === 'neutralizing' || status === 'losing')
        score += 80;
      if (p.contestable) score += 20;
      if (p.owner === 'blue' && p.progress < 99.5) score += 40;
      score += p.blueCount;
      // 进度离两端越远越需要看见条
      score += (50 - Math.abs(p.progress - 50)) * 0.15;

      if (score > bestScore) {
        bestScore = score;
        prompt = {
          id: p.def.id,
          name: p.def.name,
          progress: p.progress,
          owner: p.owner,
          status,
          blueCount: p.blueCount,
          redCount: p.redCount,
        };
      }
    }

    return this.getState(prompt);
  }

  getState(prompt: ConquestState['activePrompt']): ConquestState {
    return {
      blueTickets: this.blueTickets,
      redTickets: this.redTickets,
      maxTickets: this.maxTickets,
      points: this.points.map(p => p.snapshot(this.isContestable(p))),
      breakthrough: this.breakthrough,
      winner: this.winner,
      activePrompt: prompt,
    };
  }

  /** 双方固定 HQ 出生参考点 */
  getHqSpawn(faction: Faction): { x: number; z: number } {
    const hq = faction === 'player' ? this.blueHq : this.redHq;
    const direction = faction === 'player' ? 1 : -1;
    return { x: hq.def.x, z: hq.def.z + direction * 4 };
  }

  /**
   * 蓝方可部署的据点（已占领）。frontline=true 为最前沿点。
   */
  getBlueSpawnOptions(): SpawnOption[] {
    const line = this.linearPoints;
    const front = this.blueFrontIndex();
    const options: SpawnOption[] = [
      {
        id: this.blueHq.def.id,
        name: this.blueHq.def.name,
        x: this.blueHq.def.x,
        z: this.blueHq.def.z + 4,
        kind: 'hq',
        frontline: front < 0,
      },
    ];
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      if (p.owner !== 'blue') continue;
      options.push({
        id: p.def.id,
        name: p.def.name,
        x: p.def.x,
        z: p.def.z,
        kind: 'point',
        frontline: i === front,
      });
    }
    return options;
  }

  /** 在指定据点内取可站立出生坐标（带槽位偏移） */
  getSpawnInPoint(pointId: string, slot = 0): { x: number; z: number } | null {
    const p = this.points.find(pt => pt.def.id === pointId);
    if (!p) return null;
    const cols = 3;
    const row = Math.floor(slot / cols);
    const lane = (slot % cols) - 1;
    let ox = lane * 4.5 + (row % 2 === 0 ? 0 : 1.2);
    let oz = (row - 1) * 3.2;
    if (p.def.kind === 'hq') {
      const inward = p.def.id === 'HQ_BLUE' ? 1 : -1;
      oz = inward * (3 + row * 4);
    }
    // 约束在半径内
    const r = Math.max(5, p.def.radius * 0.45);
    const len = Math.hypot(ox, oz);
    if (len > r) {
      ox = (ox / len) * r;
      oz = (oz / len) * r;
    }
    return { x: p.def.x + ox, z: p.def.z + oz };
  }

  /** AI 用：某阵营所有已占领点的出生坐标（含 HQ） */
  getFactionSpawnAnchors(faction: Faction): { id: string; x: number; z: number; weight: number }[] {
    const team: Team = faction === 'player' ? 'blue' : 'red';
    const line = this.linearPoints;
    const front =
      faction === 'player' ? this.blueFrontIndex() : this.redFrontIndex();
    const anchors: { id: string; x: number; z: number; weight: number }[] = [];
    const hq = faction === 'player' ? this.blueHq : this.redHq;
    anchors.push({
      id: hq.def.id,
      x: hq.def.x,
      z: hq.def.z + (faction === 'player' ? 4 : -4),
      weight: 1,
    });
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      if (p.owner !== team) continue;
      const isFront =
        faction === 'player' ? i === front : i === front;
      anchors.push({
        id: p.def.id,
        x: p.def.x,
        z: p.def.z,
        weight: isFront ? 3.5 : 1.6,
      });
    }
    return anchors;
  }

  /**
   * AI 可选战场目标：高权重目标为下一可争夺点，低权重目标为己方前沿防守点。
   */
  getFrontlineObjectives(faction: Faction): BattleObjective[] {
    const line = this.linearPoints;
    const objectives: BattleObjective[] = [];
    let attack: CapturePoint | null = null;
    let defend: CapturePoint | null = null;

    if (faction === 'player') {
      const front = this.blueFrontIndex();
      if (this.allLineBlue) attack = this.redHq;
      else if (front + 1 >= 0 && front + 1 < line.length) attack = line[front + 1];
      defend = front >= 0 ? line[front] : this.blueHq;
    } else {
      const front = this.redFrontIndex();
      if (this.allLineRed) attack = this.blueHq;
      else if (front - 1 >= 0 && front - 1 < line.length) attack = line[front - 1];
      defend = front < line.length ? line[front] : this.redHq;
    }

    if (attack) {
      objectives.push({
        id: `ATTACK_${attack.def.id}`,
        x: attack.def.x,
        z: attack.def.z,
        radius: Math.max(6, attack.def.radius * 0.82),
        priority: 4,
      });
    }
    if (defend && defend !== attack) {
      objectives.push({
        id: `DEFEND_${defend.def.id}`,
        x: defend.def.x,
        z: defend.def.z,
        radius: Math.max(6, defend.def.radius * 0.72),
        priority: 1.25,
      });
    }
    return objectives;
  }
}
