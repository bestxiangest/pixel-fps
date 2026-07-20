import * as THREE from 'three';
import type { AABB, HeightFn } from './collision';
import { createMetalTexture } from './textures';
import { GameAudio } from './audio';

interface AmmoDrop {
  root: THREE.Group;
  baseY: number;
  life: number;
  phase: number;
}

interface AmmoCrate {
  root: THREE.Group;
  x: number;
  z: number;
}

const PICKUP_RADIUS = 1.55;
const CRATE_INTERACT_RADIUS = 2.8;
const DROP_LIFETIME = 45;
const MAX_DROPS = 18;

const CRATE_POSITIONS = [
  { x: -14, z: 200 },
  { x: 20, z: 140 },
  { x: -40, z: 70 },
  { x: 55, z: 5 },
  { x: -35, z: -70 },
  { x: 25, z: -140 },
  { x: 12, z: -200 },
  { x: 0, z: 30 },
];

function lambert(color: number, map?: THREE.Texture) {
  const emissive = new THREE.Color(color).multiplyScalar(0.09);
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: 1,
    flatShading: true,
    ...(map ? { map } : {}),
  });
}

function markNoHit(root: THREE.Object3D) {
  root.traverse(object => {
    object.userData.noHit = true;
  });
}

function buildAmmoDrop(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'ammo-drop';
  const caseMat = lambert(0x70894d);
  const darkMat = lambert(0x3b4632);
  const brassMat = lambert(0xffcd55);

  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.28, 0.52),
    caseMat,
  );
  caseMesh.position.y = 0.18;
  root.add(caseMesh);

  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.08, 0.14),
    darkMat,
  );
  strap.position.y = 0.35;
  root.add(strap);

  for (let i = -1; i <= 1; i++) {
    const cartridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.18, 0.08),
      brassMat,
    );
    cartridge.position.set(i * 0.13, 0.5, 0);
    root.add(cartridge);
  }
  markNoHit(root);
  return root;
}

function buildAmmoCrate(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'ammo-crate';
  const metal = createMetalTexture();
  const bodyMat = lambert(0x7b9167, metal);
  const edgeMat = lambert(0x424d3e, metal);
  const markMat = lambert(0xffdb62);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.9, 1.15),
    bodyMat,
  );
  body.position.y = 0.5;
  root.add(body);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.82, 0.16, 1.25),
    edgeMat,
  );
  lid.position.y = 1.02;
  root.add(lid);

  for (const x of [-0.72, 0.72]) {
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.0, 1.2),
      edgeMat,
    );
    brace.position.set(x, 0.5, 0);
    root.add(brace);
  }

  const ammoMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.18, 0.04),
    markMat,
  );
  ammoMark.position.set(0, 0.58, 0.59);
  root.add(ammoMark);
  for (let i = -1; i <= 1; i++) {
    const round = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.34, 0.05),
      markMat,
    );
    round.position.set(i * 0.18, 0.58, 0.62);
    root.add(round);
  }

  root.traverse(object => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}

export class AmmoSupplySystem {
  readonly root = new THREE.Group();
  private readonly drops: AmmoDrop[] = [];
  private readonly crates: AmmoCrate[] = [];

  constructor(
    scene: THREE.Scene,
    obstacles: AABB[],
    getHeight: HeightFn,
    private readonly audio: GameAudio,
  ) {
    this.root.name = 'ammo-supplies';
    scene.add(this.root);

    for (const position of CRATE_POSITIONS) {
      const ground = getHeight(position.x, position.z);
      const root = buildAmmoCrate();
      root.position.set(position.x, ground, position.z);
      root.userData.ammoCrate = true;
      this.root.add(root);
      this.crates.push({ root, x: position.x, z: position.z });
      obstacles.push({
        min: new THREE.Vector3(position.x - 0.95, ground, position.z - 0.68),
        max: new THREE.Vector3(position.x + 0.95, ground + 1.1, position.z + 0.68),
      });
    }
  }

  spawnDrop(position: THREE.Vector3, getHeight: HeightFn) {
    const ground = getHeight(position.x, position.z);
    const root = buildAmmoDrop();
    root.position.set(position.x, ground + 0.08, position.z);
    this.root.add(root);
    this.drops.push({
      root,
      baseY: ground + 0.08,
      life: DROP_LIFETIME,
      phase: Math.random() * Math.PI * 2,
    });
    while (this.drops.length > MAX_DROPS) this.removeDrop(0);
  }

  resetDrops() {
    while (this.drops.length > 0) this.removeDrop(this.drops.length - 1);
  }

  private removeDrop(index: number) {
    const drop = this.drops[index];
    this.root.remove(drop.root);
    drop.root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
      else mesh.material.dispose();
    });
    this.drops.splice(index, 1);
  }

  private nearestCrate(playerPos: THREE.Vector3): AmmoCrate | null {
    let nearest: AmmoCrate | null = null;
    let bestDistance = CRATE_INTERACT_RADIUS;
    for (const crate of this.crates) {
      const distance = Math.hypot(crate.x - playerPos.x, crate.z - playerPos.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = crate;
      }
    }
    return nearest;
  }

  canUseCrate(playerPos: THREE.Vector3, playerAlive: boolean): boolean {
    return playerAlive && this.nearestCrate(playerPos) !== null;
  }

  tryUseCrate(
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    refillAmmo: () => boolean,
  ): boolean {
    if (!playerAlive || !this.nearestCrate(playerPos)) return false;
    const changed = refillAmmo();
    if (changed) this.audio.playAmmoPickup(true);
    return changed;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    addMagazineAmmo: () => boolean,
  ) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.life -= dt;
      drop.root.rotation.y += dt * 0.9;
      drop.root.position.y = drop.baseY + 0.08 + Math.sin(drop.life * 3 + drop.phase) * 0.06;
      if (
        playerAlive &&
        drop.root.position.distanceToSquared(playerPos) <= PICKUP_RADIUS * PICKUP_RADIUS &&
        addMagazineAmmo()
      ) {
        this.audio.playAmmoPickup(false);
        this.removeDrop(i);
        continue;
      }
      if (drop.life <= 0) this.removeDrop(i);
    }
  }
}
