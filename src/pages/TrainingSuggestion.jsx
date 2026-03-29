import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Zap, MapPin, Dumbbell, Clock, Target, CheckCircle, RotateCcw, Loader2 } from 'lucide-react'

const STATIC_LOCATIONS = [
  { value: 'home', label: 'Home' },
  { value: 'gym', label: 'Gym' },
  { value: 'travel', label: 'Travel / Hotel' },
  { value: 'outdoor', label: 'Outdoor / Park' },
]

const EQUIPMENT = [
  { value: 'full_gym', label: 'Full Gym' },
  { value: 'limited', label: 'Limited Equipment' },
  { value: 'running_only', label: 'Running Only' },
  { value: 'bodyweight', label: 'Bodyweight Only' },
]

const FOCUSES = [
  { value: 'running', label: 'Running' },
  { value: 'hyrox_strength', label: 'Hyrox Strength' },
  { value: 'mixed', label: 'Mixed / Full' },
  { value: 'recovery', label: 'Recovery / Mobility' },
]

const TIME_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '75', label: '75 minutes' },
  { value: '90', label: '90 minutes' },
  { value: '120', label: '2 hours' },
]

export default function TrainingSuggestion() {
  const [params, setParams] = useState({
    location: 'gym', equipment: 'full_gym', focus: 'mixed', time: '60',
    venueId: null,
  })
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [objectives, setObjectives] = useState([])
  const [venues, setVenues] = useState([])

  useEffect(() => {
    const now = new Date()
    Promise.all([
      api.getObjectives().catch(() => []),
      api.getVenues().catch(() => []),
    ]).then(([objs, vens]) => {
      setObjectives(
        (objs || [])
          .filter(obj => new Date(obj.date) >= now)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 2)
      )
      setVenues(vens || [])
    })
  }, [])

  const set = (k, v) => setParams(p => ({ ...p, [k]: v }))

  function handleLocationChange(value) {
    // Check if it's a saved venue (prefixed with "venue:")
    if (value.startsWith('venue:')) {
      const venueId = value.slice(6)
      const venue = venues.find(v => v.id === venueId)
      setParams(p => ({
        ...p,
        location: 'outdoor',
        venueId,
        equipment: venue?.equipment || p.equipment,
      }))
    } else {
      setParams(p => ({ ...p, location: value, venueId: null }))
    }
  }

  // Compute the current select value
  const locationSelectValue = params.venueId ? `venue:${params.venueId}` : params.location

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.getSuggestion(params)
      setSuggestion(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogSession = async () => {
    if (!suggestion) return
    try {
      const venueName = params.venueId ? venues.find(v => v.id === params.venueId)?.name : null
      await api.createTrainingSession({
        type: suggestion.sessionType || 'mixed',
        title: suggestion.title,
        date: new Date().toISOString().split('T')[0],
        status: 'planned',
        location: params.location,
        equipment: params.equipment,
        duration: params.time,
        exercises: suggestion.workout,
        notes: `Generated suggestion. Focus: ${params.focus}${venueName ? `. Venue: ${venueName}` : ''}`,
      })
      alert('Session saved to Training Log!')
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Suggest Training
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Get a personalised training session based on your context and goals.
        </p>
      </div>

      {objectives.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Target className="h-3 w-3 text-primary" /> Upcoming Goals Considered
            </p>
            <div className="flex gap-2 flex-wrap">
              {objectives.map(obj => (
                <Badge key={obj.id} variant="outline" className="text-xs">
                  {obj.name} — {new Date(obj.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parameters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Training Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Where are you training?</Label>
              <Select value={locationSelectValue} onValueChange={handleLocationChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {venues.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        My Venues
                      </div>
                      {venues.map(v => (
                        <SelectItem key={v.id} value={`venue:${v.id}`}>
                          {v.name}
                        </SelectItem>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Generic
                      </div>
                    </>
                  )}
                  {STATIC_LOCATIONS.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {params.venueId && (
                <p className="text-xs text-primary">
                  Equipment auto-set from venue profile.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Dumbbell className="h-3 w-3" /> Equipment</Label>
              <Select value={params.equipment} onValueChange={v => set('equipment', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EQUIPMENT.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Target className="h-3 w-3" /> Focus</Label>
              <Select value={params.focus} onValueChange={v => set('focus', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FOCUSES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Time Available</Label>
              <Select value={params.time} onValueChange={v => set('time', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating suggestion…</>
            ) : (
              <><Zap className="h-4 w-4 mr-2" /> Generate Training Session</>
            )}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Suggestion result */}
      {suggestion && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                {suggestion.title || 'Training Session'}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-xs capitalize">
                  {FOCUSES.find(f => f.value === params.focus)?.label}
                </Badge>
                <Badge variant="outline" className="text-xs">{params.time} min</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Workout</p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-line">{suggestion.workout}</div>
            </div>

            {suggestion.coachNote && (
              <>
                <Separator />
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">Coach Note</p>
                  <p className="text-sm">{suggestion.coachNote}</p>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
              </Button>
              <Button size="sm" onClick={handleLogSession}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Save to Training Log
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
