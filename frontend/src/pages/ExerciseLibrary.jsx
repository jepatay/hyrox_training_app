import { useEffect, useState } from 'react';
import { exerciseLibraryApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Check, X, Sparkles, BookOpen } from 'lucide-react';

const STATION_LABEL = Object.fromEntries(STATIONS.map(s => [s.key, s]));

// Form shape used for both "add new" (key: null) and "edit existing".
function blankForm() {
  return {
    key: null,
    label: '',
    aliases: '',
    unit: 'reps',
    metersPerCal: 10,
    credits: {}, // stationKey -> 0-100 (percent, as the UI edits it)
    reasoning: '',
    status: 'approved',
  };
}

function toFormCredits(credits) {
  const out = {};
  for (const [k, v] of Object.entries(credits || {})) out[k] = Math.round(v * 100);
  return out;
}

function CreditBadges({ credits }) {
  const entries = Object.entries(credits || {}).filter(([, w]) => w > 0);
  if (!entries.length) return <span className="text-xs text-muted-foreground">No station credit yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, weight]) => {
        const meta = STATION_LABEL[key];
        return (
          <span key={key} className="inline-flex items-center gap-1 text-xs bg-secondary rounded-full px-2 py-0.5">
            <span>{meta?.icon}</span>
            <span>{meta?.label || key}</span>
            <span className="text-muted-foreground">{Math.round(weight * 100)}%</span>
          </span>
        );
      })}
    </div>
  );
}

