import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_CONFIG = {
  categories: [
    { id: 'single_men', label: 'Single Men', type: 'single', description: 'Standard HYROX format, male athletes' },
    { id: 'single_men_open', label: 'Single Men Open', type: 'single', description: 'Open category, male athletes' },
    { id: 'single_women', label: 'Single Women', type: 'single', description: 'Standard HYROX format, female athletes' },
    { id: 'single_women_open', label: 'Single Women Open', type: 'single', description: 'Open category, female athletes' },
    { id: 'single_men_pro', label: 'Single Men Pro', type: 'single', description: 'Pro category, male athletes' },
    { id: 'single_women_pro', label: 'Single Women Pro', type: 'single', description: 'Pro category, female athletes' },
    { id: 'double_men', label: 'Double Men', type: 'double', description: '2 male athletes per team' },
    { id: 'double_women', label: 'Double Women', type: 'double', description: '2 female athletes per team' },
    { id: 'double_mixed', label: 'Double Mixed', type: 'double', description: '1 male + 1 female per team' },
    { id: 'half_single_men', label: 'Half Single Men', type: 'half', description: 'Half-distance format, male athletes' },
    { id: 'half_single_women', label: 'Half Single Women', type: 'half', description: 'Half-distance format, female athletes' },
  ],
  stationTemplates: [
    {
      id: 'full_hyrox',
      label: 'Full HYROX',
      stations: [
        { order: 1, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 2, type: 'station', label: 'SkiErg', reps_or_distance: '1000m' },
        { order: 3, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 4, type: 'station', label: 'Sled Push', reps_or_distance: '50m' },
        { order: 5, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 6, type: 'station', label: 'Sled Pull', reps_or_distance: '50m' },
        { order: 7, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 8, type: 'station', label: 'Burpee Broad Jump', reps_or_distance: '80m' },
        { order: 9, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 10, type: 'station', label: 'Rowing', reps_or_distance: '1000m' },
        { order: 11, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 12, type: 'station', label: 'Farmers Carry', reps_or_distance: '200m' },
        { order: 13, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 14, type: 'station', label: 'Sandbag Lunges', reps_or_distance: '100m' },
        { order: 15, type: 'run', label: 'Run', reps_or_distance: '1000m' },
        { order: 16, type: 'station', label: 'Wall Balls', reps_or_distance: '100 reps' },
      ],
    },
  ],
  checklistItems: [
    { id: 'cl_1', category: 'Setup', order: 1, text: 'Confirm date and venue availability' },
    { id: 'cl_2', category: 'Setup', order: 2, text: 'Define categories and max athletes per wave' },
    { id: 'cl_3', category: 'Equipment', order: 3, text: 'SkiErg checked and calibrated' },
    { id: 'cl_4', category: 'Equipment', order: 4, text: 'Sleds loaded to correct weight per category' },
    { id: 'cl_5', category: 'Equipment', order: 5, text: 'Rowing machines set and tested' },
    { id: 'cl_6', category: 'Equipment', order: 6, text: 'Sandbags at correct weight per category' },
    { id: 'cl_7', category: 'Equipment', order: 7, text: 'Wall balls at correct weight per category' },
    { id: 'cl_8', category: 'Equipment', order: 8, text: 'Farmers carry handles and weights prepared' },
    { id: 'cl_9', category: 'Logistics', order: 9, text: 'Start list printed per category' },
    { id: 'cl_10', category: 'Logistics', order: 10, text: 'Bib numbers assigned and available' },
    { id: 'cl_11', category: 'Logistics', order: 11, text: 'Timer / stopwatch ready' },
    { id: 'cl_12', category: 'Logistics', order: 12, text: 'Results sheet or device ready for time entry' },
    { id: 'cl_13', category: 'Communication', order: 13, text: 'Athletes notified of start times' },
    { id: 'cl_14', category: 'Communication', order: 14, text: 'Coaches briefed on wave schedule' },
    { id: 'cl_15', category: 'Post-event', order: 15, text: 'Results entered and saved' },
    { id: 'cl_16', category: 'Post-event', order: 16, text: 'Equipment cleaned and stored' },
  ],
};

export async function ensureConfigExists() {
  const configRef = doc(db, 'config', 'main');
  const snap = await getDoc(configRef);
  if (!snap.exists()) {
    await setDoc(configRef, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  return snap.data();
}

export function buildChecklistFromConfig(checklistItems) {
  const checklist = {};
  checklistItems.forEach((item) => {
    checklist[item.id] = false;
  });
  return checklist;
}
