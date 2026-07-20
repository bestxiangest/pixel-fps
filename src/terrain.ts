import * as THREE from 'three';
import { createGroundTexture } from './textures';

/** 大战场边长（米） */
export const MAP_SIZE = 500;
export const MAP_HALF = MAP_SIZE / 2;

/** 确定性噪声 */
function hash2(x: number, z: number): number {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return (
    a * (1 - ux) * (1 - uz) +
    b * ux * (1 - uz) +
    c * (1 - ux) * uz +
    d * ux * uz
  );
}

function fbm(x: number, z: number): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * smoothNoise(x * f, z * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

/**
 * 大战场高度场：
 * - 中部相对平坦的交火走廊
 * - 东西两侧缓坡高地
 * - 数条战壕凹槽与散布弹坑
 * - 北侧台地略抬高
 */
export function sampleHeight(x: number, z: number): number {
  const nx = x / MAP_HALF;
  const nz = z / MAP_HALF;

  const ridge = (nx * nx) * 5.2 + (Math.abs(nx) > 0.58 ? 1.4 : 0);
  const valley = -Math.exp(-((nx * 2.0) ** 2)) * 1.5;

  const plateau =
    nz < -0.12 ? THREE.MathUtils.smoothstep(nz, -0.5, -0.12) * 2.4 : 0;

  const southRise = nz > 0.35 ? (nz - 0.35) * 2.2 : 0;

  const detail = (fbm(x * 0.022, z * 0.022) - 0.5) * 3.2;
  const micro = (fbm(x * 0.08, z * 0.08) - 0.5) * 0.6;

  let trench = 0;
  const trenches = [
    { a: 0, b: 1, c: -70, w: 4.2, depth: 1.7 },
    { a: 0, b: 1, c: 20, w: 3.6, depth: 1.5 },
    { a: 0, b: 1, c: 90, w: 3.8, depth: 1.55 },
    { a: 1, b: 0, c: -40, w: 3.2, depth: 1.35 },
    { a: 0.75, b: 0.65, c: 15, w: 3.0, depth: 1.25 },
    { a: -0.6, b: 0.8, c: -30, w: 2.8, depth: 1.2 },
  ];
  for (const t of trenches) {
    const dist = Math.abs(t.a * x + t.b * z + t.c) / Math.hypot(t.a, t.b);
    if (dist < t.w) {
      const k = 1 - dist / t.w;
      trench -= t.depth * k * k;
    }
  }

  let craters = 0;
  const craterSites = [
    [20, 55], [-35, 40], [55, 15], [-75, 70], [90, -20],
    [-15, -55], [40, -100], [-110, 12], [100, 90], [-50, 100],
    [70, 140], [-80, -80], [30, -160], [-25, 160], [120, -40],
    [-130, 50], [0, -30], [45, 30], [-60, -10], [85, -120],
  ];
  for (const [cx, cz] of craterSites) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < 5.5) {
      const k = 1 - d / 5.5;
      craters -= 1.15 * k * k;
    }
  }

  let h = ridge + valley + plateau + southRise + detail + micro + trench + craters;
  h = THREE.MathUtils.clamp(h, -2.8, 9);
  return h;
}

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly segments: number;

  constructor(scene: THREE.Scene, segments = 140) {
    this.segments = segments;
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, sampleHeight(x, z));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const tex = createGroundTexture();
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  getHeight(x: number, z: number): number {
    if (Math.abs(x) > MAP_HALF || Math.abs(z) > MAP_HALF) return 0;
    return sampleHeight(x, z);
  }
}
