import { useState, useEffect } from 'react';
import { sessionsApi, coachingApi, venuesApi } from '@/lib/api';
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

const RPE_LABELS = {
  1: 'Recovery — effortless, Zone 1',
  2: 'Recovery — effortless, Zone 1',
  3: 'Easy — conversational, Zone 2',
  4: 'Easy — conversational, Zone 2',
  5: 'Moderate — short sentences, Zone 3',
  6: 'Moderate — short sentences, Zone 3',
  7: 'Hard — threshold, Zone 4',
  8: 'Very hard — race pace, Zone 4–5',
  9: 'Near maximal — interval pace, Zone 5',
  10: 'Maximal — true all-out, unsustainable',
};

const VOLUME_DESCRIPTIONS = {
  Low: 'Under ~30 min of actual work — stopped because it was hard, not too much',
  Medium: '30–60 min of work — solid amount, could have done a bit more',
  High: '60+ min or high rep count — legs depleted from quantity, not just peak effort',
};

export default function SessionForm({ session, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: session?.date?.slice(0, 10) || today,
    type: session?.type || '',
    status: session?.status || 'completed',
    isClass: session?.isClass || false,
    location: session?.location || '',
    venueId: session?.venueId || null,
    equipment: session?.equipment || '',
    duration: session?.duration || '',
    runningDistance: session?.runningDistance || '',
    rpe: session?.rpe != null ? session.rpe : '',
    volume: session?.volume || '',
    notes: session?.notes || '',
    exercises: session?.exercises || [],
  });
  const [saving, setSaving] = useState(false);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [venues, setVenues] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    venuesApi.list().then(data => setVenues(data || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  function handleLocationChange(value) {
    if (value.startsWith('venue:')) {
      const venueId = value.slice(6);
      const venue = venues.find(v => v.id === venueId);
      setForm(prev => ({
        ...prev,
        location: venue?.name || value,
        venueId,
        equipment: venue?.equipment || prev.equipment,
      }));
    } else {
      setForm(prev => ({ ...prev, location: value, venueId: null }));
    }
  }

  const locationSelectValue = form.venueId ? `venue:${form.venueId}` : form.location;
  const selectedVenue = form.venueId ? venues.find(v => v.id === form.venueId) : null;

  const rpeInt = form.rpe !== '' ? Math.round(Number(form.rpe)) : null;
  const sessionLoad = rpeInt && form.duration ? Math.round(rpeInt * parseInt(form.duration)) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.date || !form.type) {
      toast({ title: 'Validation', description: 'Date and type are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const rpe = form.rpe !== '' ? Math.round(Number(form.rpe)) : null;
      const duration = form.duration ? parseInt(form.duration) : null;
      const data = {
        ...form,
        duration,
        runningDistance: form.runningDistance ? parseFloat(String(form.runningDistance).replace(',', '.')) : null,
        rpe,
        volume: form.volume || null,
        sessionLoad: rpe && duration ? Math.round(rpe * duration) : null,
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

          <button
            type="button"
            onClick={() => set('isClass', !form.isClass)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-fit ${
              form.isClass
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-secondary text-muted-foreground'
            }`}
          >
            <span>👥</span>
            <span className="text-xs">Class / Group Session</span>
          </button>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={locationSelectValue} onValueChange={handleLocationChange}>
                <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  {venues.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">My Venues</div>
                      {venues.map(v => (
                        <SelectItem key={v.id} value={`venue:${v.id}`}>{v.name}</SelectItem>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Generic</div>
                    </>
                  )}
                  <SelectItem value="club_gym">Club Gym</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
              {selectedVenue?.notes && (
                <p className="text-xs text-muted-foreground">📍 {selectedVenue.notes}</p>
              )}
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
              <Input type="number" placeholder="5.0" step="0.01" min="0" value={form.runningDistance} onChange={e => set('runningDistance', e.target.value)} />
            </div>
          )}

          {form.status === 'completed' && (
            <div className="border border-border rounded-lg p-4 space-y-5">
              <p className="text-sm font-medium">Post-Session Metrics</p>

              {/* Intensity RPE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Intensity — how hard?</Label>
                  {rpeInt != null && (
                    <span className={`text-sm font-bold ${
                      rpeInt >= 9 ? 'text-red-400' : rpeInt >= 7 ? 'text-yellow-400' : 'text-green-400'
                    }`}>{rpeInt}/10</span>
                  )}
                </div>
                <div className="flex gap-1">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => set('rpe', rpeInt === n ? '' : n)}
                      className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${
                        rpeInt === n
                          ? n >= 9 ? 'bg-red-500 text-white'
                            : n >= 7 ? 'bg-yellow-500 text-black'
                            : 'bg-green-500 text-white'
                          : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {rpeInt != null ? (
                  <p className="text-xs text-muted-foreground">{RPE_LABELS[rpeInt]}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">7 = threshold pace · 8 = race pace · 9 = interval pace</p>
                )}
              </div>

              {/* Volume */}
              <div className="space-y-2">
                <Label>Volume — how much?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['Low', 'Medium', 'High'].map(v => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => set('volume', form.volume === v ? '' : v)}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        form.volume === v
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {VOLUME_DESCRIPTIONS[form.volume] || 'Low = could have gone longer · High = depleted from quantity'}
                </p>
              </div>

              {/* Session Load — calculated */}
              {sessionLoad != null && (
                <div className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Session Load</p>
                    <p className="text-xs text-muted-foreground">RPE {rpeInt} × {form.duration} min</p>
                  </div>
                  <span className="text-2xl font-bold text-primary">{sessionLoad}</span>
                </div>
              )}
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
