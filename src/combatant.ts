import * as THREE from 'three';
import { AABB, HeightFn, moveWithCollision } from './collision';
import { createCamoTexture, createMetalTexture } from './textures';
import { GameAudio } from './audio';
import { Effects } from './effects';
import { NavigationGrid } from './navigation';
import type { WeaponId } from './weapons';

export type Faction = 'player' | 'enemy';
export type CombatantState =
  | 'patrol'
  | 'alert'
  | 'chase'
  | 'attack'
  | 'cover'
  | 'dead';

export interface CombatantSpawn {
  x: number;
  z: number;
  waypoints: { x: number; z: number }[];
  cover?: { x: number; z: number }[];
}

export interface BattleObjective {
  id: string;
  x: number;
  z: number;
  radius: number;
  priority: number;
}

export interface CombatantOrder {
  id: string;
  kind: 'objective' | 'intercept' | 'investigate' | 'patrol';
  x: number;
  z: number;
  radius: number;
}

export interface DamageSource {
  id: string;
  faction: Faction;
}

interface CombatTarget extends DamageSource {
  readonly pos: THREE.Vector3;
  readonly alive: boolean;
  takeDamage(
    amount: number,
    source?: DamageSource,
    fromPos?: THREE.Vector3,
  ): unknown;
}

export interface SquadmateStatus {
  id: string;
  hp: number;
  maxHp: number;
  distance: number;
  order: CombatantOrder['kind'] | 'none';
}

interface GunfireReport {
  faction: Faction;
  x: number;
  z: number;
  ttl: number;
  heat: number;
  serial: number;
}

const MAX_HP = 100;
const AI_DMG = 10;
const ENEMY_AI_DMG = 16;
const UNIT_RADIUS = 0.35;
const UNIT_HALF_H = 0.9;
const EYE_FROM_CENTER = 0.65;
const WALK_SPEED = 3.2;
const CHASE_SPEED = 4.6;
const ENEMY_CHASE_SPEED = 5.6;
const AI_JUMP_VELOCITY = 10.8;
const AI_MAX_JUMP_OBSTACLE = 2.05;
const ATTACK_RANGE = 28;
const ENEMY_ATTACK_RANGE = 34;
const SIGHT_RANGE = 45;
const ENEMY_SIGHT_RANGE = 58;
const SIGHT_FOV = Math.cos(THREE.MathUtils.degToRad(65));
const ENEMY_SIGHT_FOV = Math.cos(THREE.MathUtils.degToRad(78));
const FIRE_INTERVAL = 0.55;
const ENEMY_FIRE_INTERVAL = 0.32;
const COVER_HP = 35;
const ENEMY_COVER_HP = 52;
const CONQUEST_TEAM_SIZE = 18;
let RESPAWN_TIME = 10;

export function setCombatantRespawnTime(sec: number) {
  RESPAWN_TIME = sec;
}

/** 敌方专用难度：更高伤害 / 更快反应 / 更准射击 */
function isEnemy(faction: Faction) {
  return faction === 'enemy';
}

function mat(color: number, map?: THREE.Texture, emissiveStrength = 0.06) {
  const emissive = new THREE.Color(color).multiplyScalar(emissiveStrength);
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: 1,
    flatShading: true,
    ...(map ? { map } : {}),
  });
}

let friendlyMarkerTexture: THREE.CanvasTexture | null = null;

function getFriendlyMarkerTexture(): THREE.CanvasTexture {
  if (friendlyMarkerTexture) return friendlyMarkerTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 8, 8);
  ctx.fillStyle = '#66bbff';
  const pixels = [
    [3, 0], [4, 0],
    [2, 1], [5, 1],
    [2, 2], [5, 2],
    [1, 3], [6, 3],
    [1, 4], [6, 4],
    [0, 5], [7, 5],
    [0, 6], [1, 6], [6, 6], [7, 6],
  ];
  for (const [x, y] of pixels) ctx.fillRect(x, y, 1, 1);
  friendlyMarkerTexture = new THREE.CanvasTexture(canvas);
  friendlyMarkerTexture.magFilter = THREE.NearestFilter;
  friendlyMarkerTexture.minFilter = THREE.NearestFilter;
  friendlyMarkerTexture.generateMipmaps = false;
  friendlyMarkerTexture.colorSpace = THREE.SRGBColorSpace;
  return friendlyMarkerTexture;
}

function buildCombatantMesh(
  faction: Faction,
  teamColor: number,
): {
  root: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  hitbox: THREE.Mesh;
  headHitbox: THREE.Mesh;
  friendlyMarker: THREE.Sprite | null;
} {
  const root = new THREE.Group();
  const camo = createCamoTexture(faction === 'player' ? 'blue' : 'red');
  const bodyMat = mat(
    faction === 'player' ? 0xd8edff : 0xffded8,
    camo,
    0.08,
  );
  const teamMat = mat(teamColor, undefined, 0.14);
  const skinMat = mat(0xf0bd88, undefined, 0.08);
  const darkMat = mat(
    faction === 'player' ? 0x294c73 : 0x663434,
    undefined,
    0.08,
  );
  const gearMat = mat(
    faction === 'player' ? 0x355d82 : 0x75433b,
    undefined,
    0.1,
  );
  const metalMat = mat(0x9aa6ad, createMetalTexture(), 0.08);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), bodyMat);
  body.position.y = 1.05;
  root.add(body);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.11), teamMat);
  vest.position.set(0, 1.08, -0.2);
  root.add(vest);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.36), gearMat);
  belt.position.y = 0.73;
  root.add(belt);

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.48, 0.18),
    gearMat,
  );
  backpack.position.set(0, 1.08, 0.24);
  root.add(backpack);

  for (const x of [-0.36, 0.36]) {
    const shoulder = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.3),
      teamMat,
    );
    shoulder.position.set(x, 1.3, 0);
    root.add(shoulder);
  }

  for (const x of [-0.16, 0, 0.16]) {
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.15, 0.08),
      gearMat,
    );
    pouch.position.set(x, 0.88, -0.24);
    root.add(pouch);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
  head.position.y = 1.6;
  root.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.035), darkMat);
  visor.position.set(0, 1.63, -0.205);
  root.add(visor);

  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), bodyMat);
  helm.position.y = 1.78;
  root.add(helm);

  const helmBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.055, 0.44),
    teamMat,
  );
  helmBand.position.y = 1.73;
  root.add(helmBand);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), bodyMat);
  armL.position.set(-0.38, 1.05, 0);
  root.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), bodyMat);
  armR.position.set(0.38, 1.05, 0);
  root.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), darkMat);
  legL.position.set(-0.14, 0.35, 0);
  root.add(legL);
  const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.16, 0.08), gearMat);
  kneeL.position.set(0, -0.02, -0.13);
  legL.add(kneeL);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.32), darkMat);
  bootL.position.set(0, -0.31, -0.05);
  legL.add(bootL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), darkMat);
  legR.position.set(0.14, 0.35, 0);
  root.add(legR);
  const kneeR = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.16, 0.08), gearMat);
  kneeR.position.set(0, -0.02, -0.13);
  legR.add(kneeR);
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.32), darkMat);
  bootR.position.set(0, -0.31, -0.05);
  legR.add(bootR);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.45), metalMat);
  gun.position.set(0.38, 1.0, -0.25);
  root.add(gun);
  const gunStock = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.16, 0.18),
    gearMat,
  );
  gunStock.position.set(0.38, 1.0, 0.03);
  root.add(gunStock);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.25, 5),
    metalMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.38, 1.02, -0.55);
  root.add(barrel);

  // 身体 / 头部独立隐形受击盒，便于爆头判定
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.42, 0.52),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = 0.72;
  hitbox.userData.isCombatantHitbox = true;
  hitbox.userData.isHead = false;
  root.add(hitbox);

  const headHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.44, 0.44),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  headHitbox.position.y = 1.6;
  headHitbox.userData.isCombatantHitbox = true;
  headHitbox.userData.isHead = true;
  root.add(headHitbox);
  head.userData.isHead = true;

  let friendlyMarker: THREE.Sprite | null = null;
  if (faction === 'player') {
    friendlyMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getFriendlyMarkerTexture(),
        transparent: true,
        alphaTest: 0.4,
        depthWrite: false,
        color: 0xffffff,
      }),
    );
    friendlyMarker.position.set(0, 2.35, 0);
    friendlyMarker.scale.set(0.8, 0.8, 1);
    friendlyMarker.userData.noHit = true;
    root.add(friendlyMarker);
  }

  root.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    head,
    body,
    armL,
    armR,
    legL,
    legR,
    hitbox,
    headHitbox,
    friendlyMarker,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formationOffset(id: string, radius: number): { x: number; z: number } {
  const hash = hashString(id);
  const angle = ((hash % 360) * Math.PI) / 180;
  const ring = 0.35 + (((hash >>> 9) % 100) / 100) * 0.65;
  return {
    x: Math.cos(angle) * radius * ring,
    z: Math.sin(angle) * radius * ring,
  };
}

