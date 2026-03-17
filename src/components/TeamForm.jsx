import { useState } from 'react';

export default function TeamForm({ categoryType, onSave, onCancel, initialData }) {
  const isDouble = categoryType === 'double';

  // Single name field per athlete — join existing first+last for backwards compat
  const [name, setName] = useState(() => {
    if (!initialData) return '';
    return [initialData.athlete1First, initialData.athlete1Last].filter(Boolean).join(' ')
      || initialData.teamName || '';
  });
  const [athlete1, setAthlete1] = useState(() => {
    if (!initialData) return '';
    return [initialData.athlete1First, initialData.athlete1Last].filter(Boolean).join(' ') || '';
  });
  const [athlete2, setAthlete2] = useState(() => {
    if (!initialData) return '';
    return [initialData.athlete2First, initialData.athlete2Last].filter(Boolean).join(' ') || '';
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const a1 = isDouble ? athlete1.trim() : name.trim();
    if (!a1) return;

    const formData = isDouble
      ? {
          teamName: [athlete1.trim(), athlete2.trim()].filter(Boolean).join(' / '),
          athlete1First: athlete1.trim(),
          athlete1Last: '',
          athlete2First: athlete2.trim(),
          athlete2Last: '',
        }
      : {
          teamName: name.trim(),
          athlete1First: name.trim(),
          athlete1Last: '',
          athlete2First: '',
          athlete2Last: '',
        };

    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="team-form">
      {isDouble ? (
        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="form-group">
            <label>Athlete 1 *</label>
            <input
              value={athlete1}
              onChange={(e) => setAthlete1(e.target.value)}
              placeholder="Full name"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Athlete 2</label>
            <input
              value={athlete2}
              onChange={(e) => setAthlete2(e.target.value)}
              placeholder="Full name"
            />
          </div>
        </div>
      ) : (
        <div className="form-group">
          <label>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            required
            autoFocus
          />
        </div>
      )}

      <div className="flex gap-8 mt-12">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : (initialData ? 'Update' : 'Add')}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <style>{`
        .team-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
        }
      `}</style>
    </form>
  );
}
