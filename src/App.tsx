/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  BladeStyle,
  DailyChallenge,
  DifficultyId,
  FruitKind,
  LeaderboardEntry,
  PowerUpId,
} from './types/game';
import {
  BLADE_STYLES,
  computeDynamicScaling,
  deleteLeaderboardEntry,
  DIFFICULTIES,
  FRUIT_SPECS,
  getLeaderboard,
  getPlayerName,
  getSavedHighScore,
  loadDailyChallenges,
  POWER_UPS,
  saveDailyChallenges,
  saveHighScore,
  submitLeaderboardScore,
  syncRealLeaderboardWithServer,
} from './utils/storage';
import { DojoCanvas } from './components/DojoCanvas';
import { PWAStatusAndInstall } from './components/PWAInstallPrompt';
import { LeaderboardModal } from './components/LeaderboardModal';
import { DailyChallengesModal } from './components/DailyChallengesModal';
import { soundEngine } from './utils/sound';
import {
  Trophy,
  Calendar,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  Clock,
  Flame,
  Swords,
  Heart,
  Award,
} from 'lucide-react';

export default function App() {
  const [phase, setPhase] = useState<'title' | 'playing' | 'paused' | 'gameover'>('title');
  const [mode, setMode] = useState<'classic' | 'daily'>('classic');
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>('shinobi');
  const [bladeStyle, setBladeStyle] = useState<BladeStyle>(BLADE_STYLES[0]);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => getSavedHighScore());
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [lives, setLives] = useState(DIFFICULTIES.shinobi.lives);
  const [maxLives, setMaxLives] = useState(DIFFICULTIES.shinobi.lives);
  const [energy, setEnergy] = useState(50);
  const [fruitsSliced, setFruitsSliced] = useState(0);
  const [hitBombInRun, setHitBombInRun] = useState(false);

  const [activePowerUps, setActivePowerUps] = useState<Record<PowerUpId, number>>({
    chrono_lotus: 0,
    frenzy_storm: 0,
    twin_katana: 0,
    aegis_ward: 0,
  });
  const [powerUpCooldowns, setPowerUpCooldowns] = useState<Record<PowerUpId, number>>({
    chrono_lotus: 0,
    frenzy_storm: 0,
    twin_katana: 0,
    aegis_ward: 0,
  });
  const [triggerFrenzySignal, setTriggerFrenzySignal] = useState(0);

  const [cutFeed, setCutFeed] = useState<{
    id: number;
    text: string;
    subtext: string;
    color: string;
  } | null>(null);

  const [isMuted, setIsMuted] = useState(() => soundEngine.getMuted());
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showLeaderboards, setShowLeaderboards] = useState(false);
  const [showDailyChallenges, setShowDailyChallenges] = useState(false);
  const [transitionBanner, setTransitionBanner] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => getLeaderboard());
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallenge[]>(() =>
    loadDailyChallenges()
  );
  const [playerName, setPlayerNameState] = useState(() => getPlayerName());

  // Start a new Classic or Daily Challenge run
  const startGame = useCallback(
    (selectedDiff: DifficultyId = difficulty, runMode: 'classic' | 'daily' = 'classic', challengeId: string | null = null) => {
      const cfg = DIFFICULTIES[selectedDiff];
      setDifficulty(selectedDiff);
      setMode(runMode);
      setActiveChallengeId(challengeId);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setLives(cfg.lives);
      setMaxLives(cfg.lives);
      setEnergy(55);
      setFruitsSliced(0);
      setHitBombInRun(false);
      setActivePowerUps({
        chrono_lotus: 0,
        frenzy_storm: 0,
        twin_katana: 0,
        aegis_ward: 0,
      });
      setPowerUpCooldowns({
        chrono_lotus: 0,
        frenzy_storm: 0,
        twin_katana: 0,
        aegis_ward: 0,
      });
      soundEngine.playUiClick('confirm');
      setCutFeed(null);
      setPhase('playing');
      setTransitionBanner(`${cfg.name} Dojo · By Rajveer Singh Rana`);
    },
    [difficulty]
  );

  useEffect(() => {
    if (!transitionBanner) return;
    const t = window.setTimeout(() => setTransitionBanner(null), 2000);
    return () => clearTimeout(t);
  }, [transitionBanner]);

  // Start a specific Daily Challenge
  const handleStartDailyChallenge = useCallback(
    (ch: DailyChallenge) => {
      const targetDiff = ch.minDifficulty || difficulty;
      startGame(targetDiff, 'daily', ch.id);
    },
    [difficulty, startGame]
  );

  // Trigger Power-Up
  const activatePowerUp = useCallback(
    (id: PowerUpId) => {
      if (phase !== 'playing') return;
      const cfg = POWER_UPS[id];
      if (activePowerUps[id] > 0 || powerUpCooldowns[id] > 0) return;
      if (energy < cfg.energyCost) return;

      soundEngine.playPowerUp(id);
      setEnergy((prev) => Math.max(0, prev - cfg.energyCost));
      setActivePowerUps((prev) => ({ ...prev, [id]: cfg.durationSec }));
      setPowerUpCooldowns((prev) => ({ ...prev, [id]: cfg.cooldownSec }));

      if (id === 'frenzy_storm') {
        setTriggerFrenzySignal((s) => s + 1);
      }

      setCutFeed({
        id: Date.now(),
        text: `${cfg.name} Activated!`,
        subtext: cfg.description,
        color: cfg.colorHex,
      });
    },
    [phase, activePowerUps, powerUpCooldowns, energy]
  );

  // Power-Up timers & passive energy regeneration
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = window.setInterval(() => {
      setActivePowerUps((prev) => ({
        chrono_lotus: Math.max(0, +(prev.chrono_lotus - 0.2).toFixed(1)),
        frenzy_storm: Math.max(0, +(prev.frenzy_storm - 0.2).toFixed(1)),
        twin_katana: Math.max(0, +(prev.twin_katana - 0.2).toFixed(1)),
        aegis_ward: Math.max(0, +(prev.aegis_ward - 0.2).toFixed(1)),
      }));
      setPowerUpCooldowns((prev) => ({
        chrono_lotus: Math.max(0, +(prev.chrono_lotus - 0.2).toFixed(1)),
        frenzy_storm: Math.max(0, +(prev.frenzy_storm - 0.2).toFixed(1)),
        twin_katana: Math.max(0, +(prev.twin_katana - 0.2).toFixed(1)),
        aegis_ward: Math.max(0, +(prev.aegis_ward - 0.2).toFixed(1)),
      }));
      setEnergy((prev) => Math.min(100, +(prev + 0.45).toFixed(1)));
    }, 200);

    return () => clearInterval(interval);
  }, [phase]);

  // Keyboard shortcuts (Enter/Space to start, 1-4 Power-ups, Esc Pause, H toggle dock)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showLeaderboards || showDailyChallenges) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.code === 'Space' || e.code === 'Enter') && phase === 'title') {
        e.preventDefault();
        startGame(difficulty, 'classic', null);
      } else if (e.code === 'Escape') {
        if (phase === 'playing') setPhase('paused');
        else if (phase === 'paused') setPhase('playing');
      } else if (e.code === 'KeyH') {
        setDockCollapsed((c) => !c);
      } else if (phase === 'playing') {
        if (e.key === '1') activatePowerUp('chrono_lotus');
        if (e.key === '2') activatePowerUp('frenzy_storm');
        if (e.key === '3') activatePowerUp('twin_katana');
        if (e.key === '4') activatePowerUp('aegis_ward');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    difficulty,
    showLeaderboards,
    showDailyChallenges,
    startGame,
    activatePowerUp,
  ]);

  // Finalize game over & submit score to leaderboard
  const triggerGameOver = useCallback(
    (finalScore: number, finalMaxCombo: number, finalSliced: number) => {
      soundEngine.playGameOver();
      setPhase('gameover');
      const updatedHigh = saveHighScore(finalScore);
      setHighScore(updatedHigh);

      if (finalScore > 0) {
        const badge =
          finalScore >= 2500
            ? 'Grandmaster Blade'
            : finalScore >= 1200
            ? 'Shogun Vanguard'
            : finalScore >= 600
            ? 'Shinobi Ace'
            : 'Dojo Initiate';

        const updatedBoard = submitLeaderboardScore(
          {
            playerName,
            titleBadge: badge,
            score: finalScore,
            maxCombo: finalMaxCombo,
            fruitsSliced: finalSliced,
            difficulty,
            mode,
            isLocalPlayer: true,
          },
          (serverMerged) => {
            setLeaderboard(serverMerged);
          }
        );
        setLeaderboard(updatedBoard);
      }
    },
    [playerName, difficulty, mode]
  );

  // Callback from 3D DojoCanvas when a fruit is sliced
  const handleScoreChange = useCallback(
    (
      deltaScore: number,
      kind: FruitKind,
      currentCombo: number,
      cutStyleName: string,
      juiceHex: string,
      energyGain: number
    ) => {
      const spec = FRUIT_SPECS[kind];
      const prevScaling = computeDynamicScaling(difficulty, score);
      const nextScore = score + deltaScore;
      const nextScaling = computeDynamicScaling(difficulty, nextScore);
      const nextCombo = currentCombo;
      const nextMaxCombo = Math.max(maxCombo, currentCombo);
      const nextSliced = fruitsSliced + 1;

      setScore(nextScore);
      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setFruitsSliced(nextSliced);
      setEnergy((prev) => Math.min(100, prev + energyGain));

      if (nextScore > highScore) {
        setHighScore(nextScore);
      }

      if (nextScaling.tempoLevel > prevScaling.tempoLevel) {
        soundEngine.playTempoLevelUp(nextScaling.tempoLevel);
        setTransitionBanner(
          `Tempo Lv.${nextScaling.tempoLevel} (${nextScaling.tempoTitle}) · Spawn ${nextScaling.spawnRateMultiplier}x · Life ${Math.round(nextScaling.lifespanMultiplier * 100)}%`
        );
      }

      setCutFeed({
        id: Date.now(),
        text: `${spec.label} +${deltaScore}`,
        subtext:
          currentCombo > 1
            ? `${cutStyleName} · ${currentCombo}x Blitz Combo!`
            : `${cutStyleName}`,
        color: juiceHex,
      });

      // Update Daily Challenges progress live
      setDailyChallenges((prevChallenges) => {
        let changed = false;
        const nextList = prevChallenges.map((ch) => {
          if (ch.completed) return ch;
          let nextVal = ch.currentValue;

          if (ch.type === 'slice_specific' && ch.targetFruits?.includes(kind)) {
            nextVal = Math.min(ch.targetValue, ch.currentValue + 1);
          } else if (ch.type === 'combo_streak') {
            nextVal = Math.min(ch.targetValue, Math.max(ch.currentValue, currentCombo));
          } else if (
            ch.type === 'score_no_bomb' &&
            !hitBombInRun &&
            difficulty !== 'apprentice'
          ) {
            nextVal = Math.min(ch.targetValue, Math.max(ch.currentValue, nextScore));
          }

          if (nextVal !== ch.currentValue) {
            changed = true;
            const nowComplete = nextVal >= ch.targetValue;
            return {
              ...ch,
              currentValue: nextVal,
              completed: nowComplete,
            };
          }
          return ch;
        });

        if (changed) {
          saveDailyChallenges(nextList);
        }
        return nextList;
      });
    },
    [score, maxCombo, fruitsSliced, highScore, hitBombInRun, difficulty]
  );

  // Callback when Oni Bomb is neutralized by Aegis Ward
  const handleBombDeflected = useCallback(() => {
    const bonus = 60;
    const nextScore = score + bonus;
    setScore(nextScore);
    setCutFeed({
      id: Date.now(),
      text: `Aegis Ward Deflection +${bonus}!`,
      subtext: 'Oni Bomb neutralized into pure spirit energy',
      color: '#a855f7',
    });
  }, [score]);

  // Callback when player loses a life (missed fruit or hit Oni Bomb)
  const handleLifeLost = useCallback(
    (reason: 'missed' | 'bomb') => {
      if (reason === 'bomb') {
        setHitBombInRun(true);
      }
      setCombo(0);
      setCutFeed({
        id: Date.now(),
        text: reason === 'bomb' ? 'Oni Bomb Detonated! -1 Life' : 'Fruit Missed! -1 Life',
        subtext:
          reason === 'bomb'
            ? 'Activate Aegis Kami Ward [4] to deflect bombs!'
            : 'Keep your blade sweeping across the center arc',
        color: '#ef4444',
      });

      const nextLives = lives - 1;
      if (nextLives <= 0) {
        setLives(0);
        triggerGameOver(score, maxCombo, fruitsSliced);
      } else {
        setLives(nextLives);
      }
    },
    [lives, score, maxCombo, fruitsSliced, triggerGameOver]
  );

  const handleOfflineSync = useCallback(async () => {
    const synced = await syncRealLeaderboardWithServer();
    setLeaderboard(synced);
  }, []);

  const handleDeleteLeaderboardRun = useCallback(async (id: string) => {
    const updated = await deleteLeaderboardEntry(id);
    setLeaderboard(updated);
  }, []);

  useEffect(() => {
    syncRealLeaderboardWithServer().then((synced) => {
      setLeaderboard(synced);
    });
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
    if (!next) {
      soundEngine.playUiClick('tap');
    }
  };

  const activeChallenge = dailyChallenges.find((c) => c.id === activeChallengeId);
  const dynamicScaling = computeDynamicScaling(difficulty, phase === 'playing' ? score : 0);

  return (
    <div className="relative w-full h-dvh overflow-hidden select-none">
      {/* 1. Full-Bleed 3D Three.js Dojo Canvas */}
      <DojoCanvas
        phase={phase}
        difficulty={difficulty}
        score={score}
        bladeStyle={bladeStyle}
        activePowerUps={activePowerUps}
        triggerFrenzySignal={triggerFrenzySignal}
        onScoreChange={handleScoreChange}
        onLifeLost={handleLifeLost}
        onBombDeflected={handleBombDeflected}
      />

      {/* 2. Unified Top Perimeter HUD (Structured Flow so Challenge Badge & Cut Callouts NEVER overlap) */}
      <div className="fixed top-0 inset-x-0 z-20 px-2.5 sm:px-5 pt-2.5 sm:pt-3 flex flex-col gap-1.5 pointer-events-none">
        {/* Row 1: Score/Combo/Tempo (Left) and Audio/Offline/Pause Controls (Right) */}
        <div className="flex items-center justify-between gap-2">
          {/* Top-Left: Brand Spec Badge or Live Score Readout */}
          <div className="flex items-center pointer-events-none min-w-0">
            {phase === 'title' ? (
              <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-[#0f172a]/95 border border-slate-700/80 shadow-lg">
                <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="text-[11px] sm:text-xs truncate">
                  <span className="font-bold font-display text-white tracking-wide">
                    KATANA NECTAR
                  </span>
                  <span className="mx-1.5 text-slate-500">·</span>
                  <span className="text-amber-300 font-mono-num font-semibold">
                    Best: {highScore.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-[#0f172a]/95 border border-slate-700/80 shadow-xl">
                <div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium leading-none">
                    Score
                  </div>
                  <div className="text-base sm:text-2xl font-extrabold font-mono-num text-amber-400 leading-none mt-1">
                    {score.toLocaleString()}
                  </div>
                </div>
                <div className="h-6 sm:h-7 w-px bg-slate-800 shrink-0" />
                <div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium leading-none">
                    Combo
                  </div>
                  <div
                    className={`text-xs sm:text-sm font-bold font-mono-num leading-none mt-1 ${
                      combo >= 4 ? 'text-sky-400' : 'text-slate-200'
                    }`}
                  >
                    {combo}x
                  </div>
                </div>
                <div className="h-6 sm:h-7 w-px bg-slate-800 shrink-0" />
                <div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium leading-none">
                    Tempo Lv.{dynamicScaling.tempoLevel}
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold font-mono-num text-amber-300 leading-none mt-1 whitespace-nowrap">
                    {dynamicScaling.spawnRateMultiplier.toFixed(1)}x Speed
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top-Right: Offline/PWA Install, Audio Mute & Pause (pointer-events-auto, never wraps over Life Bar) */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
            <PWAStatusAndInstall onOfflineSync={handleOfflineSync} />

            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-[#0f172a]/95 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
              title={isMuted ? 'Unmute Dojo Audio' : 'Mute Dojo Audio'}
              aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            {phase === 'playing' && (
              <button
                onClick={() => {
                  soundEngine.playUiClick('close');
                  setPhase('paused');
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#0f172a]/95 border border-slate-700/80 text-xs font-semibold text-slate-200 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
                aria-label="Pause Game"
              >
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Dedicated High-Visibility Dojo Life Bar (Always visible & crystal-clear on Mobile & Desktop) */}
        <div className="flex items-center justify-between gap-2 w-full">
          <div
            className={`flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-xl bg-[#0f172a]/95 border shadow-lg transition-colors w-full sm:w-auto sm:min-w-[320px] max-w-[440px] ${
              activePowerUps.aegis_ward > 0
                ? 'border-purple-400/90 shadow-purple-500/20'
                : lives === 1 && phase !== 'title'
                ? 'border-rose-500/90 animate-pulse'
                : 'border-slate-700/90'
            }`}
            role="meter"
            aria-label="Dojo Life Bar"
            aria-valuenow={lives}
            aria-valuemin={0}
            aria-valuemax={maxLives}
          >
            {/* Heart Icons + Label */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold font-display tracking-wider text-slate-200 uppercase mr-0.5">
                Life
              </span>
              {Array.from({ length: maxLives }).map((_, idx) => {
                const isAlive = idx < lives;
                return (
                  <Heart
                    key={idx}
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-200 ${
                      isAlive
                        ? activePowerUps.aegis_ward > 0
                          ? 'text-purple-400 fill-purple-400 scale-105'
                          : 'text-rose-500 fill-rose-500 scale-100'
                        : 'text-slate-500 fill-slate-900/90 opacity-65 scale-90'
                    }`}
                  />
                );
              })}
            </div>

            {/* Segmented Visual Health Bar Track + Fill */}
            <div className="relative flex-1 h-2.5 sm:h-3 rounded-full bg-slate-900 border border-slate-700/90 overflow-hidden min-w-[80px]">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  activePowerUps.aegis_ward > 0
                    ? 'bg-gradient-to-r from-purple-500 via-fuchsia-400 to-sky-400'
                    : lives <= 1
                    ? 'bg-gradient-to-r from-red-600 to-rose-500'
                    : lives === 2 && maxLives > 2
                    ? 'bg-gradient-to-r from-rose-500 to-amber-400'
                    : 'bg-gradient-to-r from-rose-600 via-rose-500 to-emerald-400'
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, (lives / Math.max(1, maxLives)) * 100))}%`,
                }}
              />
              {/* Segment tick dividers matching maxLives */}
              {maxLives > 1 && (
                <div className="absolute inset-0 flex pointer-events-none">
                  {Array.from({ length: maxLives - 1 }).map((_, segIdx) => (
                    <div
                      key={segIdx}
                      className="h-full border-r border-slate-950/80"
                      style={{ width: `${100 / maxLives}%` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Numeric Life Counter / Shield Status */}
            <div className="flex items-center gap-1 shrink-0 font-mono-num text-[11px] sm:text-xs font-extrabold">
              {activePowerUps.aegis_ward > 0 ? (
                <span className="text-purple-300 flex items-center gap-0.5">
                  <Shield className="w-3 h-3 fill-purple-400/30" />
                  <span>WARD</span>
                </span>
              ) : (
                <span
                  className={
                    lives <= 1
                      ? 'text-rose-400'
                      : lives < maxLives
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }
                >
                  {lives}/{maxLives} HP
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Active Daily Challenge Progress & Cut Callout Banner (Stacked cleanly with zero overlap) */}
        {phase === 'playing' && (activeChallenge || cutFeed) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1.5 w-full">
            {activeChallenge ? (
              <div className="px-3 py-1 rounded-lg bg-[#0f172a]/95 border border-sky-500/50 text-[11px] sm:text-xs text-slate-200 flex items-center gap-1.5 shadow-md">
                <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-semibold text-white">
                  {activeChallenge.title}:
                </span>
                <span className="font-mono-num font-bold text-sky-300">
                  {activeChallenge.currentValue}/{activeChallenge.targetValue}
                </span>
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}

            {cutFeed && (
              <div
                key={cutFeed.id}
                className="px-3.5 py-1 rounded-lg bg-[#0c0f17]/95 border border-slate-700/90 shadow-lg text-center sm:mx-auto"
              >
                <div
                  className="text-xs sm:text-sm font-extrabold font-display tracking-wide"
                  style={{ color: cutFeed.color }}
                >
                  {cutFeed.text}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-300 font-medium">
                  {cutFeed.subtext}
                </div>
              </div>
            )}

            <div className="hidden sm:block w-24" />
          </div>
        )}
      </div>

      {/* 4. Title Screen Overlay (Responsive for both Mobile & Desktop) */}
      {phase === 'title' && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-between pt-24 pb-28 sm:pt-24 sm:pb-16 px-3 sm:px-4 pointer-events-none overflow-y-auto">
          <div className="w-full max-w-lg mx-auto pointer-events-auto bg-[#0c0f17]/92 border border-slate-800/90 rounded-2xl px-4 py-4 sm:px-7 sm:py-6 shadow-2xl">
            {/* Bespoke Inline SVG Title Lockup */}
            <div className="flex justify-center mb-2">
              <svg
                viewBox="0 0 420 76"
                className="w-full max-w-[280px] sm:max-w-[350px] h-auto overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="titleGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                  <linearGradient id="bladeCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#f8fafc" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <path
                  d="M 10 58 Q 210 36 410 18 Q 215 44 10 58 Z"
                  fill="url(#bladeCyan)"
                />
                <text
                  x="210"
                  y="44"
                  textAnchor="middle"
                  fill="url(#titleGold)"
                  fontFamily="Outfit, sans-serif"
                  fontWeight="800"
                  fontSize="38"
                  letterSpacing="3"
                >
                  KATANA NECTAR
                </text>
                <text
                  x="210"
                  y="66"
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="600"
                  fontSize="11"
                  letterSpacing="3"
                >
                  BY RAJVEER SINGH RANA
                </text>
              </svg>
            </div>

            {/* Difficulty Selector Row */}
            <div className="mt-2 text-center">
              <div className="text-[11px] sm:text-xs font-medium text-slate-300 mb-2">
                {DIFFICULTIES[difficulty].subtitle}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#111827] rounded-xl border border-slate-800">
                {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((diffKey) => {
                  const d = DIFFICULTIES[diffKey];
                  const active = difficulty === diffKey;
                  return (
                    <button
                      key={diffKey}
                      onClick={() => {
                        soundEngine.playUiClick('tap');
                        setDifficulty(diffKey);
                        setLives(DIFFICULTIES[diffKey].lives);
                        setMaxLives(DIFFICULTIES[diffKey].lives);
                      }}
                      className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {d.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Start CTA & Secondary Feature Buttons */}
            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
              <button
                onClick={() => startGame(difficulty, 'classic', null)}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold text-sm sm:text-base tracking-wide shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>ENTER DOJO</span>
              </button>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <button
                  onClick={() => {
                    soundEngine.playUiClick('tab');
                    setShowDailyChallenges(true);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>
                    Trials ({dailyChallenges.filter((c) => c.completed).length}/
                    {dailyChallenges.length})
                  </span>
                </button>

                <button
                  onClick={() => {
                    soundEngine.playUiClick('tab');
                    setShowLeaderboards(true);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>Rankings</span>
                </button>
              </div>
            </div>

            {/* Single Flat Control-Hint Line */}
            <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 text-[11px] text-center text-slate-400 font-medium">
              Touch Swipe or Mouse Drag to Slice · Tap Power-Ups Below · Esc Pause
            </div>
          </div>

          <div className="flex-1" />
        </div>
      )}

      {/* 5. Pause & Game Over Modal */}
      {(phase === 'paused' || phase === 'gameover') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
          <div className="w-full max-w-md rounded-2xl bg-[#0f172a] border border-slate-700 p-5 sm:p-6 shadow-2xl text-center">
            <h2 className="text-xl sm:text-2xl font-extrabold font-display text-white tracking-tight">
              {phase === 'paused' ? 'DOJO PAUSED' : 'SESSION COMPLETE'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {DIFFICULTIES[difficulty].name} Tier ·{' '}
              {mode === 'daily' ? 'Daily Trial' : 'Classic Mode'}
            </p>

            {/* Run Summary Stats */}
            <div className="mt-4 grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#111827] border border-slate-800">
              <div>
                <div className="text-[11px] text-slate-400">Score</div>
                <div className="text-base sm:text-lg font-extrabold font-mono-num text-amber-400">
                  {score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Max Combo</div>
                <div className="text-base sm:text-lg font-extrabold font-mono-num text-sky-400">
                  {maxCombo}x
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Fruits Cut</div>
                <div className="text-base sm:text-lg font-extrabold font-mono-num text-emerald-400">
                  {fruitsSliced}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {phase === 'paused' ? (
                <button
                  onClick={() => {
                    soundEngine.playUiClick('confirm');
                    setPhase('playing');
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Slicing</span>
                </button>
              ) : (
                <button
                  onClick={() => startGame(difficulty, mode, activeChallengeId)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Slice Again</span>
                </button>
              )}

              <button
                onClick={() => {
                  soundEngine.playUiClick('tab');
                  setShowLeaderboards(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <Trophy className="w-4 h-4" />
                <span>Rankings</span>
              </button>

              <button
                onClick={() => {
                  soundEngine.playUiClick('close');
                  setPhase('title');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Title Screen
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 flex items-center justify-center gap-1.5 font-medium">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>By Rajveer Singh Rana</span>
            </div>
          </div>
        </div>
      )}

      {/* Transition Watermark Banner (Appears smoothly during game transitions, non-intrusive) */}
      {transitionBanner && (
        <div className="fixed top-26 sm:top-28 inset-x-0 mx-auto w-fit z-20 pointer-events-none select-none px-4 py-1.5 rounded-full bg-[#0f172a]/90 border border-amber-500/40 text-xs font-display font-bold text-amber-300 tracking-wider shadow-lg">
          {transitionBanner}
        </div>
      )}

      {/* 6. Unified Collapsible Bottom Control Dock (Centered via inset-x-0 mx-auto) */}
      <div
        className="fixed bottom-7 sm:bottom-8 inset-x-0 mx-auto z-20 w-[95vw] max-w-[860px] pointer-events-none transition-transform duration-200"
        style={{
          transform: dockCollapsed
            ? 'translateY(calc(100% + 4px))'
            : 'translateY(0)',
        }}
      >
        {/* Collapse / Expand Toggle Tab */}
        <div className="flex items-center justify-center px-2">
          <button
            onClick={() => {
              soundEngine.playUiClick('tap');
              setDockCollapsed((c) => !c);
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-[#0f172a] border border-b-0 border-slate-700/90 text-[11px] font-semibold text-slate-200 hover:text-white cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Show Power-Ups &amp; Dock</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                <span>Hide Dock</span>
              </>
            )}
          </button>
        </div>

        {/* Main Dock Body */}
        <div className="pointer-events-auto rounded-xl bg-[#0f172a]/95 border border-slate-700/90 px-2.5 py-2 sm:px-4 sm:py-2.5 shadow-2xl flex flex-col gap-2">
          {/* Top Row of Dock: 4 Full-Width Power-Up Buttons (Never truncated) */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 w-full">
            {(Object.keys(POWER_UPS) as PowerUpId[]).map((pid) => {
              const p = POWER_UPS[pid];
              const activeSec = activePowerUps[pid];
              const cdSec = powerUpCooldowns[pid];
              const canAfford = energy >= p.energyCost && activeSec <= 0 && cdSec <= 0;
              const IconComp =
                pid === 'chrono_lotus'
                  ? Clock
                  : pid === 'frenzy_storm'
                  ? Flame
                  : pid === 'twin_katana'
                  ? Swords
                  : Shield;

              return (
                <button
                  key={pid}
                  onClick={() => activatePowerUp(pid)}
                  disabled={phase !== 'playing' || !canAfford}
                  title={`${p.name} (${p.energyCost}% Ki): ${p.description}`}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 py-2 sm:px-3 sm:py-2 rounded-lg border text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeSec > 0
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : phase === 'playing' && canAfford
                      ? 'bg-slate-800/95 hover:bg-slate-700 border-slate-600 text-white active:scale-95'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <IconComp
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: p.colorHex }}
                  />
                  <span>{p.shortName}</span>
                  <span className="text-[10px] font-mono-num text-slate-300">
                    {activeSec > 0
                      ? `${activeSec.toFixed(0)}s`
                      : cdSec > 0
                      ? `${cdSec.toFixed(0)}s`
                      : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Row of Dock: Ki Energy Bar + Blade Selector + Trials & Rankings */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            {/* Ki Energy Bar */}
            <div className="flex items-center gap-2 min-w-[110px] sm:min-w-[160px]">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-200 whitespace-nowrap">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Ki {Math.floor(energy)}%</span>
              </span>
              <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-800 overflow-hidden shrink-0">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{ width: `${Math.min(100, energy)}%` }}
                />
              </div>
            </div>

            {/* Blade Swatches */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              <span className="hidden xs:inline sm:inline text-[11px] text-slate-400">
                Blade:
              </span>
              {BLADE_STYLES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    soundEngine.playUiClick('blade');
                    setBladeStyle(b);
                  }}
                  title={b.name}
                  className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border transition-transform cursor-pointer ${
                    bladeStyle.id === b.id
                      ? 'scale-110 border-white'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: b.primaryColor }}
                  aria-label={b.name}
                />
              ))}
            </div>

            {/* Quick Modals */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  soundEngine.playUiClick('tab');
                  setShowDailyChallenges(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs font-semibold text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Trials
              </button>

              <button
                onClick={() => {
                  soundEngine.playUiClick('tab');
                  setShowLeaderboards(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs font-semibold text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Rankings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Permanent Corner Watermark ('By Rajveer Singh Rana') — Always visible in bottom-right corner without obstructing play */}
      <div
        className="fixed bottom-1.5 right-2.5 z-30 pointer-events-none select-none"
        aria-label="Watermark By Rajveer Singh Rana"
      >
        <div className="px-2.5 py-0.5 rounded-md bg-[#0c0f17]/90 border border-slate-700/70 text-[11px] font-medium text-slate-300 tracking-wide shadow-md">
          By <span className="text-amber-400 font-bold">Rajveer Singh Rana</span>
        </div>
      </div>

      {/* 8. Modals */}
      <LeaderboardModal
        isOpen={showLeaderboards}
        onClose={() => setShowLeaderboards(false)}
        entries={leaderboard}
        onPlayerNameUpdated={(name) => setPlayerNameState(name)}
        onRefreshSync={handleOfflineSync}
        onDeleteEntry={handleDeleteLeaderboardRun}
      />

      <DailyChallengesModal
        isOpen={showDailyChallenges}
        onClose={() => setShowDailyChallenges(false)}
        challenges={dailyChallenges}
        onStartDailyChallenge={handleStartDailyChallenge}
      />
    </div>
  );
}
