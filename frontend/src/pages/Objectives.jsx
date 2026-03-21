import { useEffect, useState } from 'react';
import { objectivesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDate, daysUntil, OBJECTIVE_TYPES, PRIORITY_CONFIG } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Target, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import ObjectiveForm from '@/components/forms/ObjectiveForm';

const STATION_LABELS = {
  run: 'Run', skiErg: 'SkiErg', sledPush: 'Sled Push', sledPull: 'Sled Pull',
  burpeeBroadJump: 'Burpee BJ', rowErg: 'Row Erg', farmersCarry: 'Farmers Carry',
  walkingLunges: 'Lunges', wallBall: 'Wall Ball',
  // running objective focus areas
  speed: 'Speed Work', endurance: 'Endurance', threshold: 'Threshold', strength: 'Strength',
};

function focusColor(score) {
  if (score >= 7) return 'bg-red-500';
  if (score >= 4) return 'bg-yellow-400';
  return 'bg-green-500';
}

function scoreColor(score) {
  if (score >= 7) return 'text-green-400';
  if (score >= 4) return 'text-yellow-400';
  return 'text-red-400';
}

export default function Objectives() {
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await objectivesApi.list();
      setObjectives(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load objectives', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this objective?')) return;
    try {
      await objectivesApi.delete(id);
      setObjectives(prev => prev.filter(o => o.id !== id));
      toast({ title: 'Deleted', description: 'Objective removed.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  }

  async function handleAnalyze(id) {
    setAnalyzingId(id);
    try {
      const { readiness } = await objectivesApi.readiness(id);
      setObjectives(prev => prev.map(o => o.id === id ? { ...o, readiness } : o));
      toast({ title: 'Analysis complete!' });
    } catch {
      toast({ title: 'Error', description: 'Could not generate analysis.', variant: 'destructive' });
    } finally {
      setAnalyzingId(null);
    }
  }

  function handleSaved(obj) {
    setObjectives(prev => {
      const exists = prev.find(o => o.id === obj.id);
      return exists ? prev.map(o => o.id === obj.id ? obj : o) : [obj, ...prev];
    });
    setShowForm(false);
    setEditing(null);
    toast({ title: 'Saved!', description: `${obj.name} has been saved.` });
    // auto-generate readiness after save
    handleAnalyze(obj.id);
  }

  const upcoming = objectives.filter(o => new Date(o.date) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = objectives.filter(o => new Date(o.date) < new Date()).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Objectives</h1>
          <p className="text-muted-foreground text-sm">{objectives.length} total goals</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Objective
        </Button>
      </div>

      {objectives.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No objectives yet. Set your first race goal!</p>
            <Button onClick={() => setShowForm(true)}>Add Your First Objective</Button>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</h2>
          {upcoming.map(obj => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              onEdit={() => setEditing(obj)}
              onDelete={() => handleDelete(obj.id)}
              onAnalyze={() => handleAnalyze(obj.id)}
              analyzing={analyzingId === obj.id}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Past</h2>
          {past.map(obj => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              onEdit={() => setEditing(obj)}
              onDelete={() => handleDelete(obj.id)}
              onAnalyze={() => handleAnalyze(obj.id)}
              analyzing={analyzingId === obj.id}
              past
            />
          ))}
        </div>
      )}

      {(showForm || editing) && (
        <ObjectiveForm
          objective={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function ObjectiveCard({ obj, onEdit, onDelete, onAnalyze, analyzing, past }) {
  const priority = PRIORITY_CONFIG[obj.priority] || PRIORITY_CONFIG.C;
  const typeLabel = OBJECTIVE_TYPES.find(t => t.value === obj.type)?.label || obj.type;
  const days = daysUntil(obj.date);
  const [expanded, setExpanded] = useState(false);
  const readiness = obj.readiness;

  return (
    <Card className={past ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <span className={`text-xs font-bold px-2 py-1 rounded-md border ${priority.color} shrink-0`}>
            {obj.priority}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{obj.name}</h3>
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
              {obj.hyroxDivision && (
                <Badge variant="outline" className="text-xs capitalize">{obj.hyroxDivision.replace('_', ' ')}</Badge>
              )}
              {obj.targetTime && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" /> {obj.targetTime}
                </Badge>
              )}
              {/* Readiness score badge */}
              {readiness?.score != null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  readiness.score >= 7 ? 'text-green-400 border-green-400/30 bg-green-400/10' :
                  readiness.score >= 4 ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' :
                  'text-red-400 border-red-400/30 bg-red-400/10'
                }`}>
                  Readiness {readiness.score}/10
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">{formatDate(obj.date)}</span>
              {!past && days !== null && (
                <span className={`text-sm font-medium ${days <= 30 ? 'text-orange-400' : days <= 90 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                  {days === 0 ? '🏁 Today!' : days > 0 ? `${days} days to go` : 'Past'}
                </span>
              )}
            </div>

            {obj.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{obj.notes}</p>}

            {/* Readiness summary + expand toggle */}
            {readiness && (
              <div className="mt-2">
                {readiness.summary && (
                  <p className="text-xs text-muted-foreground">{readiness.summary}</p>
                )}
                {readiness.focusAreas?.length > 0 && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                  >
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expanded ? 'Hide focus areas' : 'Show focus areas'}
                  </button>
                )}
                {expanded && readiness.focusAreas?.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {readiness.focusAreas.map(area => (
                      <div key={area.key} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{STATION_LABELS[area.key] || area.label}</span>
                          <span className={`font-bold ${area.score >= 7 ? 'text-red-400' : area.score >= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {area.score}/10
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${focusColor(area.score)}`}
                            style={{ width: `${area.score * 10}%` }}
                          />
                        </div>
                        {area.note && <p className="text-xs text-muted-foreground">{area.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 shrink-0 items-end">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAnalyze}
              disabled={analyzing}
              className="gap-1 text-xs h-7 px-2 text-muted-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${analyzing ? 'animate-spin' : ''}`} />
              {analyzing ? 'Analysing…' : readiness ? 'Refresh' : 'Analyse'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
