import { useState, useEffect } from 'react';
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

export default function EventEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(null); // waveId or null
  const [editingTeam, setEditingTeam] = useState(null);

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
    } finally {
      setLoading(false);
    }
  }

  async function saveInfo() {
    if (!event) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'events', id), {
        name: event.name,
        date: event.date,
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveWaves() {
    if (!event) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'events', id), { waves: event.waves });
    } finally {
      setSaving(false);
    }
  }

  function getNextAvailableSlot(wave) {
    const slots = wave.slots || [];
    const nonPauseSlots = slots.filter((s) => !s.isPause);
    for (const slot of nonPauseSlots) {
      const teamsInSlot = (slot.teams || []).length;
      if (teamsInSlot < wave.teamsPerSlot) {
        return slot.slotIndex;
      }
    }
    return nonPauseSlots.length > 0 ? nonPauseSlots[nonPauseSlots.length - 1].slotIndex : 0;
  }

  async function addTeam(waveId, formData) {
    const wave = event.waves.find((w) => w.id === waveId);
    if (!wave) return;
    const slotIndex = getNextAvailableSlot(wave);

    const teamData = {
      eventId: id,
      waveId,
      slotIndex,
      ...formData,
      finishTimeSeconds: null,
      rank: null,
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, 'teams'), teamData);
    const newTeam = { id: ref.id, ...teamData };

    // Update slot in wave
    const updatedWaves = event.waves.map((w) => {
      if (w.id !== waveId) return w;
      const updatedSlots = w.slots.map((s) => {
        if (s.slotIndex !== slotIndex) return s;
        return { ...s, teams: [...(s.teams || []), ref.id] };
      });
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

  async function deleteTeam(team) {
    if (!window.confirm(`Remove team "${team.teamName}"?`)) return;
    await deleteDoc(doc(db, 'teams', team.id));

    // Remove from slot
    const updatedWaves = event.waves.map((w) => {
      if (w.id !== team.waveId) return w;
      const updatedSlots = w.slots.map((s) => ({
        ...s,
        teams: (s.teams || []).filter((tid) => tid !== team.id),
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

  const wavesForTeams = (event?.waves || []).filter((w) => !w.isPause);
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
                <input
                  type="date"
                  value={event?.date || ''}
                  onChange={(e) => setEvent((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <button className="btn-primary" onClick={saveInfo} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
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
            <div className="mt-20">
              <button className="btn-primary" onClick={saveWaves} disabled={saving}>
                {saving ? 'Saving...' : 'Save Waves'}
              </button>
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
                          <th>Slot</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {waveTeams.map((team) => {
                          const slots = recalculateSlotTimes(wave.slots || [], wave.startTime, wave.intervalMinutes);
                          const slot = slots.find((s) => s.slotIndex === team.slotIndex);
                          return editingTeam === team.id ? (
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
                              <td className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                {slot?.scheduledTime || '—'}
                              </td>
                              <td>
                                <div className="flex gap-4">
                                  <button className="btn-ghost" onClick={() => setEditingTeam(team.id)}>Edit</button>
                                  <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteTeam(team)}>Remove</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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
      `}</style>
    </div>
  );
}
