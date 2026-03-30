import { useState } from 'react';
import { sessionsApi, coachingApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SESSION_TYPES } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

const EXERCISES = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row Erg',
  'Farmers Carry', 'Sandbag Lunges', 'Wall Balls', 'Box Jump', 'Pull Up',
  'Push Up', 'Squat', 'Deadlift', 'Bench Press', 'KB Swing', 'Assault Bike',
];

export default function SessionForm({ session, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: session?.date?.slice(0, 10) || today,
    type: session?.type || '',
    status: session?.status || 'completed',
    location: session?.location || '',
    equipment: session?.equipment || '',
    duration: session?.duration || '',
    runningDistance: session?.runningDistance || '',
    rpe: session?.rpe || '',

    notes: session?.notes || '',
    exercises: session?.exercises || [],
  });
  const [saving, setSaving] = useState(false);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.date || !form.type) {
      toast({ title: 'Validation', description: 'Date and type are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        duration: form.duration ? parseInt(form.duration) : null,
        runningDistance: form.runningDistance ? parseFloat(form.runningDistance) : null,
        rpe: form.rpe ? parseInt(form.rpe) : null,
      };
      let saved;
      if (session) {
        saved = await sessionsApi.update(session.id, data);
      } else {
        saved = await sessionsApi.create(data);
        // Auto-generate coaching feedback
        if (form.status === 'completed') {
          setGeneratingFeedback(true);
          try {
            const { feedback } = await coachingApi.generateFeedback(saved.id);
            saved = { ...saved, coachingFeedback: feedback };
          } catch {
            // Feedback generation is optional
          }
          setGeneratingFeedback(false);
        }
      }
      onSaved(saved);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setSaving(false);
      setGeneratingFeedback(false);
    }
  }

  if (generatingFeedback) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium">Generating Coaching Feedback</p>
              <p className="text-sm text-muted-foreground">Analysing your training...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session ? 'Edit Session' : 'Log Training Session'}</DialogTitle>
          <DialogDescription>Record your workout details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Session Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('type', t.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    form.type === t.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span className="text-xs">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={form.location} onValueChange={v => set('location', v)}>
                <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="club_gym">Club Gym</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Equipment</Label>
              <Select value={form.equipment} onValueChange={v => set('equipment', v)}>
                <SelectTrigger><SelectValue placeholder="Equipment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_gym">Full Gym</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="running_only">Running Only</SelectItem>
                  <SelectItem value="stairs">Stairs</SelectItem>
                  <SelectItem value="bodyweight">Bodyweight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input type="number" placeholder="60" min="1" max="480" value={form.duration} onChange={e => set('duration', e.target.value)} />
            </div>
          </div>

          {(form.type === 'running' || form.type === 'hyrox_training' || form.type === 'hyrox_competition') && (
            <div className="space-y-1.5">
              <Label>Running Distance (km)</Label>
              <Input type="number" placeholder="5.0" step="0.1" min="0" value={form.runningDistance} onChange={e => set('runningDistance', e.target.value)} />
            </div>
          )}

          {form.status === 'completed' && (
            <div className="border border-border rounded-lg p-4 space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Post-Session Feedback</p>
              <div className="space-y-1.5">
                <Label>RPE (1–10)</Label>
                <Input type="number" min="1" max="10" placeholder="7" value={form.rpe} onChange={e => set('rpe', e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Workout details, intervals, weights, how it went..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {form.status === 'completed' && !session && <Sparkles className="h-4 w-4" />}
              {saving ? 'Saving...' : session ? 'Update Session' : 'Log + Get Coaching Feedback'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
