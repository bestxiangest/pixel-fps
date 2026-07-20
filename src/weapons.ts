import * as THREE from 'three';
import { createMetalTexture, createCamoTexture } from './textures';
import { GameAudio } from './audio';
import { Effects } from './effects';

export type PrimaryWeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type WeaponId = PrimaryWeaponId | 'pistol';

/** 战地式散布/后坐力参数（角度单位：度） */
export interface WeaponDef {
  id: WeaponId;
  name: string;
  automatic: boolean;
  rpm: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  range: number;
  damage: number;
  pellets: number;

  /** 腰射：站立静止目标散布 */
  hipStandSpread: number;
  /** 腰射：移动 */
  hipMoveSpread: number;
  /** 腰射：空中 */
  hipAirSpread: number;
  /** 开镜散布（接近指哪打哪） */
  adsSpread: number;
  minSpread: number;
  maxSpread: number;
  /** 每发开火瞬间增加的散布 */
  fireSpreadImpulse: number;
  /** 散布每秒衰减（度/秒） */
  spreadRecover: number;

  /** 首发后坐力（弧度） */
  recoilPitch: number;
  recoilYaw: number;
  /** 连发后坐力递增系数 */
  recoilRamp: number;
  /** 开镜下后坐力倍率 */
  adsRecoilMul: number;
  /** 枪模后坐位移 */
  kick: number;
  /** 开镜 FOV */
  adsFov: number;
}

export interface WeaponState {
  def: WeaponDef;
  mag: number;
  reserve: number;
  model: THREE.Group;
  muzzle: THREE.Object3D;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle',
    name: 'AR-PIXEL',
    automatic: true,
    rpm: 550,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 1.8,
    range: 180,
    damage: 22,
    pellets: 1,
    // 步枪：腰射散大，连发后坐可控
    hipStandSpread: 1.6,
    hipMoveSpread: 3.4,
    hipAirSpread: 6.0,
    adsSpread: 0.18,
    minSpread: 0.12,
    maxSpread: 8.5,
    fireSpreadImpulse: 0.55,
    spreadRecover: 6.5,
    recoilPitch: 0.016,
    recoilYaw: 0.007,
    recoilRamp: 0.12,
    adsRecoilMul: 0.55,
    kick: 0.03,
    adsFov: 48,
  },
  smg: {
    id: 'smg',
    name: 'VX-9 SMG',
    automatic: true,
    rpm: 850,
    magSize: 36,
    reserveMax: 108,
    reloadTime: 1.55,
    range: 82,
    damage: 15,
    pellets: 1,
    // 冲锋枪：近距离射速和腰射占优，持续射击扩散较快。
    hipStandSpread: 1.25,
    hipMoveSpread: 2.45,
    hipAirSpread: 5.2,
    adsSpread: 0.38,
    minSpread: 0.2,
    maxSpread: 10.5,
    fireSpreadImpulse: 0.72,
    spreadRecover: 8.4,
    recoilPitch: 0.011,
    recoilYaw: 0.011,
    recoilRamp: 0.09,
    adsRecoilMul: 0.68,
    kick: 0.022,
    adsFov: 54,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SG-8 BREACH',
    automatic: false,
    rpm: 92,
    magSize: 8,
    reserveMax: 32,
    reloadTime: 2.35,
    range: 38,
    damage: 12,
    pellets: 8,
    // 霰弹枪：一次发射八颗弹丸，近距离爆发高，距离衰减由射程限制体现。
    hipStandSpread: 4.6,
    hipMoveSpread: 6.2,
    hipAirSpread: 9.5,
    adsSpread: 2.25,
    minSpread: 1.8,
    maxSpread: 12,
    fireSpreadImpulse: 1.6,
    spreadRecover: 7,
    recoilPitch: 0.055,
    recoilYaw: 0.022,
    recoilRamp: 0,
    adsRecoilMul: 0.72,
    kick: 0.075,
    adsFov: 56,
  },
  sniper: {
    id: 'sniper',
    name: 'M90 LONGBOW',
    automatic: false,
    rpm: 48,
    magSize: 5,
    reserveMax: 20,
    reloadTime: 2.65,
    range: 300,
    damage: 96,
    pellets: 1,
    // 狙击枪：开镜几乎无散布，腰射极不可靠，单发后坐明显。
    hipStandSpread: 7.5,
    hipMoveSpread: 10,
    hipAirSpread: 14,
    adsSpread: 0.035,
    minSpread: 0.02,
    maxSpread: 15,
    fireSpreadImpulse: 2.4,
    spreadRecover: 5.2,
    recoilPitch: 0.078,
    recoilYaw: 0.016,
    recoilRamp: 0,
    adsRecoilMul: 0.48,
    kick: 0.095,
    adsFov: 30,
  },
  pistol: {
    id: 'pistol',
    name: 'PX-9',
    automatic: false,
    rpm: 240,
    magSize: 12,
    reserveMax: 48,
    reloadTime: 1.2,
    range: 80,
    damage: 28,
    pellets: 1,
    // 手枪：腰射更准，单发后坐更大
    hipStandSpread: 1.1,
    hipMoveSpread: 2.4,
    hipAirSpread: 5.0,
    adsSpread: 0.22,
    minSpread: 0.1,
    maxSpread: 7.0,
    fireSpreadImpulse: 0.75,
    spreadRecover: 8.0,
    recoilPitch: 0.028,
    recoilYaw: 0.014,
    recoilRamp: 0.22,
    adsRecoilMul: 0.65,
    kick: 0.045,
    adsFov: 52,
  },
};

