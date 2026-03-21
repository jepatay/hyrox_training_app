import OpenAI from 'openai';

let openai;

function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

async function chat(prompt, maxTokens = 400) {
  if (!process.env.OPENAI_API_KEY) {
    return 'Set OPENAI_API_KEY in your backend .env file to enable AI features.';
  }
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content;
}

async function chatJson(prompt, maxTokens = 600) {
  if (!process.env.OPENAI_API_KEY) return null;
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });
  return JSON.parse(completion.choices[0].message.content);
}

const HYROX_WEIGHTS = {
  open_men:   { sledPush: '102kg', sledPull: '78kg',  farmersCarry: '2×24kg', walkingLunges: '2×10kg',  wallBall: '4kg ball / 10ft' },
  open_women: { sledPush: '72kg',  sledPull: '52kg',  farmersCarry: '2×16kg', walkingLunges: '2×7.5kg', wallBall: '3kg ball / 9ft'  },
  pro_men:    { sledPush: '152kg', sledPull: '102kg', farmersCarry: '2×32kg', walkingLunges: '2×20kg',  wallBall: '6kg ball / 10ft' },
  pro_women:  { sledPush: '102kg', sledPull: '78kg',  farmersCarry: '2×24kg', walkingLunges: '2×10kg',  wallBall: '4kg ball / 10ft' },
};

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const d = new Date(birthday);
  const age = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 365.25));
  return isNaN(age) ? null : age;
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

