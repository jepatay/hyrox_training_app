import { useState } from 'react';
import { recalculateSlotTimes, addMinutesToTime } from '../utils/timeUtils';

// ── Rest Wave Card ────────────────────────────────────────────────────────────
function RestWaveCard({ wave, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const endTime = wave.startTime
    ? addMinutesToTime(wave.startTime, wave.durationMinutes || 30)
    : '--:--';

  return (
    <div className="wave-card wave-card-rest">
      <div className="wave-card-header" style={{ cursor: 'default' }}>
        <div className="wave-card-left">
          <span className="badge badge-rest">REST</span>
          <div className="rest-fields" onClick={(e) => e.stopPropagation()}>
            <input
              type="time"
              value={wave.startTime}
              onChange={(e) => onUpdate({ ...wave, startTime: e.target.value })}
              style={{ width: 90 }}
            />
            <span className="wave-meta">→ {endTime}</span>
            <input
              type="number"
              min="5"
              value={wave.durationMinutes || 30}
              onChange={(e) => onUpdate({ ...wave, durationMinutes: Number(e.target.value) })}
              style={{ width: 60 }}
              title="Duration (minutes)"
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>min</span>
          </div>
        </div>
        <div className="wave-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost" onClick={onMoveUp} disabled={isFirst} title="Move up">↑</button>
          <button className="btn-ghost" onClick={onMoveDown} disabled={isLast} title="Move down">↓</button>
          <button className="btn-danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Regular Wave Card ─────────────────────────────────────────────────────────
function WaveCard({ wave, categories, stationTemplates, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);

  const category = categories.find((c) => c.id === wave.categoryId);
  const recalcSlots = recalculateSlotTimes(wave.slots || [], wave.startTime, wave.intervalMinutes);
  const slotCount = recalcSlots.length;

  // Last slot start time = first wave slot time + (slotCount-1) * interval
  const lastSlotTime = slotCount > 0
    ? addMinutesToTime(wave.startTime, (slotCount - 1) * (wave.intervalMinutes || 0))
    : wave.startTime;

  function updateField(field, value) {
    const updated = { ...wave, [field]: value };
    if (field === 'startTime' || field === 'intervalMinutes') {
      updated.slots = recalculateSlotTimes(updated.slots || [], updated.startTime, updated.intervalMinutes);
    }
    onUpdate(updated);
  }

  function changeSlotCount(targetCount) {
    if (targetCount < 1) return;
    const currentSlots = wave.slots || [];
    const currentCount = currentSlots.length;

    if (targetCount > currentCount) {
      const newSlots = [...currentSlots];
      for (let i = currentCount; i < targetCount; i++) {
        newSlots.push({ slotIndex: i, scheduledTime: '', isPause: false, pauseDurationMinutes: null, teams: [] });
      }
      const reindexed = newSlots.map((s, i) => ({ ...s, slotIndex: i }));
      onUpdate({ ...wave, slots: recalculateSlotTimes(reindexed, wave.startTime, wave.intervalMinutes) });
    } else if (targetCount < currentCount) {
      let toRemove = currentCount - targetCount;
      const newSlots = [...currentSlots];
      for (let i = newSlots.length - 1; i >= 0 && toRemove > 0; i--) {
        if (!newSlots[i].teams || newSlots[i].teams.length === 0) {
          newSlots.splice(i, 1);
          toRemove--;
        }
      }
      const reindexed = newSlots.map((s, i) => ({ ...s, slotIndex: i }));
      onUpdate({ ...wave, slots: recalculateSlotTimes(reindexed, wave.startTime, wave.intervalMinutes) });
    }
  }

  return (
    <div className="wave-card">
      <div className="wave-card-header" onClick={() => setExpanded((e) => !e)}>
        <div className="wave-card-left">
          <span className="wave-expand-icon">{expanded ? '▾' : '▸'}</span>
          <span className="badge badge-category">{category?.label || wave.categoryId}</span>
          <span className="wave-time mono">{wave.startTime}</span>
          {slotCount > 0 && <span className="wave-meta">→ {lastSlotTime}</span>}
          <span className="wave-meta">{slotCount} slot{slotCount !== 1 ? 's' : ''} · {wave.intervalMinutes}min interval</span>
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
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="form-group">
              <label>Category</label>
              <select value={wave.categoryId} onChange={(e) => updateField('categoryId', e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" value={wave.startTime} onChange={(e) => updateField('startTime', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Interval (min)</label>
              <input type="number" min="1" value={wave.intervalMinutes} onChange={(e) => updateField('intervalMinutes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Teams / Slot</label>
              <input type="number" min="1" value={wave.teamsPerSlot} onChange={(e) => updateField('teamsPerSlot', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Num. Slots</label>
              <input type="number" min="1" value={slotCount} onChange={(e) => changeSlotCount(Number(e.target.value))} />
            </div>
          </div>

          <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="form-group">
              <label>Station Template</label>
              <select value={wave.stationTemplateId} onChange={(e) => updateField('stationTemplateId', e.target.value)}>
                {stationTemplates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="wave-slots-section">
            <span className="section-title" style={{ marginBottom: 8, display: 'block' }}>
              Schedule — {slotCount} slot{slotCount !== 1 ? 's' : ''}
            </span>
            <div className="slots-list">
              {recalcSlots.map((slot, idx) => (
                <div key={idx} className="slot-item">
                  <span className="slot-time mono">{slot.scheduledTime}</span>
                  <span className="slot-label">Slot {idx + 1}</span>
                  <span className="slot-team-count">{(slot.teams || []).length} / {wave.teamsPerSlot} teams</span>
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
        .wave-card-rest {
          border-color: var(--border);
          opacity: 0.85;
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
        .rest-fields {
          display: flex;
          align-items: center;
          gap: 8px;
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
        .slot-team-count {
          color: var(--text-dim);
          font-size: 0.78rem;
          font-family: 'DM Mono', monospace;
        }
        .badge-rest {
          background: rgba(255,255,255,0.08);
          color: var(--text-muted);
          border: 1px dashed var(--border);
          font-size: 0.72rem;
          padding: 2px 8px;
          border-radius: var(--radius);
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

// ── Wave Builder ──────────────────────────────────────────────────────────────
export default function WaveBuilder({ waves, categories, stationTemplates, onWavesChange }) {
  function addWave() {
    const defaultCat = categories[0]?.id || '';
    const defaultTemplate = stationTemplates[0]?.id || '';
    const newWave = {
      id: `wave_${Date.now()}`,
      isRest: false,
      categoryId: defaultCat,
      startTime: '09:00',
      intervalMinutes: 10,
      teamsPerSlot: 2,
      stationTemplateId: defaultTemplate,
      slots: [{ slotIndex: 0, scheduledTime: '', isPause: false, pauseDurationMinutes: null, teams: [] }],
    };
    const recalc = recalculateSlotTimes(newWave.slots, newWave.startTime, newWave.intervalMinutes);
    onWavesChange([...waves, { ...newWave, slots: recalc }]);
  }

  function addRest() {
    const lastWave = waves[waves.length - 1];
    const startTime = lastWave?.startTime || '10:00';
    onWavesChange([...waves, {
      id: `rest_${Date.now()}`,
      isRest: true,
      startTime,
      durationMinutes: 30,
    }]);
  }

  function updateWave(idx, updated) {
    onWavesChange(waves.map((w, i) => (i === idx ? updated : w)));
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
        <div className="flex gap-8">
          <button className="btn-secondary" onClick={addRest}>+ Add Rest</button>
          <button className="btn-primary" onClick={addWave}>+ Add Wave</button>
        </div>
      </div>

      {waves.length === 0 && (
        <div className="wave-empty">
          No waves yet. Click "Add Wave" to get started.
        </div>
      )}

      <div className="waves-list">
        {waves.map((wave, idx) =>
          wave.isRest ? (
            <RestWaveCard
              key={wave.id}
              wave={wave}
              onUpdate={(updated) => updateWave(idx, updated)}
              onDelete={() => deleteWave(idx)}
              onMoveUp={() => moveWave(idx, -1)}
              onMoveDown={() => moveWave(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === waves.length - 1}
            />
          ) : (
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
          )
        )}
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
