import { useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw, Save } from 'lucide-react';

const STATION_LABEL = Object.fromEntries(STATIONS.map(s => [s.key, s]));

function benchmarkWork(b) {
  if (b.raceWeightKg) return `${(b.raceVolume * b.raceWeightKg).toLocaleString()} kg·${b.volumeUnit}`;
  if (b.kind === 'cardio') return `${b.raceVolume.toLocaleString()}m at race pace`;
  return `${b.raceVolume.toLocaleString()}${b.volumeUnit}-equivalent`;
}

export default function StationModel() {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await profileApi.getStationModel();
      setModel(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load station model', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function setThreshold(key, value) {
    setModel(prev => ({ ...prev, thresholds: { ...prev.thresholds, [key]: value === '' ? '' : Number(value) } }));
  }
  function setBenchmark(key, field, value) {
    setModel(prev => ({
      ...prev,
      benchmarks: {
        ...prev.benchmarks,
        [key]: { ...prev.benchmarks[key], [field]: value === '' ? null : Number(value) },
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        thresholds: {
          t5: Number(model.thresholds.t5) || 150,
          t4: Number(model.thresholds.t4) || 75,
          t3: Number(model.thresholds.t3) || 40,
        },
        benchmarks: Object.fromEntries(
          Object.entries(model.benchmarks).map(([key, b]) => [key, { raceVolume: b.raceVolume, raceWeightKg: b.raceWeightKg }])
        ),
      };
      await profileApi.update({ stationModel: payload });
      toast({ title: 'Saved', description: 'Future sessions will score against these numbers.' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Reset to the built-in HYROX Open Men benchmarks and tier cut-offs?')) return;
    setSaving(true);
    try {
      await profileApi.update({ stationModel: null });
      await load();
      toast({ title: 'Reset to defaults' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !model) {
    return (
      <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Station Model</h1>
          <p className="text-muted-foreground text-sm">
            What "race demand" means for each of the 9 stations, and how far above/below it a session has to be to land each tier. New and recalculated sessions score against these numbers.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tier Cut-offs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-6">
            {[
              ['t5', 'Tier 5 at', 'text-green-400'],
              ['t4', 'Tier 4 at', 'text-lime-400'],
              ['t3', 'Tier 3 at', 'text-yellow-400'],
            ].map(([key, label, color]) => (
              <div key={key} className="space-y-1.5">
                <Label className={color}>{label}</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">≥</span>
                  <Input type="number" className="w-20" value={model.thresholds[key]} onChange={e => setThreshold(key, e.target.value)} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pb-2">Below tier 3's cut-off with any evidence → tier 2 · no evidence → tier 1</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Race-Demand Reference</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="font-medium py-2 px-2">Station</th>
                  <th className="font-medium py-2 px-2">Race volume</th>
                  <th className="font-medium py-2 px-2">Race load</th>
                  <th className="font-medium py-2 px-2">Benchmark work</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(model.benchmarks).map(([key, b]) => {
                  const meta = STATION_LABEL[key];
                  return (
                    <tr key={key} className="border-t border-border/50">
                      <td className="py-2.5 px-2">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span>{meta?.icon}</span>{b.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <Input type="number" className="w-20" value={b.raceVolume ?? ''} onChange={e => setBenchmark(key, 'raceVolume', e.target.value)} />
                          <span className="text-xs text-muted-foreground">{b.volumeUnit}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        {b.raceWeightKg != null ? (
                          <div className="flex items-center gap-1.5">
                            <Input type="number" step="0.5" className="w-20" value={b.raceWeightKg ?? ''} onChange={e => setBenchmark(key, 'raceWeightKg', e.target.value)} />
                            <span className="text-xs text-muted-foreground">kg</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground font-mono">{benchmarkWork(b)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
