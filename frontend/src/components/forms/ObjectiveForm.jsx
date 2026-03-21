import { useState } from 'react';
import { objectivesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OBJECTIVE_TYPES } from '@/lib/utils';

const HYROX_DIVISIONS = [
  { value: 'open_men',   label: 'Open Men'   },
  { value: 'open_women', label: 'Open Women' },
  { value: 'pro_men',    label: 'PRO Men'    },
  { value: 'pro_women',  label: 'PRO Women'  },
];

const DIVISION_WEIGHTS = {
  open_men:   { sledPush: '102 kg', sledPull: '78 kg',  farmersCarry: '2 × 24 kg', walkingLunges: '2 × 10 kg',  wallBall: '4 kg / 10 ft' },
  open_women: { sledPush: '72 kg',  sledPull: '52 kg',  farmersCarry: '2 × 16 kg', walkingLunges: '2 × 7.5 kg', wallBall: '3 kg / 9 ft'  },
  pro_men:    { sledPush: '152 kg', sledPull: '102 kg', farmersCarry: '2 × 32 kg', walkingLunges: '2 × 20 kg',  wallBall: '6 kg / 10 ft' },
  pro_women:  { sledPush: '102 kg', sledPull: '78 kg',  farmersCarry: '2 × 24 kg', walkingLunges: '2 × 10 kg',  wallBall: '4 kg / 10 ft' },
};

const STATIONS = [
  { key: 'run',              label: 'Run',                 detail: '8 × 1 km',    placeholder: 'e.g. 5:00 /km' },
  { key: 'skiErg',          label: 'SkiErg',              detail: '1 km',         placeholder: 'e.g. 4:30' },
  { key: 'sledPush',        label: 'Sled Push',           detail: '50 m',         placeholder: 'e.g. 3:00' },
  { key: 'sledPull',        label: 'Sled Pull',           detail: '50 m',         placeholder: 'e.g. 3:30' },
  { key: 'burpeeBroadJump', label: 'Burpee Broad Jump',   detail: '80 m',         placeholder: 'e.g. 5:00' },
  { key: 'rowErg',          label: 'Row Erg',             detail: '1 km',         placeholder: 'e.g. 4:00' },
  { key: 'farmersCarry',    label: 'Farmers Carry',       detail: '200 m',        placeholder: 'e.g. 2:00' },
  { key: 'walkingLunges',   label: 'Walking Lunges',      detail: '100 m',        placeholder: 'e.g. 3:30' },
  { key: 'wallBall',        label: 'Wall Ball',           detail: '100 reps',     placeholder: 'e.g. 5:00' },
];

const EMPTY_STATIONS = Object.fromEntries(STATIONS.map(s => [s.key, '']));

export default function ObjectiveForm({ objective, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: objective?.name || '',
    type: objective?.type || '',
    date: objective?.date?.slice(0, 10) || '',
    priority: objective?.priority || 'B',
    targetTime: objective?.targetTime || '',
    notes: objective?.notes || '',
    hyroxDivision: objective?.hyroxDivision || 'open_men',
    stationTargets: objective?.stationTargets || { ...EMPTY_STATIONS },
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const setStation = (k, v) => setForm(prev => ({
    ...prev,
    stationTargets: { ...prev.stationTargets, [k]: v },
  }));

  const isHyrox = form.type === 'hyrox';
  const weights = isHyrox ? (DIVISION_WEIGHTS[form.hyroxDivision] || DIVISION_WEIGHTS.open_men) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.type || !form.date || !form.priority) {
      toast({ title: 'Validation', description: 'Name, type, date and priority are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        date: form.date,
        priority: form.priority,
        targetTime: form.targetTime || null,
        notes: form.notes,
        hyroxDivision: isHyrox ? form.hyroxDivision : null,
        stationTargets: isHyrox ? form.stationTargets : null,
      };
      const result = objective
        ? await objectivesApi.update(objective.id, payload)
        : await objectivesApi.create(payload);
      onSaved(result);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{objective ? 'Edit Objective' : 'New Objective'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="e.g. Paris Hyrox 2025" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {OBJECTIVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A Goal (Main race)</SelectItem>
                  <SelectItem value="B">B Goal (Secondary race)</SelectItem>
                  <SelectItem value="C">C Goal (Training race)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Race Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Overall Target Time</Label>
              <Input placeholder="e.g. 1:25:00" value={form.targetTime} onChange={e => set('targetTime', e.target.value)} />
            </div>
          </div>

          {/* Hyrox-specific section */}
          {isHyrox && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
              <div className="space-y-1.5">
                <Label>Division</Label>
                <Select value={form.hyroxDivision} onValueChange={v => set('hyroxDivision', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HYROX_DIVISIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {weights && (
                <p className="text-xs text-muted-foreground">
                  Sled Push {weights.sledPush} · Sled Pull {weights.sledPull} · Farmers Carry {weights.farmersCarry} · Lunges {weights.walkingLunges} · Wall Ball {weights.wallBall}
                </p>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Target times per station <span className="font-normal text-muted-foreground">(optional, mm:ss)</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATIONS.map(s => (
                    <div key={s.key} className="space-y-0.5">
                      <p className="text-xs font-medium">{s.label} <span className="text-muted-foreground">({s.detail})</span></p>
                      <Input
                        placeholder={s.placeholder}
                        value={form.stationTargets[s.key] || ''}
                        onChange={e => setStation(s.key, e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Any notes about this goal..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Objective'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
