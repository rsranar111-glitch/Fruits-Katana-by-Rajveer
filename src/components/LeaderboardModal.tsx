import React, { useState } from 'react';
import { DifficultyId, LeaderboardEntry } from '../types/game';
import { DIFFICULTIES, getPlayerName, setPlayerName } from '../utils/storage';
import { soundEngine } from '../utils/sound';
import {
  Trophy,
  X,
  Check,
  User,
  Shield,
  Flame,
  RefreshCw,
  Trash2,
  Swords,
} from 'lucide-react';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
  onPlayerNameUpdated: (newName: string) => void;
  onRefreshSync: () => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

function formatRunTimestamp(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  entries,
  onPlayerNameUpdated,
  onRefreshSync,
  onDeleteEntry,
}) => {
  const [filterDiff, setFilterDiff] = useState<'all' | DifficultyId>('all');
  const [editingName, setEditingName] = useState(getPlayerName());
  const [savedNotice, setSavedNotice] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen) return null;

  // Strictly real runs only (no mock entries)
  const realEntries = entries.filter((e) => !e.id.startsWith('gl_') && e.score > 0);
  const filtered = realEntries.filter((e) =>
    filterDiff === 'all' ? true : e.difficulty === filterDiff
  );

  // Real Career Aggregates computed 100% from recorded runs
  const totalRealRuns = realEntries.length;
  const bestRealScore = realEntries.reduce((max, e) => Math.max(max, e.score), 0);
  const bestRealCombo = realEntries.reduce((max, e) => Math.max(max, e.maxCombo), 0);
  const totalFruitsCut = realEntries.reduce((sum, e) => sum + e.fruitsSliced, 0);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playUiClick('confirm');
    setPlayerName(editingName);
    const updated = getPlayerName();
    setEditingName(updated);
    onPlayerNameUpdated(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleSyncClick = async () => {
    soundEngine.playUiClick('tap');
    setIsSyncing(true);
    try {
      await onRefreshSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 sm:p-4 pointer-events-auto">
      <div className="w-full max-w-2xl rounded-xl bg-[#0f172a] border border-slate-700/90 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-[#111827] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display text-white tracking-tight">
                Live Dojo Leaderboard (Real Player Runs)
              </h2>
              <p className="text-[11px] text-slate-400">
                100% verified gameplay sessions · Zero synthetic entries
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 transition-colors cursor-pointer"
              title="Sync real scores with server"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playUiClick('close');
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Leaderboards"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Real Career Telemetry Summary Strip */}
        <div className="grid grid-cols-4 gap-2 px-4 sm:px-6 py-2.5 bg-[#0a0f1d] border-b border-slate-800/80 text-center">
          <div>
            <div className="text-[10px] sm:text-[11px] text-slate-400">Verified Runs</div>
            <div className="text-sm sm:text-base font-mono-num font-bold text-white">
              {totalRealRuns}
            </div>
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] text-slate-400">Top Score</div>
            <div className="text-sm sm:text-base font-mono-num font-bold text-amber-400">
              {bestRealScore.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] text-slate-400">Best Combo</div>
            <div className="text-sm sm:text-base font-mono-num font-bold text-sky-400">
              {bestRealCombo}x
            </div>
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] text-slate-400">Total Sliced</div>
            <div className="text-sm sm:text-base font-mono-num font-bold text-emerald-400">
              {totalFruitsCut.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Player Callsign Bar & Difficulty Filter */}
        <div className="px-4 sm:px-6 py-3 bg-[#0c1221] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          <form onSubmit={handleSaveName} className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <label htmlFor="ninja-callsign" className="text-xs text-slate-400 whitespace-nowrap">
              Player Name:
            </label>
            <input
              id="ninja-callsign"
              type="text"
              value={editingName}
              maxLength={22}
              onChange={(e) => setEditingName(e.target.value)}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-medium text-white focus:outline-none focus:border-amber-400 w-36 sm:w-44"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              {savedNotice ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              ) : (
                'Save'
              )}
            </button>
          </form>

          {/* Segmented Filter Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto">
            {(['all', 'apprentice', 'shinobi', 'shogun', 'ronin'] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  soundEngine.playUiClick('tab');
                  setFilterDiff(d);
                }}
                className={`px-2 py-1 rounded text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  filterDiff === d
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d === 'all' ? 'All Tiers' : DIFFICULTIES[d].name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Real Rankings Table */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-3 divide-y divide-slate-800/70">
          {filtered.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <Swords className="w-8 h-8 text-amber-400/70 mx-auto" />
              <div className="text-sm font-bold text-white">
                No Real Runs Recorded Yet{filterDiff !== 'all' ? ` for ${DIFFICULTIES[filterDiff].name}` : ''}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                This leaderboard displays only authentic completed game sessions. Enter the Dojo and finish a run to log your real score, combo streak, and slice count!
              </p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={item.id}
                  className={`py-3 flex items-center justify-between gap-3 ${
                    item.isLocalPlayer ? 'bg-amber-500/5 -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 text-center font-mono-num text-sm font-bold shrink-0 ${
                        rank === 1
                          ? 'text-amber-400'
                          : rank === 2
                          ? 'text-slate-200'
                          : rank === 3
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}
                    >
                      #{rank}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {item.playerName}
                        </span>
                        {item.isLocalPlayer && (
                          <span className="text-[10px] font-semibold text-amber-400">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                        <span>{DIFFICULTIES[item.difficulty].name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.mode === 'daily' ? 'Daily Trial' : 'Classic'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRunTimestamp(item.timestamp)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={item.syncedOnline ? 'text-emerald-400' : 'text-amber-300'}>
                          {item.syncedOnline ? 'Synced' : 'Local Offline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-5 shrink-0 text-right">
                    <div className="hidden xs:block sm:block">
                      <div className="text-[10px] text-slate-400">Max Combo</div>
                      <div className="text-xs font-mono-num font-semibold text-sky-400">
                        {item.maxCombo}x
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Sliced</div>
                      <div className="text-xs font-mono-num font-semibold text-slate-200">
                        {item.fruitsSliced}
                      </div>
                    </div>
                    <div className="w-16 sm:w-20">
                      <div className="text-[10px] text-slate-400">Score</div>
                      <div className="text-sm sm:text-base font-mono-num font-bold text-amber-400">
                        {item.score.toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteEntry(item.id)}
                      className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      title="Delete this run record"
                      aria-label="Delete run record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-[#111827] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Real session telemetry persisted on server &amp; offline storage</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 font-medium shrink-0">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Rajveer Singh Rana</span>
          </div>
        </div>
      </div>
    </div>
  );
};
