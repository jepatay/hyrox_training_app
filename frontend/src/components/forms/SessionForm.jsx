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
import { Sparkles, Trash2, Plus } from 'lucide-react';

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

// Kept in sync with the extraction enum in backend/src/services/claude.js
const EXTRACTED_EXERCISE_NAMES = [
  { value: 'sledPush', label: 'Sled Push' },
  { value: 'sledPull', label: 'Sled Pull' },
  { value: 'farmersCarry', label: 'Farmers Carry' },
  { value: 'wallBalls', label: 'Wall Balls' },
  { value: 'skiErg', label: 'Ski Erg' },
  { value: 'rowErg', label: 'Row Erg' },
  { value: 'burpeeBroadJump', label: 'Burpee Broad Jump' },
  { value: 'walkingLunges', label: 'Walking Lunges' },
  { value: 'squat', label: 'Squat' },
  { value: 'thruster', label: 'Thruster' },
  { value: 'deadlift', label: 'Deadlift' },
  { value: 'benchPress', label: 'Bench Press' },
  { value: 'pullUp', label: 'Pull Up' },
  { value: 'run', label: 'Run' },
  { value: 'other', label: 'Other' },
];

const emptyRow = () => ({ name: 'other', sets: '', reps: '', weightKg: '', distanceM: '', notes: '' });

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
    weightVest: session?.weightVest || false,
    notes: session?.notes || '',
    exercises: session?.exercises || [],
  });
  // 'form' -> 'extracting' -> 'review' -> 'finalizing'
  const [stage, setStage] = useState('form');
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState([]);
  const [savedSession, setSavedSession] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
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
      const isNew = !session;
      const saved = isNew
        ? await sessionsApi.create(data)
        : await sessionsApi.update(session.id, data);

      // Planned (not completed) sessions have nothing to score — save and done.
      if (form.status !== 'completed') {
        onSaved(saved);
        return;
      }

      // Completed but no notes to extract from — still score/feedback, just skip the review step.
      if (!form.notes.trim()) {
        await finalize(saved, isNew);
        return;
      }

      setSavedSession(saved);
      setStage('extracting');
      setSaving(false);
      try {
        const { extractedExercises } = await sessionsApi.extract(saved.id);
        setReviewRows((extractedExercises?.exercises || []).map(e => ({
          name: e.name || 'other',
          sets: e.sets ?? '',
          reps: e.reps ?? '',
          weightKg: e.weightKg ?? '',
          distanceM: e.distanceM ?? '',
          notes: e.notes || '',
        })));
      } catch {
        setReviewRows([]);
        toast({ title: 'Extraction failed', description: 'You can still add exercises manually below.', variant: 'destructive' });
      }
      setStage('review');
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setSaving(false);
    }
  }

  // Persists the (possibly hand-corrected) exercise list, then scores off
  // exactly what's on screen — not whatever the AI originally guessed.
  async function handleConfirmReview() {
    setStage('finalizing');
    try {
      const exercises = reviewRows
        .filter(r => r.name)
        .map(r => ({
          name: r.name,
          sets: r.sets !== '' ? Number(r.sets) : null,
          reps: r.reps !== '' ? Number(r.reps) : null,
          weightKg: r.weightKg !== '' ? Number(r.weightKg) : null,
          distanceM: r.distanceM !== '' ? Number(r.distanceM) : null,
          notes: r.notes || null,
        }));
      await sessionsApi.update(savedSession.id, { extractedExercises: { exercises } });
      await finalize(savedSession, !session);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setStage('review');
    }
  }

  // Always called for a completed session — generates station scores (new or
  // edited alike), plus the initial coaching thread for brand-new sessions only.
  async function finalize(saved, isNew) {
    setStage('finalizing');
    try {
      const calls = [coachingApi.generateStationScores(saved.id)];
      if (isNew) calls.push(coachingApi.generateFeedback(saved.id));
      const [scoresResult, feedbackResult] = await Promise.allSettled(calls);
      if (scoresResult.status === 'fulfilled') {
        saved = { ...saved, stationScores: scoresResult.value.stationScores, stationEquivalence: scoresResult.value.stationEquivalence };
      }
      if (isNew && feedbackResult?.status === 'fulfilled') {
        saved = { ...saved, coachingThread: feedbackResult.value.coachingThread };
      }
      onSaved(saved);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setStage('form');
      setSaving(false);
    }
  }

  function updateRow(i, field, value) {
    setReviewRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }
  function removeRow(i) {
    setReviewRows(prev => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setReviewRows(prev => [...prev, emptyRow()]);
  }

  if (stage === 'extracting' || stage === 'finalizing') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium">{stage === 'extracting' ? 'Reading Your Notes' : 'Scoring Your Session'}</p>
              <p className="text-sm text-muted-foreground">
                {stage === 'extracting' ? 'Pulling out sets, reps, and weights from your notes...' : 'Computing station impact from the confirmed exercises...'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (stage === 'review') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review What Was Extracted</DialogTitle>
            <DialogDescription>
              This is what the AI read from your notes — sets × reps, weight, distance. Fix anything it got wrong (a missed round count, a mislabeled movement) before station scores are computed from it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {reviewRows.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nothing structured was found in your notes. Add exercises manually if any of them should count toward a station.</p>
            )}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {reviewRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.8fr_auto] gap-1.5 items-center">
                  <Select value={row.name} onValueChange={v => updateRow(i, 'name', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXTRACTED_EXERCISE_NAMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="h-8 text-xs" type="number" placeholder="sets" value={row.sets} onChange={e => updateRow(i, 'sets', e.target.value)} />
                  <Input className="h-8 text-xs" type="number" placeholder="reps" value={row.reps} onChange={e => updateRow(i, 'reps', e.target.value)} />
                  <Input className="h-8 text-xs" type="number" placeholder="kg" step="0.5" value={row.weightKg} onChange={e => updateRow(i, 'weightKg', e.target.value)} />
                  <Input className="h-8 text-xs" type="number" placeholder="m" value={row.distanceM} onChange={e => updateRow(i, 'distanceM', e.target.value)} />
                  <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {reviewRows.length > 0 && (
              <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.8fr_auto] gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide px-0.5">
                <span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Distance</span><span></span>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add exercise
            </Button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStage('form')}>Back</Button>
            <Button type="button" onClick={handleConfirmReview} className="gap-2">
              <Sparkles className="h-4 w-4" /> Confirm & Score
            </Button>
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

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => set('isClass', !form.isClass)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                form.isClass
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-secondary text-muted-foreground'
              }`}
            >
              <span>👥</span>
              <span className="text-xs">Class / Group Session</span>
            </button>
            <button
              type="button"
              onClick={() => set('weightVest', !form.weightVest)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                form.weightVest
                  ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-border hover:bg-secondary text-muted-foreground'
              }`}
            >
              <span>🦺</span>
              <span className="text-xs">Weight Vest — 9 kg</span>
            </button>
          </div>

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
              {form.status === 'completed' && <Sparkles className="h-4 w-4" />}
              {saving ? 'Saving...' : session ? 'Update Session' : 'Log Training'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
