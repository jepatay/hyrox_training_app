import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import {
  Plus, Dumbbell, Calendar, Clock, MapPin, Trash2, Edit2, ChevronDown, ChevronUp,
  Activity, MessageSquare
} from 'lucide-react'

const SESSION_TYPES = [
  { value: 'running', label: 'Running' },
  { value: 'hyrox_training', label: 'Hyrox Training' },
  { value: 'gym_strength', label: 'Gym Strength' },
  { value: 'crossfit_class', label: 'CrossFit Class' },
  { value: 'recovery', label: 'Recovery' },
]

const LOCATIONS = [
  { value: 'club_gym', label: 'Club Gym' },
  { value: 'home', label: 'Home' },
  { value: 'travel', label: 'Travel' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'outdoor', label: 'Outdoor' },
]

const EQUIPMENT = [
  { value: 'full_gym', label: 'Full Gym' },
  { value: 'limited', label: 'Limited Equipment' },
  { value: 'running_only', label: 'Running Only' },
  { value: 'bodyweight', label: 'Bodyweight Only' },
]

const FEELINGS = ['easy', 'normal', 'hard']

const TYPE_COLORS = {
  running: 'info',
  hyrox_training: 'warning',
  gym_strength: 'secondary',
  crossfit_class: 'success',
  recovery: 'outline',
}

const emptyForm = {
  title: '', type: 'running', date: new Date().toISOString().split('T')[0],
  status: 'completed', location: 'club_gym', equipment: 'full_gym',
  duration: '', distance: '', exercises: '', intervals: '', weights: '',
  rpe: '', feeling: 'normal', notes: '', coachingFeedback: '',
}

function SessionCard({ session, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const typeLabel = SESSION_TYPES.find(t => t.value === session.type)?.label || session.type

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Dumbbell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{session.title || typeLabel}</p>
            <Badge variant={TYPE_COLORS[session.type] || 'secondary'} className="text-[10px]">{typeLabel}</Badge>
            {session.status === 'planned' && <Badge variant="outline" className="text-[10px]">Planned</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(session.date)}</span>
            {session.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{session.duration} min</span>}
            {session.distance && <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{session.distance} km</span>}
            {session.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{LOCATIONS.find(l => l.value === session.location)?.label || session.location}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {session.rpe && <div className="text-right"><p className="text-[10px] text-muted-foreground">RPE</p><p className="text-sm font-bold text-primary">{session.rpe}</p></div>}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {session.feeling && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground uppercase tracking-wider mb-1">Feeling</p>
                <p className="font-medium capitalize">{session.feeling}</p>
              </div>
            )}
            {session.equipment && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground uppercase tracking-wider mb-1">Equipment</p>
                <p className="font-medium">{EQUIPMENT.find(e => e.value === session.equipment)?.label || session.equipment}</p>
              </div>
            )}
            {session.intervals && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground uppercase tracking-wider mb-1">Intervals</p>
                <p className="font-medium">{session.intervals}</p>
              </div>
            )}
            {session.weights && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground uppercase tracking-wider mb-1">Weights</p>
                <p className="font-medium">{session.weights}</p>
              </div>
            )}
          </div>

          {session.exercises && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs">
              <p className="text-muted-foreground uppercase tracking-wider mb-1">Exercises</p>
              <p className="whitespace-pre-line">{session.exercises}</p>
            </div>
          )}

          {session.notes && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs">
              <p className="text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="whitespace-pre-line">{session.notes}</p>
            </div>
          )}

          {session.coachingFeedback && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs">
              <p className="text-primary uppercase tracking-wider mb-1 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Coaching Feedback
              </p>
              <p className="whitespace-pre-line text-foreground">{session.coachingFeedback}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onEdit(session)}>
              <Edit2 className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(session.id)}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionForm({ initial = emptyForm, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Session Title</Label>
          <Input placeholder="e.g. Morning run, Hyrox simulation..." value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SESSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date *</Label>
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
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={form.location} onValueChange={v => set('location', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LOCATIONS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Equipment</Label>
          <Select value={form.equipment} onValueChange={v => set('equipment', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EQUIPMENT.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Duration (min)</Label>
          <Input type="number" placeholder="60" value={form.duration} onChange={e => set('duration', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Distance (km)</Label>
          <Input type="number" step="0.1" placeholder="5.0" value={form.distance} onChange={e => set('distance', e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Exercises / Workout Details</Label>
          <Textarea placeholder="e.g. 3x400m intervals @ 4:00/km, Sled push 4x25m..." value={form.exercises} onChange={e => set('exercises', e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>Intervals</Label>
          <Input placeholder="e.g. 8x200m @ 45s" value={form.intervals} onChange={e => set('intervals', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Weights</Label>
          <Input placeholder="e.g. Squat 3x5 @ 80kg" value={form.weights} onChange={e => set('weights', e.target.value)} />
        </div>
      </div>

      {form.status === 'completed' && (
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Post-Session Feedback</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>RPE (1-10)</Label>
              <Input type="number" min="1" max="10" placeholder="7" value={form.rpe} onChange={e => set('rpe', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Feeling</Label>
              <Select value={form.feeling} onValueChange={v => set('feeling', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FEELINGS.map(f => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="How did it feel? Anything to note..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={loading || !form.type || !form.date}>
          {loading ? 'Saving…' : 'Save Session'}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function TrainingLog() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSession, setEditSession] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = () => {
    setLoading(true)
    api.getTrainingSessions()
      .then(s => setSessions(s || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openCreate = () => { setEditSession(null); setDialogOpen(true) }
  const openEdit = (s) => { setEditSession(s); setDialogOpen(true) }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (editSession) {
        await api.updateTrainingSession(editSession.id, form)
      } else {
        await api.createTrainingSession(form)
      }
      setDialogOpen(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this session?')) return
    await api.deleteTrainingSession(id)
    load()
  }

  const filtered = filter === 'all'
    ? sessions
    : sessions.filter(s => s.type === filter)

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Training Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{sessions.length} sessions recorded</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Log Session
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...SESSION_TYPES.map(t => t.value)].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'All' : SESSION_TYPES.find(t => t.value === f)?.label || f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading sessions…</div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No sessions yet. Log your first training session!</p>
            <Button onClick={openCreate} className="mt-4" size="sm"><Plus className="h-4 w-4 mr-2" />Log Session</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map(s => (
            <SessionCard key={s.id} session={s} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSession ? 'Edit Session' : 'Log Training Session'}</DialogTitle>
          </DialogHeader>
          <SessionForm
            initial={editSession || emptyForm}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