function segmentIntersectsAabb2D(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  obstacle: AABB,
  margin: number,
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [x1, dx, obstacle.min.x - margin, obstacle.max.x + margin],
    [z1, dz, obstacle.min.z - margin, obstacle.max.z + margin],
  ];
  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-6) {
      if (start < min || start > max) return false;
      continue;
    }
    const a = (min - start) / delta;
    const b = (max - start) / delta;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
    if (tMin > tMax) return false;
  }
  return true;
}

export function createCoverPoints(obstacles: AABB[]): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (const obstacle of obstacles) {
    const w = obstacle.max.x - obstacle.min.x;
    const d = obstacle.max.z - obstacle.min.z;
    const h = obstacle.max.y - obstacle.min.y;
    if (h < 0.65 || h > 6 || w > 18 || d > 18) continue;
    const x = (obstacle.min.x + obstacle.max.x) * 0.5;
    const z = (obstacle.min.z + obstacle.max.z) * 0.5;
    const gap = UNIT_RADIUS + 0.65;
    points.push(
      { x: obstacle.min.x - gap, z },
      { x: obstacle.max.x + gap, z },
      { x, z: obstacle.min.z - gap },
      { x, z: obstacle.max.z + gap },
    );
  }
  return points;
}

export class Combatant implements CombatTarget {
  readonly root: THREE.Group;
  readonly hitbox: THREE.Mesh;
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  state: CombatantState = 'patrol';
  active = true;

