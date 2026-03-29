/**
 * Training Suggestion service
 * Generates structured workouts based on user context and training history.
 * Future: plug in Claude AI API for more personalised, dynamic suggestions.
 */

const HYROX_STATIONS = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row Erg', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
]

export function generateTrainingSuggestion({ location, equipment, focus, time, recentSessions, objectives, venueName }) {
  const nextRace = objectives
    .filter(o => new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]

  const daysToRace = nextRace
    ? Math.ceil((new Date(nextRace.date) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const last7 = recentSessions.filter(s => {
    const d = new Date(s.date)
    const cut = new Date()
    cut.setDate(cut.getDate() - 7)
    return d >= cut
  })

  const recentTypes = last7.map(s => s.type)
  const recentRpe = last7.filter(s => s.rpe).map(s => s.rpe)
  const avgRecentRpe = recentRpe.length ? recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length : 5

  // Override focus if near race
  let adjustedFocus = focus
  if (daysToRace && daysToRace <= 7) {
    adjustedFocus = 'recovery'
  } else if (daysToRace && daysToRace <= 21 && nextRace?.type === 'hyrox') {
    adjustedFocus = 'hyrox_strength'
  }

  const canRun = equipment !== 'full_gym'
  const hasGym = equipment === 'full_gym' || equipment === 'limited'
  const isTravel = location === 'travel' || location === 'hotel'
  const isRecovery = adjustedFocus === 'recovery' || avgRecentRpe >= 8.5

  const locationLabel = venueName || null

  if (isRecovery || adjustedFocus === 'recovery') {
    return buildRecovery(time, isTravel, nextRace, daysToRace, locationLabel)
  }

  if (adjustedFocus === 'running') {
    return buildRunning(time, recentTypes, nextRace, daysToRace, locationLabel)
  }

  if (adjustedFocus === 'hyrox_strength') {
    return buildHyrox(time, hasGym, canRun, recentSessions, nextRace, daysToRace, locationLabel)
  }

  if (adjustedFocus === 'mixed') {
    return buildMixed(time, hasGym, canRun, recentTypes, nextRace, daysToRace, locationLabel)
  }

  return buildGeneral(time, hasGym, canRun, locationLabel)
}

function buildRunning(time, recentTypes, nextRace, daysToRace, venueName) {
  let title, workout, coachNote

  if (time <= 35) {
    title = 'Short Interval Run'
    workout = '6 × 400m @ 85-90% effort\nRest: 90s between reps\nTarget: consistent splits'
    coachNote = 'Short and sharp. Focus on maintaining form in the last 2 reps.'
  } else if (time <= 55) {
    title = 'Tempo Run'
    workout = `20 min continuous tempo @ comfortably hard effort\n(~10-15s/km slower than 5K pace)\nFocus: steady breathing, don't fade`
    coachNote = nextRace?.type === '5k'
      ? `Tempo runs are key for your ${nextRace.name} goal. Lock in that pace.`
      : 'Tempo builds lactate threshold — crucial for running economy in Hyrox.'
  } else if (time <= 75) {
    title = 'Interval Session'
    workout = '8 × 600m @ 5K effort\nRest: 2 min jog between reps\n\nAlternative: 4 × 1000m @ 10K effort, 2 min rest'
    coachNote = 'Quality over quantity. If pace drops significantly, cut the session short.'
  } else {
    title = 'Long Easy Run'
    workout = `${time - 20} min easy run @ 65-70% max HR\nConversation pace throughout\nFocus: aerobic base`
    coachNote = 'Long runs build your engine. Keep it easy — save the effort for interval days.'
  }

  const note = venueName ? `[${venueName}] ${coachNote}` : coachNote
  return { title, workout, coachNote: note, sessionType: 'running' }
}

function buildHyrox(time, hasGym, canRun, recentSessions, nextRace, daysToRace, venueName) {
  const title = daysToRace && daysToRace <= 21
    ? 'Hyrox Race Simulation'
    : 'Hyrox Station Training'

  let workout
  if (daysToRace && daysToRace <= 21) {
    workout = `Race pace simulation:\n\n400m run @ race pace → SkiErg 1000m\n400m run @ race pace → Sled Push 2 × 25m\n400m run @ race pace → Sled Pull 2 × 25m\n\nRest 5-8 min. Add 1-2 more stations if energy allows.`
  } else if (time <= 50) {
    workout = `Station circuit — 2-3 rounds:\n\n• SkiErg: 500m\n• Sled Push: 2 × 25m (race weight)\n• Farmers Carry: 2 × 25m\n• Wall Balls: 20 reps @ 6/9kg\n\nRest 2 min between rounds`
  } else {
    workout = `Full Hyrox block:\n\n1. SkiErg: 3 × 500m @ race pace (rest 90s)\n2. Sled Push: 4 × 25m @ race weight (rest 2 min)\n3. Sled Pull: 4 × 25m (rest 2 min)\n4. Farmers Carry: 3 × 50m @ race weight\n5. Sandbag Lunges: 3 × 25m\n6. Wall Balls: 3 × 25 reps @ 6/9kg`
  }

  const coachNote = daysToRace
    ? `Race is ${daysToRace} days away. Focus on technique and confidence, not max effort.`
    : 'Prioritise form on each station — weight is secondary to movement quality.'

  const note = venueName ? `[${venueName}] ${coachNote}` : coachNote
  return { title, workout, coachNote: note, sessionType: 'hyrox_training' }
}

function buildMixed(time, hasGym, canRun, recentTypes, nextRace, daysToRace, venueName) {
  const runDominant = recentTypes.filter(t => t === 'running').length > recentTypes.filter(t => t === 'hyrox_training').length

  const title = 'Mixed Conditioning Session'

  let workout
  if (!canRun) {
    workout = `4 rounds:\n• SkiErg: 2 min @ moderate effort\n• Burpee Broad Jumps: 10 reps\n• Farmers Carry: 40m\n• Wall Balls: 15 reps\n• Rest: 90s\n\nFinish: 3 × 10 Romanian Deadlift + 10 Push-ups`
  } else if (runDominant) {
    workout = `2000m run @ easy/moderate pace\n\n3 rounds:\n• Sled Push: 2 × 25m\n• Sandbag Lunges: 20m\n• Row: 500m @ moderate effort\n\n1000m run to finish`
  } else {
    workout = `3 × 800m @ 5K effort (rest 2 min)\n\nStrength block:\n• 3 × 8 Romanian Deadlift (moderate weight)\n• 3 × 10 Goblet Squat\n• 2 × 25 Wall Balls`
  }

  const coachNote = nextRace?.type === 'hyrox'
    ? 'Mixed sessions build the conditioning for a full Hyrox race.'
    : 'Balanced training develops all energy systems. Keep the intensity honest.'

  const note = venueName ? `[${venueName}] ${coachNote}` : coachNote
  return { title, workout, coachNote: note, sessionType: 'hyrox_training' }
}

function buildRecovery(time, isTravel, nextRace, daysToRace, venueName) {
  const title = 'Active Recovery Session'

  const workout = isTravel
    ? `• 10 min light walk or easy movement\n• Yoga flow: 5 rounds sun salutation\n• Mobility: 2 min each — hip flexors, hamstrings, chest opener`
    : `• 15-20 min very easy jog or walk (60% max HR)\n• Foam rolling: quads, IT band, calves, lats (30s each)\n• Mobility flow: hip circles, world's greatest stretch, pigeon pose`

  const coachNote = daysToRace && daysToRace <= 7
    ? `Race in ${daysToRace} days — stay fresh. Light movement only. Trust your training.`
    : 'Recovery is training. Your body adapts during rest.'

  const note = venueName ? `[${venueName}] ${coachNote}` : coachNote
  return { title, workout, coachNote: note, sessionType: 'recovery' }
}

function buildGeneral(time, hasGym, canRun, venueName) {
  return buildMixed(time, hasGym, canRun, [], null, null, venueName)
}
