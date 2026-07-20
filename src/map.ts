import * as THREE from 'three';
import { AABB } from './collision';
import {
  createBrickTexture,
  createMetalTexture,
  createWoodTexture,
  createCamoTexture,
  createConcreteTexture,
  createFoliageTexture,
  createBarkTexture,
  createRockTexture,
} from './textures';
import { sampleHeight, MAP_SIZE, MAP_HALF } from './terrain';
import { generateBattlefieldStructures } from './structureGen';

export { MAP_SIZE, MAP_HALF };

export interface MinimapFeature {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  kind: 'building' | 'cover' | 'tree' | 'vehicle' | 'terrain';
}

export interface MapData {
  obstacles: AABB[];
  minimap: MinimapFeature[];
  spawn: THREE.Vector3;
  /** 地图根节点，供射线检测 */
  root: THREE.Group;
}

interface BoxSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  mat: THREE.Material;
  collide?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  minimap?: { color: string; kind: MinimapFeature['kind']; w?: number; d?: number };
}

function rndSeed(seed: { v: number }): number {
  seed.v = (seed.v * 16807) % 2147483647;
  return (seed.v - 1) / 2147483646;
}

interface TreeInstance {
  x: number;
  z: number;
  gy: number;
  scale: number;
}

export class MapBuilder {
  readonly obstacles: AABB[] = [];
  readonly minimap: MinimapFeature[] = [];
  readonly mats: Record<string, THREE.MeshLambertMaterial>;
  readonly root: THREE.Group;
  private readonly treeQueue: TreeInstance[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'map';
    this.scene.add(this.root);

    const mat = (map: THREE.Texture, color = 0xffffff) =>
      new THREE.MeshLambertMaterial({ map, color, flatShading: true });

    this.mats = {
      brick: mat(createBrickTexture()),
      metal: mat(createMetalTexture()),
      wood: mat(createWoodTexture()),
      camo: mat(createCamoTexture()),
      concrete: mat(createConcreteTexture()),
      foliage: mat(createFoliageTexture()),
      bark: mat(createBarkTexture()),
      rock: mat(createRockTexture()),
      sand: mat(createCamoTexture(), 0xc2a66a),
      rust: mat(createMetalTexture(), 0x8a5a3a),
      darkMetal: mat(createMetalTexture(), 0x4a4a4a),
      paint: mat(createMetalTexture(), 0x3a5a3a),
    };
  }

  /** 世界 y = 地形高度 + 局部高度（中心） */
  groundY(x: number, z: number, localY = 0): number {
    return sampleHeight(x, z) + localY;
  }

  /** 贴地浅基座：顶面约在地形表面，略埋入地下避免缝隙；返回墙体底面高度 */
  private addFooting(x: number, z: number, w: number, d: number, mat?: THREE.Material) {
    const gy = sampleHeight(x, z);
    const h = 0.55;
    this.addBox({
      x,
      // 中心略低于地表，让基座大部分埋在地下
      y: gy - h * 0.42,
      z,
      w,
      h,
      d,
      mat: mat ?? this.mats.concrete,
      collide: false,
    });
    // 墙底略埋入地表，避免出现悬空缝
    return gy - 0.04;
  }

