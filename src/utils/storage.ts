import {
  BladeStyle,
  DailyChallenge,
  DifficultyConfig,
  DifficultyId,
  DynamicScalingMetrics,
  FruitKind,
  FruitSpec,
  LeaderboardEntry,
  PowerUpConfig,
  PowerUpId,
} from '../types/game';

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  apprentice: {
    id: 'apprentice',
    name: 'Apprentice',
    subtitle: '1–2 fruits per wave · Relaxed speed · 5 Lives',
    gravity: 7.6,
    spawnIntervalMs: 2600,
    minBurst: 1,
    maxBurst: 2,
    bombChance: 0.06,
    scoreMultiplier: 1.0,
    lives: 5,
    speedMultiplier: 0.85,
    accentColor: '#38bdf8',
  },
  shinobi: {
    id: 'shinobi',
    name: 'Shinobi',
    subtitle: '1–3 fruits per wave · Balanced pace · 3 Lives',
    gravity: 9.2,
    spawnIntervalMs: 2200,
    minBurst: 1,
    maxBurst: 3,
    bombChance: 0.12,
    scoreMultiplier: 1.25,
    lives: 3,
    speedMultiplier: 1.0,
    accentColor: '#22c55e',
  },
  shogun: {
    id: 'shogun',
    name: 'Shogun',
    subtitle: '2–3 fruits per wave · Fast arcs · 1.6x Score',
    gravity: 10.8,
    spawnIntervalMs: 1900,
    minBurst: 2,
    maxBurst: 3,
    bombChance: 0.17,
    scoreMultiplier: 1.6,
    lives: 3,
    speedMultiplier: 1.12,
    accentColor: '#f59e0b',
  },
  ronin: {
    id: 'ronin',
    name: 'Ronin Extreme',
    subtitle: '2–4 fruits per wave · Master reflex · 2.2x Score',
    gravity: 12.2,
    spawnIntervalMs: 1650,
    minBurst: 2,
    maxBurst: 4,
    bombChance: 0.22,
    scoreMultiplier: 2.2,
    lives: 2,
    speedMultiplier: 1.22,
    accentColor: '#f43f5e',
  },
};

const TEMPO_TITLES = [
  'Calm Breeze',
  'Rising Gale',
  'Swift Katana',
  'Blazing Iaido',
  'Storm Cleave',
  'Tempest Edge',
  'Crimson Hurricane',
  'Thunder Shogun',
  'Eclipse Fury',
  'Kami Overdrive',
];

const TEMPO_THRESHOLDS = [0, 150, 350, 600, 900, 1250, 1650, 2100, 2600, 3200];

/**
 * Dynamically scales fruit spawn rate up and projectile lifespan down
 * as the player's score increases within a single session.
 */
export function computeDynamicScaling(
  difficultyId: DifficultyId,
  score: number
): DynamicScalingMetrics {
  const baseDiff = DIFFICULTIES[difficultyId];
  const safeScore = Math.max(0, score);

  let tempoLevel = 1;
  for (let i = TEMPO_THRESHOLDS.length - 1; i >= 0; i--) {
    if (safeScore >= TEMPO_THRESHOLDS[i]) {
      tempoLevel = i + 1;
      break;
    }
  }
  const tempoTitle = TEMPO_TITLES[Math.min(tempoLevel - 1, TEMPO_TITLES.length - 1)];

  // Smooth continuous curve for spawn rate increase (1.00x -> 2.20x)
  const spawnCurve = Math.min(1.2, Math.pow(safeScore / 2100, 0.85) * 1.1);
  const spawnRateMultiplier = +(1 + spawnCurve).toFixed(2);

  const effectiveSpawnIntervalMs = Math.max(
    480,
    Math.round(baseDiff.spawnIntervalMs / spawnRateMultiplier)
  );
  const effectiveStaggerMs = Math.max(
    145,
    Math.round(370 / Math.pow(spawnRateMultiplier, 0.78))
  );

  // Smooth continuous curve for projectile lifespan reduction (1.00 -> 0.52)
  const lifeReduction = Math.min(0.48, Math.pow(safeScore / 2300, 0.85) * 0.44);
  const lifespanMultiplier = +Math.max(0.52, 1 - lifeReduction).toFixed(2);

  // Increasing gravity by 1 / (lifespanMultiplier^2) keeps the exact same apex height
  // while reducing ballistic flight duration to (baseFlightTime * lifespanMultiplier)
  const effectiveGravity = +(
    baseDiff.gravity /
    (lifespanMultiplier * lifespanMultiplier)
  ).toFixed(2);

  const maxProjectileLifespanSec = +(2.75 * lifespanMultiplier).toFixed(2);
  const bonusMaxBurst = safeScore >= 1600 ? 2 : safeScore >= 550 ? 1 : 0;
  const bonusMaxOnScreen = safeScore >= 1200 ? 1 : 0;

  return {
    tempoLevel,
    tempoTitle,
    spawnRateMultiplier,
    effectiveSpawnIntervalMs,
    effectiveStaggerMs,
    lifespanMultiplier,
    effectiveGravity,
    maxProjectileLifespanSec,
    bonusMaxBurst,
    bonusMaxOnScreen,
  };
}

