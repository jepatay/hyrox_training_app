import { useState } from 'react';

const EMPTY_FORM = {
  teamName: '',
  bibNumber: '',
  athlete1First: '',
  athlete1Last: '',
  athlete2First: '',
  athlete2Last: '',
};

export default function TeamForm({ categoryType, onSave, onCancel, initialData }) {
  const [form, setForm] = useState(initialData || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isDouble = categoryType === 'double';

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.teamName.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="team-form">
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="form-group">
          <label>Team Name *</label>
          <input
            name="teamName"
            value={form.teamName}
            onChange={handleChange}
            placeholder="e.g. Thunder Duo"
            required
          />
        </div>
        <div className="form-group">
          <label>Bib Number</label>
          <input
            name="bibNumber"
            value={form.bibNumber}
            onChange={handleChange}
            placeholder="e.g. A01"
            className="mono-input"
          />
        </div>
      </div>

      <div className="form-section-label">
        {isDouble ? 'Athlete 1' : 'Athlete'}
      </div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="form-group">
          <label>First Name *</label>
          <input
            name="athlete1First"
            value={form.athlete1First}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>Last Name *</label>
          <input
            name="athlete1Last"
            value={form.athlete1Last}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      {isDouble && (
        <>
          <div className="form-section-label">Athlete 2</div>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label>First Name</label>
              <input
                name="athlete2First"
                value={form.athlete2First}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                name="athlete2Last"
                value={form.athlete2Last}
                onChange={handleChange}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex gap-8 mt-16">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : (initialData ? 'Update Team' : 'Add Team')}
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
        .form-section-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--yellow);
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .mono-input {
          font-family: 'DM Mono', monospace;
        }
      `}</style>
    </form>
  );
}
