import { useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { SESSION_TYPES, formatDuration } from '@/lib/utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthlyReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, [month, year]);

  async function load() {
    setLoading(true);
    try {
      const data = await reportsApi.monthly(month, year);
      setReport(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to generate report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Pie chart colors
  const pieColors = SESSION_TYPES.map(t => t.color);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Monthly Report
          </h1>
          <p className="text-muted-foreground text-sm">AI-generated training analysis</p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-32 text-center">{MONTHS[month - 1]} {year}</span>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ChevronRight className="h-4 w-4" />
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
            <p className="text-muted-foreground">No sessions logged in {MONTHS[month - 1]} {year}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Sessions" value={report.stats.totalSessions} />
            <StatCard label="Running Distance" value={`${report.stats.totalDistance} km`} />
            <StatCard label="Total Training Time" value={formatDuration(report.stats.totalDuration)} />
            <StatCard label="Average RPE" value={report.stats.avgRpe || '—'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly breakdown */}
            {report.weeklyData?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Weekly Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={report.weeklyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8 }} />
                      <Bar dataKey="sessions" fill="#f97316" radius={[4, 4, 0, 0]} />
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

          {/* Feeling breakdown */}
          {Object.keys(report.stats.feelingBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">How Sessions Felt</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  {Object.entries(report.stats.feelingBreakdown).map(([feeling, count]) => (
                    <div key={feeling} className="flex items-center gap-2">
                      <span>{feeling === 'easy' ? '😌' : feeling === 'normal' ? '😊' : '😤'}</span>
                      <span className="text-sm capitalize text-muted-foreground">{feeling}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Report */}
          {report.aiReport && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Coaching Report — {MONTHS[month - 1]} {year}
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

function StatCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
