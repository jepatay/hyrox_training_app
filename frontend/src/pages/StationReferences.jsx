import { useEffect, useState } from 'react';
import { adminApi, stationReferencesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Ruler } from 'lucide-react';

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

// Placeholder page (Change Brief V2 Phase 0 + Phase 1(b)): the backup export
// button lands here first, and this reads the new stationReferences doc so
// its defaults are visible before the full editable page is built in Phase 4.
export default function StationReferences() {
  const [exporting, setExporting] = useState(false);
  const [references, setReferences] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setReferences(await stationReferencesApi.get());
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load station references', variant: 'destructive' });
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Ruler className="h-5 w-5" /> Station References</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Race quantities, reference loads and target paces for the 10 scoring categories. This page is a placeholder — full editing (target paces, load cap, pace cap, floor) and the reprocess flow land in a later phase.
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
        <CardHeader><CardTitle className="text-base">Category defaults</CardTitle></CardHeader>
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
                    <th className="font-medium py-1.5 pr-4">Reference load</th>
                    <th className="font-medium py-1.5 pr-4">Target pace</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(references.categories).map(([key, c]) => (
                    <tr key={key} className="border-t border-border/50">
                      <td className="py-1.5 pr-4">{CATEGORY_LABELS[key] || key}</td>
                      <td className="py-1.5 pr-4">{c.raceQty} {c.unit}</td>
                      <td className="py-1.5 pr-4">{c.referenceLoadKg ? `${c.referenceLoadKg} kg` : '—'}</td>
                      <td className="py-1.5 pr-4">{c.targetPaceSecPerKm != null ? `${c.targetPaceSecPerKm}s/km` : (key in { run: 1, skierg: 1, row: 1 } ? 'not set' : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">
                Limits: load cap {references.limits.loadCap}, pace cap {references.limits.paceCap}, floor {references.limits.floor}, warm-up weight {references.limits.warmupWeight}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
