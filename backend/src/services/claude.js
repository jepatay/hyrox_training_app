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
  if (!process.env.OPENAI_API_KEY) {
    console.error('chatJson: OPENAI_API_KEY is not set');
    return null;
  }
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = completion.choices[0].message.content;
    try {
      return JSON.parse(raw);
    } catch {
      console.error('chatJson: failed to parse JSON response', raw?.slice(0, 200));
      return null;
    }
  } catch (err) {
    console.error('chatJson: OpenAI API error:', err?.status, err?.message);
    return null;
  }
}

const HYROX_WEIGHTS = {
  open_men:   { sledPush: '152kg', sledPull: '103kg', farmersCarry: '2×24kg', walkingLunges: '20kg',  wallBall: '6kg / 10ft' },
  open_women: { sledPush: '102kg', sledPull: '78kg',  farmersCarry: '2×16kg', walkingLunges: '10kg',  wallBall: '4kg / 9ft'  },
  pro_men:    { sledPush: '202kg', sledPull: '153kg', farmersCarry: '2×32kg', walkingLunges: '30kg',  wallBall: '9kg / 10ft' },
  pro_women:  { sledPush: '152kg', sledPull: '103kg', farmersCarry: '2×24kg', walkingLunges: '20kg',  wallBall: '6kg / 9ft'  },
};

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const d = new Date(birthday);
  const age = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 365.25));
  return isNaN(age) ? null : age;
}

