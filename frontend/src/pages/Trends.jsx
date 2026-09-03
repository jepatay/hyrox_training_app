import { Fragment, useEffect, useMemo, useState } from 'react';
import { sessionsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS, formatDate, getSessionTypeConfig } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

const TRENDS_WINDOW_DAYS = 30;

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

// The literal calculation behind every tier — this is what "not transparent"
// was about: a score with nothing behind it isn't trustworthy. Every row here
// expands to the exact arithmetic (weight x volume vs. benchmark, or
// intensity-adjusted distance) that produced it, not just a colored number.
function SessionPerformanceTable({ sessions }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!sessions.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No sessions with a computed station breakdown in this window yet — hit Recalculate on a session to see its evaluation here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide">
            <th className="font-medium py-2 pr-3">Date</th>
            <th className="font-medium py-2 pr-3">Session</th>
            <th className="font-medium py-2 pr-3">Stations touched — tier per station</th>
            <th className="font-medium py-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => {
            const isExpanded = expandedId === s.sessionId;
            const typeConfig = getSessionTypeConfig(s.type);
            return (
              <Fragment key={s.sessionId}>
                <tr
                  className="border-t border-border/50 cursor-pointer hover:bg-secondary/30"
                  onClick={() => setExpandedId(isExpanded ? null : s.sessionId)}
                >
                  <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap align-top">{formatDate(s.date)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap align-top">
                    <span className="inline-flex items-center gap-1.5">{typeConfig.icon} {typeConfig.label}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(s.stations).map(([key, p]) => {
                        const meta = STATIONS.find(x => x.key === key);
                        const tier = tierFromRatio(p.ratio);
                        const color = tierColor(tier);
                        return (
                          <span
                            key={key}
                            title={`${meta?.label}: ${Math.round(p.ratio * 100)}% of race demand`}
                            className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                            style={{ color, backgroundColor: `${color}22` }}
                          >
                            {meta?.icon} {tier}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2.5 align-top text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-secondary/20">
                    <td colSpan={4} className="p-3">
                      <div className="space-y-2">
                        {Object.entries(s.stations).map(([key, p]) => {
                          const meta = STATIONS.find(x => x.key === key);
                          return (
                            <div key={key} className="text-xs">
                              <span className="font-medium text-foreground">{meta?.icon} {meta?.label} — tier {tierFromRatio(p.ratio)}/5</span>
                              <p className="text-muted-foreground font-mono mt-0.5">{p.basis}</p>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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

function QuadrantView({ station, points }) {
  const M = { l: 44, r: 14, t: 14, b: 34 }, W = 460, H = 380;
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b;
  const maxDataPct = points.length ? Math.max(1, ...points.flatMap(p => [p.volumeRatio || 0, p.loadRatio || 0])) * 100 : 100;
  const domainMax = Math.max(200, Math.ceil((maxDataPct * 1.15) / 50) * 50);
  const x = pct => M.l + (pct / domainMax) * plotW;
  const y = pct => M.t + plotH - (pct / domainMax) * plotH;
  const tickStep = domainMax / 4;
  const ticks = [0, 1, 2, 3, 4].map(i => Math.round(i * tickStep));

  const usable = points.filter(p => p.volumeRatio != null && p.loadRatio != null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><span className="text-lg">{station.icon}</span>{station.label} — Volume vs. Load</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {usable.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No sessions with a computed breakdown for this station in the last {TRENDS_WINDOW_DAYS} days.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 480 }}>
              <rect x={x(100)} y={M.t} width={x(domainMax) - x(100)} height={y(100) - M.t} fill="#22d3ee" opacity="0.06" />
              <rect x={M.l} y={M.t} width={x(100) - M.l} height={y(100) - M.t} fill="#fb923c" opacity="0.06" />
              {ticks.map(v => (
                <g key={v}>
                  <line x1={x(v)} x2={x(v)} y1={M.t} y2={M.t + plotH} stroke="currentColor" className="text-border" strokeWidth="1" />
                  <line x1={M.l} x2={M.l + plotW} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeWidth="1" />
                  <text x={x(v)} y={M.t + plotH + 16} textAnchor="middle" fontSize="9" className="fill-muted-foreground">{v}</text>
                  <text x={M.l - 8} y={y(v) + 3} textAnchor="end" fontSize="9" className="fill-muted-foreground">{v}</text>
                </g>
              ))}
              <line x1={x(100)} x2={x(100)} y1={M.t} y2={M.t + plotH} stroke="currentColor" className="text-foreground" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.4" />
              <line x1={M.l} x2={M.l + plotW} y1={y(100)} y2={y(100)} stroke="currentColor" className="text-foreground" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.4" />
              <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fontWeight="600" className="fill-foreground">Volume (% of race demand)</text>
              <text x={12} y={M.t + plotH / 2} textAnchor="middle" fontSize="10" fontWeight="600" className="fill-foreground" transform={`rotate(-90 12 ${M.t + plotH / 2})`}>Load / Effort (% of benchmark)</text>
              {usable.map((p, i) => {
                const isLatest = i === usable.length - 1;
                return (
                  <circle
                    key={p.sessionId || i}
                    cx={x(Math.min(p.volumeRatio * 100, domainMax))}
                    cy={y(Math.min(p.loadRatio * 100, domainMax))}
                    r={isLatest ? 6 : 3.5}
                    fill={isLatest ? '#f97316' : 'currentColor'}
                    className={isLatest ? '' : 'text-muted-foreground'}
                    opacity={isLatest ? 1 : 0.55}
                  >
                    <title>{formatDate(p.date)} · volume {Math.round(p.volumeRatio * 100)}% · load {Math.round(p.loadRatio * 100)}%</title>
                  </circle>
                );
              })}
            </svg>
            <div className="flex justify-center gap-4 mt-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> latest session</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-current opacity-55" /> earlier sessions</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Trends() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quadrantKey, setQuadrantKey] = useState('wall_balls');
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const result = await sessionsApi.stationTrends(TRENDS_WINDOW_DAYS);
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

  // Same underlying data, pivoted from "per station, list of sessions" to
  // "per session, list of stations" for the performance table.
  const sessionsPivot = useMemo(() => {
    if (!data) return [];
    const map = {};
    for (const [key, points] of Object.entries(data.trends || {})) {
      for (const p of points) {
        (map[p.sessionId] ||= { sessionId: p.sessionId, date: p.date, type: p.type, stations: {} }).stations[key] = p;
      }
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  // Default the quadrant to whichever station actually has the most data,
  // once it's loaded, instead of an arbitrary fixed choice.
  useEffect(() => {
    if (!data) return;
    const richest = STATIONS.map(s => ({ key: s.key, n: (data.trends?.[s.key] || []).length })).sort((a, b) => b.n - a.n)[0];
    if (richest?.n > 0) setQuadrantKey(richest.key);
  }, [data]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Trends</h1>
        <p className="text-muted-foreground text-sm">
          Race-equivalence per station over the last {TRENDS_WINDOW_DAYS} days — where volume is building, where it isn't, and which stations haven't been trained at all.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-bold mb-1">Per-Training Performance</h2>
            <p className="text-muted-foreground text-sm mb-3 max-w-2xl">
              How each session was actually evaluated. Click a row to see the exact calculation per station — not just the tier number.
            </p>
            <Card>
              <CardContent className="p-4">
                <SessionPerformanceTable sessions={sessionsPivot} />
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Load Over Time</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {STATIONS.map(s => (
                <TrendCard key={s.key} station={s} points={trendsByStation[s.key]} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Volume vs. Load</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-3 max-w-2xl">
              Same total work can come from very different training — high reps at a lighter load (volume-leaning) vs. fewer reps at a heavier load (load-leaning). The tier score above collapses this to one number; this keeps both axes visible, per station, across your recent sessions.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {STATIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setQuadrantKey(s.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    quadrantKey === s.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  <span>{s.icon}</span>{s.label}
                  {trendsByStation[s.key]?.length > 0 && (
                    <span className="text-[10px] opacity-70">({trendsByStation[s.key].length})</span>
                  )}
                </button>
              ))}
            </div>
            <QuadrantView station={STATIONS.find(s => s.key === quadrantKey)} points={trendsByStation[quadrantKey] || []} />
          </div>
        </>
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          {formatDate(data.from)} – {formatDate(data.to)} · only sessions with a computed station breakdown count here — hit Recalculate on older sessions to backfill them.
        </p>
      )}
    </div>
  );
}
