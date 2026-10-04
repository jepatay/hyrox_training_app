import { useEffect, useState } from 'react';
import { sessionsApi, exerciseLibraryApi, reprocessApi } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// Audit view for one Home station box: every scored line that credited this
// station in the current and previous window, with the arithmetic, plus the
// sessions in those windows that contribute nothing because they were never
// scored (or their extraction came back empty) — the usual reason a trend %
// looks wrong.
export default function StationBreakdown({ category, label, windows, onClose, onScored }) {
  const [sessions, setSessions] = useState(null);
  const [library, setLibrary] = useState([]);
  const [fixing, setFixing] = useState(null);

  function load() {
    return Promise.all([sessionsApi.list(), exerciseLibraryApi.list().catch(() => [])])
      .then(([s, lib]) => { setSessions(s || []); setLibrary(lib || []); })
      .catch(() => setSessions([]));
  }
  useEffect(() => { load(); }, []);

  // Extract + score each not-counted session one at a time (each is an AI
  // call), then reload this view and tell Home to refresh its totals.
  async function scoreMissing(list) {
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      setFixing({ done: i, total: list.length, failed });
      try { await reprocessApi.extractAndScoreSession(list[i].s.id); } catch { failed++; }
    }
    setFixing({ done: list.length, total: list.length, failed });
    await load();
    onScored?.();
    setFixing(f => (f?.failed ? f : null));
  }

  const labelFor = new Map(library.map(e => [e.key, e.label]));

  function windowData({ from, to }) {
    const inWindow = (sessions || []).filter(s => s.date >= from && s.date <= to);
    const rows = [];
    const unscored = [];
    for (const s of inWindow) {
      if (!s.v2) {
        if (s.notes?.trim() || s.runningDistance) {
          unscored.push({ s, reason: s.extractionV2?.lines?.length === 0 ? 'nothing read from notes' : 'not scored' });
        }
        continue;
      }
      for (const l of s.v2.lines || []) {
        const c = l.credits?.[category];
        if (c) rows.push({ date: s.date, id: s.id, exercise: labelFor.get(l.exerciseKey) || l.exerciseKey || 'Unknown', qty: l.qty, ...c });
      }
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    unscored.sort((a, b) => (a.s.date < b.s.date ? 1 : -1));
    return { rows, unscored, total: rows.reduce((sum, r) => sum + (r.re || 0), 0) };
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0E0F11] text-[#F3F1EB] border-[#33373B] max-w-lg w-[calc(100%-32px)] p-4">
        <h2 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-2xl">{label} — where the number comes from</h2>
        {sessions && (() => {
          const missing = windows.flatMap(w => windowData(w).unscored);
          if (!missing.length && !fixing) return null;
          return (
            <div className="flex flex-col gap-1.5">
              <button
                disabled={!!fixing && fixing.done < fixing.total}
                onClick={() => scoreMissing(missing)}
                className="min-h-[48px] rounded-xl bg-[#F5C400] text-[#0E0F11] font-['Barlow_Condensed',sans-serif] font-bold text-lg tracking-wide uppercase disabled:opacity-60"
              >
                {fixing && fixing.done < fixing.total
                  ? `Scoring ${fixing.done + 1} of ${fixing.total}...`
                  : `Score the ${missing.length} not-counted session${missing.length === 1 ? '' : 's'}`}
              </button>
              {fixing?.failed > 0 && fixing.done === fixing.total && (
                <div className="text-xs text-[#FF8F86]">{fixing.failed} couldn't be read — try again, or open them in the Training Log.</div>
              )}
            </div>
          );
        })()}

        {!sessions ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[#F5C400] border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          windows.map(w => {
            const { rows, unscored, total } = windowData(w);
            return (
              <div key={w.title} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-baseline">
                  <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-sm tracking-wider uppercase text-[#A6A49C]">
                    {w.title} · {w.from} → {w.to}
                  </div>
                  <div className="font-['Barlow_Condensed',sans-serif] font-bold text-xl">{total.toFixed(2)} RE</div>
                </div>
                {!rows.length && <div className="text-sm text-[#A6A49C]">No scored lines credit {label} here.</div>}
                {rows.map((r, i) => (
                  <div key={`${r.id}-${i}`} className="bg-[#1A1C1F] rounded-lg px-3 py-2">
                    <div className="flex justify-between gap-2 text-[15px] font-semibold">
                      <span>{r.date.slice(5)} · {r.exercise}</span>
                      <span>{(r.re || 0).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-[#A6A49C] leading-snug">qty {r.qty ?? '—'} · {r.basis}</div>
                  </div>
                ))}
                {unscored.length > 0 && (
                  <div className="text-xs leading-snug text-[#FF8F86]">
                    Not counted ({unscored.length}): {unscored.map(u => `${u.s.date.slice(5)} (${u.reason})`).join(', ')}
                  </div>
                )}
              </div>
            );
          })
        )}
      </DialogContent>
    </Dialog>
  );
}
