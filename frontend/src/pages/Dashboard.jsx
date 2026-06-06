import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { objectivesApi, sessionsApi } from '@/lib/api';
import { formatDate, daysUntil, formatDuration, getSessionTypeConfig, PRIORITY_CONFIG } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Plus, Zap, Target, Clock, TrendingUp, Activity, MapPin } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import SessionForm from '@/components/forms/SessionForm';

// Collapse legacy run1–run8 spokes into a single "Running" entry
function normalizeRadarData(radarData) {
  if (!radarData?.length) return radarData;
  const runs = radarData.filter(d => /^run\d+$/.test(d.key));
  if (runs.length === 0) return radarData;
  const avgRun = Math.round(runs.reduce((s, r) => s + r.readiness, 0) / runs.length);
  const rest = radarData.filter(d => !/^run\d+$/.test(d.key));
  const overallIdx = rest.findIndex(d => d.key === 'overall');
  const result = [...rest];
  result.splice(overallIdx + 1, 0, { key: 'running', label: 'Running', readiness: avgRun });
  return result;
}

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
      sessionsApi.list({ limit: 150 }),
    ]).then(([objs, sess]) => {
      setObjectives(objs);
      setSessions(sess);
    }).catch(() => {
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    }).finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const weeklySessions = sessions.filter(s => new Date(s.date) >= weekAgo && s.status !== 'planned');
  const monthlySessions = sessions.filter(s => new Date(s.date) >= monthAgo && s.status !== 'planned');
  const weeklyRunKm = weeklySessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
  const avgDuration = weeklySessions.length
    ? Math.round(weeklySessions.reduce((s, x) => s + (x.duration || 0), 0) / weeklySessions.length)
    : null;
  const weeklyLoad = weeklySessions.reduce((sum, s) => {
    return sum + (s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : 0));
  }, 0);

  const loadData = buildWeeklyLoad(sessions);

  const upcomingObjs = objectives
    .filter(o => new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);

  // HYROX radar: nearest upcoming HYROX objective with readiness data
  const hyroxObj = objectives
    .filter(o => o.type === 'hyrox' && o.readiness?.radarData?.length > 0 && new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const hyroxRadarData = hyroxObj ? normalizeRadarData(hyroxObj.readiness.radarData) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-xs">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/suggest')} variant="outline" size="sm" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Suggest Training
          </Button>
          <Button onClick={() => setShowLogForm(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Log Training
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Activity}    label="This Week"    value={`${weeklySessions.length} sessions`} />
        <StatCard icon={MapPin}      label="Weekly Run"   value={`${weeklyRunKm.toFixed(1)} km`} />
        <StatCard icon={TrendingUp}  label="This Month"   value={`${monthlySessions.length} sessions`} />
        <StatCard icon={Target}      label="Objectives"   value={`${objectives.length} total`} sub={`${upcomingObjs.length} upcoming`} />
        <WeeklyLoadCard load={weeklyLoad} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Training load chart — stacked by RPE intensity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session Load — Last 8 Weeks</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadData.every(w => w.easy + w.moderate + w.hard + w.noRpe === 0) ? (
              <p className="text-muted-foreground text-sm text-center py-8">No training data yet</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={loadData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(v, name) => [v, name]}
                    />
                    <Bar dataKey="easy"     stackId="a" fill="#22c55e" name="Easy (RPE ≤6)"   />
                    <Bar dataKey="moderate" stackId="a" fill="#eab308" name="Moderate (RPE 7-8)" />
                    <Bar dataKey="hard"     stackId="a" fill="#ef4444" name="Hard (RPE 9-10)"  />
                    <Bar dataKey="noRpe"    stackId="a" fill="#374151" name="No RPE"           />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-1 justify-center">
                  {[['#22c55e','Easy ≤6'],['#eab308','Mod 7-8'],['#ef4444','Hard 9-10'],['#374151','No RPE']].map(([color, label]) => (
                    <span key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Objectives */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Upcoming Objectives</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/objectives')}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingObjs.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm mb-2">No objectives set</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/objectives')}>Add Objective</Button>
              </div>
            ) : upcomingObjs.map(obj => {
              const days = daysUntil(obj.date);
              const priority = PRIORITY_CONFIG[obj.priority] || PRIORITY_CONFIG.C;
              return (
                <div key={obj.id} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/50">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border shrink-0 ${priority.color}`}>
                    {obj.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{obj.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(obj.date)}
                      {days !== null && (
                        <span className={`ml-1.5 font-medium ${days <= 30 ? 'text-orange-400' : 'text-muted-foreground'}`}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Sessions */}
        <Card className={hyroxRadarData ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Recent Training</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/training')}>View all</Button>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">No sessions logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sessions.slice(0, 5).map(session => {
                  const typeConfig = getSessionTypeConfig(session.type);
                  return (
                    <div key={session.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                      <span className="text-lg">{typeConfig.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium">{typeConfig.label}</p>
                          {session.status === 'planned' && <Badge variant="outline" className="text-xs py-0">Planned</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(session.date)}
                          {session.duration && ` · ${formatDuration(session.duration)}`}
                          {session.runningDistance && ` · ${session.runningDistance} km`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {session.weightVest && (
                          <span className="text-xs text-orange-400">🦺</span>
                        )}
                        {session.rpe != null && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            session.rpe >= 9 ? 'text-red-400 bg-red-400/10' :
                            session.rpe >= 7 ? 'text-yellow-400 bg-yellow-400/10' :
                            'text-green-400 bg-green-400/10'
                          }`}>RPE {session.rpe}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HYROX Readiness Radar */}
        {hyroxRadarData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">HYROX Readiness</CardTitle>
              <p className="text-xs text-muted-foreground truncate">{hyroxObj.name}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={hyroxRadarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                  <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar dataKey="readiness" stroke="#f97316" fill="#f97316" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip
                    formatter={(v) => [`${v}/10`, 'Readiness']}
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 11 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-xs text-center text-muted-foreground">
                Overall: <span className="font-bold text-primary">{hyroxObj.readiness.score}/10</span>
                <Button variant="link" size="sm" className="text-xs h-auto p-0 ml-2" onClick={() => navigate('/objectives')}>
                  Full analysis →
                </Button>
              </p>
            </CardContent>
          </Card>
        )}
      </div>

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
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-primary/10 rounded-md shrink-0">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
            <p className="text-sm font-bold leading-none">{value}</p>
            {sub && <p className="text-xs text-muted-foreground leading-none mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyLoadCard({ load }) {
  const { color, label } = load >= 2000
    ? { color: 'text-amber-400', label: 'High — monitor recovery' }
    : load >= 1200
    ? { color: 'text-blue-400', label: 'Peak prep range' }
    : load >= 800
    ? { color: 'text-green-400', label: 'Optimal base' }
    : { color: 'text-muted-foreground', label: load > 0 ? 'Low load' : 'No load data' };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-primary/10 rounded-md shrink-0">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none mb-0.5">Weekly Load</p>
            <p className={`text-sm font-bold leading-none ${color}`}>{load > 0 ? load : '—'}</p>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">{label}</p>
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
    weeks[key] = { week: key, easy: 0, moderate: 0, hard: 0, noRpe: 0 };
  }
  sessions.forEach(s => {
    if (!s.date || s.status === 'planned') return;
    const d = new Date(s.date);
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks >= 0 && diffWeeks <= 7) {
      const key = Object.keys(weeks)[7 - diffWeeks];
      if (key && weeks[key]) {
        const rpe = s.rpe;
        const load = s.sessionLoad || (rpe && s.duration ? Math.round(rpe * s.duration) : null);
        if (!rpe)         weeks[key].noRpe += s.duration || 30;
        else if (rpe <= 6) weeks[key].easy += load || s.duration || 0;
        else if (rpe <= 8) weeks[key].moderate += load || s.duration || 0;
        else               weeks[key].hard += load || s.duration || 0;
      }
    }
  });
  return Object.values(weeks);
}
