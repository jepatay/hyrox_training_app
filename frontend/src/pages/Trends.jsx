import { useEffect, useMemo, useState } from 'react';
import { sessionsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PERIODS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
];

function tierColor(tier) {
  return { 5: '#4ade80', 4: '#a3e635', 3: '#facc15', 2: '#fb923c', 1: '#f87171' }[tier] || '#6b7280';
}
function tierFromRatio(ratio) {
  if (ratio >= 1.5) return 5;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio > 0) return 2;
  return 1;
}

function TrendCard({ station, points }) {
  if (points.length < 2) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{station.icon}</span>
            <span className="text-sm font-semibold">{station.label}</span>
          </div>
          <div className="h-20 flex flex-col items-center justify-center text-center gap-1">
            <span className="text-xl text-muted-foreground/40 font-mono">—</span>
            <span className="text-xs text-muted-foreground">{points.length === 0 ? 'Not trained in this window' : 'Only 1 session — need more data'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const W = 260, H = 100, PAD = 10;
  const maxV = Math.max(160, Math.max(...points.map(p => p.ratio * 100)) * 1.15);
  const px = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const py = v => H - 22 - (v / maxV) * (H - 34);
  const refY = py(100);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p.ratio * 100).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${px(points.length - 1).toFixed(1)} ${H - 22} L ${px(0).toFixed(1)} ${H - 22} Z`;
  const delta = Math.round((points[points.length - 1].ratio - points[0].ratio) * 100);
  const deltaColor = delta > 8 ? 'text-green-400 bg-green-400/10' : delta < -8 ? 'text-orange-400 bg-orange-400/10' : 'text-muted-foreground bg-secondary';
  const latest = points[points.length - 1];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="text-lg">{station.icon}</span>{station.label}
          </span>
          <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${deltaColor}`}>{delta > 0 ? '+' : ''}{delta}%</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
          <line x1={PAD} x2={W - PAD} y1={refY} y2={refY} stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="2 3" />
          <path d={areaD} fill="#f97316" opacity="0.1" />
          <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" />
          {points.map((p, i) => (
            <circle key={i} cx={px(i)} cy={py(p.ratio * 100)} r={i === points.length - 1 ? 4 : 2.5} fill={tierColor(tierFromRatio(p.ratio))} stroke="currentColor" className="text-card" strokeWidth="1.2" />
          ))}
        </svg>
        <div className="flex justify-between text-[11px] font-mono text-muted-foreground mt-1">
          <span>{points.length} session{points.length === 1 ? '' : 's'}</span>
          <span>latest {Math.round(latest.ratio * 100)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Trends() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => { load(days); }, [days]);

  async function load(d) {
    setLoading(true);
    try {
      const result = await sessionsApi.stationTrends(d);
      setData(result);
    } catch {
      toast({ title: 'Error', description: 'Failed to load trends', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const trendsByStation = useMemo(() => {
    if (!data) return {};
    const out = {};
    for (const s of STATIONS) out[s.key] = data.trends?.[s.key] || [];
    return out;
  }, [data]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Trends</h1>
        <p className="text-muted-foreground text-sm">
          Race-equivalence per station across recent sessions — where volume is building, where it isn't, and which stations haven't been trained at all.
        </p>
      </div>

      <div className="flex gap-2">
        {PERIODS.map(p => (
          <Button key={p.days} size="sm" variant={days === p.days ? 'default' : 'outline'} onClick={() => setDays(p.days)}>
            {p.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STATIONS.map(s => (
            <TrendCard key={s.key} station={s} points={trendsByStation[s.key]} />
          ))}
        </div>
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          {formatDate(data.from)} – {formatDate(data.to)} · only sessions with a computed station breakdown count here — hit Recalculate on older sessions to backfill them.
        </p>
      )}
    </div>
  );
}
