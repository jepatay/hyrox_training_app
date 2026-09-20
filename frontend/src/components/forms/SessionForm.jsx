import { useState } from 'react';
import { sessionsApi, coachingApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';

// Session type/status/location/equipment/duration/RPE/volume were dropped —
// the v2 extraction pipeline reads all of that (movements, weights, runs)
// straight out of the notes text now, so hand-entering it separately was
// duplicate work nobody was doing anymore. `type` and `status` still exist
// on the session record (other pages/records read them) but are fixed
// defaults here rather than a picker.
const DEFAULT_TYPE = 'hyrox_training';

export default function SessionForm({ session, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: session?.date?.slice(0, 10) || today,
    isClass: session?.isClass || false,
    weightVestKg: session?.weightVestKg ?? (session?.weightVest ? 9 : null),
    notes: session?.notes || '',
  });
  // 'form' -> 'extracting' -> 'review' -> 'finalizing'
  const [stage, setStage] = useState('form');
  const [saving, setSaving] = useState(false);
  const [savedSession, setSavedSession] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const { toast } = useToast();

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.date) {
      toast({ title: 'Validation', description: 'Date is required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = {
        date: form.date,
        isClass: form.isClass,
        weightVestKg: form.weightVestKg,
        notes: form.notes,
        type: session?.type || DEFAULT_TYPE,
        status: 'completed',
      };
      const isNew = !session;
      const saved = isNew
        ? await sessionsApi.create(data)
        : await sessionsApi.update(session.id, data);

      // No notes to extract from — still score/feedback, just skip the review step.
      if (!form.notes.trim()) {
        await finalize(saved, isNew);
        return;
      }

      setSavedSession(saved);
      setStage('extracting');
      setSaving(false);
      try {
        const { summaryText } = await sessionsApi.extract(saved.id);
        setReviewText(summaryText || '');
      } catch {
        setReviewText('');
        toast({ title: 'Extraction failed', description: 'You can still type exercises manually below.', variant: 'destructive' });
      }
      setStage('review');
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setSaving(false);
    }
  }

  // Persists the (possibly hand-corrected) review text, re-parses it back
  // into structured exercises, then scores off exactly that — not whatever
  // the AI originally guessed from the freeform notes.
  async function handleConfirmReview() {
    setStage('finalizing');
    try {
      await sessionsApi.confirmExtraction(savedSession.id, reviewText);
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
              This is your log rewritten as one line per exercise, with the total already worked out — e.g. "Thruster: 13 × 15 reps @ 11kg = 195 reps total". Fix any line that's wrong (a missed round count, a mislabeled movement) before station scores are computed from it. A line tagged <span className="italic">[new — pending review]</span> is an exercise not yet in your Exercise Library — it won't count toward a score until you approve it there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {reviewText.trim() === '' && (
              <p className="text-sm text-muted-foreground">Nothing structured was found in your notes. Type exercise lines below if any should count toward a station, e.g. "Wall Balls: 100 reps @ 6kg".</p>
            )}
            <Textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder={'Thruster: 13 × 15 reps @ 11kg = 195 reps total\nWall Balls: 100 reps @ 6kg'}
            />
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{session ? 'Edit Session' : 'Log Training Session'}</DialogTitle>
          <DialogDescription>Write what you did — everything else is worked out from your notes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => set('isClass', !form.isClass)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors h-9 ${
                form.isClass
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-secondary text-muted-foreground'
              }`}
            >
              <span>👥</span>
              <span className="text-xs">Class / Group Session</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => set('weightVestKg', form.weightVestKg ? null : 9)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors h-9 ${
                  form.weightVestKg
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-border hover:bg-secondary text-muted-foreground'
                }`}
              >
                <span>🦺</span>
                <span className="text-xs">Weight Vest</span>
              </button>
              {form.weightVestKg != null && (
                <Input
                  type="number" min="1" step="0.5"
                  className="w-16 h-9 text-sm"
                  value={form.weightVestKg}
                  onChange={e => set('weightVestKg', e.target.value === '' ? null : Number(e.target.value))}
                />
              )}
              {form.weightVestKg != null && <span className="text-xs text-muted-foreground">kg — used for run, burpees, lunges</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Warm-ups, runs and abs all count — write everything you did, in your own words."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={8}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {saving ? 'Saving...' : session ? 'Update Session' : 'Log Training'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
