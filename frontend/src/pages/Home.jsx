import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi, draftsApi, dailyTotalsApi } from '@/lib/api';
import { Plus, Mic } from 'lucide-react';

// The 9 race-station boxes, in the same order as the design and as
// scoring.js's CATEGORY_KEYS (minus `core`, which gets its own wide box).
const STATION_BOXES = [
  { key: 'run', label: 'Run' },
  { key: 'skierg', label: 'SkiErg' },
  { key: 'sled_push', label: 'Sled Push' },
  { key: 'sled_pull', label: 'Sled Pull' },
  { key: 'burpee_broad_jump', label: 'Burpee BJ' },
  { key: 'row', label: 'Row' },
  { key: 'farmers_carry', label: 'Farmers' },
  { key: 'sandbag_lunges', label: 'Lunges' },
  { key: 'wall_balls', label: 'Wall Balls' },
];
const ALL_CATEGORY_LABELS = {
  ...Object.fromEntries(STATION_BOXES.map(b => [b.key, b.label])),
  core: 'Core',
};

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function sumWindow(dailyTotals, fromStr, toStr) {
  const totals = Object.fromEntries(STATION_BOXES.map(b => [b.key, 0]));
  for (const d of dailyTotals) {
    if (d.date < fromStr || d.date > toStr) continue;
    for (const b of STATION_BOXES) totals[b.key] += d.re?.[b.key] || 0;
  }
  return { totals };
}

function trendLabel(current, previous) {
  if (previous > 0.001) {
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct, text: `${pct > 0 ? '+' : ''}${pct}%` };
  }
  if (current > 0.001) return { pct: 100, text: 'new' };
  return { pct: 0, text: '0%' };
}

const WINDOW_OPTIONS = [15, 30, 60, 90];
const DAILY_CHART_DAYS = 60;

function dailyReTotal(d) {
  return Object.values(d?.re || {}).reduce((sum, v) => sum + (v || 0), 0);
}

