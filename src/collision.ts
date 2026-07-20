import * as THREE from 'three';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export type HeightFn = (x: number, z: number) => number;

export function boxesOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/**
 * 轴分离 AABB + 地形高度场地面。
 */
export function moveWithCollision(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  dt: number,
  radius: number,
  halfHeight: number,
  obstacles: AABB[],
  getHeight?: HeightFn,
): { position: THREE.Vector3; grounded: boolean } {
  const p = pos.clone();
  let grounded = false;

  const makeBox = (px: number, py: number, pz: number): AABB => ({
    min: new THREE.Vector3(px - radius, py - halfHeight, pz - radius),
    max: new THREE.Vector3(px + radius, py + halfHeight, pz + radius),
  });

  // X
  p.x += vel.x * dt;
  for (const obs of obstacles) {
    if (!boxesOverlap(makeBox(p.x, p.y, p.z), obs)) continue;
    if (vel.x > 0) p.x = obs.min.x - radius;
    else if (vel.x < 0) p.x = obs.max.x + radius;
    else {
      const cx = (obs.min.x + obs.max.x) * 0.5;
      p.x = p.x < cx ? obs.min.x - radius : obs.max.x + radius;
    }
    vel.x = 0;
  }

  // Z
  p.z += vel.z * dt;
  for (const obs of obstacles) {
    if (!boxesOverlap(makeBox(p.x, p.y, p.z), obs)) continue;
    if (vel.z > 0) p.z = obs.min.z - radius;
    else if (vel.z < 0) p.z = obs.max.z + radius;
    else {
      const cz = (obs.min.z + obs.max.z) * 0.5;
      p.z = p.z < cz ? obs.min.z - radius : obs.max.z + radius;
    }
    vel.z = 0;
  }

  // Y
  p.y += vel.y * dt;

  // 地形地面
  const groundY = getHeight ? getHeight(p.x, p.z) : 0;
  if (p.y - halfHeight < groundY) {
    p.y = groundY + halfHeight;
    vel.y = 0;
    grounded = true;
  }

  for (const obs of obstacles) {
    if (!boxesOverlap(makeBox(p.x, p.y, p.z), obs)) continue;

    const feet = p.y - halfHeight;
    const head = p.y + halfHeight;
    const top = obs.max.y;
    const bottom = obs.min.y;
    const thickness = top - bottom;

    if (
      vel.y <= 0 &&
      feet < top &&
      feet > top - Math.max(0.65, thickness + 0.2) &&
      head > top
    ) {
      p.y = top + halfHeight;
      vel.y = 0;
      grounded = true;
      continue;
    }

    if (vel.y > 0) {
      p.y = bottom - halfHeight;
      vel.y = 0;
    } else if (vel.y < 0) {
      p.y = top + halfHeight;
      vel.y = 0;
      grounded = true;
    } else {
      const cy = (bottom + top) * 0.5;
      if (p.y < cy) p.y = bottom - halfHeight;
      else {
        p.y = top + halfHeight;
        grounded = true;
      }
    }
  }

  return { position: p, grounded };
}
