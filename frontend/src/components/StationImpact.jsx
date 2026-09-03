import { useState } from 'react';
import { coachingApi } from '@/lib/api';
import { STATIONS } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

// Volume-leaning vs load-leaning vs race-realistic, from the same volumeRatio/
// loadRatio decomposition used in the Station Model settings and Trends pages.
function leanTag(equiv) {
  if (!equiv) return null;
  const { volumeRatio, loadRatio } = equiv;
  if (volumeRatio == null || loadRatio == null) return null;
  if (volumeRatio > loadRatio * 1.15) return { letter: 'V', title: 'Volume-leaning (endurance bias)', className: 'text-cyan-400 border-cyan-400/40' };
  if (loadRatio > volumeRatio * 1.15) return { letter: 'L', title: 'Load-leaning (strength bias)', className: 'text-orange-400 border-orange-400/40' };
  return { letter: 'R', title: 'Race-realistic balance', className: 'text-muted-foreground border-current/40' };
}

const SCORE_COLORS = {
  1: 'bg-red-500/15 border-red-500/40 text-red-400',
  2: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  3: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
  4: 'bg-lime-500/15 border-lime-500/40 text-lime-400',
  5: 'bg-green-500/15 border-green-500/40 text-green-400',
};

export default function StationImpact({ scores, equivalence, sessionId, onUpdate }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!sessionId || refreshing) return;
    setRefreshing(true);
    try {
      const { stationScores, stationEquivalence } = await coachingApi.generateStationScores(sessionId);
      onUpdate?.(stationScores, stationEquivalence);
    } catch {
      // silently ignore
    } finally {
      setRefreshing(false);
    }
  }

  if (!scores) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground font-medium">Station Impact</p>
        {sessionId && onUpdate && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Recalculate station scores"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Recalculating…' : 'Recalculate'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {STATIONS.map(({ key, label, icon }) => {
          const score = scores[key] || 1;
          const colorClass = SCORE_COLORS[score] || SCORE_COLORS[1];
          const lean = leanTag(equivalence?.[key]);
          return (
            <div
              key={key}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-center ${colorClass}`}
            >
              {lean && (
                <span
                  title={lean.title}
                  className={`absolute top-1 right-1 h-3.5 w-3.5 rounded-full border bg-background text-[8px] font-bold leading-[13px] ${lean.className}`}
                >
                  {lean.letter}
                </span>
              )}
              <span className="text-lg">{icon}</span>
              <span className="text-[10px] leading-tight font-medium text-foreground">{label}</span>
              <span className="text-sm font-bold">{score}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <span
                    key={n}
                    className={`h-1.5 w-1.5 rounded-full ${n <= score ? 'bg-current' : 'bg-current/20'}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
