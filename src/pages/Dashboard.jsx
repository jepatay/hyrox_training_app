import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { buildChecklistFromConfig, ensureConfigExists } from '../utils/firestoreUtils';
import NavBar from '../components/NavBar';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'events'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }

  async function createEvent() {
    setCreating(true);
    try {
      const config = await ensureConfigExists();
      const checklist = buildChecklistFromConfig(config.checklistItems || []);
      const ref = await addDoc(collection(db, 'events'), {
        name: 'New Event',
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        waves: [],
        checklist,
      });
      navigate(`/event/${ref.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteEvent(id, name) {
    if (!window.confirm(`Delete event "${name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'events', id));
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function getEventStatus(event) {
    const date = new Date(event.date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (date < now) return 'past';
    if (date.toDateString() === now.toDateString()) return 'today';
    return 'upcoming';
  }

  const statusColors = {
    past: 'var(--text-dim)',
    today: 'var(--yellow)',
    upcoming: 'var(--success)',
  };

  return (
    <div className="page-layout" style={{ flexDirection: 'column' }}>
      <NavBar />
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Events</h1>
          <button className="btn-primary" onClick={createEvent} disabled={creating}>
            {creating ? 'Creating...' : '+ New Event'}
          </button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px' }}>
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon">◈</div>
            <div className="dashboard-empty-title">No events yet</div>
            <p>Create your first simulation event to get started.</p>
            <button className="btn-primary" onClick={createEvent} disabled={creating} style={{ marginTop: '16px' }}>
              + New Event
            </button>
          </div>
        ) : (
          <div className="events-grid">
            {events.map((event) => {
              const status = getEventStatus(event);
              const waveCount = (event.waves || []).length;
              const checklistTotal = Object.keys(event.checklist || {}).length;
              const checklistDone = Object.values(event.checklist || {}).filter(Boolean).length;
              return (
                <div key={event.id} className="event-card">
                  <div className="event-card-header">
                    <div>
                      <div className="event-card-name">{event.name}</div>
                      <div className="event-card-date mono">{event.date}</div>
                    </div>
                    <div
                      className="event-status-dot"
                      style={{ background: statusColors[status] }}
                      title={status}
                    />
                  </div>

                  <div className="event-card-meta">
                    <span>{waveCount} wave{waveCount !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>Checklist {checklistDone}/{checklistTotal}</span>
                  </div>

                  <div className="event-card-actions">
                    <Link to={`/event/${event.id}`} className="event-action-btn">Edit</Link>
                    <Link to={`/event/${event.id}/startlist`} className="event-action-btn">Start List</Link>
                    <Link to={`/event/${event.id}/results`} className="event-action-btn">Results</Link>
                    <button
                      className="event-action-btn event-action-delete"
                      onClick={() => deleteEvent(event.id, event.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .event-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: border-color var(--transition);
        }
        .event-card:hover {
          border-color: var(--text-dim);
        }
        .event-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .event-card-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          font-size: 1.2rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .event-card-date {
          font-family: 'DM Mono', monospace;
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .event-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 4px;
        }
        .event-card-meta {
          display: flex;
          gap: 8px;
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .event-card-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .event-action-btn {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 5px 12px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          color: var(--text-muted);
          background: transparent;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: color var(--transition), border-color var(--transition), background var(--transition);
        }
        .event-action-btn:hover {
          color: var(--text);
          border-color: var(--text-muted);
          background: var(--bg-elevated);
          text-decoration: none;
        }
        .event-action-delete {
          color: var(--danger);
          border-color: transparent;
        }
        .event-action-delete:hover {
          border-color: var(--danger);
          background: transparent;
          color: var(--danger);
        }
        .dashboard-empty {
          text-align: center;
          padding: 80px 40px;
          color: var(--text-muted);
        }
        .dashboard-empty-icon {
          font-size: 3rem;
          margin-bottom: 16px;
          color: var(--text-dim);
        }
        .dashboard-empty-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.4rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
