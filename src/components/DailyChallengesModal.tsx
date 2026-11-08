import React from 'react';
import { DailyChallenge } from '../types/game';
import { soundEngine } from '../utils/sound';
import { Calendar, CheckCircle2, Play, Sparkles, X } from 'lucide-react';

interface DailyChallengesModalProps {
  isOpen: boolean;
  onClose: () => void;
  challenges: DailyChallenge[];
  onStartDailyChallenge: (challenge: DailyChallenge) => void;
}

export const DailyChallengesModal: React.FC<DailyChallengesModalProps> = ({
  isOpen,
  onClose,
  challenges,
  onStartDailyChallenge,
}) => {
  if (!isOpen) return null;

  const totalCompleted = challenges.filter((c) => c.completed).length;
  const totalXp = challenges.reduce((acc, c) => acc + (c.completed ? c.rewardXp : 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
      <div className="w-full max-w-xl rounded-xl bg-[#0f172a] border border-slate-700/90 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111827] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-lg font-bold font-display text-white tracking-tight">
                Daily Dojo Trials
              </h2>
              <p className="text-xs text-slate-400">
                Date Seed: {challenges[0]?.dateStr} · {totalCompleted}/{challenges.length} Completed · {totalXp} XP Earned
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playUiClick('close');
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Daily Challenges"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Challenge List */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {challenges.map((ch, idx) => {
            const pct = Math.min(100, Math.round((ch.currentValue / ch.targetValue) * 100));
            return (
              <div
                key={ch.id}
                className={`p-4 rounded-lg border transition-colors ${
                  ch.completed
                    ? 'bg-emerald-950/20 border-emerald-600/50'
                    : 'bg-[#111827] border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono-num font-bold text-slate-400">
                        0{idx + 1}.
                      </span>
                      <h3 className="text-base font-bold font-display text-white">
                        {ch.title}
                      </h3>
                      {ch.completed && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {ch.description}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      onStartDailyChallenge(ch);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{ch.completed ? 'Replay Trial' : 'Launch Trial'}</span>
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="mt-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono-num">
                    <span>
                      Progress: {ch.currentValue} / {ch.targetValue}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <Sparkles className="w-3 h-3" /> +{ch.rewardXp} Dojo XP
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        ch.completed ? 'bg-emerald-400' : 'bg-sky-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111827] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Progress updates automatically during Classic &amp; Daily Trial runs.</span>
          <button
            onClick={() => {
              soundEngine.playUiClick('close');
              onClose();
            }}
            className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
