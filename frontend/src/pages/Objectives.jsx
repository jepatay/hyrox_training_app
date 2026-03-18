import { useEffect, useState } from 'react';
import { objectivesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDate, daysUntil, OBJECTIVE_TYPES, PRIORITY_CONFIG } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Target, Clock } from 'lucide-react';
import ObjectiveForm from '@/components/forms/ObjectiveForm';

export default function Objectives() {
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
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

  function handleSaved(obj) {
    setObjectives(prev => {
      const exists = prev.find(o => o.id === obj.id);
      return exists ? prev.map(o => o.id === obj.id ? obj : o) : [obj, ...prev];
    });
    setShowForm(false);
    setEditing(null);
    toast({ title: 'Saved!', description: `${obj.name} has been saved.` });
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
          {upcoming.map(obj => <ObjectiveCard key={obj.id} obj={obj} onEdit={() => setEditing(obj)} onDelete={() => handleDelete(obj.id)} />)}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Past</h2>
          {past.map(obj => <ObjectiveCard key={obj.id} obj={obj} onEdit={() => setEditing(obj)} onDelete={() => handleDelete(obj.id)} past />)}
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

function ObjectiveCard({ obj, onEdit, onDelete, past }) {
  const priority = PRIORITY_CONFIG[obj.priority] || PRIORITY_CONFIG.C;
  const typeLabel = OBJECTIVE_TYPES.find(t => t.value === obj.type)?.label || obj.type;
  const days = daysUntil(obj.date);

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
              {obj.targetTime && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" /> {obj.targetTime}
                </Badge>
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
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