  addBox(spec: BoxSpec): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w, spec.h, spec.d),
      spec.mat,
    );
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = spec.receiveShadow !== false;
    mesh.userData.shootable = true;
    this.root.add(mesh);

    if (spec.collide !== false) {
      this.obstacles.push({
        min: new THREE.Vector3(spec.x - spec.w / 2, spec.y - spec.h / 2, spec.z - spec.d / 2),
        max: new THREE.Vector3(spec.x + spec.w / 2, spec.y + spec.h / 2, spec.z + spec.d / 2),
      });
    }

    if (spec.minimap) {
      this.minimap.push({
        x: spec.x,
        z: spec.z,
        w: spec.minimap.w ?? spec.w,
        d: spec.minimap.d ?? spec.d,
        color: spec.minimap.color,
        kind: spec.minimap.kind,
      });
    }
    return mesh;
  }

  addWall(opts: {
    cx: number;
    cz: number;
    yBase: number;
    length: number;
    height: number;
    thickness: number;
    axis: 'x' | 'z';
    mat: THREE.Material;
    /** @deprecated 使用 openings */
    door?: { center: number; width: number; height: number };
    /** 门洞 / 窗口等开口（sill=离地高度，门为 0） */
    openings?: { center: number; width: number; height: number; sill?: number }[];
  }) {
    const { cx, cz, yBase, length, height, thickness, axis, mat } = opts;
    const openings = [...(opts.openings ?? [])];
    if (opts.door) {
      openings.push({
        center: opts.door.center,
        width: opts.door.width,
        height: opts.door.height,
        sill: 0,
      });
    }

    const place = (mid: number, len: number, y: number, h: number) => {
      if (len <= 0.05 || h <= 0.05) return;
      if (axis === 'x') {
        this.addBox({ x: cx + mid, y, z: cz, w: len, h, d: thickness, mat });
      } else {
        this.addBox({ x: cx, y, z: cz + mid, w: thickness, h, d: len, mat });
      }
    };

    if (openings.length === 0) {
      place(0, length, yBase + height / 2, height);
      return;
    }

    const half = length / 2;
    const sorted = openings
      .map(o => ({
        ...o,
        sill: o.sill ?? 0,
        left: o.center - o.width / 2,
        right: o.center + o.width / 2,
      }))
      .filter(o => o.right > -half && o.left < half)
      .sort((a, b) => a.left - b.left);

    let cursor = -half;
    for (const o of sorted) {
      const left = Math.max(o.left, -half);
      const right = Math.min(o.right, half);
      if (left - cursor > 0.05) {
        place((cursor + left) / 2, left - cursor, yBase + height / 2, height);
      }
      const sill = Math.max(0, Math.min(o.sill, height - 0.2));
      const openH = Math.min(o.height, height - sill);
      if (sill > 0.05) {
        place((left + right) / 2, right - left, yBase + sill / 2, sill);
      }
      const top = sill + openH;
      if (height - top > 0.05) {
        place(
          (left + right) / 2,
          right - left,
          yBase + top + (height - top) / 2,
          height - top,
        );
      }
      cursor = Math.max(cursor, right);
    }
    if (half - cursor > 0.05) {
      place((cursor + half) / 2, half - cursor, yBase + height / 2, height);
    }
  }

  addBuilding(opts: {
    x: number;
    z: number;
    w: number;
    d: number;
    floors: 1 | 2;
    wallH?: number;
    mat?: THREE.Material;
    doorSide?: 'n' | 's' | 'e' | 'w';
    /** 是否在非门墙开窗 */
    windows?: boolean;
  }) {
    const wallH = opts.wallH ?? 5.2;
    const mat = opts.mat ?? this.mats.brick;
    const t = 0.35;
    const floors = opts.floors;
    const doorSide = opts.doorSide ?? 's';
    const withWindows = opts.windows !== false;
    // 玩家半高 0.9 → 总高约 1.8，门洞需明显留余量
    const doorW = 2.2;
    const doorH = 2.95;
    const y0 = this.addFooting(opts.x, opts.z, opts.w + 0.8, opts.d + 0.8);
    this.minimap.push({
      x: opts.x, z: opts.z, w: opts.w, d: opts.d, color: '#8a6a4a', kind: 'building',
    });

    const x0 = opts.x - opts.w / 2;
    const x1 = opts.x + opts.w / 2;
    const z0 = opts.z - opts.d / 2;
    const z1 = opts.z + opts.d / 2;

    const winOpenings = (len: number, count: number) => {
      if (!withWindows || count <= 0 || len < 5) return [];
      const outs: { center: number; width: number; height: number; sill: number }[] = [];
      for (let i = 0; i < count; i++) {
        const tPos = (i + 1) / (count + 1);
        outs.push({
          center: -len / 2 + tPos * len,
          width: 1.25,
          height: 1.25,
          sill: 1.55,
        });
      }
      return outs;
    };

    for (let f = 0; f < floors; f++) {
      const base = y0 + f * wallH;
      const door =
        f === 0
          ? { center: 0, width: doorW, height: doorH, sill: 0 }
          : undefined;
      const floorWins = f === 0 ? 1 : 2;

      const southOpen =
        doorSide === 's' && door
          ? [door, ...winOpenings(opts.w, 1).filter(w => Math.abs(w.center) > doorW)]
          : winOpenings(opts.w, floorWins);
      const northOpen =
        doorSide === 'n' && door
          ? [door, ...winOpenings(opts.w, 1).filter(w => Math.abs(w.center) > doorW)]
          : winOpenings(opts.w, floorWins);
      const westOpen =
        doorSide === 'w' && door
          ? [door, ...winOpenings(opts.d, 1).filter(w => Math.abs(w.center) > doorW)]
          : winOpenings(opts.d, floorWins);
      const eastOpen =
        doorSide === 'e' && door
          ? [door, ...winOpenings(opts.d, 1).filter(w => Math.abs(w.center) > doorW)]
          : winOpenings(opts.d, floorWins);

      this.addWall({
        cx: opts.x, cz: z0 + t / 2, yBase: base,
        length: opts.w, height: wallH, thickness: t, axis: 'x', mat,
        openings: southOpen,
      });
      this.addWall({
        cx: opts.x, cz: z1 - t / 2, yBase: base,
        length: opts.w, height: wallH, thickness: t, axis: 'x', mat,
        openings: northOpen,
      });
      this.addWall({
        cx: x0 + t / 2, cz: opts.z, yBase: base,
        length: opts.d, height: wallH, thickness: t, axis: 'z', mat,
        openings: westOpen,
      });
      this.addWall({
        cx: x1 - t / 2, cz: opts.z, yBase: base,
        length: opts.d, height: wallH, thickness: t, axis: 'z', mat,
        openings: eastOpen,
      });

      if (f === 1) {
        const holeW = 2.2;
        const holeD = 2.4;
        const holeX = opts.x - opts.w / 2 + 2.5;
        const innerD = opts.d - t * 2;
        const leftW = holeX - holeW / 2 - (x0 + t);
        if (leftW > 0.3) {
          this.addBox({
            x: x0 + t + leftW / 2, y: base, z: opts.z,
            w: leftW, h: 0.25, d: innerD, mat: this.mats.wood,
          });
        }
        const rightW = x1 - t - (holeX + holeW / 2);
        if (rightW > 0.3) {
          this.addBox({
            x: holeX + holeW / 2 + rightW / 2, y: base, z: opts.z,
            w: rightW, h: 0.25, d: innerD, mat: this.mats.wood,
          });
        }
        const sideD = (innerD - holeD) / 2;
        if (sideD > 0.2) {
          this.addBox({
            x: holeX, y: base, z: z0 + t + sideD / 2,
            w: holeW, h: 0.25, d: sideD, mat: this.mats.wood,
          });
          this.addBox({
            x: holeX, y: base, z: z1 - t - sideD / 2,
            w: holeW, h: 0.25, d: sideD, mat: this.mats.wood,
          });
        }
      }
    }

    if (floors === 2) {
      const steps = 10;
      const stepH = wallH / steps;
      const stepD = 0.45;
      const sx = opts.x - opts.w / 2 + 2.5;
      const sz0 = opts.z - (steps * stepD) / 2;
      for (let i = 0; i < steps; i++) {
        this.addBox({
          x: sx,
          y: y0 + stepH * (i + 0.5),
          z: sz0 + stepD * (i + 0.5),
          w: 1.6, h: stepH, d: stepD,
          mat: this.mats.concrete,
        });
      }
    }

    this.addBox({
      x: opts.x,
      y: y0 + floors * wallH + 0.15,
      z: opts.z,
      w: opts.w + 0.5,
      h: 0.3,
      d: opts.d + 0.5,
      mat: this.mats.concrete,
    });
  }

  /**
   * 断壁残垣：部分墙体残缺、高度不齐、无完整屋顶，可进入内部作战。
   */
  addRuin(opts: {
    x: number;
    z: number;
    w: number;
    d: number;
    mat?: THREE.Material;
    /** 0..1 残破程度，越高缺口越多 */
    damage?: number;
    rng?: () => number;
  }) {
    const rng = opts.rng ?? Math.random;
    const mat = opts.mat ?? this.mats.brick;
    const damage = opts.damage ?? 0.55;
    const t = 0.38;
    const y0 = this.addFooting(opts.x, opts.z, opts.w + 0.4, opts.d + 0.4);
    const wallH = 3.8 + rng() * 1.6;
    const x0 = opts.x - opts.w / 2;
    const x1 = opts.x + opts.w / 2;
    const z0 = opts.z - opts.d / 2;
    const z1 = opts.z + opts.d / 2;

    const sides: {
      cx: number; cz: number; length: number; axis: 'x' | 'z'; intact: boolean;
    }[] = [
      { cx: opts.x, cz: z0 + t / 2, length: opts.w, axis: 'x', intact: rng() > damage * 0.35 },
      { cx: opts.x, cz: z1 - t / 2, length: opts.w, axis: 'x', intact: rng() > damage * 0.35 },
      { cx: x0 + t / 2, cz: opts.z, length: opts.d, axis: 'z', intact: rng() > damage * 0.35 },
      { cx: x1 - t / 2, cz: opts.z, length: opts.d, axis: 'z', intact: rng() > damage * 0.35 },
    ];

    for (const side of sides) {
      if (!side.intact) {
        // 只剩半截矮墙
        const segLen = side.length * (0.35 + rng() * 0.35);
        const offset = (rng() - 0.5) * (side.length - segLen);
        const h = 0.9 + rng() * 1.2;
        this.addWall({
          cx: side.axis === 'x' ? side.cx + offset : side.cx,
          cz: side.axis === 'z' ? side.cz + offset : side.cz,
          yBase: y0,
          length: segLen,
          height: h,
          thickness: t,
          axis: side.axis,
          mat,
        });
        continue;
      }

      const h = Math.max(3.1, wallH * (0.72 + rng() * 0.28));
      const openings: { center: number; width: number; height: number; sill?: number }[] = [];
      if (rng() > 0.35) {
        openings.push({
          center: (rng() - 0.5) * side.length * 0.4,
          width: 2.0 + rng() * 0.6,
          height: Math.min(2.9, h - 0.25),
          sill: 0,
        });
      }
      if (rng() > 0.45 && h > 2.2) {
        openings.push({
          center: (rng() - 0.5) * side.length * 0.5,
          width: 1.0,
          height: 0.9,
          sill: 1.0 + rng() * 0.3,
        });
      }
      this.addWall({
        cx: side.cx, cz: side.cz, yBase: y0,
        length: side.length, height: h, thickness: t, axis: side.axis, mat,
        openings,
      });
    }

    // 内部瓦砾
    const rubbleN = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < rubbleN; i++) {
      const rx = opts.x + (rng() - 0.5) * (opts.w - 2);
      const rz = opts.z + (rng() - 0.5) * (opts.d - 2);
      const s = 0.5 + rng() * 0.9;
      this.addBox({
        x: rx, y: y0 + s * 0.35, z: rz,
        w: s * 1.2, h: s * 0.7, d: s,
        mat: rng() > 0.5 ? this.mats.concrete : mat,
      });
    }

    // 残存屋顶角
    if (rng() > 0.55) {
      const rw = opts.w * (0.3 + rng() * 0.35);
      const rd = opts.d * (0.3 + rng() * 0.35);
      const ox = (rng() - 0.5) * (opts.w - rw) * 0.5;
      const oz = (rng() - 0.5) * (opts.d - rd) * 0.5;
      this.addBox({
        x: opts.x + ox, y: y0 + wallH * 0.7, z: opts.z + oz,
        w: rw, h: 0.22, d: rd,
        mat: this.mats.concrete,
        collide: false,
      });
    }

    this.minimap.push({
      x: opts.x, z: opts.z, w: opts.w, d: opts.d, color: '#7a6550', kind: 'building',
    });
  }

  /**
   * 可进入碉堡：厚墙 + 门 + 射击窗，内部中空可站人。
   */
  addEnterableBunker(opts: {
    x: number;
    z: number;
    w?: number;
    d?: number;
    doorSide?: 'n' | 's' | 'e' | 'w';
    mat?: THREE.Material;
  }) {
    const w = opts.w ?? 5.5;
    const d = opts.d ?? 4.8;
    const mat = opts.mat ?? this.mats.concrete;
    const doorSide = opts.doorSide ?? 's';
    const t = 0.55;
    const wallH = 3.4;
    const y0 = this.addFooting(opts.x, opts.z, w + 0.6, d + 0.6);
    const x0 = opts.x - w / 2;
    const x1 = opts.x + w / 2;
    const z0 = opts.z - d / 2;
    const z1 = opts.z + d / 2;

    const door = { center: 0, width: 2.1, height: 2.85, sill: 0 };
    const slit = (len: number, n: number) => {
      const outs: { center: number; width: number; height: number; sill: number }[] = [];
      for (let i = 0; i < n; i++) {
        const u = (i + 1) / (n + 1);
        outs.push({
          center: -len / 2 + u * len,
          width: 0.95,
          height: 0.65,
          sill: 1.55,
        });
      }
      return outs;
    };

    const sideOpen = (
      side: 'n' | 's' | 'e' | 'w',
      len: number,
    ) => {
      if (side === doorSide) return [door, ...slit(len, 1)];
      return slit(len, len > 5.5 ? 2 : 1);
    };

    this.addWall({
      cx: opts.x, cz: z0 + t / 2, yBase: y0,
      length: w, height: wallH, thickness: t, axis: 'x', mat,
      openings: sideOpen('s', w),
    });
    this.addWall({
      cx: opts.x, cz: z1 - t / 2, yBase: y0,
      length: w, height: wallH, thickness: t, axis: 'x', mat,
      openings: sideOpen('n', w),
    });
    this.addWall({
      cx: x0 + t / 2, cz: opts.z, yBase: y0,
      length: d, height: wallH, thickness: t, axis: 'z', mat,
      openings: sideOpen('w', d),
    });
    this.addWall({
      cx: x1 - t / 2, cz: opts.z, yBase: y0,
      length: d, height: wallH, thickness: t, axis: 'z', mat,
      openings: sideOpen('e', d),
    });

    // 厚屋顶 + 矮女儿墙
    this.addBox({
      x: opts.x, y: y0 + wallH + 0.18, z: opts.z,
      w: w + 0.3, h: 0.36, d: d + 0.3,
      mat: this.mats.concrete,
    });
    const parapetH = 0.55;
    const py = y0 + wallH + 0.36 + parapetH / 2;
    this.addBox({
      x: opts.x, y: py, z: z0 + 0.12, w: w + 0.2, h: parapetH, d: 0.22, mat,
    });
    this.addBox({
      x: opts.x, y: py, z: z1 - 0.12, w: w + 0.2, h: parapetH, d: 0.22, mat,
    });
    this.addBox({
      x: x0 + 0.12, y: py, z: opts.z, w: 0.22, h: parapetH, d: d + 0.2, mat,
    });
    this.addBox({
      x: x1 - 0.12, y: py, z: opts.z, w: 0.22, h: parapetH, d: d + 0.2, mat,
    });

    this.minimap.push({
      x: opts.x, z: opts.z, w, d, color: '#6e6e6e', kind: 'building',
    });
  }

  /** 碎石 / 坍塌堆 */
  addRubble(x: number, z: number, scale = 1, rng: () => number = Math.random) {
    const gy = sampleHeight(x, z);
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const ox = (rng() - 0.5) * 2.8 * scale;
      const oz = (rng() - 0.5) * 2.8 * scale;
      const s = (0.45 + rng() * 0.85) * scale;
      this.addBox({
        x: x + ox,
        y: gy + s * 0.4,
        z: z + oz,
        w: s * (0.9 + rng() * 0.6),
        h: s * (0.5 + rng() * 0.5),
        d: s * (0.8 + rng() * 0.5),
        mat: rng() > 0.4 ? this.mats.concrete : this.mats.brick,
      });
    }
    this.minimap.push({ x, z, w: 2.5 * scale, d: 2.5 * scale, color: '#6a6055', kind: 'cover' });
  }

  /** 矮碉堡 / 机枪巢（封闭式，不可进入） — 见 addBunker */

  addSandbag(x: number, z: number, rotY = 0) {
    const gy = sampleHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, gy, z);
    group.rotation.y = rotY;

    const dims = [
      { y: 0.22, w: 2.4, h: 0.44, d: 0.75 },
      { y: 0.62, w: 2.0, h: 0.38, d: 0.7 },
      { y: 0.95, w: 1.5, h: 0.32, d: 0.62 },
    ];

    for (const s of dims) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), this.mats.sand);
      mesh.position.set(0, s.y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const cos = Math.abs(Math.cos(rotY));
      const sin = Math.abs(Math.sin(rotY));
      const aw = s.w * cos + s.d * sin;
      const ad = s.w * sin + s.d * cos;
      this.obstacles.push({
        min: new THREE.Vector3(x - aw / 2, gy + s.y - s.h / 2, z - ad / 2),
        max: new THREE.Vector3(x + aw / 2, gy + s.y + s.h / 2, z + ad / 2),
      });
    }
    this.root.add(group);
    this.minimap.push({ x, z, w: 2.4, d: 0.9, color: '#c2a66a', kind: 'cover' });
  }

  /** 沙袋工事线 */
  addSandbagLine(x0: number, z0: number, x1: number, z1: number, spacing = 2.2) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.floor(len / spacing));
    const ang = Math.atan2(dx, dz);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.addSandbag(x0 + dx * t, z0 + dz * t, ang + Math.PI / 2);
    }
  }

  addCrate(x: number, z: number, scale = 1, stacked = false) {
    const s = 1.05 * scale;
    const gy = sampleHeight(x, z);
    this.addBox({
      x, y: gy + s / 2, z, w: s, h: s, d: s,
      mat: this.mats.wood,
      minimap: { color: '#a07840', kind: 'cover' },
    });
    // 加固条
    this.addBox({
      x, y: gy + s / 2, z: z + s / 2 + 0.02,
      w: s * 0.85, h: 0.07, d: 0.04,
      mat: this.mats.darkMetal, collide: false, castShadow: false,
    });
    if (stacked) {
      this.addBox({
        x: x + 0.15, y: gy + s + s * 0.45, z: z - 0.1,
        w: s * 0.9, h: s * 0.9, d: s * 0.9,
        mat: this.mats.wood,
      });
    }
  }

  addBarrel(x: number, z: number) {
    const gy = sampleHeight(x, z);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.4, 1.05, 10),
      this.mats.rust,
    );
    mesh.position.set(x, gy + 0.52, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.obstacles.push({
      min: new THREE.Vector3(x - 0.4, gy, z - 0.4),
      max: new THREE.Vector3(x + 0.4, gy + 1.05, z + 0.4),
    });
    this.minimap.push({ x, z, w: 0.9, d: 0.9, color: '#7a4030', kind: 'cover' });
  }

  addLowWall(x: number, z: number, len: number, axis: 'x' | 'z', h = 1.15) {
    const gy = sampleHeight(x, z);
    if (axis === 'x') {
      this.addBox({
        x, y: gy + h / 2, z, w: len, h, d: 0.4,
        mat: this.mats.concrete,
        minimap: { color: '#888', kind: 'cover', w: len, d: 0.6 },
      });
    } else {
      this.addBox({
        x, y: gy + h / 2, z, w: 0.4, h, d: len,
        mat: this.mats.concrete,
        minimap: { color: '#888', kind: 'cover', w: 0.6, d: len },
      });
    }
  }

  addRock(x: number, z: number, scale = 1) {
    const gy = sampleHeight(x, z);
    const s = scale;
    this.addBox({
      x, y: gy + 0.55 * s, z,
      w: 1.4 * s, h: 1.1 * s, d: 1.2 * s,
      mat: this.mats.rock,
      minimap: { color: '#666', kind: 'cover' },
    });
    this.addBox({
      x: x + 0.5 * s, y: gy + 0.35 * s, z: z - 0.3 * s,
      w: 0.9 * s, h: 0.7 * s, d: 0.8 * s,
      mat: this.mats.rock,
      collide: false,
    });
  }

  addContainer(x: number, z: number, rotY = 0) {
    const gy = sampleHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    g.rotation.y = rotY;

    const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 2.5), this.mats.paint);
    body.position.y = 1.25;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.12, 2.6), this.mats.darkMetal);
    ridge.position.y = 2.55;
    g.add(ridge);

    this.root.add(g);
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const bw = 6.2 * cos + 2.5 * sin;
    const bd = 6.2 * sin + 2.5 * cos;
    this.obstacles.push({
      min: new THREE.Vector3(x - bw / 2, gy, z - bd / 2),
      max: new THREE.Vector3(x + bw / 2, gy + 2.6, z + bd / 2),
    });
    this.minimap.push({ x, z, w: bw, d: bd, color: '#3a5a3a', kind: 'cover' });
  }

  addVehicleWreck(x: number, z: number, rotY = 0) {
    const gy = sampleHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    g.rotation.y = rotY;

    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 1.9), this.mats.rust);
    body.position.set(0, 0.85, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.05, 1.8), this.mats.darkMetal);
    cabin.position.set(-0.65, 1.7, 0);
    cabin.castShadow = true;
    g.add(cabin);

    // 破损挡风玻璃框
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 1.5), this.mats.darkMetal);
    frame.position.set(-1.45, 1.85, 0);
    g.add(frame);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.7), this.mats.metal);
    bed.position.set(1.15, 1.35, 0);
    bed.castShadow = true;
    g.add(bed);

    // 车斗护栏
    for (const side of [-0.85, 0.85]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.08), this.mats.rust);
      rail.position.set(1.15, 1.7, side);
      g.add(rail);
    }

    for (const [wx, wz] of [[-1.35, 1.05], [-1.35, -1.05], [1.35, 1.05], [1.35, -1.05]]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10),
        this.mats.darkMetal,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      wheel.castShadow = true;
      g.add(wheel);
    }

    // 倾斜一点更像残骸
    g.rotation.z = (Math.sin(x * 0.1) * 0.08);
    this.root.add(g);

    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const bw = 4.4 * cos + 1.9 * sin;
    const bd = 4.4 * sin + 1.9 * cos;
    this.obstacles.push({
      min: new THREE.Vector3(x - bw / 2, gy, z - bd / 2),
      max: new THREE.Vector3(x + bw / 2, gy + 2.2, z + bd / 2),
    });
    this.minimap.push({ x, z, w: bw, d: bd, color: '#6a4030', kind: 'vehicle' });
  }

  addTree(x: number, z: number, scale = 1) {
    const gy = sampleHeight(x, z);
    const trunkH = 2.4 * scale;
    const trunkR = 0.3 * scale;
    const leavesR = 1.5 * scale;
    this.treeQueue.push({ x, z, gy, scale });
    this.obstacles.push({
      min: new THREE.Vector3(x - trunkR, gy, z - trunkR),
      max: new THREE.Vector3(x + trunkR, gy + trunkH, z + trunkR),
    });
    this.minimap.push({
      x, z, w: leavesR * 1.3, d: leavesR * 1.3, color: '#2d6b28', kind: 'tree',
    });
  }

  /** 用 InstancedMesh 批量提交树木（性能） */
  flushTrees() {
    const n = this.treeQueue.length;
    if (n === 0) return;

    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.3, 2.4, 6);
    const leafGeo = new THREE.ConeGeometry(1.5, 3.4, 7);
    const leaf2Geo = new THREE.ConeGeometry(1.05, 2.4, 7);
    const trunks = new THREE.InstancedMesh(trunkGeo, this.mats.bark, n);
    const leaves = new THREE.InstancedMesh(leafGeo, this.mats.foliage, n);
    const leaves2 = new THREE.InstancedMesh(leaf2Geo, this.mats.foliage, n);
    trunks.castShadow = true;
    leaves.castShadow = true;
    leaves2.castShadow = true;
    trunks.receiveShadow = true;

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const t = this.treeQueue[i];
      const sc = t.scale;
      const trunkH = 2.4 * sc;

      p.set(t.x, t.gy + trunkH / 2, t.z);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);

      p.set(t.x, t.gy + trunkH + 3.4 * sc * 0.3, t.z);
      m.compose(p, q, s);
      leaves.setMatrixAt(i, m);

      p.set(t.x, t.gy + trunkH + 3.4 * sc * 0.65, t.z);
      s.set(sc * 0.7, sc * 0.7, sc * 0.7);
      m.compose(p, q, s);
      leaves2.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    leaves2.instanceMatrix.needsUpdate = true;
    this.root.add(trunks, leaves, leaves2);
    this.treeQueue.length = 0;
  }

  /** 矮碉堡 / 机枪巢 */
  addBunker(x: number, z: number) {
    const gy = sampleHeight(x, z);
    this.addBox({
      x, y: gy + 0.7, z, w: 4.5, h: 1.4, d: 3.5,
      mat: this.mats.concrete,
      minimap: { color: '#777', kind: 'building', w: 4.5, d: 3.5 },
    });
    // 射击口上沿
    this.addBox({
      x, y: gy + 1.55, z: z + 1.6, w: 3.2, h: 0.35, d: 0.4,
      mat: this.mats.concrete,
    });
    // 侧翼沙袋
    this.addSandbag(x - 2.8, z + 0.5, Math.PI / 2);
    this.addSandbag(x + 2.8, z + 0.5, Math.PI / 2);
  }

  /** 瞭望塔 */
  addWatchtower(x: number, z: number) {
    const gy = sampleHeight(x, z);
    for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      this.addBox({
        x: x + ox, y: gy + 2.5, z: z + oz,
        w: 0.3, h: 5, d: 0.3, mat: this.mats.wood,
      });
    }
    this.addBox({
      x, y: gy + 5.2, z, w: 3.2, h: 0.25, d: 3.2, mat: this.mats.wood,
    });
    // 护栏
    for (const [ox, oz, ax] of [
      [0, -1.5, 'x'], [0, 1.5, 'x'], [-1.5, 0, 'z'], [1.5, 0, 'z'],
    ] as [number, number, string][]) {
      if (ax === 'x') {
        this.addBox({
          x: x + ox, y: gy + 5.7, z: z + oz, w: 3, h: 0.8, d: 0.12,
          mat: this.mats.wood,
        });
      } else {
        this.addBox({
          x: x + ox, y: gy + 5.7, z: z + oz, w: 0.12, h: 0.8, d: 3,
          mat: this.mats.wood,
        });
      }
    }
    this.minimap.push({ x, z, w: 3.2, d: 3.2, color: '#8a7040', kind: 'building' });
  }
}