function ExerciseCard({ entry, onEdit, onApprove, onReject, onDelete }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 px-1 border-t border-border/50 first:border-t-0">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{entry.label}</span>
          <Badge variant="outline" className="text-[10px] py-0">{entry.unit}{entry.unit === 'cal' && entry.metersPerCal ? ` · ${entry.metersPerCal}m/cal` : ''}</Badge>
          {entry.source === 'builtin' && <Badge variant="secondary" className="text-[10px] py-0">Built-in</Badge>}
          {entry.source === 'ai_suggested' && <Badge variant="outline" className="text-[10px] py-0 text-orange-400 border-orange-400/30">AI suggested</Badge>}
          {entry.status === 'rejected' && <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">Rejected — excluded</Badge>}
        </div>
        <CreditBadges credits={entry.credits} />
        {entry.reasoning && <p className="text-xs text-muted-foreground italic">"{entry.reasoning}"</p>}
        {entry.aliases?.length > 0 && (
          <p className="text-xs text-muted-foreground">Also recognized as: {entry.aliases.join(', ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {entry.status === 'pending' && (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-green-400 border-green-400/30" onClick={() => onApprove(entry)}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-muted-foreground" onClick={() => onReject(entry)}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(entry)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(entry)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function ExerciseLibrary() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = dialog closed
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await exerciseLibraryApi.list();
      setLibrary(data || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load exercise library', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(blankForm());
  }
  function openEdit(entry) {
    setForm({
      key: entry.key,
      label: entry.label,
      aliases: (entry.aliases || []).join(', '),
      unit: entry.unit,
      metersPerCal: entry.metersPerCal || 10,
      credits: toFormCredits(entry.credits),
      reasoning: entry.reasoning || '',
      status: entry.status,
    });
  }

  async function handleSuggest() {
    if (!form.label.trim()) {
      toast({ title: 'Name required', description: 'Type the exercise name first.', variant: 'destructive' });
      return;
    }
    setSuggesting(true);
    try {
      const suggestion = await exerciseLibraryApi.suggest(form.label.trim());
      setForm(prev => ({
        ...prev,
        unit: suggestion.unit || 'reps',
        metersPerCal: suggestion.metersPerCal || 10,
        credits: toFormCredits(suggestion.credits),
        reasoning: suggestion.reasoning || '',
      }));
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSuggesting(false);
    }
  }

  function setCredit(stationKey, value) {
    setForm(prev => ({ ...prev, credits: { ...prev.credits, [stationKey]: value === '' ? undefined : Number(value) } }));
  }

  async function handleSave() {
    if (!form.label.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        aliases: form.aliases.split(',').map(a => a.trim()).filter(Boolean),
        unit: form.unit,
        metersPerCal: form.unit === 'cal' ? Number(form.metersPerCal) || 10 : null,
        credits: Object.fromEntries(Object.entries(form.credits).filter(([, v]) => v > 0).map(([k, v]) => [k, v / 100])),
        reasoning: form.reasoning || null,
      };
      if (form.key) {
        await exerciseLibraryApi.update(form.key, payload);
      } else {
        await exerciseLibraryApi.create(payload);
      }
      setForm(null);
      await load();
      toast({ title: 'Saved' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(entry) {
    try {
      await exerciseLibraryApi.update(entry.key, { status: 'approved' });
      await load();
      toast({ title: 'Approved', description: `${entry.label} now counts toward station scores.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }
  async function handleReject(entry) {
    try {
      await exerciseLibraryApi.update(entry.key, { status: 'rejected' });
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }
  async function handleDelete(entry) {
    if (!confirm(`Delete "${entry.label}" from the library?`)) return;
    try {
      await exerciseLibraryApi.delete(entry.key);
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const pending = library.filter(e => e.status === 'pending');
  const approved = library.filter(e => e.status === 'approved');
  const rejected = library.filter(e => e.status === 'rejected');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exercise Library</h1>
          <p className="text-muted-foreground text-sm">
            Every movement the app can recognize, and exactly how much of it counts toward each of the 9 HYROX stations. Anything not in here yet gets added automatically as "pending" the next time it's logged — it won't count toward a score until you approve it.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add Exercise
        </Button>
      </div>

      {pending.length > 0 && (
        <Card className="border-orange-400/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-400">
              <Sparkles className="h-4 w-4" /> Pending Review ({pending.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">Logged in a session but not yet counted toward any score. Approve to start scoring, edit the suggested credit first, or reject to exclude permanently.</p>
          </CardHeader>
          <CardContent className="pt-0">
            {pending.map(e => (
              <ExerciseCard key={e.key} entry={e} onEdit={openEdit} onApprove={handleApprove} onReject={handleReject} onDelete={handleDelete} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Approved ({approved.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {approved.map(e => (
            <ExerciseCard key={e.key} entry={e} onEdit={openEdit} onApprove={handleApprove} onReject={handleReject} onDelete={handleDelete} />
          ))}
        </CardContent>
      </Card>

      {rejected.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Rejected ({rejected.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {rejected.map(e => (
              <ExerciseCard key={e.key} entry={e} onEdit={openEdit} onApprove={handleApprove} onReject={handleReject} onDelete={handleDelete} />
            ))}
          </CardContent>
        </Card>
      )}

      {form && (
        <Dialog open onOpenChange={() => setForm(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.key ? 'Edit Exercise' : 'Add Exercise'}</DialogTitle>
              <DialogDescription>
                {form.key ? 'Adjust the name, unit, or how much this counts toward each station.' : 'Type the exercise name, then get an AI-suggested station mapping to start from — tweak anything before saving.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <div className="flex gap-2">
                  <Input value={form.label} onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))} placeholder="e.g. Box Jump" />
                  {!form.key && (
                    <Button type="button" variant="outline" className="gap-1.5 shrink-0" disabled={suggesting} onClick={handleSuggest}>
                      <Sparkles className="h-3.5 w-3.5" /> {suggesting ? 'Thinking...' : 'Suggest'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Also recognized as (comma-separated)</Label>
                <Input value={form.aliases} onChange={e => setForm(prev => ({ ...prev, aliases: e.target.value }))} placeholder="box jumps, plyo box" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Select value={form.unit} onValueChange={v => setForm(prev => ({ ...prev, unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reps">Reps</SelectItem>
                      <SelectItem value="m">Distance (m)</SelectItem>
                      <SelectItem value="cal">Calories (cardio machine)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.unit === 'cal' && (
                  <div className="space-y-1.5">
                    <Label>Meters per calorie</Label>
                    <Input type="number" step="0.5" value={form.metersPerCal} onChange={e => setForm(prev => ({ ...prev, metersPerCal: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Station credit — how much of this counts toward each station</Label>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {STATIONS.map(s => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="text-sm w-6 text-center">{s.icon}</span>
                      <span className="text-xs text-muted-foreground flex-1">{s.label}</span>
                      <Input
                        type="number" min="0" max="100" className="w-16 h-8 text-xs"
                        value={form.credits[s.key] ?? ''}
                        onChange={e => setCredit(s.key, e.target.value)}
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Reasoning (optional)</Label>
                <Textarea rows={2} value={form.reasoning} onChange={e => setForm(prev => ({ ...prev, reasoning: e.target.value }))} placeholder="Why does this transfer the way it does?" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