  private readonly parts: ReturnType<typeof buildCombatantMesh>;
  private spawn: CombatantSpawn;
  private waypoints: THREE.Vector3[] = [];
  private coverPts: THREE.Vector3[] = [];
  private readonly globalCoverPts: THREE.Vector3[];
  private wpIndex = 0;
  private position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private grounded = true;
  private jumpCd = 0;
  private yaw = 0;
  private targetYaw = 0;
  private walkPhase = 0;
  private fireCd = 0;
  private stateTimer = 0;
  private deadTimer = 0;
  private targetMemory = 0;
  private perceptionCd = 0;
  private target: CombatTarget | null = null;
  private targetVisible = false;
  private readonly lastKnownTargetPos = new THREE.Vector3();
  private coverTarget: THREE.Vector3 | null = null;
  private order: CombatantOrder | null = null;
  private deploymentRally: THREE.Vector3 | null = null;
  private deploymentRallyActive = false;
  private patrolTarget: THREE.Vector3 | null = null;
  private patrolTimer = 0;
  private navPath: THREE.Vector3[] = [];
  private navIndex = 0;
  private readonly navGoal = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly directMoveTarget = new THREE.Vector3();
  private repathCd = 0;
  private stuckTime = 0;
  private escapeTimer = 0;
  private escapeSide = 1;
  private directRecoveryTimer = 0;
  private stuckRecoveries = 0;
  private strategicOrderRequested = true;
  private lifeSerial = 0;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    readonly id: string,
    readonly faction: Faction,
    spawn: CombatantSpawn,
    teamColor: number,
    globalCover: { x: number; z: number }[],
    private readonly navigation: NavigationGrid,
    private readonly onDeath: (unit: Combatant, source?: DamageSource) => void,
    private readonly onShot: (unit: Combatant, position: THREE.Vector3) => void,
  ) {
    this.spawn = {
      x: spawn.x,
      z: spawn.z,
      waypoints: spawn.waypoints.map(w => ({ ...w })),
      cover: spawn.cover?.map(c => ({ ...c })),
    };
    this.parts = buildCombatantMesh(faction, teamColor);
    this.root = this.parts.root;
    this.hitbox = this.parts.hitbox;
    this.hitbox.userData.combatant = this;
    this.parts.headHitbox.userData.combatant = this;
    this.root.userData.combatant = this;
    this.globalCoverPts = globalCover.map(c => new THREE.Vector3(c.x, 0, c.z));
    this.setRoute(this.spawn);
    this.respawnNow();
  }

  get alive(): boolean {
    return this.active && this.state !== 'dead';
  }

  get pos(): THREE.Vector3 {
    return this.position;
  }

  get needsStrategicOrder(): boolean {
    return this.strategicOrderRequested || this.order === null;
  }

  get currentOrderKind(): CombatantOrder['kind'] | 'none' {
    return this.order?.kind ?? 'none';
  }

  get currentLifeSerial(): number {
    return this.lifeSerial;
  }

  updateFriendlyMarker(viewerPos: THREE.Vector3) {
    if (!this.parts.friendlyMarker) return;
    const distance = Math.hypot(
      viewerPos.x - this.position.x,
      viewerPos.z - this.position.z,
    );
    this.parts.friendlyMarker.visible = this.alive && distance >= 7;
  }

  get spottedTarget(): CombatTarget | null {
    return this.alive && this.targetVisible ? this.target : null;
  }

  receiveContactReport(target: CombatTarget) {
    if (!this.alive || !target.alive || target.faction === this.faction) return;
    if (this.targetVisible) return;
    this.target = target;
    this.lastKnownTargetPos.copy(target.pos);
    this.targetMemory = Math.max(this.targetMemory, isEnemy(this.faction) ? 5.5 : 3.5);
    if (this.state === 'patrol') {
      this.state = 'alert';
      this.stateTimer = 0;
    }
  }

  setActive(active: boolean) {
    this.active = active;
    this.root.visible = active;
    if (!active) {
      this.target = null;
      this.velocity.set(0, 0, 0);
    }
  }

  setRoute(spawn: CombatantSpawn) {
    this.spawn = {
      x: spawn.x,
      z: spawn.z,
      waypoints: spawn.waypoints.map(w => ({ ...w })),
      cover: spawn.cover?.map(c => ({ ...c })),
    };
    this.waypoints = this.spawn.waypoints.map(w => new THREE.Vector3(w.x, 0, w.z));
    if (this.waypoints.length === 0) {
      this.waypoints.push(new THREE.Vector3(spawn.x, 0, spawn.z));
    }
    const localCover = (this.spawn.cover ?? []).map(c => new THREE.Vector3(c.x, 0, c.z));
    this.coverPts = [...localCover, ...this.globalCoverPts];
    this.clearNavigation();
  }

  setRespawnPos(x: number, z: number) {
    this.spawn.x = x;
    this.spawn.z = z;
    this.waypoints = [
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x + 4, 0, z - 3),
      new THREE.Vector3(x - 3, 0, z + 2),
    ];
    this.clearNavigation();
  }

  setDeploymentRally(x: number, z: number) {
    if (!this.deploymentRally) this.deploymentRally = new THREE.Vector3();
    this.deploymentRally.set(x, 0, z);
    this.deploymentRallyActive = true;
  }

  setOrder(order: CombatantOrder | null) {
    if (!order) {
      this.order = null;
      this.patrolTarget = null;
      this.clearNavigation();
      this.strategicOrderRequested = true;
      return;
    }
    const changed = !this.order || this.order.id !== order.id || this.order.kind !== order.kind;
    this.order = { ...order };
    this.strategicOrderRequested = false;
    if (
      changed ||
      (this.patrolTarget &&
        Math.hypot(
          this.patrolTarget.x - order.x,
          this.patrolTarget.z - order.z,
        ) > order.radius * 1.8)
    ) {
      this.patrolTarget = null;
      this.patrolTimer = 0;
      this.clearNavigation();
    }
  }

  respawnNow() {
    if (!this.active) return;
    this.hp = MAX_HP;
    this.lifeSerial++;
    this.strategicOrderRequested = true;
    this.state = 'patrol';
    this.stateTimer = 0;
    this.wpIndex = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.jumpCd = 0;
    this.position.set(this.spawn.x, 0, this.spawn.z);
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.deadTimer = 0;
    this.targetMemory = 0;
    this.target = null;
    this.targetVisible = false;
    this.coverTarget = null;
    this.patrolTarget = null;
    this.patrolTimer = 0;
    this.deploymentRallyActive = this.deploymentRally !== null;
    this.perceptionCd = Math.random() * 0.2;
    this.fireCd = isEnemy(this.faction) ? 0.25 + Math.random() * 0.35 : 0.8 + Math.random();
    this.clearNavigation();
    if (this.parts.friendlyMarker) this.parts.friendlyMarker.visible = true;
  }

  private clearNavigation() {
    this.navPath = [];
    this.navIndex = 0;
    this.navGoal.set(Infinity, 0, Infinity);
    this.repathCd = 0;
    this.stuckTime = 0;
    this.escapeTimer = 0;
    this.directRecoveryTimer = 0;
    this.stuckRecoveries = 0;
  }

  takeDamage(amount: number, source?: DamageSource): boolean {
    if (!this.alive || (source && source.faction === this.faction)) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.targetMemory = isEnemy(this.faction) ? 7 : 5;
    if (this.state === 'patrol') {
      this.state = 'alert';
      this.stateTimer = 0;
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadTimer = isEnemy(this.faction) ? RESPAWN_TIME * 0.72 : RESPAWN_TIME;
      this.velocity.set(0, 0, 0);
      if (this.parts.friendlyMarker) this.parts.friendlyMarker.visible = false;
      this.onDeath(this, source);
      return true;
    }
    const coverHp = isEnemy(this.faction) ? ENEMY_COVER_HP : COVER_HP;
    if (this.hp <= coverHp) {
      this.pickCover();
      if (this.coverTarget) {
        this.state = 'cover';
        this.stateTimer = 0;
      }
    }
    return false;
  }

  private pickCover() {
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const c of this.coverPts) {
      const d = c.distanceToSquared(this.position);
      if (d > 28 * 28) continue;
      let score = d;
      if (this.order) {
        const od = Math.hypot(c.x - this.order.x, c.z - this.order.z);
        if (od > this.order.radius * 2.5) score += od * od * 0.4;
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    this.coverTarget = best?.clone() ?? null;
  }

  private eyePos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x,
      this.position.y + EYE_FROM_CENTER,
      this.position.z,
    );
  }

  private targetEyePos(target: CombatTarget, out: THREE.Vector3): THREE.Vector3 {
    return out.set(target.pos.x, target.pos.y + EYE_FROM_CENTER, target.pos.z);
  }

  private hasLOS(
    from: THREE.Vector3,
    to: THREE.Vector3,
    blockers: THREE.Object3D[],
  ): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.multiplyScalar(1 / dist);
    this.raycaster.set(from, dir);
    this.raycaster.far = Math.max(0, dist - 0.4);
    return this.raycaster.intersectObjects(blockers, true).length === 0;
  }

  private canSeeTarget(
    target: CombatTarget,
    blockers: THREE.Object3D[],
  ): boolean {
    const eye = this.eyePos(new THREE.Vector3());
    const targetEye = this.targetEyePos(target, new THREE.Vector3());
    const to = targetEye.clone().sub(eye);
    const dist = to.length();
    const sightRange = isEnemy(this.faction) ? ENEMY_SIGHT_RANGE : SIGHT_RANGE;
    const fov = isEnemy(this.faction) ? ENEMY_SIGHT_FOV : SIGHT_FOV;
    if (dist > sightRange) return false;
    to.normalize();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const waiveDist = isEnemy(this.faction) ? 14 : 8;
    if (to.dot(forward) < fov && dist > waiveDist) return false;
    return this.hasLOS(eye, targetEye, blockers);
  }

  private refreshTarget(targets: CombatTarget[], blockers: THREE.Object3D[]) {
    if (this.target && (!this.target.alive || this.target.faction === this.faction)) {
      this.target = null;
      this.targetVisible = false;
    }

    const candidates = targets
      .filter(t => t.id !== this.id && t.alive && t.faction !== this.faction)
      .map(target => ({
        target,
        distanceSq: target.pos.distanceToSquared(this.position),
      }))
      .filter(x => {
        const range = isEnemy(this.faction) ? ENEMY_SIGHT_RANGE : SIGHT_RANGE;
        return x.distanceSq <= range * range;
      })
      .sort((a, b) => {
        const aSticky = a.target === this.target ? -140 : 0;
        const bSticky = b.target === this.target ? -140 : 0;
        const aPlayer = this.faction === 'enemy' && a.target.id === 'player' ? -90 : 0;
        const bPlayer = this.faction === 'enemy' && b.target.id === 'player' ? -90 : 0;
        return a.distanceSq + aSticky + aPlayer - (b.distanceSq + bSticky + bPlayer);
      });

    this.targetVisible = false;
    for (let i = 0; i < Math.min(5, candidates.length); i++) {
      const candidate = candidates[i].target;
      if (!this.canSeeTarget(candidate, blockers)) continue;
      this.target = candidate;
      this.targetVisible = true;
      this.targetMemory = 5;
      this.lastKnownTargetPos.copy(candidate.pos);
      return;
    }

    if (this.target && this.canSeeTarget(this.target, blockers)) {
      this.targetVisible = true;
      this.targetMemory = 5;
      this.lastKnownTargetPos.copy(this.target.pos);
    }
  }

  private navigationTarget(tx: number, tz: number, dt: number): THREE.Vector3 {
    this.repathCd = Math.max(0, this.repathCd - dt);
    const targetDistance = Math.hypot(tx - this.position.x, tz - this.position.z);
    const direct =
      targetDistance < 3.5 ||
      this.navigation.hasLineOfTravel(this.position.x, this.position.z, tx, tz);
    if (direct) {
      this.navPath = [];
      this.navIndex = 0;
      this.navGoal.set(tx, 0, tz);
      return this.navGoal;
    }

    const goalMoved =
      Math.hypot(this.navGoal.x - tx, this.navGoal.z - tz) >
      (isEnemy(this.faction) ? 2.2 : 4);
    if (goalMoved || this.repathCd <= 0 || this.navPath.length === 0) {
      this.navGoal.set(tx, 0, tz);
      this.navPath = this.navigation
        .findPath(this.position.x, this.position.z, tx, tz)
        .map(point => new THREE.Vector3(point.x, 0, point.z));
      this.navIndex = 0;
      this.repathCd = isEnemy(this.faction)
        ? 0.45 + (hashString(this.id) % 20) / 100
        : 1.15 + (hashString(this.id) % 35) / 100;
    }

    while (this.navIndex < this.navPath.length - 1) {
      const point = this.navPath[this.navIndex];
      if (Math.hypot(point.x - this.position.x, point.z - this.position.z) > 1.15) break;
      this.navIndex++;
    }
    return this.navPath[this.navIndex] ?? this.navGoal;
  }

  private shouldJump(
    dirX: number,
    dirZ: number,
    speed: number,
    obstacles: AABB[],
    getHeight: HeightFn,
  ): boolean {
    if (!this.grounded || this.jumpCd > 0) return false;
    const ground = getHeight(this.position.x, this.position.z);
    const feet = this.position.y - UNIT_HALF_H;
    const probeDistance = UNIT_RADIUS + 0.55 + speed * 0.12;
    const probeX = this.position.x + dirX * probeDistance;
    const probeZ = this.position.z + dirZ * probeDistance;

    for (const obstacle of obstacles) {
      const obstacleHeight = obstacle.max.y - ground;
      if (obstacleHeight < 0.35 || obstacleHeight > AI_MAX_JUMP_OBSTACLE) continue;
      const margin = UNIT_RADIUS * 0.75;
      const inFront =
        probeX >= obstacle.min.x - margin &&
        probeX <= obstacle.max.x + margin &&
        probeZ >= obstacle.min.z - margin &&
        probeZ <= obstacle.max.z + margin;
      const verticallyRelevant =
        feet <= obstacle.max.y + 0.1 &&
        this.position.y + UNIT_HALF_H >= obstacle.min.y;
      if (inFront && verticallyRelevant) return true;
    }
    return false;
  }

  private directRouteUsesOnlyJumpableObstacles(
    tx: number,
    tz: number,
    obstacles: AABB[],
    getHeight: HeightFn,
  ): boolean {
    let intersectsObstacle = false;
    for (const obstacle of obstacles) {
      if (
        !segmentIntersectsAabb2D(
          this.position.x,
          this.position.z,
          tx,
          tz,
          obstacle,
          UNIT_RADIUS + 0.18,
        )
      ) {
        continue;
      }
      intersectsObstacle = true;
      const centerX = (obstacle.min.x + obstacle.max.x) * 0.5;
      const centerZ = (obstacle.min.z + obstacle.max.z) * 0.5;
      const obstacleHeight = obstacle.max.y - getHeight(centerX, centerZ);
      if (obstacleHeight > AI_MAX_JUMP_OBSTACLE || obstacleHeight < 0.25) {
        return false;
      }
    }
    return intersectsObstacle;
  }

  private holdPosition(
    dt: number,
    obstacles: AABB[],
    getHeight: HeightFn,
  ) {
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.velocity.y += -28 * dt;
    const result = moveWithCollision(
      this.position,
      this.velocity,
      dt,
      UNIT_RADIUS,
      UNIT_HALF_H,
      obstacles,
      getHeight,
    );
    this.position.copy(result.position);
    this.grounded = result.grounded;
  }

  private moveToward(
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    obstacles: AABB[],
    getHeight: HeightFn,
    friendlies: CombatTarget[],
    forceDirect = false,
  ) {
    this.directRecoveryTimer = Math.max(0, this.directRecoveryTimer - dt);
    const dist = Math.hypot(tx - this.position.x, tz - this.position.z);
    if (dist < 0.35) {
      this.holdPosition(dt, obstacles, getHeight);
      return dist;
    }

    const terrainY = getHeight(this.position.x, this.position.z);
    const elevated = this.position.y - UNIT_HALF_H > terrainY + 0.3;
    const jumpShortcut = this.directRouteUsesOnlyJumpableObstacles(
      tx,
      tz,
      obstacles,
      getHeight,
    );
    const navTarget = forceDirect || this.directRecoveryTimer > 0 || !this.grounded || elevated || jumpShortcut
      ? this.directMoveTarget.set(tx, 0, tz)
      : this.navigationTarget(tx, tz, dt);
    let dx = navTarget.x - this.position.x;
    let dz = navTarget.z - this.position.z;
    const navDistance = Math.hypot(dx, dz) || 1;

    let dirX = dx / navDistance;
    let dirZ = dz / navDistance;
    let avoidX = 0;
    let avoidZ = 0;
    for (const friendly of friendlies) {
      if (friendly.id === this.id || !friendly.alive || friendly.faction !== this.faction) continue;
      const fx = friendly.pos.x - this.position.x;
      const fz = friendly.pos.z - this.position.z;
      const fd = Math.hypot(fx, fz);
      if (fd < 0.01 || fd > 2.4) continue;
      const ahead = (fx * dirX + fz * dirZ) / fd;
      if (ahead < 0.15) continue;
      const cross = dirX * fz - dirZ * fx;
      const fallbackSide = (hashString(this.id) & 1) === 0 ? 1 : -1;
      const side = Math.abs(cross) > 0.08 ? (cross > 0 ? -1 : 1) : fallbackSide;
      const strength = (1 - fd / 2.4) * ahead;
      avoidX += -dirZ * side * strength;
      avoidZ += dirX * side * strength;
    }
    dirX += THREE.MathUtils.clamp(avoidX, -0.75, 0.75);
    dirZ += THREE.MathUtils.clamp(avoidZ, -0.75, 0.75);
    if (this.escapeTimer > 0) {
      this.escapeTimer = Math.max(0, this.escapeTimer - dt);
      const escapeX = -dirZ * this.escapeSide;
      const escapeZ = dirX * this.escapeSide;
      dirX += escapeX * 0.95;
      dirZ += escapeZ * 0.65;
    }
    const adjustedLength = Math.hypot(dirX, dirZ) || 1;
    dirX /= adjustedLength;
    dirZ /= adjustedLength;
    dx = dirX;
    dz = dirZ;

    this.targetYaw = Math.atan2(-dx, -dz);
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(dyaw, -3 * dt, 3 * dt);

    this.velocity.x = dx * speed;
    this.velocity.z = dz * speed;
    if (this.shouldJump(dx, dz, speed, obstacles, getHeight)) {
      this.velocity.y = AI_JUMP_VELOCITY;
      this.grounded = false;
      this.jumpCd = 1.1;
    } else {
      this.velocity.y += -28 * dt;
    }
    const previousX = this.position.x;
    const previousZ = this.position.z;
    const result = moveWithCollision(
      this.position,
      this.velocity,
      dt,
      UNIT_RADIUS,
      UNIT_HALF_H,
      obstacles,
      getHeight,
    );
    this.position.copy(result.position);
    this.grounded = result.grounded;
    const moved = Math.hypot(
      this.position.x - previousX,
      this.position.z - previousZ,
    );
    if (dist > 1.5 && moved < speed * dt * 0.16) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.65) {
        this.navPath = [];
        this.repathCd = 0;
        this.escapeSide *= -1;
        this.escapeTimer = 0.75;
        this.directRecoveryTimer = 2.2;
        this.stuckTime = 0;
        this.stuckRecoveries++;
        if (this.stuckRecoveries >= 3) {
          this.strategicOrderRequested = true;
          this.stuckRecoveries = 0;
        }
      }
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
      if (moved > speed * dt * 0.55) this.stuckRecoveries = 0;
    }
    this.walkPhase += dt * speed * 2.2;
    return dist;
  }

  private faceTarget(target: CombatTarget, dt: number) {
    const dx = target.pos.x - this.position.x;
    const dz = target.pos.z - this.position.z;
    this.targetYaw = Math.atan2(-dx, -dz);
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(
      dyaw,
      -(isEnemy(this.faction) ? 7 : 4) * dt,
      (isEnemy(this.faction) ? 7 : 4) * dt,
    );
  }

  private tryShoot(
    target: CombatTarget,
    blockers: THREE.Object3D[],
    effects: Effects,
    audio: GameAudio,
  ) {
    if (this.fireCd > 0 || target.faction === this.faction || !target.alive) return;
    const hard = isEnemy(this.faction);
    this.fireCd =
      (hard ? ENEMY_FIRE_INTERVAL : FIRE_INTERVAL) +
      Math.random() * (hard ? 0.1 : 0.25);

    const eye = this.eyePos(new THREE.Vector3());
    const targetEye = this.targetEyePos(target, new THREE.Vector3());
    const dir = targetEye.clone().sub(eye).normalize();
    // 敌方散布更小、更准
    const sx = hard ? 0.055 : 0.12;
    const sy = hard ? 0.035 : 0.08;
    dir.x += (Math.random() - 0.5) * sx;
    dir.y += (Math.random() - 0.5) * sy;
    dir.z += (Math.random() - 0.5) * sx;
    dir.normalize();
    audio.playEnemyShot();
    this.onShot(this, eye);

    const attackRange = hard ? ENEMY_ATTACK_RANGE : ATTACK_RANGE;
    this.raycaster.set(eye, dir);
    this.raycaster.far = attackRange + 5;
    const hits = this.raycaster.intersectObjects(blockers, true);
    const targetDistance = eye.distanceTo(targetEye);
    const toTarget = targetEye.clone().sub(eye).normalize();
    const aimDot = dir.dot(toTarget);
    const blocked = hits.length > 0 && hits[0].distance < targetDistance - 0.6;

    const aimGate = hard ? 0.92 : 0.96;
    const hitChance = hard ? 0.78 + aimDot * 0.18 : 0.55 + aimDot * 0.2;
    const dmg = hard ? ENEMY_AI_DMG : AI_DMG;

    if (!blocked && aimDot > aimGate && targetDistance < attackRange) {
      if (Math.random() < hitChance) {
        target.takeDamage(dmg, this, eye);
        effects.spawnHit(targetEye, dir.clone().negate(), 0xaa4444);
        effects.spawnTracer(eye, targetEye, hard ? 0xff6644 : 0xffcc66);
        audio.playHit();
      } else {
        const missEnd = eye.clone().addScaledVector(dir, Math.min(attackRange, targetDistance + 4));
        effects.spawnTracer(eye, missEnd, hard ? 0xff6644 : 0xffcc66);
      }
    } else if (hits.length > 0) {
      const hit = hits[0];
      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : dir.clone().negate();
      effects.spawnHit(hit.point, normal.normalize(), 0x888888);
      effects.spawnTracer(eye, hit.point, hard ? 0xff6644 : 0xffcc66);
    } else {
      const missEnd = eye.clone().addScaledVector(dir, attackRange);
      effects.spawnTracer(eye, missEnd, hard ? 0xff6644 : 0xffcc66);
    }
  }

  private pickPatrolTarget() {
    if (!this.order) {
      this.patrolTarget = this.waypoints[this.wpIndex % this.waypoints.length].clone();
      return;
    }

    const nearCover = this.coverPts
      .filter(c => Math.hypot(c.x - this.order!.x, c.z - this.order!.z) <= this.order!.radius)
      .sort(
        (a, b) =>
          a.distanceToSquared(this.position) - b.distanceToSquared(this.position),
      )
      .slice(0, 6);
    if (nearCover.length > 0 && Math.random() < 0.55) {
      this.patrolTarget = nearCover[Math.floor(Math.random() * nearCover.length)].clone();
    } else {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * this.order.radius;
      this.patrolTarget = new THREE.Vector3(
        this.order.x + Math.cos(angle) * radius,
        0,
        this.order.z + Math.sin(angle) * radius,
      );
    }
    this.patrolTimer = 4 + Math.random() * 5;
  }

  private updatePatrol(
    dt: number,
    obstacles: AABB[],
    getHeight: HeightFn,
    friendlies: CombatTarget[],
  ) {
    if (this.deploymentRallyActive && this.deploymentRally) {
      const rallyDistance = Math.hypot(
        this.position.x - this.deploymentRally.x,
        this.position.z - this.deploymentRally.z,
      );
      if (rallyDistance > 2.4) {
        this.moveToward(
          this.deploymentRally.x,
          this.deploymentRally.z,
          WALK_SPEED * 1.28,
          dt,
          obstacles,
          getHeight,
          friendlies,
          true,
        );
        return;
      }
      this.deploymentRallyActive = false;
      this.clearNavigation();
    }

    if (this.order) {
      const anchorDistance = Math.hypot(
        this.position.x - this.order.x,
        this.position.z - this.order.z,
      );
      if (anchorDistance > this.order.radius * 1.15) {
        this.moveToward(
          this.order.x,
          this.order.z,
          WALK_SPEED * (
            this.order.kind === 'objective' || this.order.kind === 'investigate'
              ? 1.2
              : 1.08
          ),
          dt,
          obstacles,
          getHeight,
          friendlies,
        );
        return;
      }
    }

    this.patrolTimer -= dt;
    if (!this.patrolTarget || this.patrolTimer <= 0) this.pickPatrolTarget();
    const target = this.patrolTarget!;
    const distance = this.moveToward(
      target.x,
      target.z,
      WALK_SPEED,
      dt,
      obstacles,
      getHeight,
      friendlies,
    );
    if (distance < 0.55) {
      if (!this.order) this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      this.patrolTarget = null;
    }
  }

  private animateBody(moving: boolean, dt: number) {
    if (this.state === 'dead') {
      this.root.rotation.x = THREE.MathUtils.lerp(
        this.root.rotation.x,
        Math.PI / 2,
        1 - Math.exp(-6 * dt),
      );
      return;
    }
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, 0, 8 * dt);
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    if (!this.grounded) {
      this.parts.legL.rotation.x = -0.45;
      this.parts.legR.rotation.x = -0.45;
      this.parts.armL.rotation.x = 0.25;
      this.parts.armR.rotation.x = 0.25;
    }
    if (this.state === 'attack' || this.state === 'cover') {
      this.parts.armR.rotation.x = -0.9;
      this.parts.armL.rotation.x = -0.5;
    }
  }

  update(
    dt: number,
    targets: CombatTarget[],
    obstacles: AABB[],
    getHeight: HeightFn,
    blockers: THREE.Object3D[],
    effects: Effects,
    audio: GameAudio,
  ) {
    if (!this.active) return;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.jumpCd > 0) this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.stateTimer += dt;

    if (this.state === 'dead') {
      this.deadTimer -= dt;
      this.animateBody(false, dt);
      this.root.position.set(
        this.position.x,
        getHeight(this.position.x, this.position.z),
        this.position.z,
      );
      this.root.rotation.y = this.yaw;
      if (this.deadTimer <= 0) this.respawnNow();
      return;
    }

    this.perceptionCd -= dt;
    if (this.perceptionCd <= 0) {
      this.perceptionCd = isEnemy(this.faction)
        ? 0.07 + Math.random() * 0.06
        : 0.14 + Math.random() * 0.12;
      this.refreshTarget(targets, blockers);
    }
    if (!this.targetVisible) this.targetMemory = Math.max(0, this.targetMemory - dt);

    const hard = isEnemy(this.faction);
    const attackRange = hard ? ENEMY_ATTACK_RANGE : ATTACK_RANGE;
    const coverHp = hard ? ENEMY_COVER_HP : COVER_HP;
    const chaseSpeed = hard ? ENEMY_CHASE_SPEED : CHASE_SPEED;

    const target = this.target;
    const distance = target
      ? Math.hypot(target.pos.x - this.position.x, target.pos.z - this.position.z)
      : Infinity;
    const orderDistance = this.order
      ? Math.hypot(
          this.position.x - this.order.x,
          this.position.z - this.order.z,
        )
      : 0;
    const mustAdvanceToObjective =
      this.order?.kind === 'objective' &&
      orderDistance > this.order.radius * 1.25;
    // 敌方更愿意在推进途中交火，不会轻易忽略玩家
    const fightWhileAdvance = hard ? 22 : 14;
    const objectiveMarchLocked =
      mustAdvanceToObjective &&
      (!target || !this.targetVisible || distance > fightWhileAdvance);

    if (objectiveMarchLocked) {
      this.target = null;
      this.targetVisible = false;
      this.coverTarget = null;
      this.state = 'patrol';
      this.updatePatrol(dt, obstacles, getHeight, targets);
    } else if (this.state === 'patrol') {
      if (
        target &&
        this.targetVisible &&
        this.grounded &&
        (!this.deploymentRallyActive || distance < (hard ? 18 : 12)) &&
        (!mustAdvanceToObjective || distance < (hard ? 24 : 16))
      ) {
        this.state = 'alert';
        this.stateTimer = 0;
      } else {
        this.updatePatrol(dt, obstacles, getHeight, targets);
      }
    } else if (this.state === 'alert') {
      if (target) this.faceTarget(target, dt);
      this.holdPosition(dt, obstacles, getHeight);
      if (!target && this.stateTimer > 0.65) {
        this.state = 'patrol';
      } else if (
        target &&
        this.stateTimer >
          (hard ? 0.08 : 0.25) + (hashString(this.id) % (hard ? 10 : 25)) / 100
      ) {
        this.state =
          this.targetVisible && distance < attackRange ? 'attack' : 'chase';
        this.stateTimer = 0;
      }
    } else if (this.state === 'chase') {
      if (!target || !target.alive) {
        this.target = null;
        this.state = 'patrol';
      } else if (
        mustAdvanceToObjective &&
        (!this.targetVisible || distance > (hard ? 26 : 18))
      ) {
        this.target = null;
        this.state = 'patrol';
      } else if (this.hp <= coverHp) {
        this.pickCover();
        if (this.coverTarget) this.state = 'cover';
      } else if (this.grounded && this.targetVisible && distance < attackRange) {
        this.state = 'attack';
        this.stateTimer = 0;
      } else if (!this.targetVisible && this.targetMemory <= 0) {
        this.target = null;
        this.state = 'patrol';
      } else {
        this.moveToward(
          this.targetVisible ? target.pos.x : this.lastKnownTargetPos.x,
          this.targetVisible ? target.pos.z : this.lastKnownTargetPos.z,
          chaseSpeed,
          dt,
          obstacles,
          getHeight,
          targets,
        );
      }
    } else if (this.state === 'attack') {
      if (!target || !target.alive || (!this.targetVisible && this.targetMemory <= 0)) {
        this.target = null;
        this.state = 'patrol';
      } else if (mustAdvanceToObjective && distance > (hard ? 28 : 20)) {
        this.target = null;
        this.state = 'patrol';
      } else if (this.hp <= coverHp) {
        this.pickCover();
        if (this.coverTarget) this.state = 'cover';
      } else if (distance > attackRange * 1.15) {
        this.state = 'chase';
      } else {
        this.faceTarget(target, dt);
        // 敌方更倾向压近射击
        const preferredRange = hard
          ? 10 + (hashString(this.id) % 6)
          : 14 + (hashString(this.id) % 8);
        const side = (hashString(this.id) & 1) === 0 ? 1 : -1;
        const toTargetX = (target.pos.x - this.position.x) / Math.max(0.1, distance);
        const toTargetZ = (target.pos.z - this.position.z) / Math.max(0.1, distance);
        const pressSpeed = hard ? WALK_SPEED * 0.92 : WALK_SPEED * 0.72;
        if (distance > preferredRange + 3) {
          this.moveToward(
            target.pos.x,
            target.pos.z,
            pressSpeed,
            dt,
            obstacles,
            getHeight,
            targets,
          );
        } else if (distance < preferredRange - 4) {
          this.moveToward(
            this.position.x - toTargetX * 3 - toTargetZ * side * 1.5,
            this.position.z - toTargetZ * 3 + toTargetX * side * 1.5,
            WALK_SPEED * 0.68,
            dt,
            obstacles,
            getHeight,
            targets,
          );
        } else if (Math.sin(this.stateTimer * 1.15 + (hashString(this.id) % 10)) > -0.2) {
          this.moveToward(
            this.position.x - toTargetZ * side * 2.4,
            this.position.z + toTargetX * side * 2.4,
            WALK_SPEED * (hard ? 0.62 : 0.48),
            dt,
            obstacles,
            getHeight,
            targets,
          );
        } else {
          this.holdPosition(dt, obstacles, getHeight);
        }
        if (this.targetVisible) this.tryShoot(target, blockers, effects, audio);
      }
    } else if (this.state === 'cover') {
      if (!target || !target.alive) {
        this.target = null;
        this.state = 'patrol';
      } else if (!this.coverTarget) {
        this.state = 'chase';
      } else {
        const coverDistance = this.moveToward(
          this.coverTarget.x,
          this.coverTarget.z,
          chaseSpeed,
          dt,
          obstacles,
          getHeight,
          targets,
        );
        if (coverDistance < 0.8) {
          this.faceTarget(target, dt);
          this.holdPosition(dt, obstacles, getHeight);
          // 敌方掩体后开火更勤
          const peekGate = hard ? -0.15 : 0.3;
          if (this.targetVisible && Math.sin(this.stateTimer * (hard ? 4.2 : 3)) > peekGate) {
            this.tryShoot(target, blockers, effects, audio);
          }
        }
      }
    }

    const groundY = getHeight(this.position.x, this.position.z);
    if (this.position.y - UNIT_HALF_H < groundY - 0.01) {
      this.position.y = groundY + UNIT_HALF_H;
    }
    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.4;
    this.animateBody(
      moving || this.state === 'chase' || this.state === 'patrol',
      dt,
    );
    this.root.position.set(
      this.position.x,
      this.position.y - UNIT_HALF_H,
      this.position.z,
    );
    this.root.rotation.y = this.yaw;
  }
}