export const PRIMARY_WEAPON_IDS: readonly PrimaryWeaponId[] = [
  'rifle',
  'smg',
  'shotgun',
  'sniper',
];

const HIP_FOV = 72;
const ADS_BLEND_SPEED = 1 / 0.17; // ~170ms

function gunMat(color: number, map?: THREE.Texture) {
  const emissive = new THREE.Color(color).multiplyScalar(0.07);
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: 1,
    flatShading: true,
    ...(map ? { map } : {}),
  });
}

function buildRifle(): { root: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const metal = createMetalTexture();
  const camo = createCamoTexture();
  const bodyMat = gunMat(0xd7e2bd, camo);
  const metalMat = gunMat(0xaeb9c0, metal);
  const darkMat = gunMat(0x485157);
  const accentMat = gunMat(0x9dac65);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42), bodyMat);
  body.position.set(0, 0, -0.05);
  root.add(body);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.22), darkMat);
  handguard.position.set(0, -0.01, -0.28);
  root.add(handguard);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.025, 0.34),
    metalMat,
  );
  rail.position.set(0, 0.07, -0.13);
  root.add(rail);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.28, 6),
    metalMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.48);
  root.add(barrel);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.18), bodyMat);
  stock.position.set(0, -0.02, 0.22);
  root.add(stock);

  const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.04), darkMat);
  stockPad.position.set(0, -0.03, 0.32);
  root.add(stockPad);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.08), darkMat);
  mag.position.set(0, -0.12, -0.02);
  root.add(mag);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), darkMat);
  grip.position.set(0, -0.12, 0.08);
  grip.rotation.x = 0.25;
  root.add(grip);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), metalMat);
  sight.position.set(0, 0.07, -0.12);
  root.add(sight);

  const frontSight = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.065, 0.035),
    accentMat,
  );
  frontSight.position.set(0, 0.085, -0.43);
  root.add(frontSight);

  const receiverMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.084, 0.035, 0.12),
    accentMat,
  );
  receiverMark.position.set(0, 0.055, 0.02);
  root.add(receiverMark);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.62);
  root.add(muzzle);

  return { root, muzzle };
}

