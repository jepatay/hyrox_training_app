import OpenAI from 'openai';

let openai;

async function chat(prompt, maxTokens = 400) {
  if (!process.env.OPENAI_API_KEY) {
    return 'Set OPENAI_API_KEY in your backend .env file to enable AI features.';
  }
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content;
}

export async function generateCoachingFeedback({ session, recentSessions, objectives }) {
  const recentSummary = recentSessions
    .slice(0, 7)
    .map(s => `- ${s.type} on ${s.date?.slice(0, 10) || 'unknown'} (${s.duration || '?'} min, RPE ${s.rpe || '?'})`)
    .join('\n') || 'No recent sessions';

  const objSummary = objectives
    .slice(0, 5)
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const prompt = `You are an expert Hyrox and running coach. Provide brief coaching feedback (3-4 sentences) based on this training data.

Session just completed:
- Type: ${session.type}
- Duration: ${session.duration || '?'} minutes
- RPE: ${session.rpe || '?'}/10
- Feeling: ${session.feeling || 'not specified'}
- Notes: ${session.notes || 'none'}

Recent training (last 7 days):
${recentSummary}

Upcoming objectives:
${objSummary}

Give specific, actionable feedback on training balance and race preparation. Be direct and motivating.`;

  return chat(prompt, 400);
}

export async function generateTrainingSuggestion({ location, equipment, focus, timeAvailable, recentSessions, objectives }) {
  const recentSummary = recentSessions
    .slice(0, 5)
    .map(s => `- ${s.type} (${s.duration || '?'} min, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent history';

  const objSummary = objectives
    .slice(0, 3)
    .map(o => `- ${o.name} [${o.priority}] on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const prompt = `You are an expert Hyrox and running coach. Generate a complete, specific training session.

Context:
- Location: ${location}
- Equipment: ${equipment}
- Focus: ${focus}
- Time available: ${timeAvailable} minutes

Recent training:
${recentSummary}

Upcoming objectives:
${objSummary}

Create a structured workout with:
1. **Warm-up** (5-10 min): specific exercises
2. **Main workout**: detailed exercises with sets/reps/distances/rest periods
3. **Cool-down** (5-10 min): specific stretches
4. **Coach notes**: why this session is good for their goals

Be specific with numbers. Use Hyrox-relevant exercises where appropriate (sled push/pull, SkiErg, burpee broad jumps, wall balls, sandbag lunges, etc.).`;

  return chat(prompt, 1000);
}

export async function generateMonthlyReport({ sessions, objectives, month, year }) {
  const breakdown = sessions.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  const totalDistance = sessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgRpe = sessions.filter(s => s.rpe).length
    ? (sessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / sessions.filter(s => s.rpe).length).toFixed(1)
    : 'N/A';

  const objSummary = objectives
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'None';

  const prompt = `You are an expert Hyrox and running coach. Generate a monthly training report.

Month: ${month}/${year}
Total sessions: ${sessions.length}
Total duration: ${Math.round(totalDuration / 60)} hours
Total running distance: ${totalDistance.toFixed(1)} km
Average RPE: ${avgRpe}
Session breakdown: ${JSON.stringify(breakdown, null, 2)}

Upcoming objectives:
${objSummary}

Provide:
1. **Monthly Summary**: 2-3 sentences on overall training volume and balance
2. **Strengths**: 2-3 bullet points of what went well
3. **Areas to Improve**: 2-3 bullet points on weaknesses or gaps
4. **Recommendations for Next Month**: 3-4 specific, actionable training recommendations
5. **Race Prep Focus**: specific advice based on upcoming objectives

Be specific and motivating.`;

  return chat(prompt, 800);
}