export const FRUIT_SPECS: Record<FruitKind, FruitSpec> = {
  watermelon: {
    kind: 'watermelon',
    label: 'Jade Watermelon',
    points: 15,
    radius: 0.92,
    rindColor: 0x15803d,
    fleshColor: 0xf43f5e,
    seedColor: 0x0f172a,
    accentColor: 0x4ade80,
    juiceHex: '#f43f5e',
    cutStyle: 'radial_cleave',
    cutStyleName: 'Radial Cleave',
    mass: 1.35,
  },
  pineapple: {
    kind: 'pineapple',
    label: 'Sunburst Pineapple',
    points: 20,
    radius: 0.84,
    rindColor: 0xd97706,
    fleshColor: 0xfacc15,
    seedColor: 0x16a34a,
    accentColor: 0x22c55e,
    juiceHex: '#facc15',
    cutStyle: 'crown_spin',
    cutStyleName: 'Crown & Ring Spin',
    mass: 1.2,
  },
  dragonfruit: {
    kind: 'dragonfruit',
    label: 'Crimson Pitaya',
    points: 25,
    radius: 0.76,
    rindColor: 0xdb2777,
    fleshColor: 0xf8fafc,
    seedColor: 0x1e293b,
    accentColor: 0xa3e635,
    juiceHex: '#ec4899',
    cutStyle: 'magenta_starburst',
    cutStyleName: 'Starburst Split',
    mass: 1.0,
  },
  mango: {
    kind: 'mango',
    label: 'Alphonso Mango',
    points: 15,
    radius: 0.72,
    rindColor: 0xf97316,
    fleshColor: 0xfbbf24,
    seedColor: 0xfef08a,
    accentColor: 0xef4444,
    juiceHex: '#fb923c',
    cutStyle: 'tangential_glide',
    cutStyleName: 'Silky Glide',
    mass: 0.95,
  },
  coconut: {
    kind: 'coconut',
    label: 'Iron Husk Coconut',
    points: 30,
    radius: 0.78,
    rindColor: 0x5c3a21,
    fleshColor: 0xffffff,
    seedColor: 0x78350f,
    accentColor: 0xe2e8f0,
    juiceHex: '#f1f5f9',
    cutStyle: 'shell_shatter',
    cutStyleName: 'Armor Shatter',
    mass: 1.45,
  },
  pomegranate: {
    kind: 'pomegranate',
    label: 'Ruby Pomegranate',
    points: 25,
    radius: 0.74,
    rindColor: 0x9f1239,
    fleshColor: 0xfda4af,
    seedColor: 0xe11d48,
    accentColor: 0xf43f5e,
    juiceHex: '#e11d48',
    cutStyle: 'jewel_scatter',
    cutStyleName: 'Ruby Aril Scatter',
    mass: 1.05,
  },
  golden_yuzu: {
    kind: 'golden_yuzu',
    label: 'Celestial Yuzu',
    points: 75,
    radius: 0.68,
    rindColor: 0xf59e0b,
    fleshColor: 0xfef08a,
    seedColor: 0xffffff,
    accentColor: 0x38bdf8,
    juiceHex: '#fbbf24',
    cutStyle: 'celestial_nova',
    cutStyleName: 'Golden Nova',
    mass: 0.82,
    isRare: true,
  },
  bomb_oni: {
    kind: 'bomb_oni',
    label: 'Oni Fuse Bomb',
    points: 0,
    radius: 0.8,
    rindColor: 0x1e293b,
    fleshColor: 0xef4444,
    seedColor: 0xf97316,
    accentColor: 0xef4444,
    juiceHex: '#ef4444',
    cutStyle: 'bomb_detonate',
    cutStyleName: 'Detonation',
    mass: 1.5,
    isHazard: true,
  },
};

