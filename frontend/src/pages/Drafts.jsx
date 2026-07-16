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
import { Mic, Square, Camera, Plus, Trash2, Sparkles, Loader2, X } from 'lucide-react';

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
  const [pendingPhoto, setPendingPhoto] = useState(null); // { dataUrl, ocrBusy }
  const [addingNote, setAddingNote] = useState(false);
  const [convertPreview, setConvertPreview] = useState(null);
  const [converting, setConverting] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const interimRef = useRef('');
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
      // The button must respond immediately (some mobile browsers never
      // fire onend), but use stop() — not abort() — so the browser still
      // delivers a final result for whatever was just said. abort() is a
      // hard cancel that throws that away, which was swallowing the last
      // thing spoken before Stop was pressed. Keep the ref alive briefly so
      // that trailing onresult event can still land; only hard-abort and
      // release it if the browser genuinely never ends the session.
      setListening(false);
      const current = recognitionRef.current;
      try { current?.stop(); } catch {}
      setTimeout(() => {
        if (recognitionRef.current === current) {
          try { current?.abort(); } catch {}
          recognitionRef.current = null;
        }
      }, 2000);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast({ title: 'Not supported', description: "Voice input isn't supported in this browser — try typing instead.", variant: 'destructive' });
      return;
    }
    baseTextRef.current = noteText.trim() ? noteText.trim() + ' ' : '';
    interimRef.current = '';
    voiceUsedRef.current = true;
    const recognition = new SR();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    // Some browsers end the session without ever promoting a trailing
    // utterance to a final result — without this, that speech was shown
    // live while talking but then silently lost once onend/onerror fired.
    const salvageInterim = () => {
      if (interimRef.current) {
        baseTextRef.current += interimRef.current + ' ';
        interimRef.current = '';
        setNoteText(baseTextRef.current.trim());
      }
    };

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return; // stopped/stale — ignore
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk) baseTextRef.current += finalChunk + ' ';
      interimRef.current = interimChunk;
      setNoteText((baseTextRef.current + interimChunk).trim());
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      salvageInterim();
      // Surface the real reason instead of failing silently — "no-speech"
      // and a manual "aborted" stop aren't worth interrupting the user for.
      if (event.error === 'no-speech') {
        toast({ title: "Didn't catch that", description: 'No speech detected — try again or type instead.' });
      } else if (event.error !== 'aborted') {
        toast({ title: 'Voice input error', description: `${event.error} — try again or type instead.`, variant: 'destructive' });
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      salvageInterim();
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      toast({ title: 'Error', description: 'Could not start voice input — try again.', variant: 'destructive' });
    }
  }

  async function handleAddNote() {
    if (!noteText.trim() && !pendingPhoto) return;
    setAddingNote(true);
    try {
      const kind = pendingPhoto ? 'photo' : (voiceUsedRef.current ? 'voice' : 'text');
      const text = noteText.trim() || '(photo — could not read the screen)';
      const updated = await draftsApi.addEntry(date, { kind, text });
      upsertDraft(updated);
      setNoteText('');
      setPendingPhoto(null);
      voiceUsedRef.current = false;
      toast({ title: 'Added to draft', description: relativeDateLabel(date) });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAddingNote(false);
    }
  }

  // Staged, not submitted: the photo is read in the background and its
  // extracted text lands in the (still editable) textarea alongside a
  // thumbnail, so the athlete can add more comments before one explicit
  // "Add to Draft" commits everything together.
  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await resizeImageToDataUrl(file);
    setPendingPhoto({ dataUrl, ocrBusy: true });
    try {
      const { extracted } = await draftsApi.ocr({ imageBase64: dataUrl });
      setPendingPhoto(prev => (prev?.dataUrl === dataUrl ? { ...prev, ocrBusy: false } : prev));
      if (extracted) {
        setNoteText(prev => prev.trim() ? `${prev.trim()}\n${extracted}` : extracted);
      }
    } catch (err) {
      setPendingPhoto(prev => (prev?.dataUrl === dataUrl ? { ...prev, ocrBusy: false } : prev));
      toast({ title: 'Error', description: "Couldn't read the photo — you can still add it with a note.", variant: 'destructive' });
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
          {pendingPhoto && (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-secondary/30">
              <img src={pendingPhoto.dataUrl} alt="Attached" className="h-12 w-12 rounded object-cover shrink-0" />
              <div className="flex-1 text-xs text-muted-foreground">
                {pendingPhoto.ocrBusy ? (
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Reading screen...</span>
                ) : (
                  'Photo attached — extracted text added below, edit as needed.'
                )}
              </div>
              <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => setPendingPhoto(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
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
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={pendingPhoto?.ocrBusy}>
              <Camera className="h-3.5 w-3.5" /> Photo
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <Button type="button" size="sm" className="gap-1.5 ml-auto" onClick={handleAddNote} disabled={(!noteText.trim() && !pendingPhoto) || addingNote || pendingPhoto?.ocrBusy}>
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
