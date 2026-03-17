import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function ChecklistPanel({ eventId, checklist, checklistItems }) {
  const [local, setLocal] = useState(checklist || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(checklist || {});
  }, [checklist]);

  // Group items by category
  const grouped = checklistItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  // Only show items that exist in config (ignore orphaned keys)
  const validIds = new Set(checklistItems.map((i) => i.id));

  async function toggle(id) {
    const newVal = !local[id];
    const updated = { ...local, [id]: newVal };
    setLocal(updated);
    setSaving(true);
    try {
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, { [`checklist.${id}`]: newVal });
    } finally {
      setSaving(false);
    }
  }

  const totalValid = checklistItems.length;
  const totalChecked = checklistItems.filter((i) => local[i.id]).length;

  return (
    <div className="checklist-panel">
      <div className="checklist-header">
        <span className="checklist-progress">
          {totalChecked}/{totalValid} completed
        </span>
        <div className="checklist-bar">
          <div
            className="checklist-bar-fill"
            style={{ width: totalValid > 0 ? `${(totalChecked / totalValid) * 100}%` : '0%' }}
          />
        </div>
        {saving && <span className="checklist-saving">Saving...</span>}
      </div>

      <p className="checklist-note">
        Checklist template is managed in <a href="/settings">Settings</a>.
      </p>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="checklist-group">
          <div className="checklist-group-label">{category}</div>
          {items.map((item) => {
            if (!validIds.has(item.id)) return null;
            return (
              <label key={item.id} className="checklist-item">
                <input
                  type="checkbox"
                  checked={!!local[item.id]}
                  onChange={() => toggle(item.id)}
                  className="checklist-checkbox"
                />
                <span className={`checklist-text ${local[item.id] ? 'checked' : ''}`}>
                  {item.text}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      <style>{`
        .checklist-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .checklist-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .checklist-progress {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          color: var(--yellow);
          min-width: 110px;
        }
        .checklist-bar {
          flex: 1;
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
        }
        .checklist-bar-fill {
          height: 100%;
          background: var(--yellow);
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .checklist-saving {
          font-size: 0.78rem;
          color: var(--text-dim);
          font-family: 'DM Mono', monospace;
        }
        .checklist-note {
          font-size: 0.82rem;
          color: var(--text-dim);
        }
        .checklist-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .checklist-group-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 6px 0 4px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 4px;
        }
        .checklist-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius);
          cursor: pointer;
          transition: background var(--transition);
          font-size: 0.92rem;
        }
        .checklist-item:hover {
          background: var(--bg-elevated);
        }
        .checklist-checkbox {
          width: 16px;
          height: 16px;
          min-width: 16px;
          margin-top: 1px;
          cursor: pointer;
          accent-color: var(--yellow);
        }
        .checklist-text {
          line-height: 1.4;
        }
        .checklist-text.checked {
          color: var(--text-dim);
          text-decoration: line-through;
        }
      `}</style>
    </div>
  );
}
