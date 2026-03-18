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

export default function ObjectiveForm({ objective, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: objective?.name || '',
    type: objective?.type || '',
    date: objective?.date?.slice(0, 10) || '',
    priority: objective?.priority || 'B',
    targetTime: objective?.targetTime || '',
    notes: objective?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.type || !form.date || !form.priority) {
      toast({ title: 'Validation', description: 'Name, type, date and priority are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = objective
        ? await objectivesApi.update(objective.id, form)
        : await objectivesApi.create(form);
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
              <Label>Target Time</Label>
              <Input placeholder="e.g. 1:25:00" value={form.targetTime} onChange={e => set('targetTime', e.target.value)} />
            </div>
          </div>

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
