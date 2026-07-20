import * as THREE from 'three';

/** 屏幕分辨率 / 渲染分辨率。2.3 ≈ 1/2.3 降采样，清晰像素块 */
export const PIXEL_SCALE = 2.3;

/** 是否叠加 4×4 Bayer 抖动（复古色阶感） */
export const ENABLE_DITHER = true;

/** 4×4 Bayer 矩阵归一化到 0~1 */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map(v => v / 16);

function createBayerTexture(): THREE.DataTexture {
  // RGBA 兼容性更好（部分环境 RedFormat 采样异常）
  const data = new Uint8Array(16 * 4);
  for (let i = 0; i < 16; i++) {
    const v = Math.floor(BAYER4[i] * 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDither;
uniform vec2 resolution;
uniform float ditherStrength;
uniform float useDither;
varying vec2 vUv;

void main() {
  // 纹理已是 NearestFilter，直接采样即清晰色块
  vec4 color = texture2D(tDiffuse, vUv);

  if (useDither > 0.5) {
    // 按屏幕像素取 Bayer 阈值
    vec2 dUv = gl_FragCoord.xy / 4.0;
    float b = texture2D(tDither, dUv).r;
    // 轻微有序抖动，增强复古颗粒，不过度污染颜色
    color.rgb += (b - 0.5) * ditherStrength;
  }

  gl_FragColor = color;
}
`;

/**
 * 像素化后处理：
 * 1) 场景渲染到低分辨率 RT（mag/min = NearestFilter）
 * 2) 全屏四边形采样放大到画布（仍用 Nearest，避免线性模糊）
 * 3) 可选 Bayer dither
 */
export class PixelComposer {
  private rt: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly ditherTex: THREE.DataTexture;
  private width = 1;
  private height = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.ditherTex = createBayerTexture();
    this.rt = this.makeRT(1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        tDither: { value: this.ditherTex },
        resolution: { value: new THREE.Vector2(1, 1) },
        ditherStrength: { value: 0.02 },
        useDither: { value: ENABLE_DITHER ? 1 : 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);
  }

  private makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    // 双保险：部分 three 版本构造参数可能被覆盖
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    rt.texture.generateMipmaps = false;
    return rt;
  }

  setSize(fullW: number, fullH: number, scale = PIXEL_SCALE) {
    const w = Math.max(1, Math.floor(fullW / scale));
    const h = Math.max(1, Math.floor(fullH / scale));
    this.width = w;
    this.height = h;

    // 画布保持全分辨率，由后处理把低分 RT 最近邻放大
    this.renderer.setSize(fullW, fullH, false);
    this.renderer.domElement.style.width = `${fullW}px`;
    this.renderer.domElement.style.height = `${fullH}px`;
    this.renderer.domElement.style.imageRendering = 'pixelated';

    this.rt.setSize(w, h);
    this.rt.texture.minFilter = THREE.NearestFilter;
    this.rt.texture.magFilter = THREE.NearestFilter;
    this.rt.texture.generateMipmaps = false;

    this.material.uniforms.tDiffuse.value = this.rt.texture;
    this.material.uniforms.resolution.value.set(w, h);
    this.material.uniforms.useDither.value = ENABLE_DITHER ? 1 : 0;
  }

  setDither(enabled: boolean) {
    this.material.uniforms.useDither.value = enabled ? 1 : 0;
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
  }

  getRenderSize(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  dispose() {
    this.rt.dispose();
    this.ditherTex.dispose();
    this.material.dispose();
  }
}
