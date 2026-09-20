import { useEffect, useMemo, useState } from 'react';
import { exerciseLibraryApi, stationReferencesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { STATIONS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Sparkles, BookOpen, ScanSearch, Search, CheckCheck, X as XIcon } from 'lucide-react';

const STATUS_OPTIONS = ['pending', 'approved', 'rejected'];

// The Core column sits alongside the 9 race-station columns in the table but
// isn't part of STATIONS (which stays the 9-station shape v1 code elsewhere
// depends on) — it's the new daily-baseline category from Change Brief V2.
const CORE_COLUMN = { key: 'core', label: 'Core', icon: '🧱' };
const ALL_COLUMNS = [...STATIONS, CORE_COLUMN];

// Categories whose reference is a pace, not a load — set on the Station
// References page (target pace per km), not per exercise. An exercise
// crediting only these has nothing to put in the Reference column.
const PACE_STATIONS = new Set(['running', 'skierg', 'row_erg']);
const WEIGHTED_STATIONS = new Set(['sled_push', 'sled_pull', 'farmers_carry', 'sandbag_lunges', 'wall_balls']);

function isPaceOnly(entry) {
  const keys = Object.keys(entry.credits || {});
  if (!keys.length) return false;
  return keys.some(k => PACE_STATIONS.has(k)) && !keys.some(k => WEIGHTED_STATIONS.has(k));
}

// For a literal race movement (100% credit to exactly one weighted station,
// e.g. Wall Balls), the reference load is inherited from Station References
// rather than set per-exercise — shown as a placeholder so an empty field
// still reads as "150kg, from the race demand", not "unset".
function raceDefaultLoadKg(entry, stationReferences) {
  if (!stationReferences) return null;
  const weighted = Object.entries(entry.credits || {}).filter(([k, v]) => WEIGHTED_STATIONS.has(k) && v === 1);
  if (weighted.length !== 1) return null;
  return stationReferences.categories?.[weighted[0][0]]?.referenceLoadKg ?? null;
}

// Short column labels so the 9 station columns are identifiable without
// hovering for a tooltip — the icon alone reads as decoration, not a label.
const STATION_SHORT_LABEL = {
  running: 'Run',
  skierg: 'Ski',
  sled_push: 'S.Push',
  sled_pull: 'S.Pull',
  row_erg: 'Row',
  farmers_carry: 'Farmer',
  sandbag_lunges: 'Lunges',
  burpee_broad_jump: 'BBJ',
  wall_balls: 'W.Ball',
  core: 'Core',
};

function blankRow() {
  return {
    key: null, label: '', aliases: [], unit: 'reps', metersPerCal: 10,
    credits: {}, referenceLoadKg: null, reasoning: null, status: 'approved', source: 'user', isNew: true,
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
  const [stationReferences, setStationReferences] = useState(null);
  const [selectedPending, setSelectedPending] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); stationReferencesApi.get().then(setStationReferences).catch(() => {}); }, []);

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
  function handleReferenceLoadChange(entry, value) {
    updateLocal(entry.key, { referenceLoadKg: value === '' ? null : value });
  }
  function handleReferenceLoadBlur(entry) {
    persist(entry.key, { referenceLoadKg: entry.referenceLoadKg === '' ? null : Number(entry.referenceLoadKg) || null });
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
        referenceLoadKg: suggestion.referenceLoadKg ?? null,
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
        referenceLoadKg: newRow.referenceLoadKg,
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

  function togglePendingSelection(key) {
    setSelectedPending(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleBulkStatus(status) {
    const keys = [...selectedPending];
    if (!keys.length) return;
    setBulkWorking(true);
    try {
      await exerciseLibraryApi.bulkStatus(keys, status);
      setLibrary(prev => prev.map(e => keys.includes(e.key) ? { ...e, status } : e));
      setSelectedPending(new Set());
      toast({ title: status === 'approved' ? 'Approved' : 'Rejected', description: `${keys.length} exercise(s) ${status}.` });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBulkWorking(false);
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
            Every movement the app recognizes, and exactly how much it counts toward each of the 9 HYROX stations plus Core. Type directly into any cell — it saves as you go. A "pending" row won't count toward a score until you set it to approved.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handleScan} disabled={scanning}>
          <ScanSearch className="h-3.5 w-3.5" /> {scanning ? 'Scanning...' : 'Scan Past Sessions'}
        </Button>
      </div>

      {pendingCount > 0 && (
        <div className="border border-orange-400/30 bg-orange-400/5 rounded-lg p-3 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm">
            <span className="font-medium text-orange-400">{pendingCount} exercise{pendingCount === 1 ? '' : 's'} pending review.</span>{' '}
            <span className="text-muted-foreground">Filter to "Pending" below, select rows, then approve or reject in bulk.</span>
          </div>
          {statusFilter === 'pending' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedPending.size} selected</span>
              <Button
                size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                disabled={!selectedPending.size || bulkWorking}
                onClick={() => setSelectedPending(new Set(filtered.map(e => e.key)))}
              >
                Select all
              </Button>
              <Button
                size="sm" className="gap-1.5 h-7 text-xs"
                disabled={!selectedPending.size || bulkWorking}
                onClick={() => handleBulkStatus('approved')}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Approve selected
              </Button>
              <Button
                size="sm" variant="outline" className="gap-1.5 h-7 text-xs text-muted-foreground"
                disabled={!selectedPending.size || bulkWorking}
                onClick={() => handleBulkStatus('rejected')}
              >
                <XIcon className="h-3.5 w-3.5" /> Reject selected
              </Button>
            </div>
          )}
        </div>
      )}

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

      <div className="overflow-auto border border-border rounded-lg max-h-[70vh]">
        <table className="w-full text-sm min-w-[1180px]">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-muted-foreground uppercase tracking-wide bg-card shadow-[0_1px_0_0] shadow-border">
              {statusFilter === 'pending' && <th className="font-medium py-2 px-2 w-8"></th>}
              <th className="font-medium py-2 px-2 min-w-[160px]">Name</th>
              <th className="font-medium py-2 px-2 min-w-[100px]">Unit</th>
              {ALL_COLUMNS.map(s => (
                <th key={s.key} className="font-medium py-2 px-1 w-16 text-center" title={s.label}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm">{s.icon}</span>
                    <span className="text-[9px] normal-case leading-none whitespace-nowrap">{STATION_SHORT_LABEL[s.key]}</span>
                  </div>
                </th>
              ))}
              <th className="font-medium py-2 px-2 min-w-[100px]">Reference</th>
              <th className="font-medium py-2 px-2 min-w-[110px]">Status</th>
              <th className="font-medium py-2 px-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.key} className="border-t border-border/50 hover:bg-secondary/20">
                {statusFilter === 'pending' && (
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={selectedPending.has(entry.key)}
                      onChange={() => togglePendingSelection(entry.key)}
                    />
                  </td>
                )}
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
                        <SelectItem value="km">km</SelectItem>
                        <SelectItem value="cal">cal</SelectItem>
                      </SelectContent>
                    </Select>
                    {entry.unit === 'cal' && (
                      <div className="flex items-center gap-1" title="How many meters one logged calorie is worth, for converting a cal reading into distance before scoring">
                        <Input
                          type="number" step="0.5" className="h-8 w-14 text-xs px-1"
                          value={entry.metersPerCal ?? ''}
                          onChange={e => handleTextChange(entry, 'metersPerCal', e.target.value)}
                          onBlur={() => persist(entry.key, { metersPerCal: Number(entry.metersPerCal) || 10 })}
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">m/cal</span>
                      </div>
                    )}
                  </div>
                </td>
                {ALL_COLUMNS.map(s => (
                  <td key={s.key} className="p-1">
                    <Input
                      type="number" min="0" max="100"
                      className="h-8 w-14 text-xs px-1 text-center border-transparent bg-transparent hover:border-border focus:border-border"
                      value={entry.credits?.[s.key] != null ? Math.round(entry.credits[s.key] * 100) : ''}
                      onChange={e => handleCreditChange(entry, s.key, e.target.value)}
                      onBlur={() => handleCreditBlur(entry)}
                      placeholder="0"
                    />
                  </td>
                ))}
                <td className="p-1">
                  {isPaceOnly(entry) ? (
                    <span className="text-xs text-muted-foreground px-1" title="Set on the Station References page">Target pace</span>
                  ) : (
                    <Input
                      type="number" min="0" step="0.5"
                      className="h-8 w-16 text-xs px-1 border-transparent bg-transparent hover:border-border focus:border-border"
                      value={entry.referenceLoadKg ?? ''}
                      onChange={e => handleReferenceLoadChange(entry, e.target.value)}
                      onBlur={() => handleReferenceLoadBlur(entry)}
                      placeholder={(() => { const d = raceDefaultLoadKg(entry, stationReferences); return d ? `${d} (race)` : 'kg'; })()}
                    />
                  )}
                </td>
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
              {statusFilter === 'pending' && <td className="p-1"></td>}
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
                      <SelectItem value="km">km</SelectItem>
                      <SelectItem value="cal">cal</SelectItem>
                    </SelectContent>
                  </Select>
                  {newRow.unit === 'cal' && (
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.5" className="h-8 w-14 text-xs px-1" value={newRow.metersPerCal ?? ''} onChange={e => setNewRow(prev => ({ ...prev, metersPerCal: e.target.value }))} />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">m/cal</span>
                    </div>
                  )}
                </div>
              </td>
              {ALL_COLUMNS.map(s => (
                <td key={s.key} className="p-1">
                  <Input
                    type="number" min="0" max="100" className="h-8 w-14 text-xs px-1 text-center"
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
              <td className="p-1">
                {isPaceOnly(newRow) ? (
                  <span className="text-xs text-muted-foreground px-1">Target pace</span>
                ) : (
                  <Input
                    type="number" min="0" step="0.5" className="h-8 w-16 text-xs px-1"
                    value={newRow.referenceLoadKg ?? ''}
                    onChange={e => setNewRow(prev => ({ ...prev, referenceLoadKg: e.target.value === '' ? null : e.target.value }))}
                    placeholder="kg"
                  />
                )}
              </td>
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
