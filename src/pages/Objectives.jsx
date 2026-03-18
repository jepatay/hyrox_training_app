import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate, daysUntil } from '@/lib/utils'
import { Plus, Target, Calendar, Clock, Trash2, Edit2, Flame, CheckCircle } from 'lucide-react'

const TYPES = [
  { value: '5k', label: '5K Race' },
  { value: 'hyrox', label: 'Hyrox Race' },
  { value: '10k', label: '10K Race' },
  { value: 'half_marathon', label: 'Half Marathon' },
  { value: 'custom', label: 'Custom' },
]

const PRIORITIES = ['A goal', 'B goal', 'C goal']

const PRIORITY_STYLES = {
  'A goal': { badge: 'default', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
  'B goal': { badge: 'warning', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  'C goal': { badge: 'secondary', color: 'text-muted-foreground', bg: 'bg-muted/50 border-border' },
}

const emptyForm = {
  name: '', type: 'hyrox', date: '', priority: 'A goal', targetTime: '', notes: '',
}

function ObjectiveForm({ initial = emptyForm, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Objective Name *</Label>
        <Input placeholder="e.g. Paris Hyrox 2025, Sub-20 5K..." value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Race Date *</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={v => set('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Target Time</Label>
          <Input placeholder="e.g. 1:15:00, sub-20:00" value={form.targetTime} onChange={e => set('targetTime', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea placeholder="Strategy, key workouts, course details..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={loading || !form.name || !form.date}>
          {loading ? 'Saving…' : 'Save Objective'}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function Objectives() {
  const [objectives, setObjectives] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editObj, setEditObj] = useState(null)

  const load = () => {
    setLoading(true)
    api.getObjectives()
      .then(o => setObjectives(o || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (editObj) await api.updateObjective(editObj.id, form)
      else await api.createObjective(form)
      setDialogOpen(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this objective?')) return
    await api.deleteObjective(id)
    load()
  }

  const upcoming = objectives
    .filter(o => daysUntil(o.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const past = objectives
    .filter(o => daysUntil(o.date) < 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const ObjectiveCard = ({ obj }) => {
    const days = daysUntil(obj.date)
    const style = PRIORITY_STYLES[obj.priority] || PRIORITY_STYLES['C goal']
    const typeLabel = TYPES.find(t => t.value === obj.type)?.label || obj.type

    return (
      <div className={`p-5 rounded-xl border ${style.bg} space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-semibold">{obj.name}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={style.badge} className="text-[10px]">{obj.priority}</Badge>
              <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditObj(obj); setDialogOpen(true) }}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(obj.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(obj.date)}</span>
          {days >= 0 ? (
            <span className={`flex items-center gap-1 font-semibold ${style.color}`}>
              <Flame className="h-3 w-3" />
              {days === 0 ? 'Race day!' : `${days} days to go`}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <CheckCircle className="h-3 w-3" />
              {Math.abs(days)} days ago
            </span>
          )}
          {obj.targetTime && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Target: {obj.targetTime}</span>
          )}
        </div>

        {obj.notes && (
          <p className="text-xs text-muted-foreground bg-black/20 rounded-lg p-2 whitespace-pre-line">{obj.notes}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Objectives
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Races and performance goals</p>
        </div>
        <Button onClick={() => { setEditObj(null); setDialogOpen(true) }} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Add Objective
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Flame className="h-3 w-3 text-primary" /> Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming objectives. Add your first race!</p>
                  <Button onClick={() => { setEditObj(null); setDialogOpen(true) }} className="mt-4" size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Add Objective
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map(obj => <ObjectiveCard key={obj.id} obj={obj} />)}
              </div>
            )}
          </div>

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <CheckCircle className="h-3 w-3" /> Past ({past.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {past.map(obj => <ObjectiveCard key={obj.id} obj={obj} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editObj ? 'Edit Objective' : 'Add Objective'}</DialogTitle>
          </DialogHeader>
          <ObjectiveForm
            initial={editObj || emptyForm}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