export type HitResult = 'none' | 'friendly' | 'hit' | 'kill';

export class CombatantManager {
  readonly units: Combatant[] = [];
  readonly root = new THREE.Group();
  private kills = 0;
  private onKill?: () => void;
  private onEnemyDeath?: (position: THREE.Vector3, source?: DamageSource) => void;
  private conquestActive = false;
  private orderSignature = '';
  private battleTime = 0;
  private gunfireSerial = 0;
  private readonly gunfireReports: GunfireReport[] = [];
  private readonly nextOrderRefresh = new Map<string, number>();
  private latestBlueObjectives: BattleObjective[] = [];
  private latestRedObjectives: BattleObjective[] = [];
  private readonly latestPlayerPos = new THREE.Vector3();
  /** 每个死亡周期只分配一次复活点 */
  private readonly respawnAssignedLife = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    private readonly defaultEnemySpawns: CombatantSpawn[],
    coverPoints: { x: number; z: number }[],
    private readonly navigation: NavigationGrid,
    private readonly audio: GameAudio,
    private readonly effects: Effects,
  ) {
    this.root.name = 'combatants';
    scene.add(this.root);

    const blueColors = [0x55a7ef, 0x438fd8, 0x69b7f4, 0x397fc4];
    const redColors = [0xd65b50, 0xb94b45, 0xe26f5d, 0xa84040];
    for (let i = 0; i < CONQUEST_TEAM_SIZE; i++) {
      const enemySpawn = this.spawnForIndex(i);
      const allySpawn: CombatantSpawn = {
        x: enemySpawn.x,
        z: -enemySpawn.z,
        waypoints: enemySpawn.waypoints.map(w => ({ x: w.x, z: -w.z })),
        cover: enemySpawn.cover?.map(c => ({ x: c.x, z: -c.z })),
      };
      const ally = new Combatant(
        `A${String(i + 1).padStart(2, '0')}`,
        'player',
        allySpawn,
        blueColors[i % blueColors.length],
        coverPoints,
        navigation,
        (unit, source) => this.handleDeath(unit, source),
        (unit, position) => this.reportGunfire(unit.faction, position),
      );
      const enemy = new Combatant(
        `E${String(i + 1).padStart(2, '0')}`,
        'enemy',
        enemySpawn,
        redColors[i % redColors.length],
        coverPoints,
        navigation,
        (unit, source) => this.handleDeath(unit, source),
        (unit, position) => this.reportGunfire(unit.faction, position),
      );
      this.units.push(ally, enemy);
      this.root.add(ally.root, enemy.root);
    }
    this.configureSkirmish();
  }

  get allies(): Combatant[] {
    return this.units.filter(u => u.faction === 'player');
  }

  get enemies(): Combatant[] {
    return this.units.filter(u => u.faction === 'enemy');
  }

  private spawnForIndex(index: number): CombatantSpawn {
    const base = this.defaultEnemySpawns[index % this.defaultEnemySpawns.length];
    const pass = Math.floor(index / this.defaultEnemySpawns.length);
    const ox = pass === 0 ? 0 : (index % 2 === 0 ? 4 : -4);
    const oz = pass * 3;
    return {
      x: base.x + ox,
      z: base.z + oz,
      waypoints: base.waypoints.map(w => ({ x: w.x + ox, z: w.z + oz })),
      cover: base.cover?.map(c => ({ x: c.x + ox, z: c.z + oz })),
    };
  }

  private handleDeath(unit: Combatant, source?: DamageSource) {
    this.audio.playEnemyDeath();
    if (unit.faction === 'enemy') {
      this.onEnemyDeath?.(unit.pos.clone(), source);
    }
    if (unit.faction === 'enemy' && source?.id === 'player') {
      this.kills += 1;
      this.onKill?.();
    }
  }

  setKillCallback(cb: () => void) {
    this.onKill = cb;
  }

  setEnemyDeathCallback(
    cb: (position: THREE.Vector3, source?: DamageSource) => void,
  ) {
    this.onEnemyDeath = cb;
  }

  reportGunfire(faction: Faction, position: THREE.Vector3) {
    let report = this.gunfireReports.find(
      item =>
        item.faction === faction &&
        Math.hypot(item.x - position.x, item.z - position.z) < 11,
    );
    if (report) {
      report.x = THREE.MathUtils.lerp(report.x, position.x, 0.35);
      report.z = THREE.MathUtils.lerp(report.z, position.z, 0.35);
      report.ttl = 8;
      report.heat = Math.min(5, report.heat + 0.35);
    } else {
      report = {
        faction,
        x: position.x,
        z: position.z,
        ttl: 8,
        heat: 1,
        serial: ++this.gunfireSerial,
      };
      this.gunfireReports.push(report);
      if (this.gunfireReports.length > 12) this.gunfireReports.shift();
    }

    const opposing = this.units.filter(
      unit => unit.alive && unit.faction !== faction,
    );
    const committed = opposing.filter(
      unit =>
        unit.currentOrderKind === 'investigate' ||
        this.nextOrderRefresh.get(unit.id) === 0,
    ).length;
    const responders = opposing
      .filter(
        unit =>
          unit.currentOrderKind !== 'investigate',
      )
      .sort((a, b) => {
        const aMobile = a.currentOrderKind === 'intercept' ? -100 : 0;
        const bMobile = b.currentOrderKind === 'intercept' ? -100 : 0;
        return (
          Math.hypot(a.pos.x - position.x, a.pos.z - position.z) + aMobile -
          (Math.hypot(b.pos.x - position.x, b.pos.z - position.z) + bMobile)
        );
      })
      .slice(
        0,
        // 玩家开火时，敌方最多调 3 人来调查；友军仍为 1
        Math.max(0, (faction === 'player' ? 3 : 1) - committed),
      );
    for (const unit of responders) this.nextOrderRefresh.set(unit.id, 0);
  }

  getShootRoot(): THREE.Group {
    return this.root;
  }

  getKills(): number {
    return this.kills;
  }

  configureSkirmish() {
    this.conquestActive = false;
    this.orderSignature = '';
    this.kills = 0;
    this.resetCommandState();
    const enemyCount = this.defaultEnemySpawns.length;
    const allyCount = Math.min(enemyCount, this.allies.length);

    this.enemies.forEach((unit, index) => {
      const active = index < enemyCount;
      unit.setActive(active);
      if (!active) return;
      unit.setRoute(this.defaultEnemySpawns[index]);
      unit.setOrder(null);
      unit.respawnNow();
    });

    // 击杀 / 生存：启用 AI 队友，散布在玩家南侧出生带附近
    const occupied: { x: number; z: number }[] = [{ x: 0, z: 55 }];
    this.allies.forEach((unit, index) => {
      const active = index < allyCount;
      unit.setActive(active);
      if (!active) return;
      const enemySpawn = this.defaultEnemySpawns[index % enemyCount];
      const allySpawn: CombatantSpawn = {
        x: enemySpawn.x * 0.35,
        z: 48 + (index % 3) * 6 + Math.floor(index / 3) * 4,
        waypoints: enemySpawn.waypoints.map(w => ({
          x: w.x * 0.4,
          z: Math.max(20, -w.z * 0.35 + 40),
        })),
        cover: enemySpawn.cover?.map(c => ({
          x: c.x * 0.4,
          z: Math.max(18, -c.z * 0.35 + 38),
        })),
      };
      const spawn = this.navigation.findNearestWalkablePosition(
        allySpawn.x,
        allySpawn.z,
        occupied,
        6,
      );
      occupied.push(spawn);
      unit.setRoute({
        ...allySpawn,
        x: spawn.x,
        z: spawn.z,
      });
      unit.setRespawnPos(spawn.x, spawn.z);
      unit.setOrder(null);
      unit.setDeploymentRally(spawn.x, spawn.z - 8);
      unit.respawnNow();
    });
  }

  configureConquest(
    blueHq: { x: number; z: number },
    redHq: { x: number; z: number },
  ) {
    this.conquestActive = true;
    this.orderSignature = '';
    this.kills = 0;
    this.resetCommandState();
    const factionIndexes: Record<Faction, number> = { player: 0, enemy: 0 };
    const occupiedSpawns: Record<Faction, { x: number; z: number }[]> = {
      player: [{ x: blueHq.x, z: blueHq.z }],
      enemy: [],
    };
    // 大战场：6 列 × N 行，HQ 周边宽散布
    const cols = 6;
    for (const unit of this.units) {
      unit.setActive(true);
      const hq = unit.faction === 'player' ? blueHq : redHq;
      const index = factionIndexes[unit.faction]++;
      const row = Math.floor(index / cols);
      const lane = (index % cols) - (cols - 1) / 2;
      const inward = unit.faction === 'player' ? -1 : 1;
      const requestedX = hq.x + lane * 9 + (row % 2 === 0 ? 0 : 2.5);
      const requestedZ = hq.z + inward * (5 + row * 8);
      const spawn = this.navigation.findNearestWalkablePosition(
        requestedX,
        requestedZ,
        occupiedSpawns[unit.faction],
        7,
      );
      occupiedSpawns[unit.faction].push(spawn);
      unit.setRespawnPos(spawn.x, spawn.z);
      const rallyDepth = 22 + row * 4;
      const rally = this.navigation.findNearestWalkablePosition(
        hq.x + lane * 7 + (row - 1) * 2,
        hq.z + inward * rallyDepth,
      );
      unit.setDeploymentRally(rally.x, rally.z);
      unit.respawnNow();
    }
  }

  /**
   * 将即将复活单位的复活点刷新到已占领据点，广布全场。
   * 每个死亡周期仅分配一次，避免每帧抖动。
   */
  refreshConquestRespawns(
    blueAnchors: { id: string; x: number; z: number; weight: number }[],
    redAnchors: { id: string; x: number; z: number; weight: number }[],
  ) {
    if (!this.conquestActive) return;
    const pick = (
      anchors: { id: string; x: number; z: number; weight: number }[],
      seed: number,
    ) => {
      if (anchors.length === 0) return null;
      const total = anchors.reduce((s, a) => s + a.weight, 0);
      let r = ((seed % 1000) / 1000) * total;
      for (const a of anchors) {
        r -= a.weight;
        if (r <= 0) return a;
      }
      return anchors[anchors.length - 1];
    };

    const occupied: Record<Faction, { x: number; z: number }[]> = {
      player: [],
      enemy: [],
    };

    for (const unit of this.units) {
      if (!unit.active) continue;
      if (unit.alive) {
        this.respawnAssignedLife.delete(unit.id);
        continue;
      }
      if (this.respawnAssignedLife.get(unit.id) === unit.currentLifeSerial) {
        continue;
      }
      const anchors =
        unit.faction === 'player' ? blueAnchors : redAnchors;
      const seed =
        unit.id.charCodeAt(1) * 17 +
        unit.id.charCodeAt(2) * 31 +
        unit.currentLifeSerial * 97;
      const anchor = pick(anchors, seed);
      if (!anchor) continue;
      const lane = (seed % 5) - 2;
      const depth = ((seed >> 3) % 3) - 1;
      const requested = this.navigation.findNearestWalkablePosition(
        anchor.x + lane * 5,
        anchor.z + depth * 5,
        occupied[unit.faction],
        6,
      );
      occupied[unit.faction].push(requested);
      unit.setRespawnPos(requested.x, requested.z);
      this.respawnAssignedLife.set(unit.id, unit.currentLifeSerial);
    }
  }

  reset() {
    this.kills = 0;
    for (const unit of this.units) {
      if (unit.active) unit.respawnNow();
    }
  }

  private resetCommandState() {
    this.battleTime = 0;
    this.gunfireReports.length = 0;
    this.nextOrderRefresh.clear();
    this.respawnAssignedLife.clear();
    this.latestBlueObjectives = [];
    this.latestRedObjectives = [];
    this.latestPlayerPos.set(0, 0, 0);
  }

  private objectiveOrder(unit: Combatant, objective: BattleObjective): CombatantOrder {
    const offset = formationOffset(`${unit.id}:${objective.id}`, objective.radius * 0.58);
    const target = this.navigation.findNearestWalkablePosition(
      objective.x + offset.x,
      objective.z + offset.z,
    );
    return {
      id: objective.id,
      kind: 'objective',
      x: target.x,
      z: target.z,
      radius: Math.max(3.5, objective.radius * 0.32),
    };
  }

  private interceptOrder(
    unit: Combatant,
    objective: BattleObjective,
  ): CombatantOrder {
    const seed = hashString(`${unit.id}:${unit.currentLifeSerial}:${objective.id}`);
    const side = (seed & 1) === 0 ? -1 : 1;
    const advance = unit.faction === 'player' ? -1 : 1;
    const requested = this.navigation.findNearestWalkablePosition(
      objective.x + side * (9 + ((seed >>> 5) % 7)),
      objective.z + advance * (8 + ((seed >>> 10) % 7)),
    );
    return {
      id: `INTERCEPT_${objective.id}_${side}`,
      kind: 'intercept',
      x: requested.x,
      z: requested.z,
      radius: 8,
    };
  }

  private bestGunfireReport(unit: Combatant): GunfireReport | null {
    let best: GunfireReport | null = null;
    let bestScore = 0;
    for (const report of this.gunfireReports) {
      if (report.faction === unit.faction || report.ttl <= 0) continue;
      const distance = Math.hypot(unit.pos.x - report.x, unit.pos.z - report.z);
      if (distance > 75) continue;
      const score = (report.heat * report.ttl) / (1 + distance / 35);
      if (score > bestScore) {
        best = report;
        bestScore = score;
      }
    }
    return best;
  }

  private investigateOrder(
    unit: Combatant,
    report: GunfireReport,
  ): CombatantOrder {
    const offset = formationOffset(`${unit.id}:shot:${report.serial}`, 5);
    const requested = this.navigation.findNearestWalkablePosition(
      report.x + offset.x,
      report.z + offset.z,
    );
    return {
      id: `INVESTIGATE_${report.serial}`,
      kind: 'investigate',
      x: requested.x,
      z: requested.z,
      radius: 7,
    };
  }

  private assignStrategicOrder(
    unit: Combatant,
    objectives: BattleObjective[],
  ) {
    const primary = [...objectives].sort((a, b) => b.priority - a.priority)[0];
    if (!primary) {
      const offset = formationOffset(`${unit.id}:fallback`, 10);
      unit.setOrder({
        id: `FALLBACK_${unit.faction}`,
        kind: 'patrol',
        x: this.latestPlayerPos.x + offset.x,
        z: this.latestPlayerPos.z + offset.z,
        radius: 10,
      });
      this.nextOrderRefresh.set(unit.id, this.battleTime + 6);
      return;
    }

    const seed = hashString(`${unit.id}:${unit.currentLifeSerial}`);
    const report = this.bestGunfireReport(unit);
    const tacticalSlot = Math.max(0, Number.parseInt(unit.id.slice(1), 10) - 1) % CONQUEST_TEAM_SIZE;
    const investigatingCount = this.units.filter(
      teammate =>
        teammate.alive &&
        teammate.faction === unit.faction &&
        teammate.currentOrderKind === 'investigate',
    ).length;
    const canInvestigate =
      unit.currentOrderKind === 'investigate' ||
      investigatingCount < (unit.faction === 'enemy' ? 5 : 3);
    const forcedGunfireResponse = this.nextOrderRefresh.get(unit.id) === 0;
    let order: CombatantOrder;
    if (
      report &&
      canInvestigate &&
      (forcedGunfireResponse || unit.currentOrderKind === 'investigate')
    ) {
      order = this.investigateOrder(unit, report);
    } else if (tacticalSlot < Math.floor(CONQUEST_TEAM_SIZE * 0.72)) {
      order = this.objectiveOrder(unit, primary);
    } else {
      order = this.interceptOrder(unit, primary);
    }
    unit.setOrder(order);
    const duration = order.kind === 'investigate' ? 5 : 9 + (seed % 5);
    this.nextOrderRefresh.set(unit.id, this.battleTime + duration);
  }

  applyConquestOrders(
    blueObjectives: BattleObjective[],
    redObjectives: BattleObjective[],
    playerPos: THREE.Vector3,
  ) {
    if (!this.conquestActive) return;
    this.latestBlueObjectives = blueObjectives.map(objective => ({ ...objective }));
    this.latestRedObjectives = redObjectives.map(objective => ({ ...objective }));
    this.latestPlayerPos.copy(playerPos);
    const signature = [
      blueObjectives.map(x => x.id).join(','),
      redObjectives.map(x => x.id).join(','),
    ].join('|');
    const objectivesChanged = signature !== this.orderSignature;
    this.orderSignature = signature;

    for (const unit of this.units) {
      if (!unit.alive) continue;
      const due = (this.nextOrderRefresh.get(unit.id) ?? 0) <= this.battleTime;
      if (!objectivesChanged && !unit.needsStrategicOrder && !due) continue;
      this.assignStrategicOrder(
        unit,
        unit.faction === 'player' ? blueObjectives : redObjectives,
      );
    }
  }

  applyPlayerHit(
    hitObject: THREE.Object3D,
    _weaponId: WeaponId,
    damage: number,
  ): HitResult {
    let object: THREE.Object3D | null = hitObject;
    while (object) {
      const combatant = object.userData.combatant as Combatant | undefined;
      if (combatant && combatant.alive) {
        if (combatant.faction === 'player') return 'friendly';
        const killed = combatant.takeDamage(damage, {
          id: 'player',
          faction: 'player',
        });
        if (!killed) this.audio.playHit();
        return killed ? 'kill' : 'hit';
      }
      object = object.parent;
    }
    return 'none';
  }

  getNearestAllies(playerPos: THREE.Vector3, limit = 4): SquadmateStatus[] {
    return this.allies
      .filter(unit => unit.alive)
      .map(unit => ({
        id: unit.id,
        hp: unit.hp,
        maxHp: unit.maxHp,
        distance: unit.pos.distanceTo(playerPos),
        order: unit.currentOrderKind,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    obstacles: AABB[],
    getHeight: HeightFn,
    mapBlockers: THREE.Object3D[],
    playerTakeDamage: (amount: number, fromPos?: THREE.Vector3) => void,
  ) {
    this.battleTime += dt;
    this.latestPlayerPos.copy(playerPos);
    for (let i = this.gunfireReports.length - 1; i >= 0; i--) {
      this.gunfireReports[i].ttl -= dt;
      if (this.gunfireReports[i].ttl <= 0) this.gunfireReports.splice(i, 1);
    }
    const playerTarget: CombatTarget = {
      id: 'player',
      faction: 'player',
      pos: playerPos,
      alive: playerAlive,
      takeDamage: (amount, _source, fromPos) => playerTakeDamage(amount, fromPos),
    };
    const targets: CombatTarget[] = [
      playerTarget,
      ...this.units.filter(unit => unit.active),
    ];
    for (const unit of this.units) {
      unit.updateFriendlyMarker(playerPos);
      unit.update(
        dt,
        targets,
        obstacles,
        getHeight,
        mapBlockers,
        this.effects,
        this.audio,
      );
    }

    // 同阵营近距离共享目视接触，让邻近单位协同警觉和包抄。
    for (const spotter of this.units) {
      const contact = spotter.spottedTarget;
      if (!contact) continue;
      for (const teammate of this.units) {
        if (
          teammate === spotter ||
          !teammate.alive ||
          teammate.faction !== spotter.faction ||
          teammate.pos.distanceToSquared(spotter.pos) >
            (spotter.faction === 'enemy' ? 28 * 28 : 18 * 18)
        ) {
          continue;
        }
        teammate.receiveContactReport(contact);
      }
    }

    if (this.conquestActive) {
      for (const unit of this.units) {
        if (!unit.alive || !unit.needsStrategicOrder) continue;
        this.assignStrategicOrder(
          unit,
          unit.faction === 'player'
            ? this.latestBlueObjectives
            : this.latestRedObjectives,
        );
      }
    }
  }
}

export function createDefaultSpawns(): CombatantSpawn[] {
  return [
    {
      x: -40, z: -60,
      waypoints: [
        { x: -40, z: -60 }, { x: -28, z: -45 }, { x: -52, z: -40 },
      ],
      cover: [{ x: -35, z: -50 }, { x: -45, z: -55 }],
    },
    {
      x: 35, z: -80,
      waypoints: [
        { x: 35, z: -80 }, { x: 48, z: -65 }, { x: 22, z: -70 },
      ],
      cover: [{ x: 32, z: -75 }, { x: 40, z: -68 }],
    },
    {
      x: 55, z: -20,
      waypoints: [
        { x: 55, z: -20 }, { x: 70, z: -8 }, { x: 42, z: -12 },
      ],
      cover: [{ x: 58, z: -16 }, { x: 48, z: -22 }],
    },
    {
      x: 0, z: 20,
      waypoints: [
        { x: 0, z: 20 }, { x: 14, z: 35 }, { x: -14, z: 30 },
      ],
      cover: [{ x: 10, z: 40 }, { x: -12, z: 42 }, { x: 0, z: 12 }],
    },
    {
      x: 45, z: 55,
      waypoints: [
        { x: 45, z: 55 }, { x: 60, z: 70 }, { x: 32, z: 48 },
      ],
      cover: [{ x: 48, z: 52 }, { x: 38, z: 45 }],
    },
    {
      x: -50, z: 40,
      waypoints: [
        { x: -50, z: 40 }, { x: -65, z: 55 }, { x: -38, z: 35 },
      ],
      cover: [{ x: -45, z: 42 }, { x: -55, z: 32 }],
    },
  ];
}
