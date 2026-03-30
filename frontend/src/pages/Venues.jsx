import { useState, useEffect } from 'react';
import { venuesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

const EQUIPMENT_OPTIONS = [
  { value: 'running_only', label: 'Running Only' },
  { value: 'stairs', label: 'Stairs Only' },
  { value: 'bodyweight', label: 'Bodyweight Only' },
  { value: 'limited', label: 'Limited Equipment' },
  { value: 'full_gym', label: 'Full Gym' },
  { value: 'full_gym_hyrox', label: 'Full Gym + Hyrox' },
];

function emptyForm() {
  return { name: '', equipment: 'running_only', notes: '' };
}

export default function Venues() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await venuesApi.list();
      setVenues(data || []);
    } catch {
      toast({ title: 'Error', description: 'Could not load venues.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await venuesApi.update(form.id, { name: form.name, equipment: form.equipment, notes: form.notes });
      } else {
        await venuesApi.create({ name: form.name, equipment: form.equipment, notes: form.notes });
      }
      toast({ title: form.id ? 'Venue updated' : 'Venue added' });
      setForm(null);
      await load();
    } catch {
      toast({ title: 'Error', description: 'Could not save venue.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this venue?')) return;
    try {
      await venuesApi.delete(id);
      setVenues(v => v.filter(x => x.id !== id));
      toast({ title: 'Venue deleted' });
    } catch {
      toast({ title: 'Error', description: 'Could not delete venue.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" /> My Training Venues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save your training spots with what's available. The suggestion engine uses this to filter workouts.
          </p>
        </div>
        {!form && (
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Venue
          </Button>
        )}
      </div>

      {form && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{form.id ? 'Edit Venue' : 'New Venue'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Venue Name</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g. VSK, DIT-x Gym, Home…"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Available Equipment</Label>
              <Select value={form.equipment} onValueChange={v => setField('equipment', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Controls what the AI can suggest for this venue.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                placeholder="e.g. 200m straight track, no gym equipment available"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading venues…</p>
      ) : venues.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <MapPin className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No venues saved yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add your training spots to get smarter suggestions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {venues.map(venue => (
            <Card key={venue.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{venue.name}</p>
                    {venue.notes && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{venue.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="secondary" className="text-xs whitespace-nowrap">
                    {EQUIPMENT_OPTIONS.find(o => o.value === venue.equipment)?.label || venue.equipment}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ id: venue.id, name: venue.name, equipment: venue.equipment, notes: venue.notes || '' })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(venue.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
