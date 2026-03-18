import { useState } from 'react';
import { recordsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HYROX_STATIONS = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row Erg', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
];

export default function RecordForm({ onClose, onSaved }) {
  const [type, setType] = useState('hyrox');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    totalTime: '',
    notes: '',
  });
  const [splits, setSplits] = useState({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.date || !form.totalTime) {
      toast({ title: 'Validation', description: 'Date and total time are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = await recordsApi.create({ type, ...form, splitTimes: splits });
      onSaved(result);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Performance Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Record Type</Label>
            <div className="flex gap-2">
              {[
                { value: '5k', label: '5K Race' },
                { value: '10k', label: '10K Race' },
                { value: 'hyrox', label: 'Hyrox Race' },
                { value: 'other', label: 'Other' },
              ].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    type === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total Time</Label>
              <Input placeholder={type === 'hyrox' ? '1:25:30' : '25:30'} value={form.totalTime} onChange={e => set('totalTime', e.target.value)} />
            </div>
          </div>

          {/* Split times */}
          {(type === '5k' || type === '10k') && (
            <div className="space-y-2">
              <Label>Split Times (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: type === '5k' ? 5 : 10 }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-10">{i + 1}km</span>
                    <Input
                      className="h-8 text-xs"
                      placeholder="5:00"
                      value={splits[`km${i + 1}`] || ''}
                      onChange={e => setSplits(prev => ({ ...prev, [`km${i + 1}`]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {type === 'hyrox' && (
            <div className="space-y-2">
              <Label>Station Times (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                {HYROX_STATIONS.map(station => (
                  <div key={station} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-24 truncate">{station}</span>
                    <Input
                      className="h-8 text-xs"
                      placeholder="3:30"
                      value={splits[station] || ''}
                      onChange={e => setSplits(prev => ({ ...prev, [station]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Race conditions, how you felt, etc." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