function buildSmg(): { root: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const metal = createMetalTexture();
  const bodyMat = gunMat(0xbfd4d9, metal);
  const darkMat = gunMat(0x35454b);
  const accentMat = gunMat(0x4ed0c4);

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.105, 0.3),
    bodyMat,
  );
  receiver.position.z = -0.05;
  root.add(receiver);

  const shroud = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.075, 0.22),
    darkMat,
  );
  shroud.position.set(0, -0.005, -0.28);
  root.add(shroud);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.019, 0.16, 6),
    darkMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.45);
  root.add(barrel);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.2, 0.075),
    darkMat,
  );
  mag.position.set(0, -0.145, -0.08);
  root.add(mag);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.07, 0.16),
    accentMat,
  );
  stock.position.set(0, -0.015, 0.18);
  root.add(stock);

  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.025, 0.22),
    accentMat,
  );
  topRail.position.set(0, 0.075, -0.08);
  root.add(topRail);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.55);
  root.add(muzzle);
  return { root, muzzle };
}

function buildShotgun(): { root: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const metal = createMetalTexture();
  const metalMat = gunMat(0x9ba9ad, metal);
  const darkMat = gunMat(0x30383b);
  const pumpMat = gunMat(0xc49351);

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.115, 0.3),
    metalMat,
  );
  receiver.position.z = 0.02;
  root.add(receiver);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.022, 0.5, 8),
    darkMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.035, -0.38);
  root.add(barrel);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.017, 0.4, 6),
    metalMat,
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, -0.015, -0.34);
  root.add(tube);

  const pump = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.09, 0.18),
    pumpMat,
  );
  pump.position.set(0, -0.02, -0.29);
  root.add(pump);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.12, 0.27),
    pumpMat,
  );
  stock.position.set(0, -0.035, 0.29);
  root.add(stock);

  const frontSight = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.045, 0.018),
    gunMat(0xffcf55),
  );
  frontSight.position.set(0, 0.075, -0.59);
  root.add(frontSight);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.035, -0.65);
  root.add(muzzle);
  return { root, muzzle };
}

function buildSniper(): { root: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const metal = createMetalTexture();
  const metalMat = gunMat(0xa7b7bd, metal);
  const darkMat = gunMat(0x29343a);
  const stockMat = gunMat(0x667d49);
  const lensMat = new THREE.MeshBasicMaterial({
    color: 0x7ee8ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.11, 0.36),
    stockMat,
  );
  receiver.position.z = 0.02;
  root.add(receiver);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.018, 0.62, 8),
    metalMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.025, -0.47);
  root.add(barrel);

  const muzzleBrake = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.055, 0.1),
    darkMat,
  );
  muzzleBrake.position.set(0, 0.025, -0.81);
  root.add(muzzleBrake);

  const scope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.28, 8, 1, true),
    darkMat,
  );
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.13, -0.03);
  root.add(scope);

  // 镜筒必须保持中心透空；实体端盖或镜片会在 ADS 时完全挡住相机。
  const scopeLens = new THREE.Mesh(
    new THREE.TorusGeometry(0.047, 0.006, 4, 8),
    lensMat,
  );
  scopeLens.position.set(0, 0.13, -0.175);
  root.add(scopeLens);

  const rearScopeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.047, 0.007, 4, 8),
    darkMat,
  );
  rearScopeRing.position.set(0, 0.13, 0.115);
  root.add(rearScopeRing);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.13, 0.32),
    stockMat,
  );
  stock.position.set(0, -0.035, 0.35);
  root.add(stock);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.13, 0.09),
    darkMat,
  );
  mag.position.set(0, -0.12, 0.02);
  root.add(mag);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.025, -0.88);
  root.add(muzzle);
  return { root, muzzle };
}

