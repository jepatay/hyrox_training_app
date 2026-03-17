import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, collection, getDocs,
  addDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensureConfigExists } from '../utils/firestoreUtils';
import { recalculateSlotTimes } from '../utils/timeUtils';
import NavBar from '../components/NavBar';
import WaveBuilder from '../components/WaveBuilder';
import TeamForm from '../components/TeamForm';
import ChecklistPanel from '../components/ChecklistPanel';

const TABS = ['Info', 'Waves', 'Teams', 'Checklist'];

function formatDateWithDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function CalendarPicker({ value, onChange }) {
  const today = new Date();
  const [view, setView] = useState(() => {
    if (value) { const [y, m] = value.split('-').map(Number); return new Date(y, m - 1, 1); }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const selY = value ? +value.split('-')[0] : null;
  const selM = value ? +value.split('-')[1] - 1 : null;
  const selD = value ? +value.split('-')[2] : null;

  function pick(d) {
    onChange(`${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }

  const cells = [...Array(startOffset).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];

  return (
    <div className="cal-popup">
      <div className="cal-nav">
        <button type="button" onClick={() => setView(new Date(year, month-1, 1))}>‹</button>
        <span className="cal-title">{CAL_MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setView(new Date(year, month+1, 1))}>›</button>
      </div>
      <div className="cal-grid">
        {CAL_DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => (
          <div
            key={i}
            className={[
              'cal-cell',
              d ? 'cal-cell-active' : '',
              d && selY===year && selM===month && selD===d ? 'cal-cell-sel' : '',
              d && today.getFullYear()===year && today.getMonth()===month && today.getDate()===d ? 'cal-cell-today' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => d && pick(d)}
          >{d||''}</div>
        ))}
      </div>
    </div>
  );
}

export default function EventEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState(false);
  const [savedWaves, setSavedWaves] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [showCal, setShowCal] = useState(false);
  const calRef = useRef(null);

  useEffect(() => {
    if (!showCal) return;
    function onDown(e) { if (calRef.current && !calRef.current.contains(e.target)) setShowCal(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCal]);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const cfg = await ensureConfigExists();
      setConfig(cfg);
      if (id) {
        const snap = await getDoc(doc(db, 'events', id));
        if (!snap.exists()) { navigate('/'); return; }
        setEvent({ id: snap.id, ...snap.data() });
        const teamSnap = await getDocs(
          query(collection(db, 'teams'), where('eventId', '==', id))
        );
        setTeams(teamSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error('Failed to load event:', err);
      alert('Failed to load event. Check Firestore permissions.\n\n' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveInfo() {
    if (!event) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'events', id), { name: event.name, date: event.date });
      setSavedInfo(true);
      setTimeout(() => setSavedInfo(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function saveWaves() {
    if (!event) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'events', id), { waves: event.waves });
      setSavedWaves(true);
      setTimeout(() => setSavedWaves(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function getNextAvailableSlot(wave) {
    const slots = wave.slots || [];
    const nonPauseSlots = slots.filter((s) => !s.isPause);
    for (const slot of nonPauseSlots) {
      if ((slot.teams || []).length < wave.teamsPerSlot) return slot.slotIndex;
    }
    return nonPauseSlots.length > 0 ? nonPauseSlots[nonPauseSlots.length - 1].slotIndex : 0;
  }

  async function addTeam(waveId, formData) {
    const wave = event.waves.find((w) => w.id === waveId);
    if (!wave) return;
    const slotIndex = getNextAvailableSlot(wave);

    const existingBibs = teams.map((t) => parseInt(t.bibNumber, 10)).filter((n) => !isNaN(n));
    const nextBib = String(existingBibs.length > 0 ? Math.max(...existingBibs) + 1 : 100);

    const teamData = {
      eventId: id, waveId, slotIndex, ...formData,
      bibNumber: nextBib,
      finishTimeSeconds: null, rank: null, createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'teams'), teamData);
    const newTeam = { id: ref.id, ...teamData };
    const updatedWaves = event.waves.map((w) => {
      if (w.id !== waveId) return w;
      const updatedSlots = w.slots.map((s) =>
        s.slotIndex !== slotIndex ? s : { ...s, teams: [...(s.teams || []), ref.id] }
      );
      return { ...w, slots: updatedSlots };
    });
    await updateDoc(doc(db, 'events', id), { waves: updatedWaves });
    setTeams((prev) => [...prev, newTeam]);
    setEvent((prev) => ({ ...prev, waves: updatedWaves }));
    setShowTeamForm(null);
  }

  async function updateTeam(teamId, formData) {
    await updateDoc(doc(db, 'teams', teamId), formData);
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, ...formData } : t)));
    setEditingTeam(null);
  }

  async function changeTeamSlot(teamId, waveId, newSlotIndex) {
    const team = teams.find((t) => t.id === teamId);
    if (!team || team.slotIndex === newSlotIndex) return;
    await updateDoc(doc(db, 'teams', teamId), { slotIndex: newSlotIndex });
    const updatedWaves = event.waves.map((w) => {
      if (w.id !== waveId) return w;
      const updatedSlots = w.slots.map((s) => {
        if (s.slotIndex === team.slotIndex)
          return { ...s, teams: (s.teams || []).filter((tid) => tid !== teamId) };
        if (s.slotIndex === newSlotIndex)
          return { ...s, teams: [...(s.teams || []), teamId] };
        return s;
      });
      return { ...w, slots: updatedSlots };
    });
    await updateDoc(doc(db, 'events', id), { waves: updatedWaves });
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, slotIndex: newSlotIndex } : t)));
    setEvent((prev) => ({ ...prev, waves: updatedWaves }));
  }

  async function deleteTeam(team) {
    if (!window.confirm(`Remove team "${team.teamName}"?`)) return;
    await deleteDoc(doc(db, 'teams', team.id));
    const updatedWaves = event.waves.map((w) => {
      if (w.id !== team.waveId) return w;
      const updatedSlots = w.slots.map((s) => ({
        ...s, teams: (s.teams || []).filter((tid) => tid !== team.id),
      }));
      return { ...w, slots: updatedSlots };
    });
    await updateDoc(doc(db, 'events', id), { waves: updatedWaves });
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
    setEvent((prev) => ({ ...prev, waves: updatedWaves }));
  }

  if (loading) {
    return (
      <div className="page-layout" style={{ flexDirection: 'column' }}>
        <NavBar />
        <div className="loading-screen" style={{ height: 'auto', flex: 1 }}>Loading event...</div>
      </div>
    );
  }

  const wavesForTeams = (event?.waves || []).filter((w) => !w.isRest && !w.isPause);
  const checklistItems = config?.checklistItems || [];

  return (
    <div className="page-layout" style={{ flexDirection: 'column' }}>
      <NavBar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <Link to="/" style={{ color: 'var(--text-muted)' }}>Events</Link> /
            </div>
            <h1 className="page-title">{event?.name || 'Event'}</h1>
          </div>
          <div className="flex gap-8">
            <Link to={`/event/${id}/startlist`} className="btn-secondary" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.88rem', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: '0.04em', textDecoration: 'none' }}>
              Start List
            </Link>
            <Link to={`/event/${id}/results`} className="btn-secondary" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.88rem', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: '0.04em', textDecoration: 'none' }}>
              Results
            </Link>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab 0: Info */}
        {tab === 0 && (
          <div className="card" style={{ maxWidth: 500 }}>
            <div className="flex-col gap-16">
              <div className="form-group">
                <label>Event Name</label>
                <input
                  value={event?.name || ''}
                  onChange={(e) => setEvent((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. March Simulation"
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <div ref={calRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    className="date-trigger"
                    onClick={() => setShowCal(v => !v)}
                  >
                    {event?.date ? formatDateWithDay(event.date) : 'Pick a date…'}
                    <span style={{ marginLeft: 8, opacity: 0.5 }}>▾</span>
                  </button>
                  {showCal && (
                    <CalendarPicker
                      value={event?.date || ''}
                      onChange={(d) => { setEvent(prev => ({ ...prev, date: d })); setShowCal(false); }}
                    />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-primary" onClick={saveInfo} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {savedInfo && (
                  <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontFamily: 'DM Mono, monospace' }}>Saved!</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Waves */}
        {tab === 1 && (
          <div>
            <WaveBuilder
              waves={event?.waves || []}
              categories={config?.categories || []}
              stationTemplates={config?.stationTemplates || []}
              onWavesChange={(waves) => setEvent((prev) => ({ ...prev, waves }))}
            />
            <div className="mt-20" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn-primary" onClick={saveWaves} disabled={saving}>
                {saving ? 'Saving...' : 'Save Waves'}
              </button>
              {savedWaves && (
                <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontFamily: 'DM Mono, monospace' }}>Saved!</span>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Teams */}
        {tab === 2 && (
          <div className="teams-tab">
            {wavesForTeams.length === 0 && (
              <div className="teams-empty">
                No waves defined yet. Go to the Waves tab to add waves first.
              </div>
            )}
            {wavesForTeams.map((wave) => {
              const cat = config?.categories?.find((c) => c.id === wave.categoryId);
              const waveTeams = teams.filter((t) => t.waveId === wave.id);
              const allSlots = recalculateSlotTimes(wave.slots || [], wave.startTime, wave.intervalMinutes);
              const assignableSlots = allSlots.filter((s) => !s.isPause);
              return (
                <div key={wave.id} className="wave-teams-section">
                  <div className="wave-teams-header">
                    <span className="badge badge-category">{cat?.label || wave.categoryId}</span>
                    <span className="wave-teams-time mono">{wave.startTime}</span>
                    <span className="wave-teams-count">{waveTeams.length} teams</span>
                    <button
                      className="btn-primary"
                      style={{ padding: '4px 12px', fontSize: '0.8rem', marginLeft: 'auto' }}
                      onClick={() => setShowTeamForm(wave.id)}
                    >
                      + Add Team
                    </button>
                  </div>

                  {showTeamForm === wave.id && (
                    <div className="mt-12">
                      <TeamForm
                        categoryType={cat?.type}
                        onSave={(data) => addTeam(wave.id, data)}
                        onCancel={() => setShowTeamForm(null)}
                      />
                    </div>
                  )}

                  {waveTeams.length > 0 && (
                    <table className="data-table mt-12">
                      <thead>
                        <tr>
                          <th>Bib</th>
                          <th>Team</th>
                          <th>Athletes</th>
                          <th>Start Time</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {waveTeams.map((team) => (
                          editingTeam === team.id ? (
                            <tr key={team.id}>
                              <td colSpan={5}>
                                <TeamForm
                                  categoryType={cat?.type}
                                  initialData={team}
                                  onSave={(data) => updateTeam(team.id, data)}
                                  onCancel={() => setEditingTeam(null)}
                                />
                              </td>
                            </tr>
                          ) : (
                            <tr key={team.id}>
                              <td className="mono" style={{ color: 'var(--yellow)', fontSize: '0.85rem' }}>{team.bibNumber || '—'}</td>
                              <td style={{ fontWeight: 600 }}>{team.teamName}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {[team.athlete1First, team.athlete1Last].filter(Boolean).join(' ')}
                                {team.athlete2First && ` / ${[team.athlete2First, team.athlete2Last].filter(Boolean).join(' ')}`}
                              </td>
                              <td>
                                <select
                                  value={team.slotIndex}
                                  onChange={(e) => changeTeamSlot(team.id, wave.id, Number(e.target.value))}
                                  style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', padding: '2px 4px' }}
                                >
                                  {assignableSlots.map((s) => (
                                    <option key={s.slotIndex} value={s.slotIndex}>{s.scheduledTime}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <div className="flex gap-4">
                                  <button className="btn-ghost" onClick={() => setEditingTeam(team.id)}>Edit</button>
                                  <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteTeam(team)}>Remove</button>
                                </div>
                              </td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  )}

                  {waveTeams.length === 0 && showTeamForm !== wave.id && (
                    <div className="teams-wave-empty">No teams in this wave yet.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Checklist */}
        {tab === 3 && (
          <div className="card" style={{ maxWidth: 640 }}>
            <ChecklistPanel
              eventId={id}
              checklist={event?.checklist || {}}
              checklistItems={checklistItems}
            />
          </div>
        )}
      </div>

      <style>{`
        .teams-tab {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .wave-teams-section {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .wave-teams-header {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .wave-teams-time {
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
          color: var(--yellow);
        }
        .wave-teams-count {
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .teams-empty, .teams-wave-empty {
          text-align: center;
          padding: 40px;
          color: var(--text-dim);
          font-style: italic;
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .teams-wave-empty {
          padding: 20px;
          margin-top: 12px;
          border-radius: var(--radius);
        }
        .mono {
          font-family: 'DM Mono', monospace;
        }
        .date-trigger {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
          padding: 8px 14px;
          cursor: pointer;
          text-align: left;
          min-width: 240px;
          transition: border-color var(--transition);
        }
        .date-trigger:hover { border-color: var(--yellow); }
        .cal-popup {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 200;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          min-width: 240px;
        }
        .cal-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .cal-nav button {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 1.2rem;
          cursor: pointer;
          padding: 2px 8px;
          border-radius: var(--radius);
          line-height: 1;
        }
        .cal-nav button:hover { background: var(--bg-elevated); color: var(--text); }
        .cal-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          font-size: 0.95rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text);
        }
        .cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }
        .cal-dow {
          text-align: center;
          font-size: 0.68rem;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-dim);
          padding: 4px 0 6px;
          letter-spacing: 0.04em;
        }
        .cal-cell {
          text-align: center;
          padding: 6px 2px;
          border-radius: var(--radius);
          font-size: 0.82rem;
          font-family: 'DM Mono', monospace;
          color: transparent;
          cursor: default;
        }
        .cal-cell-active {
          color: var(--text-muted);
          cursor: pointer;
        }
        .cal-cell-active:hover { background: var(--bg-elevated); color: var(--text); }
        .cal-cell-today { color: var(--yellow) !important; font-weight: 700; }
        .cal-cell-sel {
          background: var(--yellow) !important;
          color: #000 !important;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
