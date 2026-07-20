import * as THREE from 'three';

function applyNearest(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}

function makeCanvas(w: number, h = w): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function noise(n: number): number {
  return (Math.random() - 0.5) * n;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v)) | 0;
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${clampByte(r)},${clampByte(g)},${clampByte(b)})`;
}

function put(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number) {
  ctx.fillStyle = rgb(r, g, b);
  ctx.fillRect(x, y, 1, 1);
}

/** JS 的 % 对负数会返回负值，数组下标必须用正模 */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 浅色干草原 / 沙土混合（大战场明亮地面） */
export function createGroundTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const pal = [
    { r: 214, g: 204, b: 168 },
    { r: 226, g: 216, b: 182 },
    { r: 200, g: 192, b: 156 },
    { r: 232, g: 222, b: 188 },
    { r: 208, g: 198, b: 162 },
    { r: 220, g: 210, b: 174 },
    { r: 194, g: 188, b: 152 },
    { r: 236, g: 228, b: 196 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = pal[mod((x >> 4) * 3 + (y >> 4) * 5 + ((x * 13 + y * 7) >> 3), pal.length)];
      const n = noise(18);
      const speck = ((x * 17 + y * 31) & 15) === 0 ? 14 : 0;
      const grass = ((x * 11 + y * 19) & 31) === 0 ? -10 : 0;
      put(
        ctx,
        x,
        y,
        c.r + n + speck + grass * 0.3,
        c.g + n + speck * 0.7 + grass * 0.15,
        c.b + n + grass * 0.05,
      );
    }
  }

  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(52, 52);
  return texture;
}

/** 高细节砖墙 64×64 */
export function createBrickTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = rgb(86, 82, 76);
  ctx.fillRect(0, 0, size, size);

  const bricks = [
    { r: 152, g: 74, b: 52 },
    { r: 138, g: 66, b: 48 },
    { r: 164, g: 82, b: 58 },
    { r: 126, g: 60, b: 44 },
    { r: 148, g: 88, b: 60 },
  ];
  const bh = 8;
  const bw = 16;
  for (let row = 0; row < size / bh; row++) {
    const offset = (row % 2) * (bw / 2);
    for (let col = -1; col <= size / bw + 1; col++) {
      const bx = mod(col * bw + offset, size);
      const by = row * bh;
      const brick = bricks[mod(row * 11 + col * 5 + 3, bricks.length)];
      for (let py = 1; py < bh - 1; py++) {
        for (let px = 1; px < bw - 1; px++) {
          const x = (bx + px) % size;
          const y = by + py;
          if (y >= size) continue;
          const edge = px === 1 || py === 1 || px === bw - 2 || py === bh - 2;
          const n = noise(16);
          const d = edge ? 0.82 : 1;
          put(ctx, x, y, (brick.r + n) * d, (brick.g + n) * d, (brick.b + n) * d);
        }
      }
    }
  }

  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createMetalTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const panel = (x >> 4) ^ (y >> 4);
      const base = panel ? 118 : 98;
      const streak = (x + y * 3) % 7 === 0 ? -14 : 0;
      const rust = ((x * 5 + y * 9) % 23 === 0) ? 22 : 0;
      const n = noise(18) + streak;
      const edge = x % 16 === 0 || y % 16 === 0;
      const d = edge ? 0.7 : 1;
      put(ctx, x, y, (base + n + rust) * d, (base + 2 + n) * d, (base + 6 + n - rust) * d);
    }
  }
  // 铆钉
  ctx.fillStyle = '#d0d0d0';
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      for (const [ox, oy] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
        ctx.fillRect(gx * 16 + ox, gy * 16 + oy, 2, 2);
      }
    }
  }
  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createWoodTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const plank = (y >> 3) % 2;
      const base = plank ? { r: 148, g: 102, b: 54 } : { r: 128, g: 88, b: 46 };
      const grain = Math.sin(x * 0.7 + y * 0.12) * 12 + Math.sin(x * 2.1) * 4;
      const n = noise(14) + grain;
      const edge = x === 0 || x === size - 1 || y % 8 === 0;
      const d = edge ? 0.68 : 1;
      put(ctx, x, y, (base.r + n) * d, (base.g + n) * d, (base.b + n) * d);
    }
  }
  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export type CamoPalette = 'field' | 'blue' | 'red';

export function createCamoTexture(tone: CamoPalette = 'field'): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  const palettes: Record<CamoPalette, { r: number; g: number; b: number }[]> = {
    field: [
      { r: 72, g: 88, b: 42 },
      { r: 98, g: 78, b: 40 },
      { r: 50, g: 64, b: 36 },
      { r: 112, g: 106, b: 58 },
      { r: 84, g: 70, b: 48 },
    ],
    blue: [
      { r: 42, g: 82, b: 138 },
      { r: 52, g: 108, b: 172 },
      { r: 28, g: 58, b: 104 },
      { r: 78, g: 126, b: 176 },
      { r: 38, g: 72, b: 122 },
    ],
    red: [
      { r: 126, g: 48, b: 42 },
      { r: 156, g: 62, b: 48 },
      { r: 86, g: 34, b: 34 },
      { r: 142, g: 82, b: 60 },
      { r: 104, g: 42, b: 38 },
    ],
  };
  const palette = palettes[tone];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = palette[mod((x * 3 + y * 5) ^ ((x >> 2) * 7 + (y >> 1) * 3), palette.length)];
      const n = noise(16);
      put(ctx, x, y, c.r + n, c.g + n, c.b + n);
    }
  }
  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createConcreteTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = 122 + ((x * 3 + y * 5) % 5) * 3;
      const n = noise(20);
      const crack =
        (x === 10 && y > 4 && y < 26) ||
        (y === 16 && x > 6 && x < 28) ||
        (x + y === 30 && x > 8)
          ? -28
          : 0;
      put(ctx, x, y, base + n + crack, base + n + crack, base - 6 + n + crack);
    }
  }
  const texture = applyNearest(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createFoliageTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  const greens = [
    { r: 32, g: 88, b: 24 },
    { r: 46, g: 108, b: 32 },
    { r: 24, g: 72, b: 20 },
    { r: 56, g: 96, b: 28 },
    { r: 40, g: 100, b: 36 },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = greens[mod(x * 7 + y * 5, greens.length)];
      const n = noise(20);
      put(ctx, x, y, c.r + n, c.g + n, c.b + n);
    }
  }
  return applyNearest(new THREE.CanvasTexture(canvas));
}

export function createBarkTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = 72 + (x % 5) * 5;
      const n = noise(16);
      const groove = x % 5 === 0 ? -18 : 0;
      put(ctx, x, y, base + n + groove, base - 22 + n + groove, base - 36 + n);
    }
  }
  return applyNearest(new THREE.CanvasTexture(canvas));
}

export function createRockTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = 90 + ((x * 5 + y * 3) % 7) * 4;
      const n = noise(24);
      put(ctx, x, y, base + n, base - 4 + n, base - 10 + n);
    }
  }
  return applyNearest(new THREE.CanvasTexture(canvas));
}

export function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#8ec4f0');
  gradient.addColorStop(0.35, '#b0d8f8');
  gradient.addColorStop(0.65, '#d0e4c0');
  gradient.addColorStop(0.85, '#f0e8c0');
  gradient.addColorStop(1, '#f8f0d0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 256);
  // 稀疏云像素
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 40; i++) {
    const y = 40 + Math.random() * 80;
    ctx.fillRect(Math.random() * 8, y, 1 + Math.random() * 2, 1);
  }
  return applyNearest(new THREE.CanvasTexture(canvas));
}
