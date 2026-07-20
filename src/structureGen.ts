import type { MapBuilder } from './map';
import { MAP_HALF } from './terrain';
import { createLinearLayout } from './conquest';

export type StructureKind =
  | 'house'
  | 'ruin'
  | 'bunker'
  | 'rubble'
  | 'wall'
  | 'tower'
  | 'nest';

export interface StructureGenOptions {
  /** 确定性种子 */
  seed?: number;
  /** 尝试放置次数（越大越密） */
  attempts?: number;
  /** 建筑之间最小间距 */
  minSeparation?: number;
  /** 旗点净空额外半径 */
  flagClearExtra?: number;
}

interface Placed {
  x: number;
  z: number;
  r: number;
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickKind(rng: () => number, nearFlag: boolean): StructureKind {
  const t = rng();
  if (nearFlag) {
    if (t < 0.28) return 'bunker';
    if (t < 0.48) return 'house';
    if (t < 0.72) return 'ruin';
    if (t < 0.85) return 'nest';
    if (t < 0.93) return 'wall';
    return 'rubble';
  }
  if (t < 0.22) return 'house';
  if (t < 0.48) return 'ruin';
  if (t < 0.62) return 'bunker';
  if (t < 0.78) return 'rubble';
  if (t < 0.9) return 'wall';
  if (t < 0.96) return 'nest';
  return 'tower';
}

function pickMat(map: MapBuilder, rng: () => number) {
  const t = rng();
  if (t < 0.4) return map.mats.brick;
  if (t < 0.7) return map.mats.concrete;
  if (t < 0.88) return map.mats.metal;
  return map.mats.brick;
}

function doorFromRng(rng: () => number): 'n' | 's' | 'e' | 'w' {
  return (['s', 'n', 'e', 'w'] as const)[Math.floor(rng() * 4)];
}

/**
 * 程序化战场建筑生成器：
 * - 完整民房（带窗）
 * - 断壁残垣（可进入）
 * - 可进入射击碉堡
 * - 瓦砾堆 / 矮墙 / 瞭望塔 / 封闭机枪巢
 *
 * 自动避开旗点圆心，并按间距去重。
 */
export function generateBattlefieldStructures(
  map: MapBuilder,
  options: StructureGenOptions = {},
): { placed: number } {
  const rng = makeRng(options.seed ?? 424242);
  const attempts = options.attempts ?? 220;
  const minSep = options.minSeparation ?? 14;
  const flagExtra = options.flagClearExtra ?? 8;

  const flags = createLinearLayout().map(p => ({
    x: p.x,
    z: p.z,
    clear: p.radius + flagExtra,
  }));

  const placed: Placed[] = [];
  let count = 0;

  const overlaps = (x: number, z: number, r: number) => {
    for (const f of flags) {
      if (Math.hypot(x - f.x, z - f.z) < f.clear + r * 0.35) return true;
    }
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + r) return true;
    }
    // 避开地图边缘与玩家默认南侧出生带
    if (Math.abs(x) > MAP_HALF - 18 || Math.abs(z) > MAP_HALF - 18) return true;
    if (Math.hypot(x, z - 218) < 16) return true;
    return false;
  };

  // 据点外围优先撒一圈战术建筑
  for (const f of flags) {
    const ring = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < ring; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = f.clear + 6 + rng() * 18;
      const x = f.x + Math.cos(ang) * dist;
      const z = f.z + Math.sin(ang) * dist;
      const kind = pickKind(rng, true);
      const r = kind === 'house' || kind === 'ruin' ? 8 : 5;
      if (overlaps(x, z, r)) continue;
      placeOne(map, rng, kind, x, z);
      placed.push({ x, z, r });
      count++;
    }
  }

  // 全图随机填充
  const span = (MAP_HALF - 22) * 2;
  for (let i = 0; i < attempts; i++) {
    const x = -MAP_HALF + 22 + rng() * span;
    const z = -MAP_HALF + 22 + rng() * span;
    const nearFlag = flags.some(f => Math.hypot(x - f.x, z - f.z) < f.clear + 40);
    const kind = pickKind(rng, nearFlag);
    const r =
      kind === 'house' ? 9 :
      kind === 'ruin' ? 8 :
      kind === 'bunker' ? 6 :
      kind === 'tower' ? 5 :
      kind === 'wall' ? 4 :
      3.5;
    if (overlaps(x, z, Math.max(r, minSep * 0.45))) continue;
    // 走廊略稀疏：中央南北轴附近降低完整房密度
    if (Math.abs(x) < 28 && (kind === 'house' || kind === 'tower') && rng() > 0.35) {
      continue;
    }
    placeOne(map, rng, kind, x, z);
    placed.push({ x, z, r: Math.max(r, minSep * 0.5) });
    count++;
  }

  return { placed: count };
}

function placeOne(
  map: MapBuilder,
  rng: () => number,
  kind: StructureKind,
  x: number,
  z: number,
) {
  const mat = pickMat(map, rng);
  const door = doorFromRng(rng);

  switch (kind) {
    case 'house': {
      const w = 7 + rng() * 6;
      const d = 6 + rng() * 5;
      const floors: 1 | 2 = rng() > 0.72 ? 2 : 1;
      map.addBuilding({
        x, z, w, d, floors, mat, doorSide: door, windows: true,
      });
      if (rng() > 0.55) {
        map.addCrate(x + w * 0.45, z + d * 0.2, 0.85 + rng() * 0.3, rng() > 0.5);
      }
      break;
    }
    case 'ruin': {
      map.addRuin({
        x, z,
        w: 7 + rng() * 7,
        d: 6 + rng() * 6,
        mat,
        damage: 0.4 + rng() * 0.45,
        rng,
      });
      if (rng() > 0.4) map.addRubble(x + (rng() - 0.5) * 4, z + (rng() - 0.5) * 4, 0.8 + rng() * 0.5, rng);
      break;
    }
    case 'bunker': {
      map.addEnterableBunker({
        x, z,
        w: 4.8 + rng() * 2.2,
        d: 4.2 + rng() * 1.8,
        doorSide: door,
        mat: rng() > 0.35 ? map.mats.concrete : mat,
      });
      if (rng() > 0.5) {
        map.addSandbag(x + 3.2, z + 1.2, Math.PI / 2);
        map.addSandbag(x - 3.2, z + 1.2, Math.PI / 2);
      }
      break;
    }
    case 'rubble':
      map.addRubble(x, z, 0.9 + rng() * 1.1, rng);
      if (rng() > 0.5) map.addLowWall(x + 2, z, 3 + rng() * 3, rng() > 0.5 ? 'x' : 'z', 0.9 + rng() * 0.5);
      break;
    case 'wall': {
      const len = 4 + rng() * 8;
      const axis: 'x' | 'z' = rng() > 0.5 ? 'x' : 'z';
      map.addLowWall(x, z, len, axis, 1.0 + rng() * 0.8);
      if (rng() > 0.45) {
        map.addLowWall(
          x + (axis === 'x' ? 0 : 2.5),
          z + (axis === 'z' ? 0 : 2.5),
          len * 0.6,
          axis === 'x' ? 'z' : 'x',
          0.9 + rng() * 0.5,
        );
      }
      break;
    }
    case 'tower':
      map.addWatchtower(x, z);
      break;
    case 'nest':
      map.addBunker(x, z);
      break;
  }
}
