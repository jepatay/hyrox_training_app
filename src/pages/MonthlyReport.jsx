import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { BarChart3, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Activity, Dumbbell, MessageSquare, Loader2 } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TYPE_LABELS = {
  running: 'Running', hyrox_training: 'Hyrox', gym_strength: 'Strength',
  crossfit_class: 'CrossFit', recovery: 'Recovery',
}
const PIE_COLORS = ['hsl(25,95%,55%)', 'hsl(45,90%,55%)', 'hsl(200,80%,55%)', 'hsl(150,60%,50%)', 'hsl(260,60%,60%)']

function CustomTooltip({ active, payload, label }) {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p, i) => <p key={i} style={{ color: p.color || p.fill }}>{p.name}: {p.value}</p>)}
      </div>
    )
  }
  return null
}

export default function MonthlyReport() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.getMonthlyReport(year, month)
      setReport(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Monthly Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Training analysis and coaching recommendations</p>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[120px] text-center font-semibold">{MONTHS[month-1]} {year}</div>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={isCurrentMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Generating report…</span>
        </div>
      )}

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="py-8 text-center text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {report && !loading && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold text-primary">{report.totalSessions}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold">{report.totalDistance?.toFixed(1) || 0}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">KM Running</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold">{report.hyroxSessions}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Hyrox Sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold">{report.avgRpe?.toFixed(1) || '–'}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Avg RPE</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Weekly sessions bar */}
            {report.weeklyBreakdown && report.weeklyBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Weekly Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={report.weeklyBreakdown} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,20%)" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(215,20%,55%)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(215,20%,55%)' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="sessions" name="Sessions" fill="hsl(25,95%,55%)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Session type pie */}
            {report.typeBreakdown && report.typeBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Session Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={report.typeBreakdown.map(t => ({ name: TYPE_LABELS[t.type] || t.type, value: t.count }))}
                        cx="50%" cy="50%" outerRadius={65}
                        dataKey="value"
                      >
                        {report.typeBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Hyrox exercises */}
          {report.hyroxExercises && Object.keys(report.hyroxExercises).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Hyrox Exercises This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(report.hyroxExercises).map(([ex, count]) => (
                    <div key={ex} className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold">{count}×</p>
                      <p className="text-xs text-muted-foreground capitalize">{ex.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strengths & Weaknesses */}
          {(report.strengths?.length > 0 || report.weaknesses?.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {report.strengths?.length > 0 && (
                <Card className="border-emerald-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                      <TrendingUp className="h-4 w-4" /> Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-emerald-400 mt-0.5">•</span> {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {report.weaknesses?.length > 0 && (
                <Card className="border-amber-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                      <TrendingDown className="h-4 w-4" /> Areas to Improve
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-amber-400 mt-0.5">•</span> {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Coaching Recommendation */}
          {report.recommendation && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <MessageSquare className="h-4 w-4" /> Coaching Recommendation for Next Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-line">{report.recommendation}</p>
              </CardContent>
            </Card>
          )}

          {report.totalSessions === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No training sessions logged for {MONTHS[month-1]} {year}.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