function buildPistol(): { root: THREE.Group; muzzle: THREE.Object3D } {
  const root = new THREE.Group();
  const metal = createMetalTexture();
  const metalMat = gunMat(0xb2bdc5, metal);
  const darkMat = gunMat(0x454e53);
  const sightMat = gunMat(0xb8d86c);

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.2), metalMat);
  slide.position.set(0, 0.02, -0.02);
  root.add(slide);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.011, 0.12, 6),
    metalMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.16);
  root.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), darkMat);
  grip.position.set(0, -0.08, 0.04);
  grip.rotation.x = 0.15;
  root.add(grip);

  const rearSight = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.025, 0.025),
    sightMat,
  );
  rearSight.position.set(0, 0.07, 0.055);
  root.add(rearSight);

  const frontSight = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.035, 0.018),
    sightMat,
  );
  frontSight.position.set(0, 0.07, -0.1);
  root.add(frontSight);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.03), darkMat);
  trigger.position.set(0, -0.04, -0.02);
  root.add(trigger);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.22);
  root.add(muzzle);

  return { root, muzzle };
}

/** 圆形锥内均匀随机方向偏移（极坐标） */
function circularSpreadOffset(
  dir: THREE.Vector3,
  upHint: THREE.Vector3,
  spreadDeg: number,
): THREE.Vector3 {
  if (spreadDeg <= 0.001) return dir.clone().normalize();
  const spreadRad = THREE.MathUtils.degToRad(spreadDeg);
  // 面积均匀：r = sqrt(u) * maxAngle
  const r = Math.sqrt(Math.random()) * spreadRad;
  const theta = Math.random() * Math.PI * 2;

  const right = new THREE.Vector3().crossVectors(dir, upHint);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  const out = dir.clone().normalize();
  out.addScaledVector(right, Math.cos(theta) * Math.sin(r));
  out.addScaledVector(up, Math.sin(theta) * Math.sin(r));
  // 沿 forward 分量 cos(r) 近似
  out.multiplyScalar(1);
  return out.normalize();
}

export interface WeaponHud {
  name: string;
  mag: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
  /** 当前散布（度），供准星间距 */
  spreadDeg: number;
  ads: boolean;
  adsBlend: number;
}

export interface PlayerWeaponContext {
  yaw: number;
  pitch: number;
  applyRecoil: (pitch: number, yaw: number) => void;
  setFov: (fov: number) => void;
  setAdsSpeedMul: (mul: number) => void;
  moving: boolean;
  sprinting: boolean;
  grounded: boolean;
  airborne: boolean;
}

export class WeaponSystem {
  readonly viewRoot = new THREE.Group();
  private readonly weapons: WeaponState[] = [];
  private primaryId: PrimaryWeaponId = 'rifle';
  private index = 0;
  private fireCooldown = 0;
  private reloading = false;
  private reloadTimer = 0;
  private switching = false;
  private switchTimer = 0;
  private switchFrom = 0;
  private fireHeld = false;
  private firePressed = false;
  private wasFireDown = false;
  private adsHeld = false;
  private adsBlend = 0;

  /** 当前散布（度） */
  private spread = 1.5;
  private recoilKick = 0;
  private consecutiveShots = 0;
  private shotResetTimer = 0;
  private bobPhase = 0;

  private readonly flash: THREE.Mesh;
  private flashTimer = 0;
  private readonly raycaster = new THREE.Raycaster();

  private readonly hipPos = new THREE.Vector3(0.28, -0.26, -0.42);
  private readonly hipRot = new THREE.Euler(0.04, 0.12, 0.02);
  private readonly adsPos = new THREE.Vector3(0.0, -0.14, -0.28);
  private readonly adsRot = new THREE.Euler(0.0, 0.0, 0.0);