export const POWER_UPS: Record<PowerUpId, PowerUpConfig> = {
  chrono_lotus: {
    id: 'chrono_lotus',
    name: 'Chrono Lotus',
    shortName: 'Slow-Mo',
    hotkey: '1',
    durationSec: 6,
    cooldownSec: 14,
    energyCost: 30,
    colorHex: '#38bdf8',
    description: 'Dilates time to 38% speed for razor-sharp multi-fruit combos.',
  },
  frenzy_storm: {
    id: 'frenzy_storm',
    name: 'Nectar Typhoon',
    shortName: 'Frenzy',
    hotkey: '2',
    durationSec: 5,
    cooldownSec: 18,
    energyCost: 45,
    colorHex: '#f43f5e',
    description: 'Launches a rapid bonus fruit wave with zero Oni Bombs.',
  },
  twin_katana: {
    id: 'twin_katana',
    name: 'Twin Shadow Blade',
    shortName: '2x Score',
    hotkey: '3',
    durationSec: 7,
    cooldownSec: 16,
    energyCost: 35,
    colorHex: '#f59e0b',
    description: 'Doubles all slice points and widens katana cleave radius by 45%.',
  },
  aegis_ward: {
    id: 'aegis_ward',
    name: 'Aegis Kami Ward',
    shortName: 'Shield',
    hotkey: '4',
    durationSec: 8,
    cooldownSec: 15,
    energyCost: 25,
    colorHex: '#a855f7',
    description: 'Neutralizes Oni Bombs on contact and converts them into +60 pts.',
  },
};

export const BLADE_STYLES: BladeStyle[] = [
  {
    id: 'steel_storm',
    name: 'Hattori Mist',
    primaryColor: '#38bdf8',
    coreColor: '#f8fafc',
    glowColor: '#0284c7',
    unlockScore: 0,
  },
  {
    id: 'solar_flare',
    name: 'Amaterasu Gold',
    primaryColor: '#f59e0b',
    coreColor: '#fef9c3',
    glowColor: '#ea580c',
    unlockScore: 500,
  },
  {
    id: 'crimson_sakura',
    name: 'Sakura Bloodmoon',
    primaryColor: '#f43f5e',
    coreColor: '#ffe4e6',
    glowColor: '#be123c',
    unlockScore: 1200,
  },
  {
    id: 'jade_dragon',
    name: 'Ryujin Emerald',
    primaryColor: '#10b981',
    coreColor: '#d1fae5',
    glowColor: '#047857',
    unlockScore: 2000,
  },
];

// Generate deterministic daily challenges for today's date
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function loadDailyChallenges(): DailyChallenge[] {
  const today = getTodayDateString();
  const storageKey = `katana_nectar_daily_${today}`;
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback to fresh generation
    }
  }

  // Seeded by day of month so challenges rotate daily
  const dayNum = new Date().getDate();
  const challenges: DailyChallenge[] = [
    {
      id: `dc_${today}_1`,
      dateStr: today,
      title: dayNum % 2 === 0 ? 'Crimson Harvest' : 'Tropical Cleave',
      description:
        dayNum % 2 === 0
          ? 'Slice 25 Jade Watermelons, Ruby Pomegranates, or Pitayas in any mode.'
          : 'Slice 25 Sunburst Pineapples, Alphonso Mangoes, or Coconuts.',
      type: 'slice_specific',
      targetValue: 25,
      currentValue: 0,
      targetFruits:
        dayNum % 2 === 0
          ? ['watermelon', 'pomegranate', 'dragonfruit']
          : ['pineapple', 'mango', 'coconut'],
      rewardXp: 350,
      completed: false,
    },
    {
      id: `dc_${today}_2`,
      dateStr: today,
      title: 'Lightning Iaido Streak',
      description: 'Execute a 5x or higher single-swipe or rapid Blitz Combo.',
      type: 'combo_streak',
      targetValue: 5,
      currentValue: 0,
      rewardXp: 500,
      completed: false,
    },
    {
      id: `dc_${today}_3`,
      dateStr: today,
      title: 'Shogun Flawless Trial',
      description: 'Score 600+ points in a single run on Shinobi, Shogun, or Ronin difficulty.',
      type: 'score_no_bomb',
      targetValue: 600,
      currentValue: 0,
      minDifficulty: 'shinobi',
      rewardXp: 750,
      completed: false,
    },
  ];

  localStorage.setItem(storageKey, JSON.stringify(challenges));
  return challenges;
}

export function saveDailyChallenges(challenges: DailyChallenge[]) {
  const today = getTodayDateString();
  localStorage.setItem(`katana_nectar_daily_${today}`, JSON.stringify(challenges));
}

const REAL_LEADERBOARD_KEY = 'katana_nectar_real_leaderboard_v2';
const LEGACY_LEADERBOARD_KEY = 'katana_nectar_leaderboard_v1';
const PLAYER_NAME_KEY = 'katana_nectar_player_name';
const HIGH_SCORE_KEY = 'katana_nectar_high_score';

export function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) || 'Rajveer Singh Rana';
}

