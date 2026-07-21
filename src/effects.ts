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

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

/** 弹痕 + 像素飞溅粒子 + 弹道曳光 */
export class Effects {
  private readonly root = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly decals: Decal[] = [];
  private readonly tracers: Tracer[] = [];
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
  private readonly tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly maxDecals = 80;
  private readonly maxParticles = 120;
  private readonly maxTracers = 48;

  constructor(scene: THREE.Scene) {
    this.root.name = 'effects';
    scene.add(this.root);
  }

  /** 子弹划过空气的快速曳光轨迹 */
  spawnTracer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color = 0xffe08a,
  ) {
    const delta = to.clone().sub(from);
    const length = delta.length();
    if (length < 0.4) return;
    while (this.tracers.length >= this.maxTracers) {
      const old = this.tracers.shift()!;
      this.root.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    // 细长曳光：前段稍粗，整体很细
    const thickness = THREE.MathUtils.clamp(0.035 + length * 0.00015, 0.03, 0.07);
    mesh.scale.set(thickness, thickness, length);
    mesh.position.copy(from).addScaledVector(delta, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      delta.normalize(),
    );
    this.root.add(mesh);
    this.tracers.push({ mesh, life: 0.09, maxLife: 0.09 });
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

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      const t = Math.max(0, tr.life / tr.maxLife);
      const mat = tr.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t * 0.95;
      // 稍稍变细，模拟划过消散
      tr.mesh.scale.x *= 0.92;
      tr.mesh.scale.y *= 0.92;
      if (tr.life <= 0) {
        this.root.remove(tr.mesh);
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
