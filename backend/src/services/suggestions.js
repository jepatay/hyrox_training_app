/**
 * Training Suggestion service
 * Generates structured workouts based on user context and training history.
 * Future: plug in Claude AI API for more personalised, dynamic suggestions.
 */

const HYROX_STATIONS = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row Erg', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
]

export function generateTrainingSuggestion({ location, equipment, focus, time, recentSessions, objectives }) {
  const ctx = { location, equipment, focus, time, recentSessions, objectives }

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
  const lastSessionType = last7[0]?.type

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

  // Generate workout based on focus
  if (isRecovery || adjustedFocus === 'recovery') {
    return buildRecovery(time, isTravel, nextRace, daysToRace)
  }

  if (adjustedFocus === 'running') {
    return buildRunning(time, recentTypes, nextRace, daysToRace)
  }

  if (adjustedFocus === 'hyrox_strength') {
    return buildHyrox(time, hasGym, canRun, recentSessions, nextRace, daysToRace)
  }

  if (adjustedFocus === 'mixed') {
    return buildMixed(time, hasGym, canRun, recentTypes, nextRace, daysToRace)
  }

  return buildGeneral(time, hasGym, canRun)
}

function buildRunning(time, recentTypes, nextRace, daysToRace) {
  const recentIntervals = recentTypes.filter(t => t === 'running').length

  let title, warmup, workout, cooldown, coachNote

  if (time <= 35) {
    title = 'Short Interval Run'
    warmup = '5 min easy jog + dynamic drills'
    workout = '6 × 400m @ hard effort (85-90% max HR)\nRest: 90s between reps\nTarget: consistent splits'
    cooldown = '5 min easy jog + calf stretches'
    coachNote = 'Short and sharp. Focus on maintaining form in the last 2 reps.'
  } else if (time <= 55) {
    title = 'Tempo Run'
    warmup = '8 min easy jog + 4 × 20s strides'
    workout = '20 min continuous tempo run @ comfortably hard effort\n(You should be able to speak in short sentences only)\nTarget pace: ~10-15s/km slower than 5K race pace'
    cooldown = '8 min easy jog + hip flexor stretch'
    coachNote = nextRace?.type === '5k'
      ? `Tempo runs are key for your ${nextRace.name} goal. Lock in that pace.`
      : 'Tempo builds your lactate threshold — crucial for running economy in Hyrox.'
  } else if (time <= 75) {
    title = 'Interval Session'
    warmup = '10 min easy jog + 4 × 100m accelerations'
    workout = '8 × 600m @ 5K race effort\nRest: 2 min jog between reps\n\nAlternative: 4 × 1000m @ 10K effort with 2 min rest'
    cooldown = '10 min easy jog + full stretch'
    coachNote = 'Quality over quantity. If pace drops significantly, stop and cool down.'
  } else {
    title = 'Long Easy Run'
    warmup = '10 min walk/easy jog'
    workout = `${time - 20} min continuous easy run @ 65-70% max HR\nConversation pace — you should be able to speak full sentences\nFocus: aerobic base building`
    cooldown = '10 min walk + full stretch (foam roll if available)'
    coachNote = 'Long runs build your engine. Do not go too fast — save the effort for interval days.'
  }

  return { title, warmup, workout, cooldown, coachNote, sessionType: 'running' }
}

