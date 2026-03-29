import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { MapPin, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

const EQUIPMENT_OPTIONS = [
  { value: 'running_only', label: 'Running Only' },
  { value: 'bodyweight', label: 'Bodyweight Only' },
  { value: 'limited', label: 'Limited Equipment' },
  { value: 'full_gym', label: 'Full Gym' },
]

const EQUIPMENT_COLORS = {
  running_only: 'secondary',
  bodyweight: 'secondary',
  limited: 'outline',
  full_gym: 'default',
}

function emptyForm() {
  return { name: '', equipment: 'running_only', notes: '' }
}

export default function Venues() {
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = hidden, {} = new, {id,...} = edit
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.getVenues()
      setVenues(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function startNew() {
    setForm(emptyForm())
    setError(null)
  }

  function startEdit(venue) {
    setForm({ id: venue.id, name: venue.name, equipment: venue.equipment, notes: venue.notes || '' })
    setError(null)
  }

  function cancelForm() {
    setForm(null)
    setError(null)
  }

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) { setError('Venue name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      if (form.id) {
        await api.updateVenue(form.id, { name: form.name, equipment: form.equipment, notes: form.notes })
      } else {
        await api.createVenue({ name: form.name, equipment: form.equipment, notes: form.notes })
      }
      setForm(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!confirm('Delete this venue?')) return
    try {
      await api.deleteVenue(id)
      setVenues(v => v.filter(x => x.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Training Venues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save your training spots with what equipment is available. The suggestion engine will use this to filter workouts.
          </p>
        </div>
        {!form && (
          <Button size="sm" onClick={startNew}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Venue
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {form && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {form.id ? 'Edit Venue' : 'New Venue'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Venue Name</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              <p className="text-xs text-muted-foreground">
                This controls what the suggestion engine can include for this venue.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                placeholder="e.g. 200m straight track, no gym equipment"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelForm} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Venue list */}
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
                  <Badge variant={EQUIPMENT_COLORS[venue.equipment] || 'secondary'} className="text-xs whitespace-nowrap">
                    {EQUIPMENT_OPTIONS.find(o => o.value === venue.equipment)?.label || venue.equipment}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(venue)}>
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

      {!form && error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
