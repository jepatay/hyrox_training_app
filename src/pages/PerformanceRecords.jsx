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
import { Plus, Trophy, Calendar, Clock, Trash2, Edit2, TrendingUp, Activity } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const HYROX_STATIONS = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
]

const empty5k = { type: '5k', date: '', totalTime: '', split1: '', split2: '', split3: '', notes: '' }
const emptyHyrox = {
  type: 'hyrox', date: '', totalTime: '', runTotal: '', notes: '',
  skiErg: '', sledPush: '', sledPull: '', burpeeBJ: '', row: '', farryCarry: '', sandbagLunges: '', wallBalls: '',
}

function timeToSeconds(t) {
  if (!t) return null
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
  if (parts.length === 2) return parts[0]*60 + parts[1]
  return null
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
      </div>
    )
  }
  return null
}

function Record5kForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date *</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Time *</Label>
          <Input placeholder="mm:ss" value={form.totalTime} onChange={e => set('totalTime', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Split 1 (0-1km)</Label>
          <Input placeholder="mm:ss" value={form.split1} onChange={e => set('split1', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Split 2 (1-2km)</Label>
          <Input placeholder="mm:ss" value={form.split2} onChange={e => set('split2', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Split 3 (2-3km)</Label>
          <Input placeholder="mm:ss" value={form.split3} onChange={e => set('split3', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea placeholder="Race conditions, how it felt..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={loading || !form.date || !form.totalTime}>
          {loading ? 'Saving…' : 'Save Record'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function RecordHyroxForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const stations = [
    { key: 'skiErg', label: 'SkiErg' }, { key: 'sledPush', label: 'Sled Push' },
    { key: 'sledPull', label: 'Sled Pull' }, { key: 'burpeeBJ', label: 'Burpee Broad Jump' },
    { key: 'row', label: 'Row' }, { key: 'farryCarry', label: 'Farmers Carry' },
    { key: 'sandbagLunges', label: 'Sandbag Lunges' }, { key: 'wallBalls', label: 'Wall Balls' },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date *</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Time *</Label>
          <Input placeholder="h:mm:ss" value={form.totalTime} onChange={e => set('totalTime', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Total Run Time</Label>
          <Input placeholder="mm:ss" value={form.runTotal} onChange={e => set('runTotal', e.target.value)} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Station Times</p>
        <div className="grid grid-cols-2 gap-2">
          {stations.map(s => (
            <div key={s.key} className="space-y-1">
              <Label className="text-[10px]">{s.label}</Label>
              <Input placeholder="mm:ss" value={form[s.key] || ''} onChange={e => set(s.key, e.target.value)} className="h-8 text-xs" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea placeholder="Race conditions, strategy, key moments..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={loading || !form.date || !form.totalTime}>
          {loading ? 'Saving…' : 'Save Record'}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function PerformanceRecords() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [addType, setAddType] = useState('5k')

  const load = () => {
    setLoading(true)
    api.getRecords()
      .then(r => setRecords(r || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (editRecord) await api.updateRecord(editRecord.id, form)
      else await api.createRecord(form)
      setDialogOpen(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return
    await api.deleteRecord(id)
    load()
  }

  const records5k = records.filter(r => r.type === '5k').sort((a, b) => new Date(a.date) - new Date(b.date))
  const recordsHyrox = records.filter(r => r.type === 'hyrox').sort((a, b) => new Date(a.date) - new Date(b.date))

  const chart5k = records5k.map(r => ({
    date: formatDate(r.date),
    seconds: timeToSeconds(r.totalTime),
    time: r.totalTime,
  }))

  const chartHyrox = recordsHyrox.map(r => ({
    date: formatDate(r.date),
    seconds: timeToSeconds(r.totalTime),
    time: r.totalTime,
  }))

  const RecordRow = ({ record }) => (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{record.totalTime}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />{formatDate(record.date)}
          </span>
        </div>
        {record.type === '5k' && (record.split1 || record.split2) && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            {record.split1 && <span>1km: {record.split1}</span>}
            {record.split2 && <span>2km: {record.split2}</span>}
            {record.split3 && <span>3km: {record.split3}</span>}
          </div>
        )}
        {record.type === 'hyrox' && record.runTotal && (
          <p className="text-xs text-muted-foreground">Run total: {record.runTotal}</p>
        )}
        {record.notes && <p className="text-xs text-muted-foreground italic">{record.notes}</p>}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord(record); setAddType(record.type); setDialogOpen(true) }}>
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(record.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Performance Records
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track your race results and progression</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditRecord(null); setAddType('5k'); setDialogOpen(true) }} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" /> Log 5K
          </Button>
          <Button onClick={() => { setEditRecord(null); setAddType('hyrox'); setDialogOpen(true) }} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Log Hyrox
          </Button>
        </div>
      </div>

      <Tabs defaultValue="5k">
        <TabsList>
          <TabsTrigger value="5k">5K ({records5k.length})</TabsTrigger>
          <TabsTrigger value="hyrox">Hyrox ({recordsHyrox.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="5k" className="space-y-4">
          {records5k.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> 5K Progression
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chart5k} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,20%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="seconds" name="Time (s)" stroke="hsl(25,95%,55%)" strokeWidth={2} dot={{ fill: 'hsl(25,95%,55%)', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-5">
              {records5k.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No 5K records yet.</p>
                </div>
              ) : (
                records5k.reverse().map(r => <RecordRow key={r.id} record={r} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hyrox" className="space-y-4">
          {recordsHyrox.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Hyrox Progression
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartHyrox} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,20%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215,20%,55%)' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="seconds" name="Time (s)" stroke="hsl(25,95%,55%)" strokeWidth={2} dot={{ fill: 'hsl(25,95%,55%)', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-5">
              {recordsHyrox.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No Hyrox records yet.</p>
                </div>
              ) : (
                recordsHyrox.reverse().map(r => <RecordRow key={r.id} record={r} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editRecord ? 'Edit Record' : `Log ${addType === '5k' ? '5K' : 'Hyrox'} Result`}
            </DialogTitle>
          </DialogHeader>
          {addType === '5k' ? (
            <Record5kForm initial={editRecord || empty5k} onSave={handleSave} onCancel={() => setDialogOpen(false)} loading={saving} />
          ) : (
            <RecordHyroxForm initial={editRecord || emptyHyrox} onSave={handleSave} onCancel={() => setDialogOpen(false)} loading={saving} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
