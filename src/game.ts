/** 游戏模式与规则状态机 */

export type GameMode = 'kill' | 'survival' | 'conquest';
export type GamePhase = 'menu' | 'playing' | 'victory' | 'gameover';

export interface GameStats {
  kills: number;
  surviveTime: number;
  mode: GameMode;
}

export class GameRules {
  phase: GamePhase = 'menu';
  mode: GameMode = 'kill';
  killTarget = 15;
  kills = 0;
  surviveTime = 0;

  get isPlaying(): boolean {
    return this.phase === 'playing';
  }

  get stats(): GameStats {
    return {
      kills: this.kills,
      surviveTime: this.surviveTime,
      mode: this.mode,
    };
  }

  start(mode: GameMode, killTarget = 15) {
    this.mode = mode;
    this.killTarget = killTarget;
    this.kills = 0;
    this.surviveTime = 0;
    this.phase = 'playing';
  }

  update(dt: number) {
    if (this.phase === 'playing') this.surviveTime += dt;
  }

  addKill(): boolean {
    if (this.phase !== 'playing') return false;
    this.kills += 1;
    if (this.mode === 'kill' && this.kills >= this.killTarget) {
      this.phase = 'victory';
      return true;
    }
    return false;
  }

  /** 征服模式由外部设置胜负 */
  setVictory() {
    if (this.phase === 'playing') this.phase = 'victory';
  }

  setDefeat() {
    if (this.phase === 'playing') this.phase = 'gameover';
  }

  /**
   * 返回 true = 永久死亡（Game Over）
   * 击杀/征服：可重生；生存：死亡即结束
   */
  onPlayerDeath(): boolean {
    if (this.phase !== 'playing') return false;
    if (this.mode === 'survival') {
      this.phase = 'gameover';
      return true;
    }
    return false;
  }

  allowRespawn(): boolean {
    return (
      this.phase === 'playing' &&
      (this.mode === 'kill' || this.mode === 'conquest')
    );
  }

  backToMenu() {
    this.phase = 'menu';
    this.kills = 0;
    this.surviveTime = 0;
  }

  formatTime(sec = this.surviveTime): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
