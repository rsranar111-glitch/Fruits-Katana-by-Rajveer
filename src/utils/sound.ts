// Procedural Web Audio API Synthesizer for Katana Nectar 3D
// Zero external MP3 dependencies — 100% offline-capable real-time sound synthesis
// Includes bespoke Katana Knife blade slash synthesis + fruit-specific chop acoustics for all 7 fruits,
// Oni Bomb warnings/collisions/deflections, and tactile Dojo UI cues.

import { CutAnimationStyle, FruitKind, PowerUpId } from '../types/game';

export type UiSoundVariant = 'tap' | 'confirm' | 'tab' | 'close' | 'blade';

interface KatanaBladeAcousticSpec {
  /** Primary Tamahagane steel fundamental start->end frequency (Hz) */
  steelStartHz: number;
  steelEndHz: number;
  /** Secondary harmonic overtone multiplier */
  harmonicRatio: number;
  /** Oscillator waveform for the blade core */
  bladeWave: OscillatorType;
  /** Duration of the metallic katana ring (seconds) */
  ringDuration: number;
  /** Air-cleave noise filter start->end frequency (Hz) */
  slashNoiseStartHz: number;
  slashNoiseEndHz: number;
  /** Air-cleave resonance Q */
  slashNoiseQ: number;
  /** Optional second staggered blade glint (for serrated / twin-edge cuts) */
  doubleGlintDelaySec?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    const savedMute = localStorage.getItem('katana_nectar_muted');
    if (savedMute === 'true') {
      this.isMuted = true;
    }
  }

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Proactively unlocks the Web Audio context on the first user touch/pointer down
   * so the very first katana fruit chop plays with zero latency.
   */
  public unlock() {
    this.getContext();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('katana_nectar_muted', String(muted));
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Helper to synthesize a filtered noise burst (for blade air-cleave, juicy splashes, shell cracks, or explosions)
  private triggerNoiseBurst(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    qValue: number,
    peakGain: number
  ) {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.42));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(40, startFreq), startTime);
    if (endFreq !== startFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + duration);
    }
    filter.Q.setValueAtTime(qValue, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  /**
   * Synthesizes a distinct metallic Katana Knife blade slash ("steel shing + edge air-cleave")
   * uniquely tuned for each fruit's density and rind resistance.
   */
  private triggerKatanaKnifeSlash(
    ctx: AudioContext,
    startTime: number,
    spec: KatanaBladeAcousticSpec,
    pitchBoostHz: number,
    speedMod: number
  ) {
    const passes = spec.doubleGlintDelaySec ? [0, spec.doubleGlintDelaySec] : [0];

    passes.forEach((delay, passIdx) => {
      const t0 = startTime + delay;
      const dur = spec.ringDuration * (passIdx === 1 ? 0.85 : 1.0);
      const fStart = (spec.steelStartHz + pitchBoostHz * 0.8) * (passIdx === 1 ? 1.18 : 1.0) * speedMod;
      const fEnd = (spec.steelEndHz + pitchBoostHz * 1.1) * (passIdx === 1 ? 1.22 : 1.0) * speedMod;

      // 1. Primary Katana Steel Edge Oscillator
      const bladeOsc = ctx.createOscillator();
      const bladeGain = ctx.createGain();
      bladeOsc.type = spec.bladeWave;
      bladeOsc.frequency.setValueAtTime(fStart, t0);
      bladeOsc.frequency.exponentialRampToValueAtTime(Math.max(80, fEnd), t0 + dur);

      bladeGain.gain.setValueAtTime(0.001, t0);
      bladeGain.gain.linearRampToValueAtTime(passIdx === 1 ? 0.16 : 0.22, t0 + 0.008);
      bladeGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      bladeOsc.connect(bladeGain);
      bladeGain.connect(ctx.destination);
      bladeOsc.start(t0);
      bladeOsc.stop(t0 + dur + 0.01);

      // 2. High-Carbon Steel Harmonic Overtone ("Shiiing" metallic sheen)
      const overtoneOsc = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(fStart * spec.harmonicRatio, t0);
      overtoneOsc.frequency.exponentialRampToValueAtTime(
        Math.min(10000, Math.max(120, fEnd * spec.harmonicRatio)),
        t0 + dur * 0.9
      );

      overtoneGain.gain.setValueAtTime(0.001, t0);
      overtoneGain.gain.linearRampToValueAtTime(passIdx === 1 ? 0.09 : 0.13, t0 + 0.006);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.92);

      overtoneOsc.connect(overtoneGain);
      overtoneGain.connect(ctx.destination);
      overtoneOsc.start(t0);
      overtoneOsc.stop(t0 + dur);
    });

    // 3. Sharp Katana Blade Air-Cleave & Rind-Entry Transient ("Shhhk!")
    this.triggerNoiseBurst(
      ctx,
      startTime,
      Math.min(0.11, spec.ringDuration * 0.75),
      'bandpass',
      spec.slashNoiseStartHz * speedMod,
      spec.slashNoiseEndHz,
      spec.slashNoiseQ,
      0.24
    );
  }

  // Sharp aerodynamic katana whoosh when swiping through open air
  public playSwing(speedRatio: number = 1) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 0.13;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq = 620 + Math.min(speedRatio, 2) * 560;
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.frequency.exponentialRampToValueAtTime(190, now + duration);
    filter.Q.setValueAtTime(3.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.16 * Math.min(speedRatio, 1.4), now + 0.028);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Bespoke Katana Knife Blade Slash + Fruit Cleavage Acoustics for all 7 fruits.
   * Every fruit produces a distinct katana knife sound (heavy cleaver steel, serrated wakizashi,
   * razor kunai glint, silky iaido draw, helmet-breaker clang, twin ninjato flick, or sacred muramasa chime)
   * layered with its physical fruit flesh/rind chop sound.
   */
  public playFruitSlice(
    style: CutAnimationStyle,
    comboCount: number = 1,
    kind?: FruitKind,
    cutSpeedRatio: number = 1.0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchBoost = Math.min(comboCount - 1, 12) * 35;
    const speedMod = 0.92 + Math.min(Math.max(cutSpeedRatio, 0.5), 2.0) * 0.12;

    // 1. WATERMELON ('watermelon' / 'radial_cleave'):
    // Katana: Heavy Odachi Cleaver Steel Draw (deep broad-blade metallic sweep)
    // Fruit: Pressurized hollow melon rind thump + crisp wet flesh cleave
    if (kind === 'watermelon' || style === 'radial_cleave') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 580,
          steelEndHz: 1460,
          harmonicRatio: 1.5,
          bladeWave: 'triangle',
          ringDuration: 0.145,
          slashNoiseStartHz: 2600,
          slashNoiseEndHz: 780,
          slashNoiseQ: 2.4,
        },
        pitchBoost,
        speedMod
      );

      // Deep melon rind thump
      const thumpOsc = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thumpOsc.type = 'triangle';
      thumpOsc.frequency.setValueAtTime(165 + pitchBoost * 0.35, now);
      thumpOsc.frequency.exponentialRampToValueAtTime(48, now + 0.15);
      thumpGain.gain.setValueAtTime(0.36, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thumpOsc.start(now);
      thumpOsc.stop(now + 0.17);

      // Wet crimson pulp split
      this.triggerNoiseBurst(ctx, now + 0.015, 0.12, 'bandpass', 1950, 820, 1.6, 0.3);
      return;
    }

    // 2. PINEAPPLE ('pineapple' / 'crown_spin'):
    // Katana: Serrated Wakizashi Double-Glint Slash (slices through diamond husk scales)
    // Fruit: Fibrous bromeliad crunch + spinning core harmonic
    if (kind === 'pineapple' || style === 'crown_spin') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 920,
          steelEndHz: 2240,
          harmonicRatio: 1.62,
          bladeWave: 'sawtooth',
          ringDuration: 0.13,
          slashNoiseStartHz: 3400,
          slashNoiseEndHz: 1350,
          slashNoiseQ: 3.1,
          doubleGlintDelaySec: 0.022,
        },
        pitchBoost,
        speedMod
      );

      [285, 340].forEach((baseF, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const t = now + idx * 0.018;
        osc.frequency.setValueAtTime(baseF + pitchBoost, t);
        osc.frequency.exponentialRampToValueAtTime(baseF * 2.05 + pitchBoost, t + 0.15);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.17);
      });
      this.triggerNoiseBurst(ctx, now + 0.01, 0.11, 'bandpass', 2650, 1420, 2.4, 0.26);
      return;
    }

    // 3. DRAGONFRUIT ('dragonfruit' / 'magenta_starburst'):
    // Katana: Swift Kunai-Katana High-Silver Flash ("Shiiing!" high-frequency razor cut)
    // Fruit: Crystalline 3-voice starburst arpeggio + seed mist
    if (kind === 'dragonfruit' || style === 'magenta_starburst') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 1360,
          steelEndHz: 3180,
          harmonicRatio: 1.5,
          bladeWave: 'sine',
          ringDuration: 0.16,
          slashNoiseStartHz: 4200,
          slashNoiseEndHz: 1950,
          slashNoiseQ: 3.6,
        },
        pitchBoost,
        speedMod
      );

      const chord = [587.33, 880.0, 1174.66];
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 1 ? 'triangle' : 'sine';
        const t = now + 0.012 + idx * 0.02;
        osc.frequency.setValueAtTime(freq + pitchBoost, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25 + pitchBoost, t + 0.14);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      });
      this.triggerNoiseBurst(ctx, now + 0.01, 0.08, 'highpass', 3000, 1850, 1.5, 0.2);
      return;
    }

    // 4. COCONUT ('coconut' / 'shell_shatter'):
    // Katana: Heavy Kabutowari (Helmet-Breaker) Steel-on-Shell Impact Clang + Ricochet Ring
    // Fruit: Hard woody shell fracture crack + deep hollow coconut knock
    if (kind === 'coconut' || style === 'shell_shatter') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 1720,
          steelEndHz: 640,
          harmonicRatio: 1.414,
          bladeWave: 'square',
          ringDuration: 0.125,
          slashNoiseStartHz: 2900,
          slashNoiseEndHz: 560,
          slashNoiseQ: 2.8,
        },
        pitchBoost,
        speedMod
      );

      // Deep hollow coconut knock
      const knockOsc = ctx.createOscillator();
      const knockGain = ctx.createGain();
      knockOsc.type = 'triangle';
      knockOsc.frequency.setValueAtTime(220 + pitchBoost * 0.3, now);
      knockOsc.frequency.exponentialRampToValueAtTime(56, now + 0.18);
      knockGain.gain.setValueAtTime(0.42, now);
      knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      knockOsc.connect(knockGain);
      knockGain.connect(ctx.destination);
      knockOsc.start(now);
      knockOsc.stop(now + 0.2);

      // Hard shell snap
      const crackOsc = ctx.createOscillator();
      const crackGain = ctx.createGain();
      crackOsc.type = 'square';
      crackOsc.frequency.setValueAtTime(960, now);
      crackOsc.frequency.exponentialRampToValueAtTime(175, now + 0.055);
      crackGain.gain.setValueAtTime(0.22, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      crackOsc.connect(crackGain);
      crackGain.connect(ctx.destination);
      crackOsc.start(now);
      crackOsc.stop(now + 0.065);

      this.triggerNoiseBurst(ctx, now, 0.12, 'bandpass', 1650, 480, 2.2, 0.34);
      return;
    }

    // 5. POMEGRANATE ('pomegranate' / 'jewel_scatter'):
    // Katana: Twin-Edge Ninjato Rapid Double-Slice ("Shing-Shing!")
    // Fruit: Crisp leathery rind pop + 5-grain ruby aril scatter chimes
    if (kind === 'pomegranate' || style === 'jewel_scatter') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 1120,
          steelEndHz: 2560,
          harmonicRatio: 1.5,
          bladeWave: 'triangle',
          ringDuration: 0.115,
          slashNoiseStartHz: 3600,
          slashNoiseEndHz: 1400,
          slashNoiseQ: 3.0,
          doubleGlintDelaySec: 0.018,
        },
        pitchBoost,
        speedMod
      );

      const jewelNotes = [880, 1174.66, 1318.5, 1567.98, 1760];
      jewelNotes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + 0.015 + idx * 0.017;
        osc.frequency.setValueAtTime(f + pitchBoost, t);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      });
      this.triggerNoiseBurst(ctx, now + 0.01, 0.085, 'lowpass', 2400, 1100, 1.4, 0.22);
      return;
    }

    // 6. GOLDEN YUZU ('golden_yuzu' / 'celestial_nova'):
    // Katana: Legendary Muramasa Spirit Katana Unsheathe (long singing golden blade resonance)
    // Fruit: Reverberant 4-partial temple bell & celestial citrus nova shimmer
    if (kind === 'golden_yuzu' || style === 'celestial_nova') {
      this.triggerKatanaKnifeSlash(
        ctx,
        now,
        {
          steelStartHz: 1046.5,
          steelEndHz: 2793.8,
          harmonicRatio: 1.5,
          bladeWave: 'triangle',
          ringDuration: 0.28,
          slashNoiseStartHz: 4500,
          slashNoiseEndHz: 2100,
          slashNoiseQ: 4.0,
          doubleGlintDelaySec: 0.028,
        },
        pitchBoost,
        speedMod
      );

      const bellPartials = [880, 1318.5, 1760, 2637];
      bellPartials.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        const t = now + idx * 0.025;
        osc.frequency.setValueAtTime(f + pitchBoost, t);
        osc.frequency.exponentialRampToValueAtTime(f * 1.12 + pitchBoost, t + 0.38);
        gain.gain.setValueAtTime(0.2 / (idx * 0.5 + 1), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.42);
      });
      this.triggerNoiseBurst(ctx, now, 0.14, 'highpass', 3200, 1800, 1.8, 0.18);
      return;
    }

    // 7. ALPHONSO MANGO ('mango' / 'tangential_glide' & default):
    // Katana: Silky Iaido Curved Katana Draw (fluid singing steel whistle)
    // Fruit: Smooth velvet nectar glide + warm splash
    this.triggerKatanaKnifeSlash(
      ctx,
      now,
      {
        steelStartHz: 760,
        steelEndHz: 1920,
        harmonicRatio: 1.333,
        bladeWave: 'sine',
        ringDuration: 0.15,
        slashNoiseStartHz: 3100,
        slashNoiseEndHz: 1050,
        slashNoiseQ: 2.8,
      },
      pitchBoost,
      speedMod
    );

    const glideOsc = ctx.createOscillator();
    const glideGain = ctx.createGain();
    glideOsc.type = 'sine';
    glideOsc.frequency.setValueAtTime(390 + pitchBoost, now);
    glideOsc.frequency.exponentialRampToValueAtTime(790 + pitchBoost, now + 0.13);
    glideGain.gain.setValueAtTime(0.26, now);
    glideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    glideOsc.connect(glideGain);
    glideGain.connect(ctx.destination);
    glideOsc.start(now);
    glideOsc.stop(now + 0.15);

    this.triggerNoiseBurst(ctx, now + 0.01, 0.09, 'lowpass', 1850, 750, 1.5, 0.24);
  }

  // Combo fanfare koto/shamisen pluck
  public playComboChord(combo: number) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    const baseIdx = Math.max(0, Math.min(combo - 2, scale.length - 3));
    const notes = [scale[baseIdx], scale[baseIdx + 1], scale[baseIdx + 2]];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.042;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
  }

  // Subtle menacing taiko & fuse sizzle warning when an Oni Bomb launches onto the screen
  public playBombSpawnWarning() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const drumOsc = ctx.createOscillator();
    const drumGain = ctx.createGain();
    drumOsc.type = 'sine';
    drumOsc.frequency.setValueAtTime(115, now);
    drumOsc.frequency.exponentialRampToValueAtTime(46, now + 0.18);
    drumGain.gain.setValueAtTime(0.22, now);
    drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    drumOsc.connect(drumGain);
    drumGain.connect(ctx.destination);
    drumOsc.start(now);
    drumOsc.stop(now + 0.21);

    // Fuse spark sizzle
    this.triggerNoiseBurst(ctx, now + 0.02, 0.14, 'bandpass', 3600, 2400, 4.0, 0.12);
  }

  // Multi-layered Oni Bomb collision explosion OR Aegis Kami Ward shield parry
  public playBombExplosion(shielded: boolean = false) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (shielded) {
      // 1. Crystalline Spirit Parry Clang
      [660, 990].forEach((f, idx) => {
        const chime = ctx.createOscillator();
        const cGain = ctx.createGain();
        chime.type = 'triangle';
        chime.frequency.setValueAtTime(f, now + idx * 0.02);
        chime.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.28);
        cGain.gain.setValueAtTime(0.2, now + idx * 0.02);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        chime.connect(cGain);
        cGain.connect(ctx.destination);
        chime.start(now + idx * 0.02);
        chime.stop(now + 0.32);
      });

      // 2. Ascending Plasma Dispersion Sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(1240, now + 0.26);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
      return;
    }

    // Direct Bomb Collision:
    // Layer 1: Sharp metallic katana-on-iron hull clang
    [1080, 1640].forEach((clangFreq) => {
      const clang = ctx.createOscillator();
      const clangGain = ctx.createGain();
      clang.type = 'square';
      clang.frequency.setValueAtTime(clangFreq, now);
      clang.frequency.exponentialRampToValueAtTime(clangFreq * 0.65, now + 0.07);
      clangGain.gain.setValueAtTime(0.18, now);
      clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      clang.connect(clangGain);
      clangGain.connect(ctx.destination);
      clang.start(now);
      clang.stop(now + 0.08);
    });

    // Layer 2: Heavy low-end concussion shockwave drop
    const boomOsc = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boomOsc.type = 'sawtooth';
    boomOsc.frequency.setValueAtTime(148, now + 0.015);
    boomOsc.frequency.exponentialRampToValueAtTime(24, now + 0.52);
    boomGain.gain.setValueAtTime(0.46, now + 0.015);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    boomOsc.connect(boomGain);
    boomGain.connect(ctx.destination);
    boomOsc.start(now + 0.015);
    boomOsc.stop(now + 0.56);

    // Layer 3: Roaring fireball noise rumble + ember crackle
    this.triggerNoiseBurst(ctx, now + 0.01, 0.52, 'lowpass', 1450, 85, 1.2, 0.42);
  }

  // Somber descending tone when a fruit falls or expires without being sliced
  public playMissFruit() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(135, now + 0.24);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  // Power-Up Activation Sound
  public playPowerUp(id: PowerUpId) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs =
      id === 'chrono_lotus'
        ? [523.25, 392.0, 261.63]
        : id === 'frenzy_storm'
        ? [329.63, 440.0, 659.25, 880.0]
        : id === 'twin_katana'
        ? [440.0, 554.37, 659.25]
        : [293.66, 440.0, 587.33];

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }

  /**
   * Tactile UI Interaction Cues for buttons, difficulty tabs, blade swatches, and dojo transitions
   */
  public playUiClick(variant: UiSoundVariant = 'tap') {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (variant === 'confirm') {
      // Heroic katana unsheathe shing + resonant taiko strike
      const shingOsc = ctx.createOscillator();
      const shingGain = ctx.createGain();
      shingOsc.type = 'sine';
      shingOsc.frequency.setValueAtTime(980, now);
      shingOsc.frequency.exponentialRampToValueAtTime(2650, now + 0.18);
      shingGain.gain.setValueAtTime(0.16, now);
      shingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      shingOsc.connect(shingGain);
      shingGain.connect(ctx.destination);
      shingOsc.start(now);
      shingOsc.stop(now + 0.21);

      const drumOsc = ctx.createOscillator();
      const drumGain = ctx.createGain();
      drumOsc.type = 'triangle';
      drumOsc.frequency.setValueAtTime(140, now);
      drumOsc.frequency.exponentialRampToValueAtTime(48, now + 0.22);
      drumGain.gain.setValueAtTime(0.28, now);
      drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      drumOsc.connect(drumGain);
      drumGain.connect(ctx.destination);
      drumOsc.start(now);
      drumOsc.stop(now + 0.25);
      return;
    }

    if (variant === 'blade') {
      // Metallic katana steel harmonic ring when changing blade style
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1560, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
      return;
    }

    if (variant === 'tab') {
      // Crisp koto string pluck for modal tabs & navigation
      [523.25, 659.25].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.03;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      });
      return;
    }

    if (variant === 'close') {
      // Soft descending woodblock tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      return;
    }

    // Default 'tap': Crisp Japanese hyoshigi wood clack
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.055);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Ascending shamisen/koto fanfare when advancing a Dynamic Tempo Level during a session
  public playTempoLevelUp(tempoLevel: number) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const base = 392 + Math.min(tempoLevel, 10) * 28;
    const notes = [base, base * 1.25, base * 1.5];

    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.05;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  // Ceremonial temple gong when a Dojo session ends
  public playGameOver() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [196, 293.66, 440].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.65);
      gain.gain.setValueAtTime(0.22 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.72);
    });
  }
}

export const soundEngine = new SoundEngine();
