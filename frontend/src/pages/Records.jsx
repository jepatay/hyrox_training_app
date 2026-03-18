import { useEffect, useState } from 'react';
import { recordsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, Trophy, TrendingDown } from 'lucide-react';
import RecordForm from '@/components/forms/RecordForm';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}

export default function Records() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await recordsApi.list();
      setRecords(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load records', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this record?')) return;
    try {
      await recordsApi.delete(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Deleted' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  }

  function handleSaved(record) {
    setRecords(prev => [record, ...prev]);
    setShowForm(false);
    toast({ title: 'Record saved!' });
  }

  const fiveKRecords = records.filter(r => r.type === '5k').sort((a, b) => new Date(a.date) - new Date(b.date));
  const tenKRecords = records.filter(r => r.type === '10k').sort((a, b) => new Date(a.date) - new Date(b.date));
  const hyroxRecords = records.filter(r => r.type === 'hyrox').sort((a, b) => new Date(a.date) - new Date(b.date));
  const otherRecords = records.filter(r => !['5k', '10k', 'hyrox'].includes(r.type));

  const bestFiveK = fiveKRecords.reduce((best, r) => !best || timeToMinutes(r.totalTime) < timeToMinutes(best.totalTime) ? r : best, null);
  const bestHyrox = hyroxRecords.reduce((best, r) => !best || timeToMinutes(r.totalTime) < timeToMinutes(best.totalTime) ? r : best, null);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Records</h1>
          <p className="text-muted-foreground text-sm">Track your race results and progression</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Log Result
        </Button>
      </div>

      {/* PR Highlights */}
      {(bestFiveK || bestHyrox) && (
        <div className="grid grid-cols-2 gap-4">
          {bestFiveK && <PRCard label="5K Personal Best" time={bestFiveK.totalTime} date={bestFiveK.date} />}
          {bestHyrox && <PRCard label="Hyrox Personal Best" time={bestHyrox.totalTime} date={bestHyrox.date} />}
        </div>
      )}

      <Tabs defaultValue="hyrox">
        <TabsList>
          <TabsTrigger value="hyrox">Hyrox ({hyroxRecords.length})</TabsTrigger>
          <TabsTrigger value="5k">5K ({fiveKRecords.length})</TabsTrigger>
          <TabsTrigger value="10k">10K ({tenKRecords.length})</TabsTrigger>
          {otherRecords.length > 0 && <TabsTrigger value="other">Other ({otherRecords.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="hyrox">
          <RecordTab records={hyroxRecords} type="hyrox" onDelete={handleDelete} />
        </TabsContent>
        <TabsContent value="5k">
          <RecordTab records={fiveKRecords} type="5k" onDelete={handleDelete} />
        </TabsContent>
        <TabsContent value="10k">
          <RecordTab records={tenKRecords} type="10k" onDelete={handleDelete} />
        </TabsContent>
        {otherRecords.length > 0 && (
          <TabsContent value="other">
            <RecordTab records={otherRecords} type="other" onDelete={handleDelete} />
          </TabsContent>
        )}
      </Tabs>

      {showForm && <RecordForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
    </div>
  );
}

function PRCard({ label, time, date }) {
  return (
    <Card className="bg-gradient-to-br from-orange-500/10 to-transparent border-orange-500/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 text-orange-400" />
          <span className="text-xs text-orange-400 font-medium">{label}</span>
        </div>
        <p className="text-2xl font-bold">{time}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatDate(date)}</p>
      </CardContent>
    </Card>
  );
}

function RecordTab({ records, type, onDelete }) {
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No {type === 'hyrox' ? 'Hyrox race' : type.toUpperCase()} results yet.</p>
        </CardContent>
      </Card>
    );
  }

  // Chart data
  const chartData = records.map(r => ({
    date: r.date?.slice(0, 10),
    minutes: timeToMinutes(r.totalTime),
    label: r.totalTime,
  })).filter(d => d.minutes);

  // Best record
  const best = records.reduce((b, r) => !b || timeToMinutes(r.totalTime) < timeToMinutes(b.totalTime) ? r : b, null);

  return (
    <div className="space-y-4">
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              Progression
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid hsl(217 33% 17%)', borderRadius: 8 }}
                  formatter={(v, _, { payload }) => [payload.label, 'Time']}
                />
                <Line type="monotone" dataKey="minutes" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {[...records].sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => (
          <Card key={record.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{record.totalTime}</span>
                    {record.id === best?.id && (
                      <Badge className="text-xs gap-1"><Trophy className="h-3 w-3" /> PR</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(record.date)}</p>
                  {record.notes && <p className="text-xs text-muted-foreground mt-1">{record.notes}</p>}
                  {record.splitTimes && Object.keys(record.splitTimes).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(record.splitTimes).map(([k, v]) => v && (
                        <span key={k} className="text-xs bg-secondary px-2 py-1 rounded">
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(record.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
