export type DifficultyId = 'apprentice' | 'shinobi' | 'shogun' | 'ronin';

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  subtitle: string;
  gravity: number;
  spawnIntervalMs: number;
  minBurst: number;
  maxBurst: number;
  bombChance: number;
  scoreMultiplier: number;
  lives: number;
  speedMultiplier: number;
  accentColor: string;
}

export interface DynamicScalingMetrics {
  tempoLevel: number;
  tempoTitle: string;
  spawnRateMultiplier: number;
  effectiveSpawnIntervalMs: number;
  effectiveStaggerMs: number;
  lifespanMultiplier: number;
  effectiveGravity: number;
  maxProjectileLifespanSec: number;
  bonusMaxBurst: number;
  bonusMaxOnScreen: number;
}

export type FruitKind =
  | 'watermelon'
  | 'pineapple'
  | 'dragonfruit'
  | 'mango'
  | 'coconut'
  | 'pomegranate'
  | 'golden_yuzu'
  | 'bomb_oni';

export type CutAnimationStyle =
  | 'radial_cleave'
  | 'crown_spin'
  | 'magenta_starburst'
  | 'tangential_glide'
  | 'shell_shatter'
  | 'jewel_scatter'
  | 'celestial_nova'
  | 'bomb_detonate';

export interface FruitSpec {
  kind: FruitKind;
  label: string;
  points: number;
  radius: number;
  rindColor: number;
  fleshColor: number;
  seedColor: number;
  accentColor: number;
  juiceHex: string;
  cutStyle: CutAnimationStyle;
  cutStyleName: string;
  mass: number;
  isHazard?: boolean;
  isRare?: boolean;
}

export type PowerUpId = 'chrono_lotus' | 'frenzy_storm' | 'twin_katana' | 'aegis_ward';

export interface PowerUpConfig {
  id: PowerUpId;
  name: string;
  shortName: string;
  hotkey: string;
  durationSec: number;
  cooldownSec: number;
  energyCost: number;
  colorHex: string;
  description: string;
}

export interface DailyChallenge {
  id: string;
  dateStr: string;
  title: string;
  description: string;
  type: 'slice_specific' | 'combo_streak' | 'score_no_bomb' | 'powerup_mastery';
  targetValue: number;
  currentValue: number;
  targetFruits?: FruitKind[];
  minDifficulty?: DifficultyId;
  rewardXp: number;
  completed: boolean;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  titleBadge: string;
  score: number;
  maxCombo: number;
  fruitsSliced: number;
  difficulty: DifficultyId;
  mode: 'classic' | 'daily';
  timestamp: number;
  isLocalPlayer?: boolean;
  syncedOnline: boolean;
}

export interface BladeStyle {
  id: string;
  name: string;
  primaryColor: string;
  coreColor: string;
  glowColor: string;
  unlockScore: number;
}

export interface GameHudState {
  phase: 'title' | 'playing' | 'paused' | 'gameover';
  mode: 'classic' | 'daily';
  activeChallengeId: string | null;
  difficulty: DifficultyId;
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  lives: number;
  maxLives: number;
  energy: number; // 0 to 100
  fruitsSliced: number;
  activePowerUps: Record<PowerUpId, number>; // remaining seconds
  powerUpCooldowns: Record<PowerUpId, number>; // remaining cooldown seconds
  lastCutNotification: {
    id: number;
    text: string;
    subtext: string;
    color: string;
  } | null;
  timeRemainingSec: number | null; // For timed daily challenges
}
