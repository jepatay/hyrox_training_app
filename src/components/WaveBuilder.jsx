import { useState } from 'react';
import { recalculateSlotTimes } from '../utils/timeUtils';

function WaveCard({ wave, categories, stationTemplates, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseMinutes, setPauseMinutes] = useState(10);
  const [pauseAfterIndex, setPauseAfterIndex] = useState(0);

  const category = categories.find((c) => c.id === wave.categoryId);
  const template = stationTemplates.find((t) => t.id === wave.stationTemplateId);

  const recalcSlots = recalculateSlotTimes(wave.slots || [], wave.startTime, wave.intervalMinutes);

  function updateField(field, value) {
    const updated = { ...wave, [field]: value };
    if (field === 'startTime' || field === 'intervalMinutes') {
      updated.slots = recalculateSlotTimes(updated.slots || [], updated.startTime, updated.intervalMinutes);
    }
    onUpdate(updated);
  }

  function addPause() {
    const slots = [...(wave.slots || [])];
    const newPause = {
      slotIndex: pauseAfterIndex + 1,
      scheduledTime: '',
      isPause: true,
      pauseDurationMinutes: Number(pauseMinutes),
      teams: [],
    };
    slots.splice(pauseAfterIndex + 1, 0, newPause);
    const reindexed = slots.map((s, i) => ({ ...s, slotIndex: i }));
    const recalc = recalculateSlotTimes(reindexed, wave.startTime, wave.intervalMinutes);
    onUpdate({ ...wave, slots: recalc });
    setShowPauseForm(false);
  }

  function removePauseSlot(idx) {
    const slots = wave.slots.filter((_, i) => i !== idx);
    const reindexed = slots.map((s, i) => ({ ...s, slotIndex: i }));
    const recalc = recalculateSlotTimes(reindexed, wave.startTime, wave.intervalMinutes);
    onUpdate({ ...wave, slots: recalc });
  }

  const nonPauseSlots = recalcSlots.filter((s) => !s.isPause);

  return (
    <div className="wave-card">
      <div className="wave-card-header" onClick={() => setExpanded((e) => !e)}>
        <div className="wave-card-left">
          <span className="wave-expand-icon">{expanded ? '▾' : '▸'}</span>
          <span className="badge badge-category">{category?.label || wave.categoryId}</span>
          <span className="wave-time mono">{wave.startTime}</span>
          <span className="wave-meta">{nonPauseSlots.length} slots · {wave.intervalMinutes}min interval</span>
        </div>
        <div className="wave-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost" onClick={onMoveUp} disabled={isFirst} title="Move up">↑</button>
          <button className="btn-ghost" onClick={onMoveDown} disabled={isLast} title="Move down">↓</button>
          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="wave-card-body">
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="form-group">
              <label>Category</label>
              <select value={wave.categoryId} onChange={(e) => updateField('categoryId', e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input
                type="time"
                value={wave.startTime}
                onChange={(e) => updateField('startTime', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Interval (min)</label>
              <input
                type="number"
                min="1"
                value={wave.intervalMinutes}
                onChange={(e) => updateField('intervalMinutes', Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Teams per Slot</label>
              <input
                type="number"
                min="1"
                value={wave.teamsPerSlot}
                onChange={(e) => updateField('teamsPerSlot', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="form-group">
              <label>Station Template</label>
              <select value={wave.stationTemplateId} onChange={(e) => updateField('stationTemplateId', e.target.value)}>
                {stationTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="wave-slots-section">
            <div className="flex items-center justify-between mb-8">
              <span className="section-title" style={{ marginBottom: 0 }}>Slots</span>
              <button
                className="btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                onClick={() => setShowPauseForm((v) => !v)}
              >
                + Insert Pause
              </button>
            </div>

            {showPauseForm && (
              <div className="pause-form">
                <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
                  <div className="form-group">
                    <label>After Slot Index</label>
                    <select value={pauseAfterIndex} onChange={(e) => setPauseAfterIndex(Number(e.target.value))}>
                      {recalcSlots.map((s, i) => (
                        <option key={i} value={i}>
                          {s.isPause ? `[Pause] ${s.scheduledTime}` : `Slot ${i}: ${s.scheduledTime}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Duration (min)</label>
                    <input
                      type="number"
                      min="1"
                      value={pauseMinutes}
                      onChange={(e) => setPauseMinutes(Number(e.target.value))}
                    />
                  </div>
                  <button className="btn-primary" style={{ alignSelf: 'flex-end', padding: '8px 12px' }} onClick={addPause}>
                    Add
                  </button>
                  <button className="btn-secondary" style={{ alignSelf: 'flex-end', padding: '8px 12px' }} onClick={() => setShowPauseForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="slots-list">
              {recalcSlots.map((slot, idx) => (
                <div key={idx} className={`slot-item ${slot.isPause ? 'slot-item-pause' : ''}`}>
                  <span className="slot-time mono">{slot.scheduledTime}</span>
                  {slot.isPause ? (
                    <span className="slot-pause-badge">── {slot.pauseDurationMinutes} min pause ──</span>
                  ) : (
                    <>
                      <span className="slot-label">Slot {idx + 1}</span>
                      <span className="slot-team-count">{(slot.teams || []).length} / {wave.teamsPerSlot} teams</span>
                    </>
                  )}
                  {slot.isPause && (
                    <button
                      className="btn-ghost"
                      style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)' }}
                      onClick={() => removePauseSlot(idx)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .wave-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .wave-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          cursor: pointer;
          user-select: none;
          transition: background var(--transition);
        }
        .wave-card-header:hover {
          background: var(--bg-elevated);
        }
        .wave-card-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .wave-expand-icon {
          color: var(--text-dim);
          font-size: 0.9rem;
          width: 16px;
        }
        .wave-time {
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
          color: var(--yellow);
        }
        .wave-meta {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .wave-card-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .wave-card-body {
          padding: 16px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .wave-slots-section {
          margin-top: 4px;
        }
        .pause-form {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px;
          margin-bottom: 10px;
        }
        .slots-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: 8px;
          max-height: 240px;
          overflow-y: auto;
        }
        .slot-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px;
          background: var(--bg-elevated);
          border-radius: var(--radius);
          font-size: 0.85rem;
        }
        .slot-item-pause {
          border: 1px dashed var(--border);
          opacity: 0.8;
        }
        .slot-time {
          font-family: 'DM Mono', monospace;
          font-size: 0.82rem;
          color: var(--yellow);
          min-width: 48px;
        }
        .slot-label {
          color: var(--text-muted);
          font-size: 0.8rem;
          min-width: 52px;
        }
        .slot-pause-badge {
          color: var(--text-dim);
          font-style: italic;
          font-family: 'DM Mono', monospace;
          font-size: 0.8rem;
        }
        .slot-team-count {
          color: var(--text-dim);
          font-size: 0.78rem;
          font-family: 'DM Mono', monospace;
        }
      `}</style>
    </div>
  );
}

export default function WaveBuilder({ waves, categories, stationTemplates, onWavesChange }) {
  function addWave() {
    const defaultCat = categories[0]?.id || '';
    const defaultTemplate = stationTemplates[0]?.id || '';
    const newWave = {
      id: `wave_${Date.now()}`,
      categoryId: defaultCat,
      startTime: '09:00',
      intervalMinutes: 10,
      teamsPerSlot: 2,
      stationTemplateId: defaultTemplate,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slotIndex: i,
        scheduledTime: '',
        isPause: false,
        pauseDurationMinutes: null,
        teams: [],
      })),
    };
    // Recalculate initial slot times
    const recalc = recalculateSlotTimes(newWave.slots, newWave.startTime, newWave.intervalMinutes);
    onWavesChange([...waves, { ...newWave, slots: recalc }]);
  }

  function updateWave(idx, updated) {
    const next = waves.map((w, i) => (i === idx ? updated : w));
    onWavesChange(next);
  }

  function deleteWave(idx) {
    onWavesChange(waves.filter((_, i) => i !== idx));
  }

  function moveWave(idx, dir) {
    const next = [...waves];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onWavesChange(next);
  }

  return (
    <div className="wave-builder">
      <div className="flex items-center justify-between mb-16">
        <span className="section-title" style={{ marginBottom: 0 }}>
          {waves.length} Wave{waves.length !== 1 ? 's' : ''}
        </span>
        <button className="btn-primary" onClick={addWave}>+ Add Wave</button>
      </div>

      {waves.length === 0 && (
        <div className="wave-empty">
          No waves yet. Click "Add Wave" to create the first wave.
        </div>
      )}

      <div className="waves-list">
        {waves.map((wave, idx) => (
          <WaveCard
            key={wave.id}
            wave={wave}
            categories={categories}
            stationTemplates={stationTemplates}
            onUpdate={(updated) => updateWave(idx, updated)}
            onDelete={() => deleteWave(idx)}
            onMoveUp={() => moveWave(idx, -1)}
            onMoveDown={() => moveWave(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === waves.length - 1}
          />
        ))}
      </div>

      <style>{`
        .wave-builder {
          display: flex;
          flex-direction: column;
        }
        .waves-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .wave-empty {
          text-align: center;
          padding: 40px;
          color: var(--text-dim);
          font-style: italic;
          border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
      `}</style>
    </div>
  );
}
