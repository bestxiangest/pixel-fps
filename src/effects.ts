import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Decal {
  mesh: THREE.Mesh;
  life: number;
}

/** 弹痕 + 像素飞溅粒子 */
export class Effects {
  private readonly root = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly decals: Decal[] = [];
  private readonly particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  private readonly particleMat = new THREE.MeshBasicMaterial({ color: 0xc8a060 });
  private readonly decalGeo = new THREE.PlaneGeometry(0.18, 0.18);
  private readonly decalMat = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly maxDecals = 80;
  private readonly maxParticles = 120;

  constructor(scene: THREE.Scene) {
    this.root.name = 'effects';
    scene.add(this.root);
  }

  spawnHit(point: THREE.Vector3, normal: THREE.Vector3, color = 0xb09060) {
    // 弹痕
    const decal = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
    decal.position.copy(point).addScaledVector(normal, 0.02);
    decal.lookAt(point.clone().add(normal));
    this.root.add(decal);
    this.decals.push({ mesh: decal, life: 12 });
    while (this.decals.length > this.maxDecals) {
      const old = this.decals.shift()!;
      this.root.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }

    // 飞溅方块
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const mat = this.particleMat.clone();
      mat.color.setHex(color);
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(point);
      const vel = normal
        .clone()
        .multiplyScalar(2 + Math.random() * 3)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            Math.random() * 3 + 1,
            (Math.random() - 0.5) * 4,
          ),
        );
      this.root.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      const t = Math.max(0, p.life / p.maxLife);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t;
      mat.transparent = true;
      if (p.life <= 0) {
        this.root.remove(p.mesh);
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 2) {
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 2) * 0.85;
      }
      if (d.life <= 0) {
        this.root.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.decals.splice(i, 1);
      }
    }
  }
}
