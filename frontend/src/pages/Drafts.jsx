import { useEffect, useRef, useState } from 'react';
import { draftsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDate, getSessionTypeConfig, SESSION_TYPES } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Mic, Square, Camera, Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';

const SPEECH_SUPPORTED = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

function relativeDateLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return formatDate(dateStr);
}

function resizeImageToDataUrl(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ENTRY_ICON = { voice: '🎤', photo: '📷', text: '📝' };

export default function Drafts() {
  const today = new Date().toISOString().slice(0, 10);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today);
  const [noteText, setNoteText] = useState('');
  const [listening, setListening] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [convertPreview, setConvertPreview] = useState(null);
  const [converting, setConverting] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const voiceUsedRef = useRef(false);
  const noteRef = useRef(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await draftsApi.list('open');
      setDrafts(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load drafts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function upsertDraft(updated) {
    setDrafts(prev => {
      const exists = prev.find(d => d.date === updated.date);
      return exists ? prev.map(d => d.date === updated.date ? updated : d) : [updated, ...prev].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast({ title: 'Not supported', description: "Voice input isn't supported in this browser — try typing instead.", variant: 'destructive' });
      return;
    }
    baseTextRef.current = noteText.trim() ? noteText.trim() + ' ' : '';
    voiceUsedRef.current = true;
    const recognition = new SR();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk) baseTextRef.current += finalChunk + ' ';
      setNoteText((baseTextRef.current + interimChunk).trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const updated = await draftsApi.addEntry(date, {
        kind: voiceUsedRef.current ? 'voice' : 'text',
        text: noteText.trim(),
      });
      upsertDraft(updated);
      setNoteText('');
      voiceUsedRef.current = false;
      toast({ title: 'Added to draft', description: relativeDateLabel(date) });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAddingNote(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const updated = await draftsApi.addPhoto(date, { imageBase64: dataUrl });
      upsertDraft(updated);
      toast({ title: 'Photo read', description: 'Extracted stats added to your draft.' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleDeleteEntry(draftDate, entryId) {
    try {
      const result = await draftsApi.deleteEntry(draftDate, entryId);
      if (result.deleted) {
        setDrafts(prev => prev.filter(d => d.date !== draftDate));
      } else {
        upsertDraft(result);
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  async function handleDiscardDraft(draftDate) {
    if (!confirm('Discard this whole draft?')) return;
    try {
      await draftsApi.delete(draftDate);
      setDrafts(prev => prev.filter(d => d.date !== draftDate));
      toast({ title: 'Draft discarded' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  function focusCaptureFor(draftDate) {
    setDate(draftDate);
    noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    noteRef.current?.focus();
  }

  async function startConvert(draft) {
    setConverting(true);
    try {
      const { extracted, rawNotes } = await draftsApi.parse(draft.date);
      setConvertPreview({
        date: draft.date,
        type: extracted?.type || '',
        duration: extracted?.duration ?? '',
        rpe: extracted?.rpe ?? '',
        runningDistance: extracted?.runningDistance ?? '',
        volume: extracted?.volume || '',
        weightVest: extracted?.weightVest || false,
        notes: extracted?.notes || rawNotes || '',
      });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'Failed to analyse draft', variant: 'destructive' });
    } finally {
      setConverting(false);
    }
  }

  async function confirmConvert() {
    if (!convertPreview.type) {
      toast({ title: 'Validation', description: 'Pick a session type.', variant: 'destructive' });
      return;
    }
    setConverting(true);
    try {
      const { date: convertDate, ...fields } = convertPreview;
      await draftsApi.convert(convertDate, {
        ...fields,
        duration: fields.duration !== '' ? Number(fields.duration) : null,
        rpe: fields.rpe !== '' ? Number(fields.rpe) : null,
        runningDistance: fields.runningDistance !== '' ? Number(fields.runningDistance) : null,
      });
      setDrafts(prev => prev.filter(d => d.date !== convertDate));
      setConvertPreview(null);
      toast({ title: 'Saved to Training Log', description: "Your draft's been merged into your training log." });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setConverting(false);
    }
  }

  const setPreview = (k, v) => setConvertPreview(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Workout Drafts</h1>
        <p className="text-muted-foreground text-sm">
          Capture what you did — voice, text, or a photo of the machine screen. Add to it through the day, then merge into your training log when you're ready.
        </p>
      </div>

      {/* Quick capture */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Quick Capture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-[200px]">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} max={today} />
          </div>
          <Textarea
            ref={noteRef}
            placeholder="What did you do? e.g. 'Went kayaking for an hour this morning, felt strong the whole way...'"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
          />
          {listening && <p className="text-xs text-orange-400 animate-pulse">🎤 Listening...</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={listening ? 'destructive' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={toggleListening}
              disabled={!SPEECH_SUPPORTED}
              title={SPEECH_SUPPORTED ? undefined : "Voice input isn't supported in this browser"}
            >
              {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {listening ? 'Stop' : 'Voice'}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={photoBusy}>
              {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {photoBusy ? 'Reading screen...' : 'Photo'}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            <Button type="button" size="sm" className="gap-1.5 ml-auto" onClick={handleAddNote} disabled={!noteText.trim() || addingNote}>
              <Plus className="h-3.5 w-3.5" /> {addingNote ? 'Adding...' : 'Add to Draft'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Open drafts */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : drafts.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No open drafts. Capture something above to get started.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map(draft => (
            <Card key={draft.date}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">{relativeDateLabel(draft.date)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{draft.entries.length} {draft.entries.length === 1 ? 'entry' : 'entries'}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => focusCaptureFor(draft.date)}>
                    <Plus className="h-3.5 w-3.5" /> Add more
                  </Button>
                  <Button size="sm" className="text-xs gap-1" onClick={() => startConvert(draft)} disabled={converting}>
                    <Sparkles className="h-3.5 w-3.5" /> Save to Training Log
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDiscardDraft(draft.date)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {draft.entries.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/50 text-sm">
                    <span>{ENTRY_ICON[entry.kind] || '📝'}</span>
                    <p className="flex-1 whitespace-pre-wrap">{entry.text}</p>
                    <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeleteEntry(draft.date, entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Convert preview dialog */}
      {convertPreview && (
        <Dialog open onOpenChange={() => setConvertPreview(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Save to Training Log — {relativeDateLabel(convertPreview.date)}</DialogTitle>
              <DialogDescription>Pre-filled from your draft. Review and adjust before saving.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Session Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SESSION_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setPreview('type', t.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        convertPreview.type === t.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      <span>{t.icon}</span>
                      <span className="text-xs">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Duration (min)</Label>
                  <Input type="number" min="1" value={convertPreview.duration} onChange={e => setPreview('duration', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>RPE (1-10)</Label>
                  <Input type="number" min="1" max="10" value={convertPreview.rpe} onChange={e => setPreview('rpe', e.target.value)} />
                </div>
                {(convertPreview.type === 'running' || convertPreview.type === 'hyrox_training' || convertPreview.type === 'hyrox_competition') && (
                  <div className="space-y-1.5">
                    <Label>Distance (km)</Label>
                    <Input type="number" step="0.01" min="0" value={convertPreview.runningDistance} onChange={e => setPreview('runningDistance', e.target.value)} />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={5} value={convertPreview.notes} onChange={e => setPreview('notes', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setConvertPreview(null)}>Cancel</Button>
              <Button type="button" onClick={confirmConvert} disabled={converting} className="gap-2">
                {converting && <Loader2 className="h-4 w-4 animate-spin" />}
                {converting ? 'Saving...' : 'Save to Training Log'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