function buildHyrox(time, hasGym, canRun, recentSessions, nextRace, daysToRace) {
  const warmupTime = Math.min(10, Math.floor(time * 0.15))
  const cooldownTime = 5

  const title = daysToRace && daysToRace <= 21
    ? 'Hyrox Race Simulation'
    : 'Hyrox Station Training'

  const warmup = `${warmupTime} min easy row or ski erg\nDynamic warm-up: leg swings, hip circles, shoulder rolls`

  let workout
  if (daysToRace && daysToRace <= 21) {
    workout = `Race pace simulation — push as if it's race day:\n\n400m run @ race pace\n→ SkiErg: 1000m\n400m run @ race pace\n→ Sled Push: 2 × 25m\n400m run @ race pace\n→ Sled Pull: 2 × 25m\n\nRest 5-8 min. Repeat 1-2 more stations if energy allows.`
  } else if (time <= 50) {
    workout = `Station circuit (2-3 rounds):\n\n• SkiErg: 500m\n• Sled Push: 2 × 25m (race weight)\n• Farmers Carry: 2 × 25m\n• Wall Balls: 20 reps @ 6/9kg\n\nRest 2 min between rounds\n200m run between stations if treadmill available`
  } else {
    workout = `Full Hyrox strength block:\n\n1. SkiErg: 3 × 500m @ race pace (rest 90s)\n2. Sled Push: 4 × 25m @ race weight (rest 2 min)\n3. Sled Pull: 4 × 25m (rest 2 min)\n4. Farmers Carry: 3 × 50m @ race weight\n5. Sandbag Lunges: 3 × 25m\n6. Wall Balls: 3 × 25 reps @ 6/9kg`
  }

  const cooldown = `${cooldownTime} min easy walk\nHip flexor stretch, hamstrings, lat stretch`

  const coachNote = daysToRace
    ? `Race is ${daysToRace} days away. Focus on technique and confidence, not max effort.`
    : 'Hyrox strength is race-specific. Prioritise form on each station — weight is secondary to movement quality.'

  return { title, warmup, workout, cooldown, coachNote, sessionType: 'hyrox_training' }
}

function buildMixed(time, hasGym, canRun, recentTypes, nextRace, daysToRace) {
  const runDominant = recentTypes.filter(t => t === 'running').length > recentTypes.filter(t => t === 'hyrox_training').length

  const title = 'Mixed Conditioning Session'
  const warmup = '5 min easy jog or row\n5 min mobility: hip flexors, thoracic rotation, shoulder prep'

  let workout
  if (!canRun) {
    workout = `Conditioning circuit — no running:\n\n4 rounds:\n• SkiErg: 2 min @ moderate effort\n• Burpee Broad Jumps: 10 reps\n• Farmers Carry: 40m\n• Wall Balls: 15 reps\n• Rest: 90s\n\nThen: 3 × 10 Romanian Deadlift + 10 Push-ups`
  } else if (runDominant) {
    workout = `Hyrox-biased mixed session:\n\n2000m run @ easy/moderate pace\n\nThen 3 rounds:\n• Sled Push: 2 × 25m\n• Sandbag Lunges: 20m\n• Row: 500m @ moderate effort\n\n1000m run @ moderate effort (finish strong)`
  } else {
    workout = `Run-biased mixed session:\n\n3 × 800m @ 5K effort (rest 2 min)\n\nStrength block:\n• 3 × 8 Romanian Deadlift (moderate weight)\n• 3 × 10 Goblet Squat\n• 2 × 25 Wall Balls\n\n1000m easy run cool-down`
  }

  const cooldown = '5 min easy walk\nFull body stretch: quads, hamstrings, glutes, lats'

  const coachNote = nextRace?.type === 'hyrox'
    ? 'Mixed sessions build the conditioning you need for a full Hyrox race. Great combination work.'
    : 'Balanced training develops all energy systems. Keep the intensity honest.'

  return { title, warmup, workout, cooldown, coachNote, sessionType: 'hyrox_training' }
}

function buildRecovery(time, isTravel, nextRace, daysToRace) {
  const title = 'Active Recovery Session'
  const warmup = '5 min gentle walk'

  const workout = isTravel
    ? `Travel recovery — hotel/minimal:\n\n• 10 min light walk or easy movement\n• Yoga flow: 5 rounds sun salutation\n• Mobility: 2 min each — hip flexors, hamstrings, chest opener\n• Breathing: 5 min diaphragmatic breathing`
    : `Active recovery:\n\n• 15-20 min very easy jog or walk (60% max HR)\n• Foam rolling: quads, IT band, calves, lats (30s each)\n• Mobility flow: hip circles, world's greatest stretch, pigeon pose\n• Optional: 10 min pool easy swim if available`

  const cooldown = 'Light stretching — hold each 45-60s'

  const coachNote = daysToRace && daysToRace <= 7
    ? `Race in ${daysToRace} days — stay fresh. Light movement only. Trust your training.`
    : 'Recovery is training. Your body adapts during rest. Do not skip it.'

  return { title, warmup, workout, cooldown, coachNote, sessionType: 'recovery' }
}

function buildGeneral(time, hasGym, canRun) {
  return buildMixed(time, hasGym, canRun, [], null, null)
}