export function setPlayerName(name: string) {
  const clean = name.trim().slice(0, 22) || 'Rajveer Singh Rana';
  localStorage.setItem(PLAYER_NAME_KEY, clean);
}

export function getSavedHighScore(): number {
  const val = Number(localStorage.getItem(HIGH_SCORE_KEY) || '0');
  return Number.isFinite(val) ? val : 0;
}

export function saveHighScore(score: number): number {
  const current = getSavedHighScore();
  const next = Math.max(current, Math.floor(score));
  localStorage.setItem(HIGH_SCORE_KEY, String(next));
  return next;
}

function isRealRunEntry(item: LeaderboardEntry): boolean {
  return Boolean(
    item &&
      typeof item.id === 'string' &&
      !item.id.startsWith('gl_') &&
      typeof item.score === 'number' &&
      item.score > 0
  );
}

export function getLeaderboard(): LeaderboardEntry[] {
  const rawV2 = localStorage.getItem(REAL_LEADERBOARD_KEY);
  if (rawV2) {
    try {
      const parsed = JSON.parse(rawV2) as LeaderboardEntry[];
      return parsed.filter(isRealRunEntry).sort((a, b) => b.score - a.score);
    } catch {
      // fall through
    }
  }

  // Migrate only real player runs (run_*) from legacy storage and purge all fake gl_* entries
  const rawLegacy = localStorage.getItem(LEGACY_LEADERBOARD_KEY);
  let migrated: LeaderboardEntry[] = [];
  if (rawLegacy) {
    try {
      const parsedLegacy = JSON.parse(rawLegacy) as LeaderboardEntry[];
      migrated = parsedLegacy
        .filter(isRealRunEntry)
        .map((item) => ({ ...item, isLocalPlayer: true }))
        .sort((a, b) => b.score - a.score);
    } catch {
      migrated = [];
    }
    localStorage.removeItem(LEGACY_LEADERBOARD_KEY);
  }

  localStorage.setItem(REAL_LEADERBOARD_KEY, JSON.stringify(migrated));
  return migrated;
}

function mergeLeaderboards(
  localList: LeaderboardEntry[],
  serverList: LeaderboardEntry[]
): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>();
  const localIds = new Set(localList.filter((i) => i.isLocalPlayer).map((i) => i.id));

  for (const item of localList) {
    if (isRealRunEntry(item)) {
      map.set(item.id, item);
    }
  }
  for (const item of serverList) {
    if (isRealRunEntry(item)) {
      map.set(item.id, {
        ...item,
        syncedOnline: true,
        isLocalPlayer: localIds.has(item.id) || item.isLocalPlayer,
      });
    }
  }

  const merged = Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  localStorage.setItem(REAL_LEADERBOARD_KEY, JSON.stringify(merged));
  return merged;
}

export function submitLeaderboardScore(
  entry: Omit<LeaderboardEntry, 'id' | 'timestamp' | 'syncedOnline'>,
  onServerSynced?: (merged: LeaderboardEntry[]) => void
): LeaderboardEntry[] {
  const current = getLeaderboard();
  const newEntry: LeaderboardEntry = {
    ...entry,
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    syncedOnline: false,
    isLocalPlayer: true,
  };
  const updated = [...current, newEntry]
    .filter(isRealRunEntry)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  localStorage.setItem(REAL_LEADERBOARD_KEY, JSON.stringify(updated));

  // Immediately sync real run with backend server if online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: updated }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.entries)) {
          const synced = mergeLeaderboards(updated, data.entries);
          if (onServerSynced) onServerSynced(synced);
        }
      })
      .catch(() => {
        // Offline fallback: entry stays safely queued in localStorage with syncedOnline = false
      });
  }

  return updated;
}

export async function syncRealLeaderboardWithServer(): Promise<LeaderboardEntry[]> {
  const local = getLeaderboard();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return local;
  }

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: local }),
    });
    if (!res.ok) return local;
    const data = await res.json();
    if (data && Array.isArray(data.entries)) {
      return mergeLeaderboards(local, data.entries);
    }
  } catch {
    // Offline or unreachable
  }
  return local;
}

export async function deleteLeaderboardEntry(id: string): Promise<LeaderboardEntry[]> {
  const filtered = getLeaderboard().filter((item) => item.id !== id);
  localStorage.setItem(REAL_LEADERBOARD_KEY, JSON.stringify(filtered));

  try {
    const res = await fetch(`/api/leaderboard/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.entries)) {
        return mergeLeaderboards(filtered, data.entries);
      }
    }
  } catch {
    // Offline fallback
  }
  return filtered;
}

export function syncOfflineScores(): LeaderboardEntry[] {
  return getLeaderboard();
}
