/** Web Audio API 合成全部音效与战场 BGM（无外部文件） */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private footCd = 0;

  /** 热血战场 BGM：148 BPM · D 小调 · 16 拍循环 */
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicNextTime = 0;
  private musicStep = 0;
  private musicPlaying = false;
  private readonly musicBpm = 148;
  private readonly musicLookahead = 0.12;
  private readonly musicScheduleAhead = 0.28;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  /** 开局播放热血战场主题（循环） */
  startBattleMusic() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopBattleMusic(true);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musicGain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.8);
    this.musicGain.connect(ctx.destination);
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.05;
    this.musicPlaying = true;
    this.scheduleMusic();
  }

  /** 停止战场 BGM；instant=true 时立即切断 */
  stopBattleMusic(instant = false) {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    const ctx = this.ctx;
    const gain = this.musicGain;
    if (!gain) return;
    if (instant || !ctx) {
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
      this.musicGain = null;
      return;
    }
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    setTimeout(() => {
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
      if (this.musicGain === gain) this.musicGain = null;
    }, 600);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    freqEnd?: number,
  ) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        t0 + duration,
      );
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(duration: number, gain: number, filterFreq: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  playRifleShot() {
    this.noiseBurst(0.08, 0.45, 1800);
    this.tone(180, 0.06, 'square', 0.12, 60);
    this.tone(90, 0.1, 'sawtooth', 0.08, 40);
  }

  playSmgShot() {
    this.noiseBurst(0.055, 0.34, 2200);
    this.tone(205, 0.045, 'square', 0.085, 75);
  }

  playShotgunShot() {
    this.noiseBurst(0.13, 0.58, 1050);
    this.tone(105, 0.14, 'sawtooth', 0.14, 40);
    this.tone(62, 0.18, 'triangle', 0.1, 40);
  }

  playSniperShot() {
    this.noiseBurst(0.11, 0.52, 1650);
    this.tone(145, 0.12, 'square', 0.13, 45);
    this.tone(74, 0.22, 'sawtooth', 0.09, 40);
  }

  playPistolShot() {
    this.noiseBurst(0.06, 0.38, 2400);
    this.tone(220, 0.05, 'square', 0.1, 80);
    this.tone(110, 0.08, 'triangle', 0.07, 50);
  }

  playEmpty() {
    this.tone(900, 0.04, 'square', 0.04, 700);
    this.tone(600, 0.05, 'square', 0.03, 400);
  }

  playReload() {
    this.tone(400, 0.05, 'square', 0.05, 350);
    setTimeout(() => this.tone(280, 0.08, 'triangle', 0.06, 200), 120);
    setTimeout(() => this.tone(500, 0.04, 'square', 0.05, 450), 280);
    setTimeout(() => {
      this.noiseBurst(0.03, 0.12, 1200);
      this.tone(320, 0.05, 'square', 0.05, 280);
    }, 450);
  }

  playSwitch() {
    this.tone(350, 0.04, 'triangle', 0.05, 280);
    this.tone(500, 0.05, 'square', 0.04, 420);
  }

  playHit() {
    this.noiseBurst(0.04, 0.15, 900);
    this.tone(150, 0.04, 'sawtooth', 0.04, 80);
  }

  playEnemyShot() {
    this.noiseBurst(0.07, 0.28, 1400);
    this.tone(140, 0.05, 'square', 0.07, 50);
  }

  playEnemyDeath() {
    this.tone(200, 0.12, 'sawtooth', 0.1, 60);
    this.noiseBurst(0.12, 0.28, 600);
  }

  /** 击杀确认音：清晰“叮”一声，爆头更高亢 */
  playKillConfirm(headshot = false) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // 低频冲击，盖过枪声一点存在感
    this.noiseBurst(0.05, headshot ? 0.22 : 0.18, headshot ? 1200 : 900);
    this.tone(140, 0.07, 'sawtooth', headshot ? 0.1 : 0.08, 70);

    if (headshot) {
      // 金色爆头：三连升调叮
      this.tone(988, 0.07, 'square', 0.16, 1480);
      setTimeout(() => this.tone(1319, 0.08, 'square', 0.14, 1760), 45);
      setTimeout(() => this.tone(1760, 0.12, 'triangle', 0.12, 1320), 100);
      // 额外高频闪光
      setTimeout(() => this.tone(2093, 0.06, 'sine', 0.08, 1600), 130);
    } else {
      // 普通击杀：两段清脆确认
      this.tone(740, 0.06, 'square', 0.14, 1100);
      setTimeout(() => this.tone(1175, 0.1, 'square', 0.13, 880), 55);
      setTimeout(() => this.tone(1568, 0.08, 'triangle', 0.08, 980), 110);
    }

    // 短促“咔”收尾，战地感确认
    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(headshot ? 2400 : 1800, t0 + 0.02);
    cg.gain.setValueAtTime(0.09, t0 + 0.02);
    cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
    click.connect(cg);
    cg.connect(ctx.destination);
    click.start(t0 + 0.02);
    click.stop(t0 + 0.08);
  }

  playPlayerHurt() {
    this.noiseBurst(0.05, 0.22, 400);
    this.tone(120, 0.08, 'sawtooth', 0.07, 50);
  }

  playPlayerDeath() {
    this.tone(180, 0.2, 'sawtooth', 0.1, 40);
    this.noiseBurst(0.15, 0.25, 300);
  }

  playVictory() {
    this.tone(523, 0.12, 'square', 0.08);
    setTimeout(() => this.tone(659, 0.12, 'square', 0.08), 120);
    setTimeout(() => this.tone(784, 0.18, 'square', 0.09), 240);
  }

  playGameOver() {
    this.tone(300, 0.15, 'sawtooth', 0.08, 120);
    setTimeout(() => this.tone(180, 0.25, 'sawtooth', 0.07, 80), 150);
  }

  playUiClick() {
    this.tone(600, 0.04, 'square', 0.05, 400);
  }

  playAmmoPickup(fullRefill: boolean) {
    this.tone(fullRefill ? 420 : 520, 0.06, 'square', 0.055, 700);
    this.tone(fullRefill ? 620 : 760, 0.08, 'triangle', 0.05, 900);
    if (fullRefill) {
      setTimeout(() => this.tone(880, 0.08, 'square', 0.045, 1100), 70);
    }
  }

  /** 脚步：sprint 时更密更高 */
  playFootstep(sprinting: boolean, dt: number) {
    this.footCd -= dt;
    if (this.footCd > 0) return;
    this.footCd = sprinting ? 0.28 : 0.42;
    this.noiseBurst(sprinting ? 0.04 : 0.05, sprinting ? 0.12 : 0.08, sprinting ? 500 : 350);
    this.tone(sprinting ? 90 : 70, 0.03, 'triangle', 0.03, 40);
  }

  resetFootTimer() {
    this.footCd = 0;
  }

  // ─── 战场主题编曲（程序化） ─────────────────────────────────

  private scheduleMusic() {
    if (!this.musicPlaying) return;
    const ctx = this.ctx;
    const bus = this.musicGain;
    if (!ctx || !bus) return;

    const stepDur = 60 / this.musicBpm / 4; // 16 分音符
    while (this.musicNextTime < ctx.currentTime + this.musicScheduleAhead) {
      this.playMusicStep(this.musicStep, this.musicNextTime, bus);
      this.musicNextTime += stepDur;
      this.musicStep = (this.musicStep + 1) % 64; // 4 小节循环
    }

    this.musicTimer = window.setTimeout(
      () => this.scheduleMusic(),
      this.musicLookahead * 1000,
    );
  }

  private playMusicStep(step: number, when: number, bus: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;

    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const half = Math.floor(step / 32); // 前后两段情绪

    // —— 鼓组：四四拍踢 + 军鼓 + 开合踩 ——
    if (beat === 0 || beat === 8) this.musicKick(when, bus, 0.55);
    if (beat === 4 || beat === 12) this.musicSnare(when, bus, 0.42);
    // 推进感双踢
    if (beat === 14 && (bar === 1 || bar === 3)) this.musicKick(when, bus, 0.35);
    if (beat === 15 && bar === 3) this.musicKick(when, bus, 0.4);
    // 踩镲：偶数为闭，强拍开
    if (beat % 2 === 0) {
      const open = beat === 6 || beat === 14;
      this.musicHat(when, bus, open ? 0.09 : 0.055, open);
    }

    // —— 贝斯：D 小调根音推进 ——
    // 和弦进行：Dm | Bb | F | C  （热血进行感）
    const bassRoots = [146.83, 116.54, 174.61, 130.81]; // D3 Bb2 F3 C3
    const root = bassRoots[bar];
    if (beat % 2 === 0) {
      const accent = beat === 0 || beat === 8 ? 0.14 : 0.09;
      const oct = beat === 0 || beat === 8 ? 1 : 0.5;
      this.musicBass(when, bus, root * oct * 2, 0.11, accent);
    }
    // 切分：第 3、11 拍加五度冲击
    if (beat === 3 || beat === 11) {
      this.musicBass(when, bus, root * 1.5, 0.08, 0.07);
    }

    // —— 主旋律（热血动机） ——
    // 前半段陈述，后半段上扬八度 + 装饰
    const motifA = [
      // bar0 Dm: D F A D | C Bb A F
      293.66, 0, 349.23, 0, 440.0, 0, 587.33, 0, 523.25, 0, 466.16, 0, 440.0, 349.23, 0, 0,
      // bar1 Bb: Bb D F Bb | A G F D
      466.16, 0, 587.33, 0, 698.46, 0, 932.33, 0, 880.0, 0, 783.99, 0, 698.46, 587.33, 0, 0,
      // bar2 F:  F A C F | E D C A
      349.23, 0, 440.0, 0, 523.25, 0, 698.46, 0, 659.25, 0, 587.33, 0, 523.25, 440.0, 0, 0,
      // bar3 C:  C E G C | D E F A  → 回 D
      523.25, 0, 659.25, 0, 783.99, 0, 1046.5, 0, 1174.7, 1318.5, 1396.9, 0, 1760.0, 0, 0, 0,
    ];
    const motifB = [
      // 后半：更密、更高、更冲
      587.33, 698.46, 880.0, 0, 880.0, 0, 1046.5, 880.0, 698.46, 0, 880.0, 0, 1046.5, 1174.7, 0, 0,
      932.33, 880.0, 698.46, 0, 932.33, 0, 1174.7, 1046.5, 880.0, 0, 1046.5, 0, 1396.9, 1174.7, 0, 0,
      698.46, 880.0, 1046.5, 0, 1174.7, 0, 1396.9, 1174.7, 1046.5, 0, 880.0, 0, 1046.5, 880.0, 0, 0,
      1046.5, 1174.7, 1318.5, 0, 1396.9, 1568.0, 1760.0, 0, 2093.0, 1760.0, 1396.9, 1174.7, 880.0, 0, 0, 0,
    ];
    const motif = half === 0 ? motifA : motifB;
    const freq = motif[step];
    if (freq > 0) {
      const leadGain = half === 0 ? 0.07 : 0.085;
      this.musicLead(when, bus, freq, 0.13, leadGain);
      // 五度叠层加厚热血感
      if (beat === 0 || beat === 8) {
        this.musicLead(when, bus, freq * 1.5, 0.16, leadGain * 0.45);
      }
    }

    // —— 和弦垫音（每小节首拍） ——
    if (beat === 0) {
      const pads: number[][] = [
        [293.66, 349.23, 440.0], // Dm
        [233.08, 293.66, 349.23], // Bb
        [349.23, 440.0, 523.25], // F
        [261.63, 329.63, 392.0], // C
      ];
      for (const f of pads[bar]) {
        this.musicPad(when, bus, f, 0.9, 0.028);
      }
    }
  }

  private musicKick(when: number, bus: GainNode, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    osc.connect(g);
    g.connect(bus);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  private musicSnare(when: number, bus: GainNode, gain: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(when);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, when);
    osc.frequency.exponentialRampToValueAtTime(100, when + 0.06);
    og.gain.setValueAtTime(gain * 0.35, when);
    og.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    osc.connect(og);
    og.connect(bus);
    osc.start(when);
    osc.stop(when + 0.1);
  }

  private musicHat(when: number, bus: GainNode, gain: number, open: boolean) {
    const ctx = this.ctx!;
    const dur = open ? 0.14 : 0.04;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = open ? 6000 : 9000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(when);
  }

  private musicBass(
    when: number,
    bus: GainNode,
    freq: number,
    duration: number,
    gain: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, when);
    filter.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(filter);
    filter.connect(g);
    g.connect(bus);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private musicLead(
    when: number,
    bus: GainNode,
    freq: number,
    duration: number,
    gain: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc2.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq * 2.002, when); // 轻微失谐加厚
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.015);
    g.gain.exponentialRampToValueAtTime(gain * 0.55, when + duration * 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, when);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(bus);
    osc.start(when);
    osc2.start(when);
    osc.stop(when + duration + 0.02);
    osc2.stop(when + duration + 0.02);
  }

  private musicPad(
    when: number,
    bus: GainNode,
    freq: number,
    duration: number,
    gain: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.08);
    g.gain.setValueAtTime(gain, when + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(g);
    g.connect(bus);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}
