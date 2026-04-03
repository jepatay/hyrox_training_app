import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export const SESSION_TYPES = [
  { value: 'running', label: 'Running', color: '#3b82f6', icon: '🏃' },
  { value: 'stairs', label: 'Stairs', color: '#f59e0b', icon: '🪜' },
  { value: 'hyrox_training', label: 'Hyrox Training', color: '#f97316', icon: '🔥' },
  { value: 'hyrox_competition', label: 'Hyrox Race', color: '#ef4444', icon: '🏅' },
  { value: 'gym_strength', label: 'Gym Strength', color: '#8b5cf6', icon: '💪' },
  { value: 'crossfit', label: 'CrossFit Class', color: '#10b981', icon: '⚡' },
  { value: 'recovery', label: 'Recovery', color: '#6b7280', icon: '🧘' },
  { value: 'cycling', label: 'Cycling', color: '#06b6d4', icon: '🚴' },
];

export const OBJECTIVE_TYPES = [
  { value: '5k', label: '5K Race' },
  { value: '10k', label: '10K Race' },
  { value: 'half_marathon', label: 'Half Marathon' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'hyrox', label: 'Hyrox Race' },
  { value: 'custom', label: 'Custom' },
];

export const PRIORITY_CONFIG = {
  A: { label: 'A Goal', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  B: { label: 'B Goal', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  C: { label: 'C Goal', color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' },
};

export function getSessionTypeConfig(type) {
  return SESSION_TYPES.find(t => t.value === type) || { label: type, color: '#6b7280', icon: '🏋️' };
}

export function parseMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^(?!<[hul])/gm, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}
