import { useEffect, useState } from 'react';
import { adminApi, stationReferencesApi, reprocessApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Ruler, RefreshCw, ClipboardList } from 'lucide-react';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CATEGORY_LABELS = {
  run: 'Run', skierg: 'SkiErg', sled_push: 'Sled Push', sled_pull: 'Sled Pull',
  burpee_broad_jump: 'Burpee Broad Jump', row: 'Row', farmers_carry: 'Farmers Carry',
  sandbag_lunges: 'Sandbag Lunges', wall_balls: 'Wall Balls', core: 'Core',
};
const PACE_CATEGORIES = new Set(['run', 'skierg', 'row']);
const LIMIT_FIELDS = [
  { key: 'loadCap', label: 'Load cap' },
  { key: 'paceCap', label: 'Pace cap' },
  { key: 'floor', label: 'Floor' },
  { key: 'warmupWeight', label: 'Warm-up weight' },
];

function paceLabel(secPerKm) {
  if (secPerKm == null) return '';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function parsePaceInput(text) {
  if (!text?.trim()) return null;
  const m = text.trim().match(/^(\d+):(\d{2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function StationReferences() {
  const [exporting, setExporting] = useState(false);
  const [references, setReferences] = useState(null);
  const [dryRun, setDryRun] = useState(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [rescoringId, setRescoringId] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setReferences(await stationReferencesApi.get());
    } catch {
      toast({ title: 'Error', description: 'Failed to load station references', variant: 'destructive' });
    }
  }

  function updateLocalCategory(key, patch) {
    setReferences(prev => ({
      ...prev,
      categories: { ...prev.categories, [key]: { ...prev.categories[key], ...patch } },
    }));
  }
  async function persistCategory(key, patch) {
    try {
      await stationReferencesApi.update({ categories: { [key]: patch } });
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
  }
  function updateLocalLimit(key, value) {
    setReferences(prev => ({ ...prev, limits: { ...prev.limits, [key]: value } }));
  }
  async function persistLimit(key, value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await stationReferencesApi.update({ limits: { [key]: n } });
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await adminApi.exportBackup();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJson(data, `hyrox-backup-${stamp}.json`);
      toast({
        title: 'Backup downloaded',
        description: `Exported ${Object.keys(data.collections).length} collections as of ${new Date(data.exportedAt).toLocaleString()}.`,
      });
    } catch (err) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDryRun() {
    setDryRunning(true);
    try {
      setDryRun(await reprocessApi.dryRun());
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDryRunning(false);
    }
  }

  async function handleExtract() {
    setExtracting(true);
    try {
      const result = await reprocessApi.extract({ limit: 20 });
      toast({
        title: 'Extraction batch done',
        description: `${result.processed} session(s) extracted, ${result.remaining} remaining, ${result.errors.length} error(s). Run again to continue.`,
      });
      handleDryRun();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  }

  async function handleScore() {
    setScoring(true);
    try {
      const result = await reprocessApi.score({});
      toast({ title: 'Scoring pass done', description: `${result.scored} session(s) scored, ${result.errors.length} error(s).` });
      handleDryRun();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setScoring(false);
    }
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      const result = await reprocessApi.rebuildDailyTotals();
      toast({ title: 'Daily totals rebuilt', description: `${result.datesRebuilt} date(s) recomputed from scratch.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRebuilding(false);
    }
  }

  async function handleReport() {
    setLoadingReport(true);
    try {
      setReport(await reprocessApi.report());
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleRescore(id) {
    setRescoringId(id);
    try {
      await reprocessApi.rescoreSession(id);
      toast({ title: 'Rescored', description: `Session ${id} rescored from its cached extraction.` });
      handleReport();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRescoringId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Ruler className="h-5 w-5" /> Station References</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Race quantities, reference loads and target paces for the 10 scoring categories, plus the limits the v2 scoring engine clamps to. Editing here changes nothing already scored — rescore a session (or run the scoring pass below) to apply a change.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Backup before reprocessing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exports every session, the exercise library, profile, objectives, records and knowledge documents to one timestamped JSON file. Nothing is changed — this is read-only.
          </p>
          <Button onClick={handleExport} disabled={exporting} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting...' : 'Export backup'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Categories</CardTitle></CardHeader>
        <CardContent>
          {!references ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-muted-foreground uppercase tracking-wide">
                    <th className="font-medium py-1.5 pr-4">Category</th>
                    <th className="font-medium py-1.5 pr-4">Race qty</th>
                    <th className="font-medium py-1.5 pr-4">Reference load (kg)</th>
                    <th className="font-medium py-1.5 pr-4">Target pace (m:ss / km)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(references.categories).map(([key, c]) => (
                    <tr key={key} className="border-t border-border/50">
                      <td className="py-1.5 pr-4">{CATEGORY_LABELS[key] || key}</td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min="0" className="h-8 w-24 text-xs"
                            value={c.raceQty ?? ''}
                            onChange={e => updateLocalCategory(key, { raceQty: e.target.value })}
                            onBlur={() => persistCategory(key, { raceQty: Number(c.raceQty) })}
                          />
                          <span className="text-xs text-muted-foreground">{c.unit}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-4">
                        {PACE_CATEGORIES.has(key) ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Input
                            type="number" min="0" step="0.5" className="h-8 w-24 text-xs"
                            value={c.referenceLoadKg ?? ''}
                            placeholder="none"
                            onChange={e => updateLocalCategory(key, { referenceLoadKg: e.target.value })}
                            onBlur={() => persistCategory(key, { referenceLoadKg: c.referenceLoadKg === '' ? null : Number(c.referenceLoadKg) })}
                          />
                        )}
                      </td>
                      <td className="py-1.5 pr-4">
                        {PACE_CATEGORIES.has(key) ? (
                          <Input
                            className="h-8 w-24 text-xs"
                            defaultValue={paceLabel(c.targetPaceSecPerKm)}
                            placeholder="not set"
                            onBlur={e => persistCategory(key, { targetPaceSecPerKm: parsePaceInput(e.target.value) })}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Limits</CardTitle></CardHeader>
        <CardContent>
          {!references ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {LIMIT_FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{f.label}</label>
                  <Input
                    type="number" min="0" step="0.05" className="h-8 w-24 text-xs"
                    value={references.limits[f.key] ?? ''}
                    onChange={e => updateLocalLimit(f.key, e.target.value)}
                    onBlur={() => persistLimit(f.key, references.limits[f.key])}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reprocess all</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Section 8's flow: dry run for counts, an extraction pass (LLM, slow — run it in batches), a scoring pass (pure, instant), then rebuild every day's total. Nothing existing is ever deleted or overwritten — old fields stay untouched, and re-running any step is safe.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDryRun} disabled={dryRunning}>
              <RefreshCw className="h-3.5 w-3.5" /> {dryRunning ? 'Running...' : '1. Dry run'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExtract} disabled={extracting || !dryRun}>
              {extracting ? 'Extracting...' : '2. Extraction pass (batch of 20)'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleScore} disabled={scoring || !dryRun}>
              {scoring ? 'Scoring...' : '3. Scoring pass (all pending)'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRebuild} disabled={rebuilding}>
              {rebuilding ? 'Rebuilding...' : '4. Rebuild daily totals'}
            </Button>
          </div>

          {dryRun && (
            <div className="text-sm bg-secondary/30 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">Sessions total: </span>{dryRun.sessionsTotal}</div>
              <div><span className="text-muted-foreground">With notes: </span>{dryRun.withNotes}</div>
              <div><span className="text-muted-foreground">From Strava: </span>{dryRun.importedFromStrava}</div>
              <div><span className="text-muted-foreground">Needing extraction: </span>{dryRun.needingExtractionV2}</div>
              <div><span className="text-muted-foreground">Needing scoring: </span>{dryRun.needingScoring}</div>
              <div><span className="text-muted-foreground">Exercise names not in library: </span>{dryRun.namesNotInLibrary}</div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleReport} disabled={loadingReport}>
              <ClipboardList className="h-3.5 w-3.5" /> {loadingReport ? 'Loading...' : '5. View report'}
            </Button>
          </div>
          {report && (
            report.needsReview.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs review.</p>
            ) : (
              <div className="space-y-1.5">
                {report.needsReview.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm bg-secondary/20 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium">{s.date}</span>{' '}
                      <span className="text-muted-foreground">{s.type} — {s.reasons.join('; ')}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={rescoringId === s.id} onClick={() => handleRescore(s.id)}>
                      {rescoringId === s.id ? 'Rescoring...' : 'Rescore'}
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
