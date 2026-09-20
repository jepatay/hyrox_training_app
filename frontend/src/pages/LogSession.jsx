import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi, exerciseLibraryApi, reprocessApi } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { ArrowLeft, Plus } from 'lucide-react';

const PART_ORDER = ['warmup', 'main', 'finisher', 'core', 'cooldown'];
const PART_LABEL = { warmup: 'Warm-up', main: 'Main', finisher: 'Then', core: 'Core', cooldown: 'Cool-down' };
const CATEGORY_LABELS = {
  run: 'Run', skierg: 'SkiErg', sled_push: 'Sled Push', sled_pull: 'Sled Pull',
  burpee_broad_jump: 'Burpee BJ', row: 'Row', farmers_carry: 'Farmers',
  sandbag_lunges: 'Lunges', wall_balls: 'Wall Balls', core: 'Core',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function lineSummary(l) {
  const n = l.intervals && l.intervals > 1 ? l.intervals : null;
  const bits = [];
  if (l.reps) bits.push(`${n ? `${n} × ` : ''}${l.reps} reps${n ? ` = ${n * l.reps} reps` : ''}`);
  else if (l.distanceM) bits.push(`${n ? `${n} × ` : ''}${l.distanceM} m${n ? ` = ${n * l.distanceM} m` : ''}`);
  else if (l.calories) bits.push(`${n ? `${n} × ` : ''}${l.calories} cal${n ? ` = ${n * l.calories} cal` : ''}`);
  if (l.weightKg) bits.push(`@ ${l.weightKg} kg`);
  return bits.join(' ');
}

export default function LogSession() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isClass, setIsClass] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [sessionId, setSessionId] = useState(null);

  // Step 2
  const [extractionV2, setExtractionV2] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [library, setLibrary] = useState([]);

  // Step 3
  const [v2, setV2] = useState(null);

  useEffect(() => { exerciseLibraryApi.list().then(setLibrary).catch(() => {}); }, []);

  const libraryByKey = new Map(library.map(e => [e.key, e]));

  async function handleWriteSubmit() {
    if (!notesInput.trim()) {
      toast({ title: 'Nothing written', description: 'Write what you did first.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      let id = sessionId;
      if (!id) {
        const created = await sessionsApi.create({
          date, isClass, type: 'hyrox_training', status: 'completed', notes: notesInput,
        });
        id = created.id;
        setSessionId(id);
      } else {
        await sessionsApi.update(id, { notes: notesInput });
      }
      const result = await sessionsApi.extractV2(id);
      setExtractionV2(result.extractionV2);
      setSummaryText(result.summaryText);
      const freshLibrary = await exerciseLibraryApi.list();
      setLibrary(freshLibrary);
      setEditingText(false);
      setStep(2);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmText() {
    setBusy(true);
    try {
      const result = await sessionsApi.confirmExtractionV2(sessionId, summaryText);
      setExtractionV2(result.extractionV2);
      setSummaryText(result.summaryText);
      setEditingText(false);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAndScore() {
    setBusy(true);
    try {
      if (editingText) {
        const result = await sessionsApi.confirmExtractionV2(sessionId, summaryText);
        setExtractionV2(result.extractionV2);
        setSummaryText(result.summaryText);
        setEditingText(false);
      }
      const { v2: scored } = await reprocessApi.rescoreSession(sessionId);
      setV2(scored);
      setStep(3);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const linesByPart = PART_ORDER.reduce((acc, p) => {
    acc[p] = (extractionV2?.lines || []).filter(l => l.part === p);
    return acc;
  }, {});
  const pendingLines = (extractionV2?.lines || []).filter(l => {
    const entry = l.libraryKey ? libraryByKey.get(l.libraryKey) : null;
    return entry?.status === 'pending';
  });

  return (
    <div className="bg-[#0E0F11] text-[#F3F1EB] font-['Barlow',system-ui,sans-serif] -m-6 p-5 min-h-screen flex flex-col gap-4">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="flex items-center gap-2">
        <button
          aria-label="Back"
          onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}
          className="w-11 h-11 rounded-full bg-[#1A1C1F] flex items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-sm tracking-wider uppercase text-[#A6A49C]">Step {step} of 3</div>
      </div>

      {step === 1 && (
        <>
          <h1 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-4xl leading-none">Write your session</h1>
          <div className="flex gap-2.5 items-center">
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className="flex-grow min-h-[44px] px-3.5 bg-[#1A1C1F] rounded-lg text-base font-medium text-[#F3F1EB] border-0"
            />
            <div className="flex border-2 border-[#F3F1EB] rounded-full overflow-hidden">
              <button
                onClick={() => setIsClass(false)}
                className={`min-h-[40px] min-w-[64px] text-[15px] font-semibold ${!isClass ? 'bg-[#26292D] text-[#0E0F11]' : 'bg-transparent text-[#F3F1EB]'}`}
              >Solo</button>
              <button
                onClick={() => setIsClass(true)}
                className={`min-h-[40px] min-w-[64px] text-[15px] font-semibold ${isClass ? 'bg-[#26292D] text-[#0E0F11]' : 'bg-transparent text-[#F3F1EB]'}`}
              >Class</button>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-grow">
            <label htmlFor="session-text" className="text-sm font-semibold text-[#A6A49C]">Everything you did, in your own words</label>
            <textarea
              id="session-text" value={notesInput} onChange={e => setNotesInput(e.target.value)}
              placeholder={'Warm-up: 500 m row\nClass, 3 rounds:\n20 wall balls 9 kg\n10 push-ups\nrun 1 km\n...'}
              className="flex-grow box-border p-4 border-2 border-[#F3F1EB] rounded-xl bg-transparent text-[#F3F1EB] text-lg leading-relaxed resize-none min-h-[280px]"
            />
          </div>
          <button
            onClick={handleWriteSubmit} disabled={busy}
            className="min-h-[56px] border-2 border-[#F5C400] rounded-xl bg-[#F5C400] text-[#0E0F11] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase disabled:opacity-60"
          >
            {busy ? 'Reading...' : 'Read my session'}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex justify-between items-center">
            <h1 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-4xl leading-none">Is this what you did?</h1>
            <button
              onClick={() => setEditingText(e => !e)}
              className="min-h-[44px] px-3.5 border-2 border-[#F3F1EB] rounded-full bg-transparent text-[#F3F1EB] text-[15px] font-semibold whitespace-nowrap"
            >
              {editingText ? 'Back to list' : 'Edit as text'}
            </button>
          </div>

          {editingText ? (
            <>
              <textarea
                value={summaryText} onChange={e => setSummaryText(e.target.value)}
                className="flex-grow box-border p-4 border-2 border-[#F3F1EB] rounded-xl bg-transparent text-[#F3F1EB] text-base leading-relaxed resize-none min-h-[400px]"
              />
              <button
                onClick={handleConfirmText} disabled={busy}
                className="min-h-[52px] border-2 border-[#F3F1EB] rounded-xl bg-transparent text-[#F3F1EB] font-['Barlow_Condensed',sans-serif] font-bold text-lg tracking-wide uppercase disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Save text'}
              </button>
            </>
          ) : (
            <>
              {PART_ORDER.filter(p => linesByPart[p].length).map(p => (
                <div key={p} className="flex flex-col gap-1.5">
                  <div className="font-['Barlow_Condensed',sans-serif] font-semibold text-sm tracking-wider uppercase text-[#A6A49C]">{PART_LABEL[p]}</div>
                  {linesByPart[p].map((l, i) => {
                    const entry = l.libraryKey ? libraryByKey.get(l.libraryKey) : null;
                    const pending = entry?.status === 'pending';
                    return (
                      <div
                        key={i}
                        className={`flex justify-between items-center gap-2 min-h-[52px] px-3 py-1.5 bg-[#1A1C1F] rounded-lg ${pending ? 'border-2 border-[#F5C400]' : ''}`}
                      >
                        <div>
                          <div className="text-base font-semibold">{entry?.label || l.exercise}</div>
                          <div className="text-sm text-[#A6A49C]">{lineSummary(l)}</div>
                        </div>
                        {pending ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-[10px] bg-[#F5C400] text-[#0E0F11] whitespace-nowrap">New exercise</span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-[10px] border border-[#F3F1EB] whitespace-nowrap">Counted</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {pendingLines.length > 0 && (
                <div className="p-3 rounded-lg bg-[#1A1C1F] flex flex-col gap-2">
                  <div className="text-sm leading-snug">
                    {pendingLines.map(l => l.exercise).join(', ')} {pendingLines.length === 1 ? "isn't" : "aren't"} in your Exercise Library yet. {pendingLines.length === 1 ? 'It counts' : 'They count'} 0 until you set {pendingLines.length === 1 ? 'its' : 'their'} weights.
                  </div>
                  <a
                    href="/exercise-library" target="_blank" rel="noopener noreferrer"
                    className="min-h-[44px] flex items-center justify-center border-2 border-[#F3F1EB] rounded-lg bg-[#1A1C1F] text-[#F3F1EB] text-[15px] font-semibold no-underline gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> Add to Exercise Library
                  </a>
                </div>
              )}

              <div className="flex-grow" />
              <button
                onClick={handleConfirmAndScore} disabled={busy}
                className="min-h-[56px] border-2 border-[#F5C400] rounded-xl bg-[#F5C400] text-[#0E0F11] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase disabled:opacity-60"
              >
                {busy ? 'Scoring...' : 'Confirm and score'}
              </button>
            </>
          )}
        </>
      )}

      {step === 3 && v2 && (
        <>
          <div className="flex justify-between items-end">
            <h1 className="m-0 font-['Barlow_Condensed',sans-serif] font-bold text-4xl leading-none">Session scored</h1>
            <div className="text-right">
              <div className="font-['Barlow_Condensed',sans-serif] font-bold text-[44px] leading-none">
                {v2.sessionLoadRE.toFixed(2)}<span className="text-base font-semibold text-[#A6A49C] ml-1">RE</span>
              </div>
              <div className="text-xs text-[#A6A49C]">session load</div>
            </div>
          </div>
          <p className="text-[13px] leading-snug text-[#A6A49C]">Full bar = 1.00 RE, one race of that station. Each line shows the arithmetic.</p>

          {CATEGORY_ORDER.map(cat => {
            const value = v2.re[cat] || 0;
            const contributingLines = (v2.lines || []).filter(l => l.credits?.[cat]);
            if (!contributingLines.length) {
              return (
                <div key={cat} className="flex justify-between items-center min-h-[36px] px-3 bg-[#1A1C1F] rounded-lg">
                  <span className="font-['Barlow_Condensed',sans-serif] font-semibold text-base tracking-wide uppercase text-[#A6A49C]">{CATEGORY_LABELS[cat]}</span>
                  <span className="font-['Barlow_Condensed',sans-serif] font-semibold text-lg text-[#A6A49C]">0</span>
                </div>
              );
            }
            const basis = contributingLines
              .map(l => `${libraryByKey.get(l.exerciseKey)?.label || l.exerciseKey}: ${l.credits[cat].basis}`)
              .join(' + ');
            return (
              <div key={cat} className="bg-[#1A1C1F] rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="font-['Barlow_Condensed',sans-serif] font-semibold text-base tracking-wide uppercase">{CATEGORY_LABELS[cat]}</span>
                  <span className="font-['Barlow_Condensed',sans-serif] font-bold text-[22px]">{value.toFixed(2)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#33373B]"><div className="h-1.5 rounded-full bg-[#F5C400]" style={{ width: `${Math.min(100, value * 100)}%` }} /></div>
                <div className="text-xs leading-snug text-[#A6A49C]">{basis}</div>
              </div>
            );
          })}

          <div className="flex-grow" />
          <div className="flex gap-2.5">
            <button
              onClick={() => navigate('/')}
              className="flex-grow min-h-[56px] border-2 border-[#F5C400] rounded-xl bg-[#F5C400] text-[#0E0F11] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase"
            >
              Save session
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex-grow min-h-[56px] border-2 border-[#F3F1EB] rounded-xl bg-transparent text-[#F3F1EB] font-['Barlow_Condensed',sans-serif] font-bold text-xl tracking-wide uppercase"
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