export default function Home() {
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState(30);
  const [dailyTotals, setDailyTotals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // 2x the largest window option, so the trend % (this window vs the
      // previous window of the same length) always has enough history —
      // 90d's previous period reaches back 180 days.
      const [totals, sessionList, draftList] = await Promise.all([
        dailyTotalsApi.list(Math.max(...WINDOW_OPTIONS) * 2),
        sessionsApi.list({ limit: 20 }),
        draftsApi.list('open'),
      ]);
      setDailyTotals(totals || []);
      setSessions(sessionList || []);
      setDrafts(draftList || []);
    } catch {
      // Best-effort — an empty Home is better than a crash.
    } finally {
      setLoading(false);
    }
  }

  const { current, previous } = useMemo(() => {
    const todayStr = isoDaysAgo(0);
    const curFrom = isoDaysAgo(windowDays - 1);
    const prevTo = isoDaysAgo(windowDays);
    const prevFrom = isoDaysAgo(windowDays * 2 - 1);

    return {
      current: sumWindow(dailyTotals, curFrom, todayStr),
      previous: sumWindow(dailyTotals, prevFrom, prevTo),
    };
  }, [dailyTotals, windowDays]);

  const dailySeries = useMemo(() => {
    const byDate = new Map(dailyTotals.map(d => [d.date, d]));
    const series = [];
    for (let i = DAILY_CHART_DAYS - 1; i >= 0; i--) {
      const date = isoDaysAgo(i);
      series.push({ date, re: dailyReTotal(byDate.get(date)) });
    }
    return series;
  }, [dailyTotals]);

  const maxStationRE = Math.max(0.01, ...STATION_BOXES.map(b => current.totals[b.key]));

  const feed = useMemo(() => {
    const sessionItems = sessions.map(s => ({ kind: 'session', date: s.date, session: s }));
    const draftItems = drafts.map(d => ({ kind: 'draft', date: d.date, draft: d }));
    return [...sessionItems, ...draftItems].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  }, [sessions, drafts]);

  return (
    <div className="bg-[#0E0F11] text-[#F3F1EB] font-['Barlow',system-ui,sans-serif] -m-6 p-5 min-h-screen space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-sm tracking-wider uppercase text-[#A6A49C]">HYROX training</div>
          <h1 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-4xl leading-none">Last {windowDays} days</h1>
        </div>
        <div className="flex gap-1.5">
          {WINDOW_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`min-h-[44px] min-w-[44px] px-2 rounded-full border-2 border-[#F3F1EB] font-['Barlow_Condensed',sans-serif] font-semibold text-[17px] ${
                windowDays === d ? 'bg-[#26292D] text-[#0E0F11]' : 'bg-transparent text-[#F3F1EB]'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-[#F5C400] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {STATION_BOXES.map(b => {
              const value = current.totals[b.key];
              const trend = trendLabel(value, previous.totals[b.key]);
              const barPct = Math.min(100, Math.round((value / maxStationRE) * 100));
              const trendColor = trend.pct > 0 ? 'text-[#5ED28C]' : trend.pct < 0 ? 'text-[#FF8F86]' : 'text-[#A6A49C]';
              return (
                <div key={b.key} className="bg-[#1A1C1F] rounded-xl p-2.5 flex flex-col gap-1.5">
                  <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-[15px] tracking-wide uppercase text-[#A6A49C]">{b.label}</div>
                  <div className="font-['Barlow_Condensed',sans-serif] font-bold text-[34px] leading-none">
                    {value.toFixed(1)}<span className="text-[13px] font-semibold text-[#A6A49C] ml-1">RE</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#33373B]"><div className="h-1.5 rounded-full bg-[#F5C400]" style={{ width: `${barPct}%` }} /></div>
                  <div className={`text-xs font-semibold ${trendColor}`}>{trend.text} <span className="font-normal text-[#A6A49C]">vs prev</span></div>
                </div>
              );
            })}
          </div>

          <p className="text-xs leading-snug text-[#A6A49C]">Bar = share of your most-trained station. 1.0 RE = one full race of that station.</p>

          <DailyReChart series={dailySeries} />

          <div className="flex gap-2.5">
            <button
              onClick={() => navigate('/log')}
              className="flex-grow min-h-[56px] border-2 border-[#F5C400] rounded-xl bg-[#F5C400] text-[#0E0F11] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase flex items-center justify-center gap-2"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={3} /> Log training
            </button>
            <button
              onClick={() => navigate('/drafts')}
              className="flex-grow min-h-[56px] border-2 border-[#F3F1EB] rounded-xl bg-transparent text-[#F3F1EB] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase flex items-center justify-center gap-2"
            >
              <Mic className="h-[18px] w-[18px]" /> Log draft
            </button>
          </div>

          <div className="flex justify-between items-baseline">
            <h2 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-2xl">Training log</h2>
            <button onClick={() => navigate('/training')} className="text-[13px] text-[#A6A49C] underline underline-offset-2">
              View all
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {feed.length === 0 && (
              <p className="text-sm text-[#A6A49C] text-center py-8">Nothing logged yet — hit "Log training" to start.</p>
            )}
            {feed.map(item => item.kind === 'draft'
              ? <DraftCard key={`draft-${item.date}`} draft={item.draft} onClick={() => navigate('/drafts')} />
              : <SessionCard key={`session-${item.session.id}`} session={item.session} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Simple, single-series bar chart: one bar per day, height = that day's
// total RE across every category, 0 for a rest day (no fake floor value —
// an empty slot in the row already reads as "didn't train"). No legend
// needed for a single series (dataviz skill) — the card title names it.
// Every bar is hoverable via a full-height invisible hit rect behind it
// (interaction.md: hit target bigger than the mark), including 0-height
// days, so a rest day is still confirmable on hover, not just inferred
// from a gap.
function DailyReChart({ series }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const maxRE = Math.max(0.1, ...series.map(d => d.re));
  const chartHeight = 70;
  const n = series.length;
  const slot = 100 / n;
  const gap = Math.min(1, slot * 0.15);
  const barWidth = Math.max(slot - gap, 0.2);
  const active = series[hoverIdx ?? series.length - 1];
  const activeLabel = hoverIdx != null ? formatShortDate(active.date) : 'Today';

  return (
    <div className="bg-[#1A1C1F] rounded-xl px-3.5 py-3 flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-[15px] tracking-wide uppercase text-[#A6A49C]">Daily load — last {n} days</div>
        <div className="text-right whitespace-nowrap">
          <span className="font-['Barlow_Condensed',sans-serif] font-bold text-lg">{active.re.toFixed(2)}</span>
          <span className="text-xs font-semibold text-[#A6A49C] ml-1">RE · {activeLabel}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" className="w-full h-20"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line x1="0" y1={chartHeight - 0.3} x2="100" y2={chartHeight - 0.3} stroke="#33373B" strokeWidth="0.5" />
        {series.map((d, i) => {
          const h = maxRE > 0 ? (d.re / maxRE) * (chartHeight - 2) : 0;
          const x = i * slot;
          const isHover = hoverIdx === i;
          return (
            <g key={d.date} onMouseEnter={() => setHoverIdx(i)} onClick={() => setHoverIdx(i)} className="cursor-pointer">
              <rect x={x} y={0} width={slot} height={chartHeight} fill="transparent" />
              {h > 0 && (
                <rect
                  x={x + gap / 2} y={chartHeight - h} width={barWidth} height={h} rx={Math.min(barWidth * 0.3, 1)}
                  fill={isHover ? '#FFD84D' : '#F5C400'}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-[#A6A49C]">
        <span>{formatShortDate(series[0].date)}</span>
        <span>{formatShortDate(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}

function formatShortDate(dateStr) {
  const { day, month } = dayMonth(dateStr);
  return `${day} ${month}`;
}

function dayMonth(dateStr) {
  const d = new Date(dateStr);
  return { day: d.getUTCDate(), month: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) };
}

function SessionCard({ session }) {
  const { day, month } = dayMonth(session.date);
  const re = session.v2?.re;
  const total = session.v2?.sessionLoadRE;
  const topCategories = re
    ? Object.entries(re).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];
  const kindLabel = session.isClass ? 'Class' : 'Solo';
  const title = topCategories.length
    ? `${kindLabel} · ${topCategories.map(([k]) => ALL_CATEGORY_LABELS[k] || k).join(', ')}`
    : `${kindLabel} · ${session.type?.replace(/_/g, ' ') || 'session'}`;

  return (
    <div className="bg-[#1A1C1F] rounded-xl p-3 flex gap-3">
      <div className="w-11 flex-shrink-0 text-center">
        <div className="font-['Barlow_Condensed',sans-serif] font-bold text-3xl leading-none">{day}</div>
        <div className="text-xs font-semibold uppercase text-[#A6A49C]">{month}</div>
      </div>
      <div className="flex flex-col gap-2 min-w-0 flex-grow">
        <div className="flex justify-between gap-2 items-baseline">
          <div className="text-[15px] font-semibold truncate">{title}</div>
          {session.v2 ? (
            <div className="font-['Barlow_Condensed',sans-serif] font-bold text-xl whitespace-nowrap">
              {total.toFixed(2)}<span className="text-xs font-semibold text-[#A6A49C] ml-0.5">RE</span>
            </div>
          ) : (
            <div className="text-xs text-[#A6A49C] whitespace-nowrap">Not scored</div>
          )}
        </div>
        {topCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topCategories.map(([k, v]) => (
              <span key={k} className="text-xs font-medium px-2 py-0.5 rounded-[10px] bg-[#26292D]">
                {ALL_CATEGORY_LABELS[k] || k} {v.toFixed(2)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftCard({ draft, onClick }) {
  const { day, month } = dayMonth(draft.date);
  const count = draft.entries?.length || 0;
  return (
    <button onClick={onClick} className="bg-[#1A1C1F] rounded-xl p-3 flex gap-3 text-left">
      <div className="w-11 flex-shrink-0 text-center">
        <div className="font-['Barlow_Condensed',sans-serif] font-bold text-3xl leading-none">{day}</div>
        <div className="text-xs font-semibold uppercase text-[#A6A49C]">{month}</div>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0 flex-grow">
        <div className="flex justify-between gap-2 items-baseline">
          <div className="text-[15px] font-semibold">Draft · {count} note{count === 1 ? '' : 's'} waiting</div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-[10px] bg-[#F5C400] text-[#0E0F11] whitespace-nowrap">Draft</span>
        </div>
        <div className="text-[13px] text-[#A6A49C]">Not scored yet. Open to turn it into a session.</div>
      </div>
    </button>
  );
}
