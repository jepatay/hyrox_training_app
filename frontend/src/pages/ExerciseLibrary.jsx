import { useEffect, useMemo, useState } from 'react';
import { exerciseLibraryApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Sparkles, BookOpen, ScanSearch, Search } from 'lucide-react';

const STATUS_OPTIONS = ['pending', 'approved', 'rejected'];

function blankRow() {
  return {
    key: null, label: '', aliases: [], unit: 'reps', metersPerCal: 10,
    credits: {}, reasoning: null, status: 'approved', source: 'user', isNew: true,
  };
}

// Every editable cell writes straight to `library` state so typing feels
// instant, then persists on blur (text/number inputs) or immediately
// (selects) — no separate edit dialog, no explicit save step per row.
export default function ExerciseLibrary() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [suggestingKey, setSuggestingKey] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newRow, setNewRow] = useState(blankRow());
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await exerciseLibraryApi.list();
      setLibrary(data || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load exercise library', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(key, patch) {
    setLibrary(prev => prev.map(e => e.key === key ? { ...e, ...patch } : e));
  }

  async function persist(key, patch) {
    try {
      await exerciseLibraryApi.update(key, patch);
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
  }

  function handleTextChange(entry, field, value) {
    updateLocal(entry.key, { [field]: value });
  }
  function handleTextBlur(entry, field) {
    persist(entry.key, { [field]: entry[field] });
  }
  function handleUnitChange(entry, unit) {
    const patch = { unit, metersPerCal: unit === 'cal' ? (entry.metersPerCal || 10) : null };
    updateLocal(entry.key, patch);
    persist(entry.key, patch);
  }
  function handleStatusChange(entry, status) {
    updateLocal(entry.key, { status });
    persist(entry.key, { status });
  }
  function handleCreditChange(entry, stationKey, pct) {
    const credits = { ...entry.credits };
    const v = pct === '' ? 0 : Number(pct) / 100;
    if (v > 0) credits[stationKey] = v; else delete credits[stationKey];
    updateLocal(entry.key, { credits });
  }
  function handleCreditBlur(entry) {
    persist(entry.key, { credits: entry.credits });
  }

  async function handleSuggest(entry) {
    if (!entry.label.trim()) return;
    setSuggestingKey(entry.key || 'new');
    try {
      const suggestion = await exerciseLibraryApi.suggest(entry.label.trim());
      const patch = {
        unit: suggestion.unit || 'reps',
        metersPerCal: suggestion.metersPerCal || 10,
        credits: suggestion.credits || {},
        reasoning: suggestion.reasoning || null,
      };
      if (entry.key) {
        updateLocal(entry.key, patch);
        persist(entry.key, patch);
      } else {
        setNewRow(prev => ({ ...prev, ...patch }));
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSuggestingKey(null);
    }
  }

  async function handleDelete(entry) {
    if (!confirm(`Delete "${entry.label}" from the library?`)) return;
    setLibrary(prev => prev.filter(e => e.key !== entry.key));
    try {
      await exerciseLibraryApi.delete(entry.key);
    } catch (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      load();
    }
  }

  async function handleAddRow() {
    if (!newRow.label.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    try {
      const created = await exerciseLibraryApi.create({
        label: newRow.label.trim(),
        aliases: newRow.aliases,
        unit: newRow.unit,
        metersPerCal: newRow.metersPerCal,
        credits: newRow.credits,
        reasoning: newRow.reasoning,
      });
      setLibrary(prev => [...prev, created].sort((a, b) => a.label.localeCompare(b.label)));
      setNewRow(blankRow());
      toast({ title: 'Added', description: `${created.label} added to the library.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      const result = await exerciseLibraryApi.backfill();
      setLibrary(result.library || []);
      toast({
        title: 'Scan complete',
        description: `Scanned ${result.scanned} distinct exercise name(s) from every logged session — ${result.addedCount} new one(s) added${result.addedCount ? ' as pending review.' : '.'}`,
      });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }

  const filtered = useMemo(() => {
    return library.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return e.label?.toLowerCase().includes(q) || (e.aliases || []).some(a => a.toLowerCase().includes(q));
    });
  }, [library, statusFilter, search]);

  const pendingCount = library.filter(e => e.status === 'pending').length;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exercise Library</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Every movement the app recognizes, and exactly how much it counts toward each of the 9 HYROX stations. Type directly into any cell — it saves as you go. A "pending" row won't count toward a score until you set it to approved.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleScan} disabled={scanning}>
          <ScanSearch className="h-3.5 w-3.5" /> {scanning ? 'Scanning...' : 'Scan Past Sessions'}
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8" placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {s === 'all' ? `All (${library.length})` : s === 'pending' ? `Pending (${pendingCount})` : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-left text-[10px] text-muted-foreground uppercase tracking-wide bg-secondary/40">
              <th className="font-medium py-2 px-2 min-w-[160px]">Name</th>
              <th className="font-medium py-2 px-2 min-w-[100px]">Unit</th>
              {STATIONS.map(s => (
                <th key={s.key} className="font-medium py-2 px-1 w-14 text-center" title={s.label}>{s.icon}</th>
              ))}
              <th className="font-medium py-2 px-2 min-w-[110px]">Status</th>
              <th className="font-medium py-2 px-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.key} className="border-t border-border/50 hover:bg-secondary/20">
                <td className="p-1">
                  <Input
                    className="h-8 text-xs border-transparent bg-transparent hover:border-border focus:border-border"
                    value={entry.label}
                    onChange={e => handleTextChange(entry, 'label', e.target.value)}
                    onBlur={() => handleTextBlur(entry, 'label')}
                  />
                </td>
                <td className="p-1">
                  <div className="flex items-center gap-1">
                    <Select value={entry.unit} onValueChange={v => handleUnitChange(entry, v)}>
                      <SelectTrigger className="h-8 text-xs border-transparent bg-transparent hover:border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reps">reps</SelectItem>
                        <SelectItem value="m">m</SelectItem>
                        <SelectItem value="cal">cal</SelectItem>
                      </SelectContent>
                    </Select>
                    {entry.unit === 'cal' && (
                      <Input
                        type="number" step="0.5" className="h-8 w-14 text-xs px-1"
                        value={entry.metersPerCal ?? ''}
                        onChange={e => handleTextChange(entry, 'metersPerCal', e.target.value)}
                        onBlur={() => persist(entry.key, { metersPerCal: Number(entry.metersPerCal) || 10 })}
                        title="meters per calorie"
                      />
                    )}
                  </div>
                </td>
                {STATIONS.map(s => (
                  <td key={s.key} className="p-1">
                    <Input
                      type="number" min="0" max="100"
                      className="h-8 w-12 text-xs px-1 text-center border-transparent bg-transparent hover:border-border focus:border-border"
                      value={entry.credits?.[s.key] != null ? Math.round(entry.credits[s.key] * 100) : ''}
                      onChange={e => handleCreditChange(entry, s.key, e.target.value)}
                      onBlur={() => handleCreditBlur(entry)}
                      placeholder="0"
                    />
                  </td>
                ))}
                <td className="p-1">
                  <Select value={entry.status} onValueChange={v => handleStatusChange(entry, v)}>
                    <SelectTrigger className={`h-8 text-xs border-transparent bg-transparent hover:border-border ${
                      entry.status === 'pending' ? 'text-orange-400' : entry.status === 'rejected' ? 'text-muted-foreground' : 'text-green-400'
                    }`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  <div className="flex items-center">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={suggestingKey === entry.key} onClick={() => handleSuggest(entry)} title="Re-suggest station credit">
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(entry)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Always-visible add row */}
            <tr className="border-t border-border bg-secondary/20">
              <td className="p-1">
                <Input
                  className="h-8 text-xs" placeholder="New exercise name..."
                  value={newRow.label}
                  onChange={e => setNewRow(prev => ({ ...prev, label: e.target.value }))}
                />
              </td>
              <td className="p-1">
                <div className="flex items-center gap-1">
                  <Select value={newRow.unit} onValueChange={v => setNewRow(prev => ({ ...prev, unit: v, metersPerCal: v === 'cal' ? (prev.metersPerCal || 10) : null }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reps">reps</SelectItem>
                      <SelectItem value="m">m</SelectItem>
                      <SelectItem value="cal">cal</SelectItem>
                    </SelectContent>
                  </Select>
                  {newRow.unit === 'cal' && (
                    <Input type="number" step="0.5" className="h-8 w-14 text-xs px-1" value={newRow.metersPerCal ?? ''} onChange={e => setNewRow(prev => ({ ...prev, metersPerCal: e.target.value }))} />
                  )}
                </div>
              </td>
              {STATIONS.map(s => (
                <td key={s.key} className="p-1">
                  <Input
                    type="number" min="0" max="100" className="h-8 w-12 text-xs px-1 text-center"
                    value={newRow.credits?.[s.key] != null ? Math.round(newRow.credits[s.key] * 100) : ''}
                    onChange={e => {
                      const v = e.target.value === '' ? 0 : Number(e.target.value) / 100;
                      setNewRow(prev => {
                        const credits = { ...prev.credits };
                        if (v > 0) credits[s.key] = v; else delete credits[s.key];
                        return { ...prev, credits };
                      });
                    }}
                    placeholder="0"
                  />
                </td>
              ))}
              <td className="p-1 text-xs text-muted-foreground">new</td>
              <td className="p-1">
                <div className="flex items-center">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={suggestingKey === 'new'} onClick={() => handleSuggest(newRow)} title="Suggest station credit">
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={handleAddRow} title="Add">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No exercises match this filter.</p>
      )}
    </div>
  );
}
