import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatDate, daysUntil, formatTime } from '@/lib/utils'
import {
  Zap, Target, Dumbbell, Trophy, Plus, Calendar, TrendingUp,
  Clock, MapPin, Activity, ChevronRight, Flame
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const TYPE_COLORS = {
  running: 'info',
  hyrox_training: 'warning',
  gym_strength: 'secondary',
  crossfit_class: 'success',
  recovery: 'outline',
}

const TYPE_LABELS = {
  running: 'Running',
  hyrox_training: 'Hyrox',
  gym_strength: 'Strength',
  crossfit_class: 'CrossFit',
  recovery: 'Recovery',
}

const PRIORITY_COLORS = {
  'A goal': 'default',
  'B goal': 'warning',
  'C goal': 'secondary',
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-primary/10 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [objectives, setObjectives] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getTrainingSessions(), api.getObjectives(), api.getRecords()])
      .then(([s, o, r]) => {
        setSessions(s || [])
        setObjectives(o || [])
        setRecords(r || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const recentSessions = sessions
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)

  const upcomingObjectives = objectives
    .filter(o => daysUntil(o.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3)

  // Weekly load chart (last 8 weeks)
  const weeklyData = (() => {
    const now = new Date()
    const weeks = []
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now)
      start.setDate(start.getDate() - (i * 7 + 6))
      const end = new Date(now)
      end.setDate(end.getDate() - i * 7)
      const label = `W${8 - i}`
      const wSessions = sessions.filter(s => {
        const d = new Date(s.date)
        return d >= start && d <= end && s.status === 'completed'
      })
      weeks.push({
        week: label,
        sessions: wSessions.length,
        running: wSessions.filter(s => s.type === 'running').reduce((a, s) => a + (s.distance || 0), 0),
      })
    }
    return weeks
  })()

  const thisMonthSessions = sessions.filter(s => {
    const d = new Date(s.date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && s.status === 'completed'
  })

  const totalKm = thisMonthSessions
    .filter(s => s.type === 'running')
    .reduce((a, s) => a + (s.distance || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading dashboard…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/suggest')} variant="outline" size="sm">
            <Zap className="h-4 w-4 mr-2" />
            Suggest Training
          </Button>
          <Button onClick={() => navigate('/training')} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Log Session
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Sessions this month" value={thisMonthSessions.length} sub="completed" />
        <StatCard icon={TrendingUp} label="KM this month" value={`${totalKm.toFixed(1)} km`} sub="running" />
        <StatCard icon={Target} label="Active Objectives" value={upcomingObjectives.length} sub="upcoming races" />
        <StatCard icon={Trophy} label="Personal Records" value={records.length} sub="logged results" />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Training load chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Training Load (Last 8 Weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(25,95%,55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(25,95%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,20%)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(215,20%,55%)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(215,20%,55%)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="sessions" name="Sessions"
                  stroke="hsl(25,95%,55%)" fill="url(#sessGrad)" strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Upcoming Objectives */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Upcoming Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingObjectives.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm">No upcoming objectives</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/objectives')}>
                  Add an objective
                </Button>
              </div>
            ) : (
              upcomingObjectives.map(obj => {
                const days = daysUntil(obj.date)
                return (
                  <div key={obj.id} className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{obj.name}</p>
                      <Badge variant={PRIORITY_COLORS[obj.priority] || 'secondary'} className="flex-shrink-0 text-[10px]">
                        {obj.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(obj.date)}
                      </span>
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <Flame className="h-3 w-3" />
                        {days === 0 ? 'Today!' : `${days}d`}
                      </span>
                    </div>
                    {obj.targetTime && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Target: {obj.targetTime}
                      </p>
                    )}
                  </div>
                )
              })
            )}
            <Link to="/objectives" className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors pt-1">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" />
              Recent Sessions
            </CardTitle>
            <Link to="/training">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sessions logged yet.{' '}
              <button onClick={() => navigate('/training')} className="text-primary hover:underline">
                Log your first session
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentSessions.map(session => (
                <div key={session.id} className="flex items-center gap-4 py-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{session.title || TYPE_LABELS[session.type] || session.type}</p>
                      <Badge variant={TYPE_COLORS[session.type] || 'secondary'} className="text-[10px]">
                        {TYPE_LABELS[session.type] || session.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.date)}
                      </span>
                      {session.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {session.duration} min
                        </span>
                      )}
                      {session.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </span>
                      )}
                    </div>
                  </div>
                  {session.rpe && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">RPE</p>
                      <p className="text-sm font-bold text-primary">{session.rpe}/10</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