export async function generateCoachingFeedback({ session, recentSessions, objectives, venueNotes, knowledge }) {
  const recentSummary = recentSessions
    .slice(0, 7)
    .map(s => `- ${s.type} on ${s.date?.slice(0, 10) || 'unknown'} (${s.duration || '?'} min, RPE ${s.rpe || '?'})`)
    .join('\n') || 'No recent sessions';

  const objSummary = objectives
    .slice(0, 5)
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const knowledgeBlock = knowledge?.trim()
    ? `\nAthlete's personal knowledge base (their own coaching notes — factor these into your feedback):\n---\n${knowledge}\n---`
    : '';

  const today = new Date().toISOString().slice(0, 10);
  const sessionDate = session.date?.slice(0, 10) || today;
  const daysAgo = Math.round((new Date(today) - new Date(sessionDate)) / (1000 * 60 * 60 * 24));
  const whenLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You know their full training history, their goals, and their personal approach to training. Give coaching feedback that feels like it comes from someone who truly knows them — not generic advice.

Today's date: ${today}

Session logged (${whenLabel} — ${sessionDate}):
- Type: ${session.type}
- Duration: ${session.duration || '?'} minutes
- RPE: ${session.rpe || '?'}/10
- Feeling: ${session.feeling || 'not specified'}
- Notes: ${session.notes || 'none'}
- Venue notes: ${venueNotes || 'none'}

IMPORTANT: This session was on ${sessionDate} (${whenLabel}). Never say "today's session" if it was not today — reference it accurately as yesterday's, or 2 days ago, etc.

Recent training (last 7 days):
${recentSummary}

Upcoming objectives:
${objSummary}
${knowledgeBlock}

Also draw on current sports science and best practices for HYROX and endurance training to enrich your feedback.

Give 3-4 sentences of sharp, specific, personal coaching feedback. Reference their actual data. Be direct and motivating — like a coach who knows them well.`;

  return chat(prompt, 450);
}

export async function generateTrainingSuggestion({ location, equipment, focus, timeAvailable, recentSessions, objectives, profile, notes, venueName, venueNotes, records, knowledge }) {
  const recentSummary = recentSessions
    .slice(0, 5)
    .map(s => `- ${s.type} (${s.duration || '?'} min, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent history';

  const objSummary = objectives
    .slice(0, 3)
    .map(o => {
      let line = `- ${o.name} [${o.priority}] on ${o.date?.slice(0, 10) || '?'}`;
      if (o.targetTime) line += ` — target: ${o.targetTime}`;
      return line;
    })
    .join('\n') || 'No objectives set';

  const recordsSummary = (records || [])
    .slice(0, 5)
    .map(r => `- ${r.type}: ${r.totalTime || r.time || '?'} on ${r.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No records';

  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender ? `Gender: ${profile.gender}` : null,
    age ? `Age: ${age}` : null,
  ].filter(Boolean).join(', ') || 'Not specified';

  const patternsLine = profile?.trainingPatterns?.trim()
    ? `\nAthlete training patterns & preferences:\n${profile.trainingPatterns.trim()}`
    : '';
  const notesLine = notes?.trim() ? `\nAthlete notes for today: ${notes.trim()}` : '';

  const venueBlock = venueName
    ? `\nVenue: ${venueName}${venueNotes ? ` — ${venueNotes}` : ''}
STRICT VENUE RULES:
- Equipment available: "${equipment}" — do NOT suggest anything requiring other equipment.
- If equipment is "stairs", the ONLY exercises allowed are stair-based (stair sprints, stair intervals, stair repeats). No flat running, no gym work.
- If equipment is "running_only", only flat/trail running exercises. No stairs, no gym.
- The athlete's training patterns may mention other venues (e.g. VSK, loops, tracks). IGNORE all location-specific details that refer to other venues. Only use details relevant to ${venueName}.`
    : '';

  const equipmentNote = venueName ? '' : `STRICT RULE: Only suggest exercises compatible with equipment "${equipment}". If equipment is "stairs", only stair-based exercises. If "running_only", only running — no strength, no gym, no stairs.`;

  const knowledgeBlock = knowledge?.trim()
    ? `\nAthlete's personal knowledge base (their own technique notes, key sessions, best practices — use these to shape the workout):\n---\n${knowledge}\n---\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You know their training history, targets, and personal approach. Design a session that fits them specifically — not a generic plan.${knowledgeBlock}
Also draw on current sports science and best practices for HYROX and endurance training where helpful.

Athlete profile:
- ${profileLine}${patternsLine}

Session context:
- Location: ${location}
- Equipment: ${equipment}
- Focus: ${focus}
- Time available: ${timeAvailable} minutes${notesLine}${venueBlock}

${equipmentNote}

Recent training:
${recentSummary}

Performance records (use these to calibrate paces):
${recordsSummary}

Upcoming objectives:
${objSummary}

PACE RULES — mandatory for all running:
- Always specify target pace in min/km (metric).
- Always convert each interval/segment to an approximate time in parentheses.
  Example: "400m @ 4:30/km (≈ 1:48)" or "1km @ 5:00/km (≈ 5:00)".
- Calibrate paces to the athlete's level using their records and target times above.
  If no records exist, use reasonable recreational runner estimates and say so.
- Give a pace range when appropriate (e.g. "4:20–4:30/km").

Output format — two sections only, no warmup, no cooldown:

**Workout**:
[Intervals/distances with exact paces in min/km and time equivalent in brackets. Rest periods in seconds or minutes. Be concise.]

**Coach note** (1-2 sentences max):
[Why this session and these paces suit their current level and goals.]`;

  return chat(prompt, 700);
}

export async function refineSuggestion({ previousSuggestion, refinement }) {
  const prompt = `You are an expert Hyrox and running coach. The athlete has a workout and wants a small change.

Current workout:
${previousSuggestion}

Athlete's requested change:
${refinement}

Apply the change and return the updated workout. Keep the same format and conciseness. Only change what was asked — do not rewrite the whole session unless necessary.`;

  return chat(prompt, 600);
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

export async function generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge }) {
  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender,
    age ? `${age} years old` : null,
  ].filter(Boolean).join(', ') || 'unknown';

  const daysAway = objective.date
    ? Math.round((new Date(objective.date) - Date.now()) / (1000 * 60 * 60 * 24))
    : '?';

  const recentSummary = recentSessions.slice(0, 20)
    .map(s => {
      const header = `[${s.date?.slice(0, 10) || '?'}] ${s.type} — ${s.duration || '?'} min${s.rpe != null ? `, RPE ${s.rpe}` : ''}`;
      const rawNotes = s.notes?.trim();
      const notes = rawNotes ? `  → ${rawNotes.slice(0, 300)}${rawNotes.length > 300 ? '…' : ''}` : '';
      return notes ? `${header}\n${notes}` : header;
    })
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

  const radarInstructions = isHyrox ? `
Also return "radarData": an array of 17 objects showing readiness (0-10, where 10 = fully ready, 0 = not at all ready) for:
- "overall" (Overall Time)
- "run1" through "run8" (each of the 8 x 1km running segments — account for cumulative fatigue: later runs should generally score lower unless the athlete has strong endurance)
- "skiErg", "sledPush", "sledPull", "burpeeBroadJump", "rowErg", "farmersCarry", "walkingLunges", "wallBall" (each station)
Each object: { "key": "<key>", "label": "<label>", "readiness": <0-10> }` : '';

  const estimatedPerfInstruction = !isHyrox ? `
Also return "estimatedPerformance": a short string estimating the athlete's current realistic performance range for this race type based on their training and records (e.g. "~19:45–20:30 for 5K today"). Be honest and specific. If insufficient data, make a conservative estimate and say so.` : '';

  const knowledgeBlock = knowledge?.trim()
    ? `\nKnowledge base (coaching notes, sport science, technique guides — use these to interpret what each training session actually develops and how it maps to each focus area):\n---\n${knowledge}\n---\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. Analyse their readiness for their upcoming goal and return a JSON response.${knowledgeBlock}

Athlete: ${profileLine}

Objective:
${objectiveDetail}${stationInfo}

Recent training (up to last 25 sessions, most recent first):
${recentSummary}

Past race records/PRs:
${recordsSummary}

How to score focus areas:
- Read every session note carefully. Notes describe what was actually trained: exercises, weights, distances, reps, paces, sets. This is your primary signal.
- Use the knowledge base to understand what each activity develops. For example: heavy sled push builds posterior chain strength; 400m intervals at race pace build speed; tempo runs build threshold.
- Cross-reference the training content against what the objective demands. A session note like "5x sled push 150kg" is far more informative than RPE alone.
- RPE is secondary context (it tells you effort, not content). Do not weight it heavily.
- Look across all provided sessions, not just the most recent few. Identify trends: what has been trained consistently? What has been neglected for weeks?
- Use past records/PRs to calibrate baseline ability.

Return a JSON object exactly like this:
{
  "score": <integer 0-10, where 10 = fully ready today>,
  "summary": "<2-3 sentence analysis grounded in specific training content observed>",
  "estimatedPerformance": <string or null>,
  "focusAreas": [
    { "key": "<key>", "label": "<label>", "score": <integer 0-10, where 10 = fully developed/ready, 0 = urgently needs work>, "note": "<one concrete sentence: what to do and why, referencing the knowledge base if relevant>" },
    ...
  ],
  "radarData": <array or null>
}

The focusAreas keys and labels should be: ${stationFocusKeys} / ${stationFocusLabels}
Order focusAreas by score ascending (least ready first).${radarInstructions}${estimatedPerfInstruction}
Be honest and specific.`;

  const result = await chatJson(prompt, 2000);
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