export function buildBattlefieldMap(scene: THREE.Scene): MapData {
  const map = new MapBuilder(scene);
  const seed = { v: 12345 };
  const R = () => rndSeed(seed);

  // 程序化建筑：民房 / 残垣 / 可进入碉堡 / 瓦砾 / 矮墙 / 瞭望塔
  generateBattlefieldStructures(map, {
    seed: 778899,
    attempts: 240,
    minSeparation: 13,
    flagClearExtra: 7,
  });

  // 稀疏战壕沙袋线（跨大战场）
  map.addSandbagLine(-60, 100, 50, 105, 3.2);
  map.addSandbagLine(-80, 20, 40, 25, 3.5);
  map.addSandbagLine(20, -40, 20, 50, 3.0);
  map.addSandbagLine(-50, -100, 40, -95, 3.4);
  map.addSandbagLine(-30, 160, 40, 165, 3.0);
  map.addSandbagLine(-90, -40, 70, -35, 3.6);
  map.addSandbagLine(40, 80, 40, -20, 3.4);

  for (let i = 0; i < 48; i++) {
    const x = -180 + R() * 360;
    const z = -200 + R() * 400;
    if (Math.hypot(x, z - 210) < 18) continue;
    if (Math.hypot(x, z + 210) < 18) continue;
    map.addSandbag(x, z, R() * Math.PI * 2);
  }

  const crateClusters = [
    [10, 130], [-40, 75], [55, 5], [-35, -65], [25, -135],
    [0, 200], [5, -200], [80, 60], [-90, -20], [40, -40],
    [-20, 40], [100, -100], [-70, 120], [90, -150],
  ];
  for (const [cx, cz] of crateClusters) {
    map.addCrate(cx, cz, 1, true);
    map.addCrate(cx + 1.2, cz + 0.3, 0.9);
    if (R() > 0.45) map.addBarrel(cx + 2, cz - 0.5);
  }
  for (let i = 0; i < 32; i++) {
    map.addCrate(-160 + R() * 320, -180 + R() * 360, 0.8 + R() * 0.4, R() > 0.6);
  }
  for (let i = 0; i < 24; i++) {
    map.addBarrel(-160 + R() * 320, -180 + R() * 360);
  }

  map.addContainer(70, 110, 0.3);
  map.addContainer(-80, 90, -0.5);
  map.addContainer(90, -20, Math.PI / 2);
  map.addContainer(-100, -80, 0.2);
  map.addContainer(30, -160, 0.8);
  map.addContainer(-50, 160, -0.4);
  map.addContainer(60, -180, 1.1);

  const vehicles: [number, number, number][] = [
    [30, 150, Math.PI / 5], [-50, 100, -Math.PI / 3], [70, 20, Math.PI / 2],
    [-60, -40, 0.4], [20, -150, -0.8], [90, 80, 1.2], [-110, 30, -0.3],
    [40, -70, 0.7], [-15, 180, -1.1], [100, -120, 0.15], [-80, -160, 0.9],
    [0, 50, 0.5], [55, -10, -0.4], [-120, -100, 0.6], [110, 40, -0.7],
  ];
  for (const [x, z, r] of vehicles) map.addVehicleWreck(x, z, r);

  // 两侧岩石带
  for (let i = 0; i < 36; i++) {
    map.addRock(-220 + R() * 50, -200 + R() * 400, 0.9 + R() * 1.4);
  }
  for (let i = 0; i < 32; i++) {
    map.addRock(170 + R() * 50, -200 + R() * 400, 0.8 + R() * 1.5);
  }

  // 边缘疏林（避开中部走廊）
  for (let i = 0; i < 55; i++) {
    const x = -200 + R() * 80;
    const z = -180 + R() * 360;
    map.addTree(x, z, 0.7 + R() * 0.6);
  }
  for (let i = 0; i < 50; i++) {
    const x = 120 + R() * 80;
    const z = -180 + R() * 360;
    map.addTree(x, z, 0.65 + R() * 0.55);
  }
  for (let i = 0; i < 30; i++) {
    map.addTree(-80 + R() * 160, 200 + R() * 40, 0.7 + R() * 0.45);
  }
  for (let i = 0; i < 28; i++) {
    map.addTree(-80 + R() * 160, -240 + R() * 35, 0.7 + R() * 0.45);
  }

  const border = MAP_HALF - 1;
  for (let i = -MAP_HALF; i <= MAP_HALF; i += 16) {
    for (const [px, pz] of [[i, -border], [i, border], [-border, i], [border, i]] as [number, number][]) {
      const gy = sampleHeight(px, pz);
      map.addBox({
        x: px, y: gy + 0.7, z: pz, w: 0.45, h: 1.5, d: 0.45,
        mat: map.mats.metal,
      });
    }
  }

  map.flushTrees();

  const spawnX = 0;
  const spawnZ = 218;
  const spawn = new THREE.Vector3(spawnX, sampleHeight(spawnX, spawnZ) + 0.9, spawnZ);

  return {
    obstacles: map.obstacles,
    minimap: map.minimap,
    spawn,
    root: map.root,
  };
}
