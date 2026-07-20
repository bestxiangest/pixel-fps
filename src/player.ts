import * as THREE from 'three';
import { AABB, HeightFn, moveWithCollision } from './collision';
import { MAP_HALF } from './map';

const GRAVITY = -28;
const JUMP_VEL = 9;
const WALK_SPEED = 5.8;
const SPRINT_SPEED = 10.5;
const PLAYER_RADIUS = 0.32;
const PLAYER_HALF_HEIGHT = 0.9;
const EYE_OFFSET = 0.7;
const MOUSE_SENS = 0.002;
const BASE_FOV = 72;
const HEALTH_REGEN_DELAY = 5;
const HEALTH_REGEN_PER_SEC = 18;
export const PLAYER_MAX_HP = 100;

export class Player {
  camera: THREE.PerspectiveCamera;
  position = new THREE.Vector3(0, PLAYER_HALF_HEIGHT, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  obstacles: AABB[] = [];
  getHeight: HeightFn = () => 0;
  moving = false;

  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  alive = true;
  autoRespawn = true;
  allowPointerLock = false;
  sprinting = false;
  airborne = false;

  /** 后坐力附加角（弧度），开火叠加，停火后部分恢复 */
  private recoilPitch = 0;
  private recoilYaw = 0;
  /** 开镜移速倍率（武器系统写入） */
  private adsSpeedMul = 1;

  private respawnTimer = 0;
  private healthRegenCooldown = 0;
  private spawnPos = new THREE.Vector3(0, PLAYER_HALF_HEIGHT, 55);
  private spawnYaw = 0;
  private hurtFlash = 0;
  private onHpChange?: (hp: number, max: number, dead: boolean) => void;
  private onDeath?: () => void;

  private keys = new Set<string>();
  private input = {
    fwd: false,
    bwd: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };
  private jumpHeld = false;

  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _move = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 780);
    this.camera.rotation.order = 'YXZ';
    this.syncCamera();
    this.bind();
  }

  setHpCallback(cb: (hp: number, max: number, dead: boolean) => void) {
    this.onHpChange = cb;
    this.pushHp();
  }

  setDeathCallback(cb: () => void) {
    this.onDeath = cb;
  }

  setSpawn(pos: THREE.Vector3, yaw = 0) {
    this.spawnPos.copy(pos);
    this.spawnYaw = yaw;
    this.respawnImmediate();
  }

  /** 仅更新下次出生点，不立刻传送 */
  setSpawnPoint(pos: THREE.Vector3, yaw = 0) {
    this.spawnPos.copy(pos);
    this.spawnYaw = yaw;
  }

  resetForMatch(autoRespawn: boolean) {
    this.autoRespawn = autoRespawn;
    this.respawnImmediate();
  }

  /** 非自动复活时，倒计时结束后可手动选点复活 */
  canChooseSpawn(): boolean {
    return !this.alive && !this.autoRespawn && this.respawnTimer <= 0;
  }

  getRespawnCountdown(): number {
    return Math.max(0, this.respawnTimer);
  }

  setFov(fov: number) {
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setAdsSpeedMul(mul: number) {
    this.adsSpeedMul = mul;
  }

  respawnImmediate() {
    this.position.copy(this.spawnPos);
    const gy = this.getHeight(this.position.x, this.position.z);
    this.position.y = gy + PLAYER_HALF_HEIGHT;
    this.yaw = this.spawnYaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.airborne = false;
    this.hp = this.maxHp;
    this.alive = true;
    this.respawnTimer = 0;
    this.healthRegenCooldown = 0;
    this.hurtFlash = 0;
    this.adsSpeedMul = 1;
    this.setFov(BASE_FOV);
    this.syncCamera();
    this.pushHp();
  }

  /** 传送到指定据点并复活 */
  respawnAt(pos: THREE.Vector3, yaw = 0) {
    this.spawnPos.copy(pos);
    this.spawnYaw = yaw;
    this.respawnImmediate();
  }

  takeDamage(amount: number) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthRegenCooldown = HEALTH_REGEN_DELAY;
    this.hurtFlash = 0.45;
    this.pushHp();
    if (this.hp <= 0) {
      this.alive = false;
      // 自动复活 3.5s；手动选点需等待 2s
      this.respawnTimer = this.autoRespawn ? 3.5 : 2.0;
      this.pushHp();
      this.onDeath?.();
    }
  }

  getHurtFlash(): number {
    return this.hurtFlash;
  }

  private pushHp() {
    this.onHpChange?.(this.hp, this.maxHp, !this.alive);
  }

  private bind() {
    document.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.jumpHeld) {
          this.input.jump = true;
          this.jumpHeld = true;
        }
      }
      this.keys.add(e.code);
      this.syncInput();
    });

    document.addEventListener('keyup', e => {
      if (e.code === 'Space') this.jumpHeld = false;
      this.keys.delete(e.code);
      this.syncInput();
    });

    document.addEventListener('mousemove', e => {
      if (!document.pointerLockElement || !this.alive) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch -= e.movementY * MOUSE_SENS;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });

    document.addEventListener('click', () => {
      if (this.allowPointerLock && this.alive && !document.pointerLockElement) {
        try {
          void document.body.requestPointerLock().catch(() => undefined);
        } catch {
          // 无头浏览器和部分嵌入式页面不允许锁定指针。
        }
      }
    });
  }

  private syncInput() {
    this.input.fwd = this.keys.has('KeyW');
    this.input.bwd = this.keys.has('KeyS');
    this.input.left = this.keys.has('KeyA');
    this.input.right = this.keys.has('KeyD');
    this.input.sprint =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  private getMoveDirection(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.crossVectors(this._forward, this._up).normalize();
    if (this.input.fwd) out.add(this._forward);
    if (this.input.bwd) out.sub(this._forward);
    if (this.input.left) out.sub(this._right);
    if (this.input.right) out.add(this._right);
    if (out.lengthSq() > 0) out.normalize();
    return out;
  }

  private syncCamera() {
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_OFFSET,
      this.position.z,
    );
    const limit = Math.PI / 2 - 0.01;
    const px = Math.max(
      -limit,
      Math.min(limit, this.pitch + this.recoilPitch),
    );
    this.camera.rotation.x = px;
    this.camera.rotation.y = this.yaw + this.recoilYaw;
  }

  /**
   * 开火后坐力：瞬时冲量叠加到 recoil*，
   * 恢复时约 65% 回弹、35% 并入 pitch 形成连发上抬。
   */
  applyRecoil(pitchKick: number, yawKick: number) {
    if (!this.alive) return;
    this.recoilPitch += pitchKick;
    this.recoilYaw += yawKick;
  }

  update(dt: number) {
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    if (this.alive && this.hp < this.maxHp) {
      if (this.healthRegenCooldown > 0) {
        this.healthRegenCooldown = Math.max(0, this.healthRegenCooldown - dt);
      } else {
        const previousDisplayHp = Math.ceil(this.hp);
        this.hp = Math.min(this.maxHp, this.hp + HEALTH_REGEN_PER_SEC * dt);
        if (Math.ceil(this.hp) !== previousDisplayHp || this.hp >= this.maxHp) {
          this.pushHp();
        }
      }
    }

    // 后坐力恢复：部分并入瞄准角，部分归零
    if (this.recoilPitch !== 0 || this.recoilYaw !== 0) {
      const recover = 1 - Math.exp(-8 * dt);
      const keep = 0.35; // 残留到 pitch/yaw 的比例
      const dp = this.recoilPitch * recover;
      const dy = this.recoilYaw * recover;
      this.pitch += dp * keep;
      this.yaw += dy * keep;
      this.recoilPitch -= dp;
      this.recoilYaw -= dy;
      if (Math.abs(this.recoilPitch) < 1e-4) this.recoilPitch = 0;
      if (Math.abs(this.recoilYaw) < 1e-4) this.recoilYaw = 0;
    }

    if (!this.alive) {
      this.respawnTimer -= dt;
      this.velocity.set(0, 0, 0);
      this.moving = false;
      this.sprinting = false;
      this.airborne = false;
      this.camera.position.set(
        this.position.x,
        this.position.y + EYE_OFFSET * 0.35,
        this.position.z,
      );
      this.camera.rotation.x = 0.4;
      this.camera.rotation.y = this.yaw;
      if (this.autoRespawn && this.respawnTimer <= 0) this.respawnImmediate();
      return;
    }

    // 开镜时禁止疾跑
    const canSprint = this.input.sprint && this.adsSpeedMul > 0.85;
    this.sprinting = canSprint;
    const baseSpeed = canSprint ? SPRINT_SPEED : WALK_SPEED;
    const speed = baseSpeed * this.adsSpeedMul;

    this.getMoveDirection(this._move);
    this.moving = this._move.lengthSq() > 0;

    this.velocity.x = this._move.x * speed;
    this.velocity.z = this._move.z * speed;
    this.velocity.y += GRAVITY * dt;

    if (this.input.jump && this.grounded) {
      this.velocity.y = JUMP_VEL;
      this.grounded = false;
      this.input.jump = false;
    }

    const result = moveWithCollision(
      this.position,
      this.velocity,
      dt,
      PLAYER_RADIUS,
      PLAYER_HALF_HEIGHT,
      this.obstacles,
      this.getHeight,
    );
    this.position.copy(result.position);
    this.grounded = result.grounded;
    this.airborne = !this.grounded;

    const limit = MAP_HALF - 1.5;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    this.syncCamera();
  }
}
