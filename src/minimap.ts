import { MAP_SIZE } from './map';
import type { MinimapFeature } from './map';
import type { PointSnapshot } from './conquest';

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly features: MinimapFeature[];
  private readonly size: number;
  private pulse = 0;

  constructor(canvas: HTMLCanvasElement, features: MinimapFeature[], size = 160) {
    this.canvas = canvas;
    this.size = size;
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = canvas.getContext('2d')!;
    this.features = features;
  }

  private worldToMini(x: number, z: number): { mx: number; my: number } {
    const half = MAP_SIZE / 2;
    const mx = ((x + half) / MAP_SIZE) * this.size;
    const my = ((z + half) / MAP_SIZE) * this.size;
    return { mx, my };
  }

  draw(
    playerX: number,
    playerZ: number,
    yaw: number,
    capturePoints?: PointSnapshot[],
  ) {
    const ctx = this.ctx;
    const s = this.size;
    this.pulse += 0.08;

    ctx.fillStyle = '#2a3428';
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = 'rgba(80,120,80,0.35)';
    ctx.lineWidth = 1;
    const step = s / 8;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, s);
      ctx.moveTo(0, i * step);
      ctx.lineTo(s, i * step);
    }
    ctx.stroke();

    for (const f of this.features) {
      const { mx, my } = this.worldToMini(f.x, f.z);
      const mw = (f.w / MAP_SIZE) * s;
      const md = (f.d / MAP_SIZE) * s;
      ctx.fillStyle = f.color;
      if (f.kind === 'tree') {
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(1.5, mw * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(mx - mw / 2, my - md / 2, Math.max(2, mw), Math.max(2, md));
      }
    }

    // 资源点 / HQ
    if (capturePoints) {
      for (const p of capturePoints) {
        const { mx, my } = this.worldToMini(p.x, p.z);
        const r = p.kind === 'hq' ? 6 : 5;

        let fill = '#888888';
        if (p.owner === 'blue') fill = '#3388ff';
        if (p.owner === 'red') fill = '#ff4433';

        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        if (p.contestable) {
          const pulse = 0.5 + 0.5 * Math.sin(this.pulse * 3);
          ctx.strokeStyle = `rgba(255,220,40,${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mx, my, r + 2 + pulse, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.owner === 'neutral' || (!p.contestable && p.kind === 'point')) {
          // 锁定灰框
          ctx.strokeStyle = '#555555';
          ctx.lineWidth = 1;
          ctx.strokeRect(mx - r - 1, my - r - 1, (r + 1) * 2, (r + 1) * 2);
        }

        if (p.contesting) {
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mx, my, r + 3 + Math.sin(this.pulse * 5), 0, Math.PI * 2);
          ctx.stroke();
        }

        // 标签
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label =
          p.kind === 'hq' ? (p.id.includes('BLUE') ? 'HQ' : 'HQ') : p.id;
        ctx.fillText(label, mx, my);
      }
    }

    // 玩家
    const { mx, my } = this.worldToMini(playerX, playerZ);
    const len = 7;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#33ff33';
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(4, len * 0.55);
    ctx.lineTo(0, len * 0.25);
    ctx.lineTo(-4, len * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }
}
