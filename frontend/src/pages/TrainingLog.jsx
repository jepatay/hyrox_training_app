import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sessionsApi, coachingApi, stravaApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDuration, getSessionTypeConfig, SESSION_TYPES } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Sparkles, ChevronDown, ChevronUp, Dumbbell, RefreshCw, Link2, Link2Off } from 'lucide-react';
import SessionForm from '@/components/forms/SessionForm';
import { parseMarkdown } from '@/lib/utils';

export default function TrainingLog() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [stravaStatus, setStravaStatus] = useState(null); // null=loading, { connected, athlete }
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { load(); }, [typeFilter, statusFilter]);

  useEffect(() => {
    stravaApi.getStatus().then(status => {
      setStravaStatus(status);
      if (status.connected) {
        const lastSync = status.lastSync ? new Date(status.lastSync) : null;
        const hoursSince = lastSync ? (Date.now() - lastSync.getTime()) / 36e5 : Infinity;
        if (hoursSince > 24) {
          stravaApi.sync().then(({ imported }) => {
            if (imported > 0) load();
          }).catch(() => {});
        }
      }
    }).catch(() => setStravaStatus({ connected: false }));
  }, []);

  // Handle ?strava= param after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const stravaParam = params.get('strava');
    if (stravaParam === 'connected') {
      toast({ title: 'Strava connected!', description: 'You can now sync your activities.' });
      setStravaStatus(prev => ({ ...prev, connected: true }));
      navigate('/training', { replace: true });
    } else if (stravaParam === 'error') {
      toast({ title: 'Strava connection failed', variant: 'destructive' });
      navigate('/training', { replace: true });
    }
  }, [location.search]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const data = await sessionsApi.list(params);
      setSessions(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load sessions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this session?')) return;
    try {
      await sessionsApi.delete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  }

  async function handleGetFeedback(session) {
    try {
      toast({ title: 'Generating...', description: 'AI is analyzing your training.' });
      const { feedback } = await coachingApi.generateFeedback(session.id);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, coachingFeedback: feedback } : s));
      setExpanded(session.id);
      toast({ title: 'Coaching feedback ready!' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate feedback', variant: 'destructive' });
    }
  }

  function handleSaved(session) {
    setSessions(prev => {
      const exists = prev.find(s => s.id === session.id);
      return exists ? prev.map(s => s.id === session.id ? session : s) : [session, ...prev];
    });
    setShowForm(false);
    setEditing(null);
    if (session.coachingFeedback) setExpanded(session.id);
    toast({ title: 'Saved!', description: 'Session logged successfully.' });
  }

  async function handleStravaConnect() {
    try {
      const { url } = await stravaApi.getAuthUrl();
      window.location.href = url;
    } catch {
      toast({ title: 'Error', description: 'Could not reach Strava', variant: 'destructive' });
    }
  }

  async function handleStravaSync() {
    setSyncing(true);
    try {
      const { imported, total } = await stravaApi.sync();
      toast({
        title: `Synced ${imported} new ${imported === 1 ? 'activity' : 'activities'}`,
        description: `${total - imported} already imported.`,
      });
      if (imported > 0) load();
    } catch (err) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleStravaDisconnect() {
    if (!confirm('Disconnect Strava? Your synced sessions will remain.')) return;
    try {
      await stravaApi.disconnect();
      setStravaStatus({ connected: false });
      toast({ title: 'Strava disconnected' });
    } catch {
      toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training Log</h1>
          <p className="text-muted-foreground text-sm">{sessions.length} sessions</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Log Session
        </Button>
      </div>

      {/* Strava banner */}
      {stravaStatus && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-orange-500 font-bold text-sm tracking-wide">STRAVA</span>
                {stravaStatus.connected ? (
                  <span className="text-xs text-muted-foreground">
                    Connected{stravaStatus.athlete ? ` · ${stravaStatus.athlete.name}` : ''}
                    {stravaStatus.lastSync ? ` · synced ${new Date(stravaStatus.lastSync).toLocaleDateString()}` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not connected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {stravaStatus.connected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                      onClick={handleStravaSync}
                      disabled={syncing}
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync activities'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-muted-foreground"
                      onClick={handleStravaDisconnect}
                    >
                      <Link2Off className="h-3 w-3" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={handleStravaConnect}
                  >
                    <Link2 className="h-3 w-3" /> Connect Strava
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter || 'all'} onValueChange={v => setTypeFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SESSION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No sessions found. Start logging your training!</p>
            <Button onClick={() => setShowForm(true)}>Log First Session</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const typeConfig = getSessionTypeConfig(session.type);
            const isExpanded = expanded === session.id;
            return (
              <Card key={session.id}>
                <CardContent className="p-0">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors rounded-t-xl"
                    onClick={() => setExpanded(isExpanded ? null : session.id)}
                  >
                    <span className="text-2xl">{typeConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{session.stravaActivityName || typeConfig.label}</span>
                        {session.status === 'planned' && <Badge variant="outline" className="text-xs">Planned</Badge>}
                        {session.syncedFromStrava && (
                          <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-400 gap-1">
                            <span className="font-bold">S</span> Strava
                          </Badge>
                        )}
                        {session.coachingFeedback && (
                          <Badge className="text-xs gap-1"><Sparkles className="h-3 w-3" /> Feedback</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatDate(session.date)}</span>
                        {session.duration && <span className="text-xs text-muted-foreground">{formatDuration(session.duration)}</span>}
                        {session.runningDistance && <span className="text-xs text-muted-foreground">{session.runningDistance} km</span>}
                        {session.rpe && <span className="text-xs font-medium text-orange-400">RPE {session.rpe}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {session.status === 'completed' && !session.coachingFeedback && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); handleGetFeedback(session); }}
                          className="gap-1 text-xs"
                        >
                          <Sparkles className="h-3 w-3" /> Feedback
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setEditing(session); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDelete(session.id); }} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-3">
                      {session.notes && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">Notes</p>
                          <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
                        </div>
                      )}
                      {session.location && (
                        <p className="text-xs text-muted-foreground">
                          📍 {session.location.replace('_', ' ')}
                          {session.equipment && ` · ${session.equipment.replace('_', ' ')}`}
                        </p>
                      )}
                      {session.coachingFeedback && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium text-primary">Coaching Feedback</span>
                          </div>
                          <p className="text-sm leading-relaxed">{session.coachingFeedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(showForm || editing) && (
        <SessionForm
          session={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
