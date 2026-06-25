const STATIONS = [
  { key: 'running', label: 'Running', icon: '🏃' },
  { key: 'skierg', label: 'SkiErg', icon: '🎿' },
  { key: 'sled_push', label: 'Sled Push', icon: '🛷' },
  { key: 'sled_pull', label: 'Sled Pull', icon: '🪢' },
  { key: 'row_erg', label: 'Row Erg', icon: '🚣' },
  { key: 'farmers_carry', label: 'Farmers Carry', icon: '🏋️' },
  { key: 'sandbag_lunges', label: 'Sandbag Lunges', icon: '🎒' },
  { key: 'burpee_broad_jump', label: 'Burpee Broad Jump', icon: '🤸' },
  { key: 'wall_balls', label: 'Wall Balls', icon: '🏐' },
];

const SCORE_COLORS = {
  1: 'bg-red-500/15 border-red-500/40 text-red-400',
  2: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  3: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
  4: 'bg-lime-500/15 border-lime-500/40 text-lime-400',
  5: 'bg-green-500/15 border-green-500/40 text-green-400',
};

export default function StationImpact({ scores }) {
  if (!scores) return null;

  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-2">Station Impact</p>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {STATIONS.map(({ key, label, icon }) => {
          const score = scores[key] || 1;
          const colorClass = SCORE_COLORS[score] || SCORE_COLORS[1];
          return (
            <div
              key={key}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-center ${colorClass}`}
            >
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
