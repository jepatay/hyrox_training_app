import { recalculateSlotTimes } from '../utils/timeUtils';

export default function SlotTimeline({ slots, startTime, intervalMinutes, teams }) {
  const recalculated = recalculateSlotTimes(slots, startTime, intervalMinutes);

  return (
    <div className="slot-timeline">
      {recalculated.map((slot, idx) => {
        if (slot.isPause) {
          return (
            <div key={slot.slotIndex} className="slot-row slot-pause">
              <span className="slot-time mono">{slot.scheduledTime}</span>
              <span className="slot-pause-label">── {slot.pauseDurationMinutes} min pause ──</span>
            </div>
          );
        }

        const slotTeams = (slot.teams || []).map(
          (tid) => teams?.find((t) => t.id === tid)
        ).filter(Boolean);

        return (
          <div key={slot.slotIndex} className="slot-row">
            <span className="slot-time mono">{slot.scheduledTime}</span>
            <span className="slot-index">Wave {idx + 1}</span>
            <div className="slot-teams">
              {slotTeams.length > 0 ? (
                slotTeams.map((team) => (
                  <span key={team.id} className="slot-team-chip">
                    <span className="slot-team-bib">{team.bibNumber}</span>
                    {team.teamName}
                  </span>
                ))
              ) : (
                <span className="slot-empty">No teams</span>
              )}
            </div>
            <span className="slot-count">{slotTeams.length} team{slotTeams.length !== 1 ? 's' : ''}</span>
          </div>
        );
      })}

      <style>{`
        .slot-timeline {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .slot-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: var(--bg-elevated);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          font-size: 0.88rem;
        }
        .slot-pause {
          border-style: dashed;
          opacity: 0.7;
        }
        .slot-time {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          color: var(--yellow);
          min-width: 48px;
        }
        .slot-index {
          color: var(--text-dim);
          font-size: 0.78rem;
          min-width: 52px;
          font-family: 'Barlow Condensed', sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .slot-pause-label {
          color: var(--text-dim);
          font-style: italic;
          font-family: 'DM Mono', monospace;
          font-size: 0.82rem;
        }
        .slot-teams {
          flex: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .slot-team-chip {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 2px;
          padding: 2px 8px;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .slot-team-bib {
          font-family: 'DM Mono', monospace;
          font-size: 0.75rem;
          color: var(--yellow);
        }
        .slot-empty {
          color: var(--text-dim);
          font-style: italic;
          font-size: 0.82rem;
        }
        .slot-count {
          color: var(--text-dim);
          font-size: 0.78rem;
          min-width: 60px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}
