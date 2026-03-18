/**
 * Coaching & Monthly Report service
 * Generates rule-based coaching feedback and monthly reports.
 * Future: can be swapped with Claude AI API for richer analysis.
 */

export async function generateCoachingFeedback(session, allSessions, objectives) {
  const insights = []
  const last14days = allSessions.filter(s => {
    const d = new Date(s.date)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    return d >= cutoff && s.status === 'completed'
  })

  const typeCounts = {}
  last14days.forEach(s => {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1
  })

  const totalKm = last14days
    .filter(s => s.type === 'running')
    .reduce((sum, s) => sum + (s.distance || 0), 0)

  // Session-specific feedback
  if (session.type === 'running') {
    if (session.rpe >= 8) {
      insights.push('High-intensity run logged. Make sure to include a recovery session in the next 48 hours.')
    }
    if (session.distance && session.distance < 3) {
      insights.push('Short run today. Consider adding a longer easy run this week to build your aerobic base.')
    }
  }

  if (session.type === 'hyrox_training') {
    if (!typeCounts['running'] || typeCounts['running'] < 2) {
      insights.push('You have not run much recently. Hyrox requires strong running between stations — add at least 2 runs per week.')
    }
  }

  if (session.type === 'gym_strength') {
    if (!typeCounts['hyrox_training']) {
      insights.push('You are building strength — make sure to combine it with Hyrox-specific work like sled push and farmers carry.')
    }
  }

  if (session.type === 'recovery') {
    const recentHardSessions = last14days.filter(s => s.rpe >= 7).length
    if (recentHardSessions >= 4) {
      insights.push('Good call on recovery. You have had several high-intensity sessions recently.')
    }
  }

  // Balance insights
  const runningRatio = (typeCounts['running'] || 0) / Math.max(last14days.length, 1)
  const hyroxRatio = (typeCounts['hyrox_training'] || 0) / Math.max(last14days.length, 1)

  if (runningRatio < 0.25 && last14days.length >= 4) {
    insights.push('Running volume is low compared to your total training. Aim for at least 2-3 runs per week.')
  }

  if (hyroxRatio < 0.2 && last14days.length >= 4) {
    insights.push('Consider adding more Hyrox-specific training sessions to sharpen your race skills.')
  }

  if (totalKm > 30) {
    insights.push(`Strong running week — ${totalKm.toFixed(1)} km in the last 14 days. Keep it consistent!`)
  }

  // Upcoming race context
  const nextRace = objectives
    .filter(o => new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]

  if (nextRace) {
    const daysOut = Math.ceil((new Date(nextRace.date) - new Date()) / (1000 * 60 * 60 * 24))
    if (daysOut <= 14) {
      insights.push(`Race alert: "${nextRace.name}" is in ${daysOut} days. Reduce volume and sharpen race-pace work.`)
    } else if (daysOut <= 42 && nextRace.type === 'hyrox') {
      insights.push(`You are ${daysOut} days out from "${nextRace.name}". Focus on race simulation and station-specific drills.`)
    } else if (daysOut <= 42 && nextRace.type === '5k') {
      insights.push(`${daysOut} days to your 5K. Prioritise interval sessions at race pace (${nextRace.targetTime || 'target pace'}).`)
    }
  }

  if (insights.length === 0) {
    insights.push('Good session! Stay consistent — frequency beats intensity for long-term progress.')
  }

  return insights.join('\n\n')
}

