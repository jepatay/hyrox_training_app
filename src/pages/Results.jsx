import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureConfigExists } from '../utils/firestoreUtils';
import { mmssToSeconds, secondsToMmss, isValidMmss } from '../utils/timeUtils';
import NavBar from '../components/NavBar';

export default function Results() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeInputs, setTimeInputs] = useState({});
  const [timeErrors, setTimeErrors] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    const [cfg, eventSnap, teamSnap] = await Promise.all([
      ensureConfigExists(),
      getDoc(doc(db, 'events', id)),
      getDocs(query(collection(db, 'teams'), where('eventId', '==', id))),
    ]);
    setConfig(cfg);
    if (eventSnap.exists()) setEvent({ id: eventSnap.id, ...eventSnap.data() });
    const teamList = teamSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setTeams(teamList);

    // Pre-fill time inputs
    const inputs = {};
    teamList.forEach((t) => {
      inputs[t.id] = t.finishTimeSeconds != null ? secondsToMmss(t.finishTimeSeconds) : '';
    });
    setTimeInputs(inputs);
    setLoading(false);
  }

  function handleTimeChange(teamId, value) {
    setTimeInputs((prev) => ({ ...prev, [teamId]: value }));
    setTimeErrors((prev) => ({ ...prev, [teamId]: '' }));
  }

  function handleTimeBlur(teamId, value) {
    if (value === '') return;
    if (!isValidMmss(value)) {
      setTimeErrors((prev) => ({ ...prev, [teamId]: 'Format: MM:SS' }));
    }
  }

  async function saveTime(team) {
    const rawVal = timeInputs[team.id] || '';
    if (rawVal !== '' && !isValidMmss(rawVal)) {
      setTimeErrors((prev) => ({ ...prev, [team.id]: 'Format: MM:SS' }));
      return;
    }
    const seconds = rawVal === '' ? null : mmssToSeconds(rawVal);
    setSaving((prev) => ({ ...prev, [team.id]: true }));

    try {
      await updateDoc(doc(db, 'teams', team.id), { finishTimeSeconds: seconds });
      const updatedTeams = teams.map((t) =>
        t.id === team.id ? { ...t, finishTimeSeconds: seconds } : t
      );

      // Re-rank within the same wave+category
      const wave = event?.waves?.find((w) => w.id === team.waveId);
      const cat = wave?.categoryId;
      const categoryTeams = updatedTeams.filter(
        (t) => t.waveId === team.waveId && t.finishTimeSeconds != null
      );
      const ranked = [...categoryTeams].sort((a, b) => a.finishTimeSeconds - b.finishTimeSeconds);

      const rankUpdates = ranked.map((t, i) =>
        updateDoc(doc(db, 'teams', t.id), { rank: i + 1 })
      );
      await Promise.all(rankUpdates);

      const rankMap = {};
      ranked.forEach((t, i) => { rankMap[t.id] = i + 1; });

      setTeams(updatedTeams.map((t) => ({
        ...t,
        rank: rankMap[t.id] !== undefined ? rankMap[t.id] : (t.finishTimeSeconds == null ? null : t.rank),
      })));
    } finally {
      setSaving((prev) => ({ ...prev, [team.id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="page-layout" style={{ flexDirection: 'column' }}>
        <NavBar />
        <div className="loading-screen" style={{ height: 'auto', flex: 1 }}>Loading results...</div>
      </div>
    );
  }

  const waves = event?.waves || [];

  return (
    <div className="page-layout" style={{ flexDirection: 'column' }}>
      <NavBar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <Link to={`/event/${id}`} style={{ color: 'var(--text-muted)' }}>← {event?.name}</Link>
            </div>
            <h1 className="page-title">Results</h1>
          </div>
          <div className="event-date mono" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {event?.date}
          </div>
        </div>

        {waves.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px' }}>
            No waves defined for this event.
          </div>
        )}

        {waves.map((wave) => {
          const cat = config?.categories?.find((c) => c.id === wave.categoryId);
          const waveTeams = teams.filter((t) => t.waveId === wave.id);
          const hasResults = waveTeams.some((t) => t.finishTimeSeconds != null);
          const sortedTeams = hasResults
            ? [...waveTeams].sort((a, b) => {
                if (a.finishTimeSeconds == null) return 1;
                if (b.finishTimeSeconds == null) return -1;
                return a.finishTimeSeconds - b.finishTimeSeconds;
              })
            : waveTeams;

          return (
            <div key={wave.id} className="results-wave card" style={{ marginBottom: '20px' }}>
              <div className="results-wave-header">
                <span className="badge badge-category">{cat?.label || wave.categoryId}</span>
                <span className="mono" style={{ color: 'var(--yellow)', fontSize: '0.88rem' }}>{wave.startTime}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{waveTeams.length} teams</span>
              </div>

              {waveTeams.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.88rem', paddingTop: '12px' }}>
                  No teams in this wave.
                </div>
              ) : (
                <table className="data-table" style={{ marginTop: '14px' }}>
                  <thead>
                    <tr>
                      {hasResults && <th style={{ width: 40 }}>Rank</th>}
                      <th>Bib</th>
                      <th>Team</th>
                      <th>Athletes</th>
                      <th style={{ width: 160 }}>Finish Time</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeams.map((team) => (
                      <tr key={team.id}>
                        {hasResults && (
                          <td>
                            {team.rank ? (
                              <span className="rank-badge" data-rank={team.rank}>
                                {team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : `#${team.rank}`}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            )}
                          </td>
                        )}
                        <td className="mono" style={{ color: 'var(--yellow)', fontSize: '0.85rem' }}>{team.bibNumber || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{team.teamName}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {[team.athlete1First, team.athlete1Last].filter(Boolean).join(' ')}
                          {team.athlete2First && ` / ${[team.athlete2First, team.athlete2Last].filter(Boolean).join(' ')}`}
                        </td>
                        <td>
                          <div>
                            <input
                              className="time-input"
                              value={timeInputs[team.id] || ''}
                              onChange={(e) => handleTimeChange(team.id, e.target.value)}
                              onBlur={(e) => handleTimeBlur(team.id, e.target.value)}
                              placeholder="MM:SS"
                              style={{
                                fontFamily: 'DM Mono, monospace',
                                fontSize: '0.95rem',
                                width: '100px',
                                borderColor: timeErrors[team.id] ? 'var(--danger)' : undefined,
                              }}
                            />
                            {timeErrors[team.id] && (
                              <div className="error-text">{timeErrors[team.id]}</div>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn-primary"
                            style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                            disabled={saving[team.id]}
                            onClick={() => saveTime(team)}
                          >
                            {saving[team.id] ? '...' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .results-wave-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .rank-badge {
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
        }
        .time-input {
          font-family: 'DM Mono', monospace;
        }
      `}</style>
    </div>
  );
}
