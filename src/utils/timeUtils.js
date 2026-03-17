/**
 * Convert MM:SS string to total seconds
 */
export function mmssToSeconds(mmss) {
  if (!mmss) return null;
  const parts = mmss.split(':');
  if (parts.length !== 2) return null;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  if (seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
}

/**
 * Convert total seconds to MM:SS string
 */
export function secondsToMmss(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return '';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Validate MM:SS format string
 */
export function isValidMmss(str) {
  if (!str) return false;
  const regex = /^\d{1,3}:\d{2}$/;
  if (!regex.test(str)) return false;
  const seconds = parseInt(str.split(':')[1], 10);
  return seconds >= 0 && seconds <= 59;
}

/**
 * Add minutes to a HH:MM time string, returns HH:MM
 */
export function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Recalculate scheduled times for all slots in a wave
 * Takes into account pause slots
 */
export function recalculateSlotTimes(slots, startTime, intervalMinutes) {
  let currentTime = startTime;
  return slots.map((slot) => {
    const updatedSlot = { ...slot, scheduledTime: currentTime };
    if (slot.isPause) {
      currentTime = addMinutesToTime(currentTime, slot.pauseDurationMinutes || 0);
    } else {
      currentTime = addMinutesToTime(currentTime, intervalMinutes);
    }
    return updatedSlot;
  });
}

/**
 * Format a HH:MM time string for display
 */
export function formatTime(timeStr) {
  return timeStr || '--:--';
}
