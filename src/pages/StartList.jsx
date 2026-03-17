import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureConfigExists } from '../utils/firestoreUtils';
import { recalculateSlotTimes } from '../utils/timeUtils';

export default function StartList() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setTeams(teamSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  if (loading) {
    return <div className="loading-screen">Loading start list...</div>;
  }

  if (!event) {
    return <div className="loading-screen">Event not found.</div>;
  }

  const waves = event.waves || [];

  return (
    <div className="startlist-page">
      <div className="startlist-controls no-print">
        <Link to={`/event/${id}`} className="startlist-back">← Back to Event</Link>
        <button className="btn-primary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="startlist-doc">
        <div className="startlist-doc-header">
          <div className="startlist-event-name">{event.name}</div>
          <div className="startlist-event-date mono">{event.date}</div>
        </div>

        {waves.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            No waves defined for this event.
          </div>
        )}

        {waves.map((wave, waveIdx) => {
          const cat = config?.categories?.find((c) => c.id === wave.categoryId);
          const recalcSlots = recalculateSlotTimes(wave.slots || [], wave.startTime, wave.intervalMinutes);

          return (
            <div key={wave.id} className={`startlist-wave ${waveIdx > 0 ? 'page-break' : ''}`}>
              <div className="startlist-wave-header">
                <span className="startlist-wave-cat">{cat?.label || wave.categoryId}</span>
                <span className="startlist-wave-time mono">{wave.startTime}</span>
              </div>

              <table className="startlist-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Bib</th>
                    <th>Team</th>
                    <th>Athletes</th>
                  </tr>
                </thead>
                <tbody>
                  {recalcSlots.map((slot, slotIdx) => {
                    if (slot.isPause) {
                      return (
                        <tr key={slotIdx} className="startlist-pause-row">
                          <td colSpan={4} className="startlist-pause-cell mono">
                            ── {slot.pauseDurationMinutes} min pause ──
                          </td>
                        </tr>
                      );
                    }

                    const slotTeams = (slot.teams || [])
                      .map((tid) => teams.find((t) => t.id === tid))
                      .filter(Boolean);

                    if (slotTeams.length === 0) {
                      return (
                        <tr key={slotIdx} className="startlist-empty-slot">
                          <td className="mono">{slot.scheduledTime}</td>
                          <td>—</td>
                          <td colSpan={2} style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Open slot</td>
                        </tr>
                      );
                    }

                    return slotTeams.map((team, ti) => (
                      <tr key={`${slotIdx}-${ti}`}>
                        {ti === 0 && (
                          <td className="mono" rowSpan={slotTeams.length}>{slot.scheduledTime}</td>
                        )}
                        <td className="mono startlist-bib">{team.bibNumber || '—'}</td>
                        <td className="startlist-team-name">{team.teamName}</td>
                        <td className="startlist-athletes">
                          {[team.athlete1First, team.athlete1Last].filter(Boolean).join(' ')}
                          {team.athlete2First && (
                            <span className="startlist-athlete2">
                              {' / '}{[team.athlete2First, team.athlete2Last].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <style>{`
        .startlist-page {
          background: var(--bg);
          min-height: 100vh;
          padding: 24px;
        }
        .startlist-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .startlist-back {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.9rem;
          color: var(--text-muted);
          text-decoration: none;
          letter-spacing: 0.04em;
        }
        .startlist-back:hover {
          color: var(--text);
          text-decoration: none;
        }
        .startlist-doc {
          max-width: 860px;
          margin: 0 auto;
        }
        .startlist-doc-header {
          margin-bottom: 32px;
          display: flex;
          align-items: baseline;
          gap: 16px;
        }
        .startlist-event-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 2.2rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .startlist-event-date {
          font-family: 'DM Mono', monospace;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .startlist-wave {
          margin-bottom: 48px;
        }
        .page-break {
          page-break-before: always;
        }
        .startlist-wave-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--yellow);
        }
        .startlist-wave-cat {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 1.4rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .startlist-wave-time {
          font-family: 'DM Mono', monospace;
          font-size: 0.9rem;
          color: var(--yellow);
        }
        .startlist-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .startlist-table th {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-dim);
          padding: 6px 10px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .startlist-table td {
          padding: 9px 10px;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
        }
        .startlist-bib {
          font-family: 'DM Mono', monospace;
          color: var(--yellow);
          font-size: 0.85rem;
          font-weight: 500;
        }
        .startlist-team-name {
          font-weight: 600;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1rem;
          letter-spacing: 0.02em;
        }
        .startlist-athletes {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .startlist-athlete2 {
          color: var(--text-dim);
        }
        .startlist-pause-row td {
          border-bottom: none;
        }
        .startlist-pause-cell {
          text-align: center;
          color: var(--text-dim);
          font-style: italic;
          padding: 12px 10px;
          font-size: 0.82rem;
        }

        @media print {
          .no-print { display: none !important; }
          .startlist-page { padding: 16px; background: white; }
          .startlist-event-name { color: black; }
          .startlist-event-date { color: #666; }
          .startlist-wave-cat { color: black; }
          .startlist-wave-time { color: #555; }
          .startlist-wave-header { border-bottom-color: #000; }
          .startlist-table th { color: #666; border-bottom-color: #ccc; }
          .startlist-table td { border-bottom-color: #eee; color: black; }
          .startlist-bib { color: black; }
          .startlist-athletes { color: #444; }
          .startlist-athlete2 { color: #888; }
          .startlist-pause-cell { color: #999; }
          .page-break { page-break-before: always; }
        }
      `}</style>
    </div>
  );
}