export function generateMonthlyReport(sessions, objectives, year, month) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long' })

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalDistance: 0,
      hyroxSessions: 0,
      avgRpe: null,
      weeklyBreakdown: [],
      typeBreakdown: [],
      hyroxExercises: {},
      strengths: [],
      weaknesses: ['No sessions recorded this month.'],
      recommendation: `No training data for ${monthName} ${year}. Start logging your sessions to track your progress!`,
    }
  }

  // Basic stats
  const totalSessions = sessions.length
  const runSessions = sessions.filter(s => s.type === 'running')
  const totalDistance = runSessions.reduce((sum, s) => sum + (s.distance || 0), 0)
  const hyroxSessions = sessions.filter(s => s.type === 'hyrox_training').length
  const rpeSessions = sessions.filter(s => s.rpe)
  const avgRpe = rpeSessions.length > 0
    ? rpeSessions.reduce((sum, s) => sum + s.rpe, 0) / rpeSessions.length
    : null

  // Weekly breakdown (4-5 weeks)
  const weeklyBreakdown = []
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  let weekStart = new Date(firstDay)
  let weekNum = 1
  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const count = sessions.filter(s => {
      const d = new Date(s.date)
      return d >= weekStart && d <= weekEnd
    }).length
    weeklyBreakdown.push({ week: `W${weekNum}`, sessions: count })
    weekStart.setDate(weekStart.getDate() + 7)
    weekNum++
  }

  // Type breakdown
  const typeCounts = {}
  sessions.forEach(s => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })
  const typeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({ type, count }))

  // Hyrox exercises (parse from exercises text)
  const hyroxKeywords = {
    'sled_push': ['sled push', 'sled-push'],
    'sled_pull': ['sled pull', 'sled-pull'],
    'ski_erg': ['skierg', 'ski erg'],
    'row': ['rowing', 'row erg'],
    'farmers_carry': ['farmers carry', "farmer's carry"],
    'sandbag_lunges': ['sandbag lunge'],
    'wall_balls': ['wall ball'],
    'burpee_broad_jump': ['burpee broad jump', 'burpee bj'],
  }
  const hyroxExercises = {}
  sessions.filter(s => s.type === 'hyrox_training').forEach(s => {
    const text = ((s.exercises || '') + ' ' + (s.notes || '')).toLowerCase()
    Object.entries(hyroxKeywords).forEach(([key, terms]) => {
      if (terms.some(t => text.includes(t))) {
        hyroxExercises[key] = (hyroxExercises[key] || 0) + 1
      }
    })
  })

  // Strengths & weaknesses analysis
  const strengths = []
  const weaknesses = []
  const weeklyAvg = totalSessions / 4.3

  if (totalSessions >= 12) strengths.push('Excellent training volume — very consistent month.')
  else if (totalSessions >= 8) strengths.push('Good consistency with strong training frequency.')
  else if (totalSessions < 4) weaknesses.push('Low training frequency. Aim for at least 3-4 sessions per week.')

  if (totalDistance >= 40) strengths.push(`Strong running volume: ${totalDistance.toFixed(1)} km this month.`)
  else if (totalDistance < 15 && sessions.some(s => s.type === 'running')) {
    weaknesses.push('Running volume is low. Build up to 30-40 km/month for Hyrox and 5K performance.')
  }

  if (hyroxSessions >= 4) strengths.push('Consistent Hyrox training — good station practice.')
  else if (hyroxSessions === 0) weaknesses.push('No Hyrox-specific training. Add station work and race simulations.')

  if (avgRpe) {
    if (avgRpe >= 7.5) strengths.push(`High training intensity (avg RPE ${avgRpe.toFixed(1)}) — pushing hard.`)
    if (avgRpe >= 8.5) weaknesses.push('Average RPE is very high. Make sure to include easier recovery sessions.')
    if (avgRpe < 5) weaknesses.push('Training intensity is low. Include some harder sessions to stimulate adaptation.')
  }

  // Upcoming race consideration
  const nextRace = objectives
    .filter(o => new Date(o.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]

  // Coaching recommendation
  let recommendation = ''
  const nextMonth = new Date(year, month, 1).toLocaleString('en-GB', { month: 'long' })

  if (nextRace) {
    const daysToRace = Math.ceil((new Date(nextRace.date) - new Date()) / (1000 * 60 * 60 * 24))
    if (daysToRace <= 30) {
      recommendation = `Race "${nextRace.name}" is ${daysToRace} days away.\n\nFor ${nextMonth}:\n• Reduce total volume by 20-30%\n• Focus on race-pace quality sessions\n• Prioritise sleep and recovery\n• Final race simulation 2-3 weeks out`
    } else if (nextRace.type === 'hyrox') {
      recommendation = `Build towards "${nextRace.name}" in ${nextMonth}:\n• Maintain ${Math.max(8, totalSessions)} sessions/month\n• Include 2 Hyrox station sessions/week\n• Run ${Math.max(25, totalDistance + 5).toFixed(0)} km total\n• Add one long run and one interval session weekly`
    } else if (nextRace.type === '5k') {
      recommendation = `For your ${nextRace.type.toUpperCase()} goal in ${nextMonth}:\n• Include 2 interval sessions per week\n• One long easy run (45-60 min)\n• One tempo run at race pace\n• Total: ${Math.max(20, totalDistance + 5).toFixed(0)} km running`
    }
  }

  if (!recommendation) {
    recommendation = `Great work in ${monthName}!\n\nFor ${nextMonth}:\n${totalSessions < 8 ? '• Build consistency to 8+ sessions\n' : '• Maintain your current training frequency\n'}${totalDistance < 20 ? '• Increase running volume gradually\n' : '• Keep up the running volume\n'}• Balance running with strength and Hyrox work\n• Log all sessions to track your progress`
  }

  return {
    totalSessions,
    totalDistance,
    hyroxSessions,
    avgRpe,
    weeklyBreakdown,
    typeBreakdown,
    hyroxExercises,
    strengths,
    weaknesses,
    recommendation,
  }
}
