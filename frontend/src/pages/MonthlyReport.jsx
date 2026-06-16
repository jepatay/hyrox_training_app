import { useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { SESSION_TYPES, formatDuration } from '@/lib/utils';

function formatDateRange(endDate) {
  const end = new Date(endDate + 'T00:00:00Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} → ${fmt(end)}`;
}

export default function MonthlyReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, [endDate]);

  async function load() {
    setLoading(true);
    setReport(null);
    try {
      const data = await reportsApi.monthly(null, null, endDate);
      setReport(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to generate report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function prevWindow() {
    const d = new Date(endDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 30);
    setEndDate(d.toISOString().slice(0, 10));
  }
  function nextWindow() {
    const d = new Date(endDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 30);
    const next = d.toISOString().slice(0, 10);
    if (next <= today) setEndDate(next);
  }

  const isLatest = endDate >= today;
  const pieColors = SESSION_TYPES.map(t => t.color);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            30-Day Training Review
          </h1>
          <p className="text-muted-foreground text-sm">Objective-driven analysis of the last 30 days</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWindow}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs font-medium min-w-52 text-center text-muted-foreground">
            {formatDateRange(endDate)}
          </span>
          <Button variant="outline" size="icon" onClick={nextWindow} disabled={isLatest}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isLatest && (
            <Button variant="outline" size="sm" onClick={() => setEndDate(today)} className="text-xs">
              Latest
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Analysing training data...</p>
        </div>
      ) : !report ? null : report.stats.totalSessions === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No sessions logged in this 30-day window.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Sessions" value={report.stats.totalSessions} />
            <StatCard label="Running" value={`${report.stats.totalDistance} km`} />
            <StatCard label="Training Time" value={formatDuration(report.stats.totalDuration)} />
            <StatCard label="Avg RPE" value={report.stats.avgRpe || '—'} />
            <StatCard
              label="Total Load"
              value={report.stats.totalLoad || '—'}
              sub={report.stats.totalLoad >= 2000 ? '⚠ High' : report.stats.totalLoad >= 1200 ? 'Peak range' : report.stats.totalLoad >= 800 ? 'Optimal' : 'Low'}
              loadColor={report.stats.totalLoad >= 2000 ? 'text-amber-400' : report.stats.totalLoad >= 1200 ? 'text-blue-400' : report.stats.totalLoad >= 800 ? 'text-green-400' : 'text-muted-foreground'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly load */}
            {report.weeklyData?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Weekly Load</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={report.weeklyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8 }}
                        formatter={(v, name) => [v, name === 'load' ? 'Session Load' : name === 'sessions' ? 'Sessions' : name]}
                      />
                      <Bar dataKey="load" fill="#f97316" radius={[4, 4, 0, 0]} name="Session Load" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Session type breakdown */}
            {Object.keys(report.stats.typeBreakdown).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Session Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={Object.entries(report.stats.typeBreakdown).map(([type, count]) => ({
                          name: SESSION_TYPES.find(t => t.value === type)?.label || type,
                          value: count,
                          color: SESSION_TYPES.find(t => t.value === type)?.color || '#6b7280',
                        }))}
                        cx="50%" cy="50%"
                        outerRadius={60}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {Object.entries(report.stats.typeBreakdown).map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Report */}
          {report.aiReport && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Coaching Review — {formatDateRange(endDate)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="ai-content text-sm leading-relaxed whitespace-pre-wrap">
                  {report.aiReport}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, loadColor }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold ${loadColor || ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