export async function generateTrainingSuggestion({ location, equipment, focus, timeAvailable, recentSessions, objectives, profile, notes }) {
  const recentSummary = recentSessions
    .slice(0, 5)
    .map(s => `- ${s.type} (${s.duration || '?'} min, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent history';

  const objSummary = objectives
    .slice(0, 3)
    .map(o => `- ${o.name} [${o.priority}] on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender ? `Gender: ${profile.gender}` : null,
    age ? `Age: ${age}` : null,
  ].filter(Boolean).join(', ') || 'Not specified';

  const patternsLine = profile?.trainingPatterns?.trim()
    ? `\nAthlete training patterns & preferences:\n${profile.trainingPatterns.trim()}`
    : '';
  const notesLine = notes?.trim() ? `\nAthlete notes for today: ${notes.trim()}` : '';

  const prompt = `You are an expert Hyrox and running coach. Generate a complete, specific training session.

Athlete profile:
- ${profileLine}${patternsLine}

Session context:
- Location: ${location}
- Equipment: ${equipment}
- Focus: ${focus}
- Time available: ${timeAvailable} minutes${notesLine}

Recent training:
${recentSummary}

Upcoming objectives:
${objSummary}

Create a structured workout with:
1. **Warm-up** (5-10 min): specific exercises
2. **Main workout**: detailed exercises with sets/reps/distances/rest periods
3. **Cool-down** (5-10 min): specific stretches
4. **Coach notes**: why this session is good for their goals (consider athlete profile and any notes provided)

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

export async function generateReadinessAnalysis({ objective, recentSessions, records, profile }) {
  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender,
    age ? `${age} years old` : null,
  ].filter(Boolean).join(', ') || 'unknown';

  const daysAway = objective.date
    ? Math.round((new Date(objective.date) - Date.now()) / (1000 * 60 * 60 * 24))
    : '?';

  const recentSummary = recentSessions.slice(0, 7)
    .map(s => `- ${s.type} (${s.duration || '?'} min, RPE ${s.rpe || '?'}, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent sessions';

  const recordsSummary = records.slice(0, 6)
    .map(r => `- ${r.type} on ${r.date?.slice(0, 10) || '?'}: ${r.totalTime || '?'}`)
    .join('\n') || 'No records';

  let objectiveDetail = `Name: ${objective.name}\nType: ${objective.type}\nDate: ${objective.date?.slice(0, 10) || '?'} (${daysAway} days away)\nPriority: ${objective.priority}`;
  if (objective.targetTime) objectiveDetail += `\nOverall target time: ${objective.targetTime}`;

  let stationInfo = '';
  let isHyrox = objective.type === 'hyrox';

  if (isHyrox) {
    const div = objective.hyroxDivision || 'open_men';
    const weights = HYROX_WEIGHTS[div] || HYROX_WEIGHTS.open_men;
    objectiveDetail += `\nDivision: ${div.replace('_', ' ')}`;
    objectiveDetail += `\nWeights: Sled Push ${weights.sledPush}, Sled Pull ${weights.sledPull}, Farmers Carry ${weights.farmersCarry}, Lunges ${weights.walkingLunges}, Wall Ball ${weights.wallBall}`;

    const targets = objective.stationTargets || {};
    stationInfo = `\nStation targets:\n` + [
      `- Run (8×1km): ${targets.run || 'not set'}`,
      `- SkiErg (1km): ${targets.skiErg || 'not set'}`,
      `- Sled Push (50m): ${targets.sledPush || 'not set'}`,
      `- Sled Pull (50m): ${targets.sledPull || 'not set'}`,
      `- Burpee Broad Jump (80m): ${targets.burpeeBroadJump || 'not set'}`,
      `- Row Erg (1km): ${targets.rowErg || 'not set'}`,
      `- Farmers Carry (200m): ${targets.farmersCarry || 'not set'}`,
      `- Walking Lunges (100m): ${targets.walkingLunges || 'not set'}`,
      `- Wall Ball (100 reps): ${targets.wallBall || 'not set'}`,
    ].join('\n');
  }

  const stationFocusKeys = isHyrox
    ? '"run", "skiErg", "sledPush", "sledPull", "burpeeBroadJump", "rowErg", "farmersCarry", "walkingLunges", "wallBall"'
    : '"speed", "endurance", "threshold", "strength"';

  const stationFocusLabels = isHyrox
    ? 'Run, SkiErg, Sled Push, Sled Pull, Burpee Broad Jump, Row Erg, Farmers Carry, Walking Lunges, Wall Ball'
    : 'Speed/intervals, Endurance base, Lactate threshold, Strength';

  const prompt = `You are an expert Hyrox and running coach. Analyze this athlete's readiness for their upcoming race goal and return a JSON response.

Athlete: ${profileLine}

Objective:
${objectiveDetail}${stationInfo}

Recent training (last 7 sessions):
${recentSummary}

Past race records/PRs:
${recordsSummary}

Return a JSON object exactly like this:
{
  "score": <integer 0-10, where 10 = fully ready today>,
  "summary": "<2-3 sentence analysis of overall readiness and key points>",
  "focusAreas": [
    { "key": "<key>", "label": "<label>", "score": <0-10 focus needed, 10=urgent>, "note": "<one sentence tip>" },
    ...
  ]
}

The focusAreas keys and labels should be: ${stationFocusKeys} / ${stationFocusLabels}
Order by score descending (most urgent first). Be honest and specific.`;

  const result = await chatJson(prompt, 800);
  if (!result) return null;
  return { ...result, updatedAt: new Date().toISOString() };
}

export async function generateStationFocus({ recentSessions, objectives, records, profile }) {
  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender,
    age ? `${age} years old` : null,
    profile?.trainingPatterns ? `Training patterns: ${profile.trainingPatterns.slice(0, 200)}` : null,
  ].filter(Boolean).join('. ') || 'unknown';

  const recentSummary = recentSessions.slice(0, 7)
    .map(s => `- ${s.type} (${s.duration || '?'} min, RPE ${s.rpe || '?'}, notes: ${s.notes?.slice(0, 60) || 'none'}, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent sessions';

  const objSummary = objectives.slice(0, 3)
    .map(o => {
      let line = `- ${o.name} [${o.priority}] ${o.type} on ${o.date?.slice(0, 10) || '?'}`;
      if (o.type === 'hyrox' && o.hyroxDivision) line += ` (${o.hyroxDivision})`;
      if (o.targetTime) line += ` target ${o.targetTime}`;
      return line;
    })
    .join('\n') || 'No objectives';

  const recordsSummary = records.slice(0, 5)
    .map(r => `- ${r.type}: ${r.totalTime || '?'} on ${r.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No records';

  const prompt = `You are an expert Hyrox coach. Based on this athlete's data, assess how much focus each Hyrox discipline needs.

Athlete: ${profileLine}

Recent training:
${recentSummary}

Objectives:
${objSummary}

Records/PRs:
${recordsSummary}

Return a JSON object where each value is 0-10 (10 = urgently needs more focus, 0 = in great shape):
{
  "run": <0-10>,
  "skiErg": <0-10>,
  "sledPush": <0-10>,
  "sledPull": <0-10>,
  "burpeeBroadJump": <0-10>,
  "rowErg": <0-10>,
  "farmersCarry": <0-10>,
  "walkingLunges": <0-10>,
  "wallBall": <0-10>
}

Base your assessment on training frequency and type, known weaknesses, upcoming race goals, and typical athlete profiles. Be honest.`;

  return chatJson(prompt, 400);
}
