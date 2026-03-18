import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { objectivesApi, sessionsApi } from '@/lib/api';
import { formatDate, daysUntil, formatDuration, getSessionTypeConfig, PRIORITY_CONFIG } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Plus, Zap, Target, Calendar, Clock, TrendingUp, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import SessionForm from '@/components/forms/SessionForm';

export default function Dashboard() {
  const [objectives, setObjectives] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      objectivesApi.list(),
      sessionsApi.list({ limit: 20 }),
    ]).then(([objs, sess]) => {
      setObjectives(objs);
      setSessions(sess);
    }).catch(() => {
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    }).finally(() => setLoading(false));
  }, []);

  // Stats
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const weeklySessions = sessions.filter(s => new Date(s.date) >= weekAgo);
  const monthlySessions = sessions.filter(s => new Date(s.date) >= monthAgo);
  const weeklyDistance = weeklySessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);

  // Training load chart (last 8 weeks)
  const loadData = buildWeeklyLoad(sessions);

  // Upcoming objectives sorted by date
  const upcomingObjs = objectives
    .filter(o => new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/suggest')} variant="outline" className="gap-2">
            <Zap className="h-4 w-4" /> Suggest Training Today
          </Button>
          <Button onClick={() => setShowLogForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Log Training
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="This Week" value={`${weeklySessions.length} sessions`} sub={`${weeklyDistance.toFixed(1)} km`} />
        <StatCard icon={TrendingUp} label="This Month" value={`${monthlySessions.length} sessions`} sub={`${monthlySessions.reduce((s, x) => s + (x.runningDistance || 0), 0).toFixed(1)} km`} />
        <StatCard icon={Target} label="Objectives" value={`${objectives.length} total`} sub={`${upcomingObjs.length} upcoming`} />
        <StatCard icon={Clock} label="Avg Duration" value={weeklySessions.length ? `${Math.round(weeklySessions.reduce((s, x) => s + (x.duration || 0), 0) / weeklySessions.length)} min` : '—'} sub="this week" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Training load chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Training Load (Last 8 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No training data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={loadData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    itemStyle={{ color: '#f97316' }}
                  />
                  <Bar dataKey="sessions" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Objectives */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Upcoming Objectives</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/objectives')}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingObjs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm mb-3">No objectives set</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/objectives')}>
                  Add Objective
                </Button>
              </div>
            ) : upcomingObjs.map(obj => {
              const days = daysUntil(obj.date);
              const priority = PRIORITY_CONFIG[obj.priority] || PRIORITY_CONFIG.C;
              return (
                <div key={obj.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${priority.color}`}>
                    {obj.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{obj.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(obj.date)}
                      {days !== null && (
                        <span className={`ml-2 font-medium ${days <= 30 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                          {days === 0 ? 'Today!' : days > 0 ? `${days}d` : 'Past'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recent Training</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/training')}>View all</Button>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No sessions logged yet. Start training!</p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map(session => {
                const typeConfig = getSessionTypeConfig(session.type);
                return (
                  <div key={session.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <span className="text-xl">{typeConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{typeConfig.label}</p>
                        {session.status === 'planned' && (
                          <Badge variant="outline" className="text-xs">Planned</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.date)}
                        {session.duration && ` · ${formatDuration(session.duration)}`}
                        {session.runningDistance && ` · ${session.runningDistance} km`}
                      </p>
                    </div>
                    <div className="text-right">
                      {session.rpe && (
                        <p className="text-sm font-medium">RPE {session.rpe}</p>
                      )}
                      {session.feeling && (
                        <p className="text-xs text-muted-foreground capitalize">{session.feeling}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Log Modal */}
      {showLogForm && (
        <SessionForm
          onClose={() => setShowLogForm(false)}
          onSaved={(session) => {
            setSessions(prev => [session, ...prev]);
            setShowLogForm(false);
            toast({ title: 'Session logged!', description: 'Your training has been saved.' });
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildWeeklyLoad(sessions) {
  const weeks = {};
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `W${d.getMonth() + 1}/${d.getDate()}`;
    weeks[key] = { week: key, sessions: 0, distance: 0 };
  }
  sessions.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date);
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24 * 7));
    if (diff >= 0 && diff <= 7) {
      const key = Object.keys(weeks)[7 - diff];
      if (key && weeks[key]) {
        weeks[key].sessions++;
        weeks[key].distance += s.runningDistance || 0;
      }
    }
  });
  return Object.values(weeks);
}