  private shootables: THREE.Object3D[] = [];
  private onHud?: (h: WeaponHud) => void;
  private onHitObject?: (
    obj: THREE.Object3D,
    weaponId: WeaponId,
    damage: number,
  ) => boolean;
  private onShot?: (position: THREE.Vector3, weaponId: WeaponId) => void;
  private hitMarkerTimer = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly audio: GameAudio,
    private readonly effects: Effects,
  ) {
    this.viewRoot.name = 'viewmodel';
    this.camera.add(this.viewRoot);
    this.viewRoot.position.copy(this.hipPos);
    this.viewRoot.rotation.copy(this.hipRot);

    const models: Record<WeaponId, { root: THREE.Group; muzzle: THREE.Object3D }> = {
      rifle: buildRifle(),
      smg: buildSmg(),
      shotgun: buildShotgun(),
      sniper: buildSniper(),
      pistol: buildPistol(),
    };
    for (const id of [...PRIMARY_WEAPON_IDS, 'pistol'] as const) {
      const def = WEAPON_DEFS[id];
      const model = models[id];
      this.weapons.push({
        def,
        mag: def.magSize,
        reserve: def.reserveMax,
        model: model.root,
        muzzle: model.muzzle,
      });
      this.viewRoot.add(model.root);
      model.root.visible = id === this.primaryId;
    }

    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.flash.visible = false;
    this.viewRoot.add(this.flash);

    this.spread = WEAPON_DEFS[this.primaryId].hipStandSpread;
    this.bindInput();
    this.pushHud();
  }

  setShootables(objs: THREE.Object3D[]) {
    this.shootables = objs;
  }

  setHitCallback(
    cb: (obj: THREE.Object3D, weaponId: WeaponId, damage: number) => boolean,
  ) {
    this.onHitObject = cb;
  }

  setShotCallback(cb: (position: THREE.Vector3, weaponId: WeaponId) => void) {
    this.onShot = cb;
  }

  setHudCallback(cb: (h: WeaponHud) => void) {
    this.onHud = cb;
    this.pushHud();
  }

  private get current(): WeaponState {
    return this.weapons[this.index];
  }

  private indexOf(id: WeaponId): number {
    return this.weapons.findIndex(weapon => weapon.def.id === id);
  }

  isAds(): boolean {
    return this.adsBlend > 0.55;
  }

  getAdsBlend(): number {
    return this.adsBlend;
  }

  /** 当前散布角度（度） */
  getSpreadDeg(): number {
    return this.spread;
  }

  private bindInput() {
    document.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.fireHeld = true;
        this.audio.unlock();
      }
      if (e.button === 2) {
        this.adsHeld = true;
        e.preventDefault();
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.adsHeld = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'Digit1' || e.code === 'Numpad1') {
        this.switchTo(this.indexOf(this.primaryId));
      }
      if (e.code === 'Digit2' || e.code === 'Numpad2') {
        this.switchTo(this.indexOf('pistol'));
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        this.fireHeld = false;
        this.adsHeld = false;
      }
    });
  }

  private switchTo(i: number) {
    if (i === this.index || this.switching || this.reloading) return;
    if (i < 0 || i >= this.weapons.length) return;
    this.switching = true;
    this.switchTimer = 0.28;
    this.switchFrom = this.index;
    this.index = i;
    this.consecutiveShots = 0;
    this.audio.playSwitch();
    this.fireCooldown = 0.15;
  }

  private startReload() {
    const w = this.current;
    if (this.reloading || this.switching) return;
    if (w.mag >= w.def.magSize) return;
    if (w.reserve <= 0) {
      this.audio.playEmpty();
      return;
    }
    this.reloading = true;
    this.reloadTimer = w.def.reloadTime;
    this.adsHeld = false; // 换弹退出开镜
    this.consecutiveShots = 0;
    this.audio.playReload();
    this.pushHud();
  }

  private finishReload() {
    const w = this.current;
    const need = w.def.magSize - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    this.reloading = false;
    this.pushHud();
  }

  /** 根据姿态计算目标散布（度） */
  private computeTargetSpread(
    moving: boolean,
    airborne: boolean,
    adsBlend: number,
  ): number {
    const d = this.current.def;
    let hip = d.hipStandSpread;
    if (airborne) hip = d.hipAirSpread;
    else if (moving) hip = d.hipMoveSpread;

    const ads = d.adsSpread;
    const t = THREE.MathUtils.smoothstep(adsBlend, 0, 1);
    return THREE.MathUtils.lerp(hip, ads, t);
  }

  private traceProjectile(
    weapon: WeaponState,
    baseDir: THREE.Vector3,
  ): 'character' | 'surface' | 'none' {
    const dir = circularSpreadOffset(baseDir, this.camera.up, this.spread);
    this.raycaster.ray.direction.copy(dir);
    this.raycaster.far = weapon.def.range;

    const hits = this.raycaster.intersectObjects(this.shootables, true);
    for (const hit of hits) {
      if (hit.object.userData.noHit) continue;
      let object: THREE.Object3D | null = hit.object;
      let skip = false;
      while (object) {
        if (object === this.viewRoot || object === this.camera) {
          skip = true;
          break;
        }
        object = object.parent;
      }
      if (skip) continue;

      let deadCombatant = false;
      object = hit.object;
      while (object) {
        const combatant = object.userData.combatant;
        if (combatant && !combatant.alive) {
          deadCombatant = true;
          break;
        }
        object = object.parent;
      }
      if (deadCombatant) continue;

      const normal = hit.face
        ? hit.face.normal
            .clone()
            .transformDirection(hit.object.matrixWorld)
            .normalize()
        : dir.clone().negate();
      if (
        this.onHitObject?.(
          hit.object,
          weapon.def.id,
          weapon.def.damage,
        )
      ) {
        this.effects.spawnHit(hit.point, normal, 0xaa3333);
        this.hitMarkerTimer = 0.18;
        return 'character';
      }

      let color = 0xb09060;
      const material = (hit.object as THREE.Mesh).material;
      if (material && !Array.isArray(material) && 'color' in material) {
        color = (material as THREE.MeshLambertMaterial).color.getHex();
      }
      this.effects.spawnHit(hit.point, normal, color);
      return 'surface';
    }
    return 'none';
  }

  private tryFire(player: PlayerWeaponContext) {
    const w = this.current;
    if (this.reloading || this.switching) return;
    if (!document.pointerLockElement) return;
    if (this.fireCooldown > 0) return;

    if (w.mag <= 0) {
      this.audio.playEmpty();
      this.fireCooldown = 0.2;
      this.startReload();
      return;
    }

    w.mag -= 1;
    this.fireCooldown = 60 / w.def.rpm;
    this.consecutiveShots += 1;
    this.shotResetTimer = 0.35;

    // 开火瞬间抬高散布
    this.spread = Math.min(
      w.def.maxSpread,
      this.spread + w.def.fireSpreadImpulse * (this.adsBlend > 0.5 ? 0.35 : 1),
    );
    this.recoilKick = w.def.kick * (1 - this.adsBlend * 0.4);

    if (w.def.id === 'smg') this.audio.playSmgShot();
    else if (w.def.id === 'shotgun') this.audio.playShotgunShot();
    else if (w.def.id === 'sniper') this.audio.playSniperShot();
    else if (w.def.id === 'pistol') this.audio.playPistolShot();
    else this.audio.playRifleShot();

    // 枪口闪光
    this.flashTimer = 0.04;
    this.flash.visible = true;

    // 后坐力：连发递增，开镜削弱
    const ramp = 1 + (this.consecutiveShots - 1) * w.def.recoilRamp;
    const adsMul = THREE.MathUtils.lerp(1, w.def.adsRecoilMul, this.adsBlend);
    const pitchKick = w.def.recoilPitch * ramp * adsMul;
    const yawKick =
      (Math.random() - 0.5) * 2 * w.def.recoilYaw * ramp * adsMul;
    player.applyRecoil(pitchKick, yawKick);

    // 弹道：普通武器单弹丸，霰弹枪在同一个散布锥内发射多颗弹丸。
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.onShot?.(this.raycaster.ray.origin.clone(), w.def.id);
    const baseDir = this.raycaster.ray.direction.clone();
    let surfaceHit = false;
    for (let pellet = 0; pellet < w.def.pellets; pellet++) {
      if (this.traceProjectile(w, baseDir) === 'surface') surfaceHit = true;
    }
    if (surfaceHit) this.audio.playHit();

    this.pushHud();
  }

  update(dt: number, player: PlayerWeaponContext) {
    this.firePressed = this.fireHeld && !this.wasFireDown;
    this.wasFireDown = this.fireHeld;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // 连发计数重置
    if (this.shotResetTimer > 0) {
      this.shotResetTimer -= dt;
      if (this.shotResetTimer <= 0) this.consecutiveShots = 0;
    }

    // ADS 混合
    const wantAds =
      this.adsHeld &&
      !this.reloading &&
      !this.switching &&
      !!document.pointerLockElement;
    const adsTarget = wantAds ? 1 : 0;
    // 约 170ms 平滑过渡
    const k = 1 - Math.exp(-ADS_BLEND_SPEED * 3.5 * dt);
    this.adsBlend = THREE.MathUtils.clamp(
      this.adsBlend + (adsTarget - this.adsBlend) * k,
      0,
      1,
    );

    // FOV + 移速
    const def = this.current.def;
    const fov = THREE.MathUtils.lerp(HIP_FOV, def.adsFov, this.adsBlend);
    player.setFov(fov);
    // 开镜减速，且禁止疾跑体感（由 player 读 mul）
    const speedMul = THREE.MathUtils.lerp(1, 0.55, this.adsBlend);
    player.setAdsSpeedMul(speedMul);

    // 散布：向目标收敛 + 开火冲量后的衰减
    const targetSpread = this.computeTargetSpread(
      player.moving,
      player.airborne,
      this.adsBlend,
    );
    // 先衰减当前散布
    this.spread = Math.max(
      def.minSpread,
      this.spread - def.spreadRecover * dt,
    );
    // 再向姿态目标靠拢（上升快、下降慢一点）
    if (this.spread < targetSpread) {
      this.spread = Math.min(targetSpread, this.spread + dt * 12);
    } else {
      this.spread = Math.max(targetSpread, this.spread - dt * def.spreadRecover * 0.5);
    }
    this.spread = THREE.MathUtils.clamp(this.spread, def.minSpread, def.maxSpread);

    // 换弹
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }

    // 切枪
    if (this.switching) {
      this.switchTimer -= dt;
      const t = 1 - Math.max(0, this.switchTimer) / 0.28;
      if (t < 0.5) {
        this.weapons[this.switchFrom].model.visible = true;
        this.weapons[this.index].model.visible = false;
        this.viewRoot.position.y = this.hipPos.y - t * 0.35;
      } else {
        this.weapons[this.switchFrom].model.visible = false;
        this.weapons[this.index].model.visible = true;
        this.viewRoot.position.y = this.hipPos.y - (1 - t) * 0.35;
      }
      if (this.switchTimer <= 0) {
        this.switching = false;
        for (let i = 0; i < this.weapons.length; i++) {
          this.weapons[i].model.visible = i === this.index;
        }
        this.pushHud();
      }
    }

    // 开火
    if (!this.switching) {
      if (this.current.def.automatic) {
        if (this.fireHeld) this.tryFire(player);
      } else if (this.firePressed) {
        this.tryFire(player);
      }
    }

    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.28);
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    }

    // 枪口闪光
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
      if (this.flashTimer <= 0) this.flash.visible = false;
    }

    // 枪模：腰射位 ↔ 开镜位
    if (!this.switching) {
      this.bobPhase += dt * (player.moving ? 10 : 2);
      const bobAmp = (1 - this.adsBlend * 0.85) * (player.moving ? 1 : 0.35);
      const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmp;
      const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.01 * bobAmp;
      const reloadDip = this.reloading
        ? 0.12 * Math.sin((1 - this.reloadTimer / def.reloadTime) * Math.PI)
        : 0;

      const px = THREE.MathUtils.lerp(this.hipPos.x, this.adsPos.x, this.adsBlend);
      const py = THREE.MathUtils.lerp(this.hipPos.y, this.adsPos.y, this.adsBlend);
      const pz = THREE.MathUtils.lerp(this.hipPos.z, this.adsPos.z, this.adsBlend);

      this.viewRoot.position.set(
        px + bobX,
        py + bobY - this.recoilKick * 0.45 - reloadDip,
        pz + this.recoilKick * 0.75,
      );

      const rx = THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, this.adsBlend);
      const ry = THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, this.adsBlend);
      const rz = THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, this.adsBlend);
      this.viewRoot.rotation.set(
        rx - this.recoilKick * 1.1 - (this.reloading ? 0.12 : 0),
        ry + bobX * 0.4,
        rz + bobX * 0.25,
      );
    }

    if (this.flash.visible) {
      const local = new THREE.Vector3();
      this.current.muzzle.getWorldPosition(local);
      this.viewRoot.worldToLocal(local);
      this.flash.position.copy(local);
    }

    this.pushHud();
  }

  getHitMarker(): number {
    return this.hitMarkerTimer;
  }

  /** 准星像素间距：按散布角度映射 */
  getCrosshairGapPx(): number {
    // 约 1° ≈ 10px，开镜时趋近 2px
    const gap = 4 + this.spread * 9;
    return THREE.MathUtils.clamp(gap, 2, 72);
  }

  resetLoadout() {
    for (const w of this.weapons) {
      w.mag = w.def.magSize;
      w.reserve = w.def.reserveMax;
    }
    this.index = this.indexOf(this.primaryId);
    this.reloading = false;
    this.switching = false;
    this.adsBlend = 0;
    this.adsHeld = false;
    this.spread = WEAPON_DEFS[this.primaryId].hipStandSpread;
    this.fireCooldown = 0;
    this.hitMarkerTimer = 0;
    this.consecutiveShots = 0;
    for (let i = 0; i < this.weapons.length; i++) {
      this.weapons[i].model.visible = i === this.index;
    }
    this.pushHud();
  }

  setPrimaryWeapon(id: PrimaryWeaponId) {
    if (!PRIMARY_WEAPON_IDS.includes(id)) return;
    this.primaryId = id;
  }

  getPrimaryWeaponId(): PrimaryWeaponId {
    return this.primaryId;
  }

  /** 弹药包：为当前武器补充最多一个弹匣的总弹量。 */
  addMagazineAmmo(): boolean {
    const weapon = this.current;
    const maxTotal = weapon.def.magSize + weapon.def.reserveMax;
    const currentTotal = weapon.mag + weapon.reserve;
    const amount = Math.min(weapon.def.magSize, maxTotal - currentTotal);
    if (amount <= 0) return false;

    const reserveSpace = weapon.def.reserveMax - weapon.reserve;
    const toReserve = Math.min(amount, reserveSpace);
    weapon.reserve += toReserve;
    weapon.mag = Math.min(
      weapon.def.magSize,
      weapon.mag + amount - toReserve,
    );
    this.pushHud();
    return true;
  }

  /** 固定弹药箱：所有武器弹匣和备弹全部补满。 */
  refillAllAmmo(): boolean {
    let changed = false;
    for (const weapon of this.weapons) {
      if (
        weapon.mag < weapon.def.magSize ||
        weapon.reserve < weapon.def.reserveMax
      ) {
        changed = true;
      }
      weapon.mag = weapon.def.magSize;
      weapon.reserve = weapon.def.reserveMax;
    }
    if (changed) {
      this.reloading = false;
      this.reloadTimer = 0;
      this.pushHud();
    }
    return changed;
  }

  private pushHud() {
    const w = this.current;
    this.onHud?.({
      name: w.def.name,
      mag: w.mag,
      magSize: w.def.magSize,
      reserve: w.reserve,
      reloading: this.reloading,
      spreadDeg: this.spread,
      ads: this.adsBlend > 0.55,
      adsBlend: this.adsBlend,
    });
  }
}
