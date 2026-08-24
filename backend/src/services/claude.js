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
    .map(s => {
      const vest = s.weightVest ? ' 🦺+9kg' : '';
      const vol = s.volume ? ` Vol:${s.volume}` : '';
      const load = s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : null);
      const loadStr = load ? ` Load:${load}` : '';
      return `- ${s.type}${vest} on ${s.date?.slice(0, 10) || 'unknown'} (${s.duration || '?'} min, RPE ${s.rpe || '?'}${vol}${loadStr})`;
    })
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
  const sessionRef = daysAgo === 0 ? "today's session" : daysAgo === 1 ? "yesterday's session" : `the session ${daysAgo} days ago (${sessionDate})`;

  const classContext = session.isClass
    ? `\nCLASS SESSION CONSTRAINT: This was a coach-led class or group session. The athlete did NOT choose the exercise selection, training structure, rest periods, or transitions between stations — those were dictated by the instructor. Do NOT suggest the athlete changes the structure, shortens breaks, tightens transitions, or modifies the programming. Focus only on what they personally control: technique, execution quality, mental focus, effort level, and how to apply learnings to their own training.`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You know their full training history, their goals, and their personal approach to training. Give coaching feedback that feels like it comes from someone who truly knows them — not generic advice.${classContext}

Today's date: ${today}

Session logged (${whenLabel} — ${sessionDate}):
- Type: ${session.type}
- Class/group session: ${session.isClass ? 'Yes — structure set by instructor' : 'No — self-directed'}
- Weight vest (9 kg): ${session.weightVest ? 'Yes — worn during session' : 'No'}
- Duration: ${session.duration || '?'} minutes
- RPE: ${session.rpe || '?'}/10${session.volume ? ` | Volume: ${session.volume}` : ''}${session.sessionLoad ? ` | Session Load: ${session.sessionLoad}` : ''}
- Feeling: ${session.feeling || 'not specified'}
- Notes: ${session.notes || 'none'}
- Venue notes: ${venueNotes || 'none'}

IMPORTANT: When referring to this session, always call it "${sessionRef}". Do not recalculate the date yourself.

Recent training (last 7 days):
${recentSummary}

Upcoming objectives:
${objSummary}
${knowledgeBlock}

Also draw on current sports science and best practices for HYROX and endurance training to enrich your feedback.

Write 3-4 sentences of sharp, specific, personal coaching feedback. Reference their actual data. Be direct and motivating — like a coach who knows them well.

Then, if the session notes are missing context that would change your feedback (e.g. how a specific movement felt, the load/weight used, fatigue level, technique cues), ask 1-2 direct, specific follow-up questions to fill that gap. Only ask if genuinely useful — skip if the notes are already detailed enough. Do not ask generic questions like "how did it go".

Return plain text: the feedback first, then any follow-up questions on their own lines.`;

  return chat(prompt, 450);
}

export async function generateFinalCoachingNote({ session, recentSessions, objectives, venueNotes, knowledge, initialMessage, userReply }) {
  const recentSummary = recentSessions
    .slice(0, 7)
    .map(s => {
      const vest = s.weightVest ? ' 🦺+9kg' : '';
      const vol = s.volume ? ` Vol:${s.volume}` : '';
      const load = s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : null);
      const loadStr = load ? ` Load:${load}` : '';
      return `- ${s.type}${vest} on ${s.date?.slice(0, 10) || 'unknown'} (${s.duration || '?'} min, RPE ${s.rpe || '?'}${vol}${loadStr})`;
    })
    .join('\n') || 'No recent sessions';

  const objSummary = objectives
    .slice(0, 5)
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const knowledgeBlock = knowledge?.trim()
    ? `\nAthlete's personal knowledge base (their own coaching notes — factor these into your feedback):\n---\n${knowledge}\n---`
    : '';

  const sessionDate = session.date?.slice(0, 10) || 'unknown';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You already gave initial feedback on a session and asked follow-up questions. The athlete has now replied with more context. Write a final, consolidated coaching note that incorporates their reply.

Session logged (${sessionDate}):
- Type: ${session.type}
- Duration: ${session.duration || '?'} minutes
- RPE: ${session.rpe || '?'}/10${session.volume ? ` | Volume: ${session.volume}` : ''}${session.sessionLoad ? ` | Session Load: ${session.sessionLoad}` : ''}
- Notes: ${session.notes || 'none'}
- Venue notes: ${venueNotes || 'none'}

Recent training (last 7 days):
${recentSummary}

Upcoming objectives:
${objSummary}
${knowledgeBlock}

Your initial feedback to the athlete:
"${initialMessage}"

Athlete's reply:
"${userReply}"

Write a single consolidated "Final Coaching Note" — 3-5 sentences — that updates your assessment using the new context from their reply. Be direct and specific. Do not ask further questions. This is the closing word on this session.`;

  return chat(prompt, 450);
}

export async function generateTrainingSuggestion({ location, equipment, focus, timeAvailable, recentSessions, objectives, profile, notes, venueName, venueNotes, records, knowledge }) {
  const recentSummary = recentSessions
    .slice(0, 5)
    .map(s => {
      const vest = s.weightVest ? ' +vest' : '';
      return `- ${s.type}${vest} (${s.duration || '?'} min${s.rpe ? `, RPE ${s.rpe}` : ''}, ${s.date?.slice(0, 10) || '?'})`;
    })
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

export async function generateTrainingReview({ sessions, objectives, startDate, endDate }) {
  const today = new Date().toISOString().slice(0, 10);

  // Detailed session log — most recent first
  const sessionLog = [...sessions].reverse().map(s => {
    const vest = s.weightVest ? ' [VEST 9kg]' : '';
    const vol = s.volume ? ` Vol:${s.volume}` : '';
    const load = s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : null);
    const loadStr = load ? ` Load:${load}` : '';
    const notes = s.notes?.trim() ? `\n    → ${s.notes.trim().slice(0, 250)}` : '';
    return `[${s.date?.slice(0, 10)}] ${s.type}${vest} — ${s.duration || '?'} min${s.rpe != null ? `, RPE ${s.rpe}${vol}${loadStr}` : ''}${notes}`;
  }).join('\n') || 'No sessions in this window';

  // Upcoming objectives — sorted by date, with readiness data if available
  const hyroxObjs = objectives.filter(o => o.type === 'hyrox').sort((a, b) => new Date(a.date) - new Date(b.date));
  const otherObjs = objectives.filter(o => o.type !== 'hyrox').sort((a, b) => new Date(a.date) - new Date(b.date));

  const formatObj = (o) => {
    const daysAway = Math.round((new Date(o.date) - new Date(today)) / (1000 * 60 * 60 * 24));
    let line = `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10)} (${daysAway} days away)`;
    if (o.targetTime) line += ` — target: ${o.targetTime}`;
    if (o.readiness?.score) {
      line += `\n  Current readiness: ${o.readiness.score}/10`;
      if (o.readiness.radarData?.length) {
        const stationScores = o.readiness.radarData
          .filter(d => d.key !== 'overall')
          .map(d => `${d.label}: ${d.readiness}/10`)
          .join(', ');
        line += `\n  Station scores: ${stationScores}`;
      }
      if (o.readiness.summary) line += `\n  AI summary: ${o.readiness.summary.slice(0, 300)}`;
    }
    return line;
  };

  const hyroxBlock = hyroxObjs.length
    ? `HYROX objectives:\n${hyroxObjs.map(formatObj).join('\n')}`
    : 'No upcoming HYROX objectives.';

  const otherBlock = otherObjs.length
    ? `Other objectives:\n${otherObjs.map(formatObj).join('\n')}`
    : '';

  const totalKm = sessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
  const totalMin = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalLoad = sessions.reduce((sum, s) =>
    sum + (s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : 0)), 0);

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. Your job is to give a sharp, objective-driven 30-day review — not generic advice.

Today: ${today}
Review window: ${startDate} → ${endDate} (last 30 days)

TRAINING WINDOW SUMMARY:
- ${sessions.length} sessions completed
- ${Math.round(totalMin / 60 * 10) / 10} hours total training
- ${totalKm.toFixed(1)} km running
- Total session load: ${totalLoad || 'not tracked'}

UPCOMING OBJECTIVES:
${hyroxBlock}
${otherBlock}

FULL SESSION LOG (last 30 days, most recent first):
${sessionLog}

---

Write a coaching review with exactly these four sections. Be specific, direct, and reference actual session data. No generic encouragement. No advice about objectives that are already past.

### Training Overview
2–3 sentences on what the last 30 days actually looked like: volume, intensity mix, consistency. Reference the data.

### Where You're Well Prepared
For each upcoming HYROX: which stations or capabilities are genuinely strong based on recent training? Reference specific sessions or patterns that back this up. If readiness scores are available, use them to anchor the assessment.

### Focus Areas — Next 30 Days
Which stations or physical qualities are the biggest gaps relative to the upcoming HYROX? Be direct. Rank the top 3 priorities. Reference the station readiness scores if present.

### Priority Sessions — Next 30 Days
3–4 specific, concrete sessions to do in the next 30 days that address the gaps above. Name the session type, effort level (RPE), approximate duration, and why it directly helps.`;

  return chat(prompt, 1000);
}

// Extracts structured exercise/workout data from session notes in the background.
// Multi-round circuits written out in full (e.g. 10 repeated rounds of a
// 7-exercise block) easily run 1500-2000+ chars — a low truncation here
// silently cuts off mid-round, undercounting sets for whichever exercises
// happen to fall past the cutoff.
export async function extractExercisesFromNotes({ type, notes }) {
  if (!notes?.trim()) return null;
  const prompt = `Extract structured workout data from this training session note. Return JSON only.

Session type: ${type}
Notes: "${notes.trim().slice(0, 4000)}"

Return:
{
  "runType": "<easy|threshold|intervals|tempo|race|null — only for running>",
  "estimatedPace": "<e.g. 4:30/km or null>",
  "exercises": [
    {
      "name": "<sledPush|sledPull|farmersCarry|wallBalls|skiErg|rowErg|burpeeBroadJump|walkingLunges|squat|deadlift|benchPress|pullUp|run|other>",
      "sets": <number or null>,
      "reps": <number or null>,
      "weightKg": <number or null>,
      "distanceM": <number or null>,
      "notes": "<any other relevant detail or null>"
    }
  ]
}

Only include what is explicitly mentioned. Return empty exercises array if nothing structured is mentioned.`;
  return chatJson(prompt, 400);
}

export async function generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge, trainingLoadBlock, transferabilityNotes, readinessScaleNotes }) {
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
      const vest = s.weightVest ? ' [WEIGHT VEST 9kg]' : '';
      const vol = s.volume ? `, Vol:${s.volume}` : '';
      const load = s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : null);
      const loadStr = load ? `, Load:${load}` : '';
      const header = `[${s.date?.slice(0, 10) || '?'}] ${s.type}${vest} — ${s.duration || '?'} min${s.rpe != null ? `, RPE ${s.rpe}${vol}${loadStr}` : ''}`;
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

  const scaleBlock = readinessScaleNotes
    ? `\nSTATION READINESS SCALE (defines what each score means per station — follow this exactly when producing radarData):\n---\n${readinessScaleNotes}\n---\n`
    : '';

  const transferabilityRef = transferabilityNotes
    ? ` Cross-reference the athlete's exercise transferability notes above to identify which gym exercises qualify as prerequisites for each station.`
    : '';

  const radarInstructions = isHyrox ? `
Also return "radarData": an array of 10 objects scoring each HYROX station.
Use the STATION READINESS SCALE above to determine each score.${transferabilityRef}
Score = readiness to PERFORM today based on physical capability, not HYROX-specific rep volume.

Components: "overall"→"Overall", "running"→"Running", "skiErg"→"SkiErg", "sledPush"→"Sled Push", "sledPull"→"Sled Pull", "burpeeBroadJump"→"Burpee BJ", "rowErg"→"Row Erg", "farmersCarry"→"Farmers Carry", "walkingLunges"→"Lunges", "wallBall"→"Wall Ball"
Each object: { "key": "<key>", "label": "<label>", "readiness": <0-10> }` : '';

  const estimatedPerfInstruction = !isHyrox ? `
Also return "estimatedPerformance": a short string estimating the athlete's current realistic performance range for this race type based on their training and records (e.g. "~19:45–20:30 for 5K today"). Be honest and specific. If insufficient data, make a conservative estimate and say so.` : '';

  const knowledgeBlock = knowledge?.trim()
    ? `\nKnowledge base (coaching notes, sport science, technique guides):\n---\n${knowledge}\n---\n`
    : '';

  const transferabilityBlock = transferabilityNotes
    ? `\nATHLETE'S EXERCISE TRANSFERABILITY NOTES (your own writing about what you train):\n---\n${transferabilityNotes}\n---\n`
    : '';

  const loadBlock = trainingLoadBlock
    ? `\n${trainingLoadBlock}\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. Analyse their readiness for their upcoming goal and return a JSON response.${knowledgeBlock}${scaleBlock}${transferabilityBlock}

Athlete: ${profileLine}

Objective:
${objectiveDetail}${stationInfo}
${loadBlock}
Recent sessions — last 20, most recent first (read notes for actual content: exercises, weights, distances, paces):
${recentSummary}

Past race records/PRs:
${recordsSummary}

How to score readiness:
- Use past race records/PRs as the primary calibration anchor. If the athlete has a record at or faster than the target, readiness starts at 7+ and is adjusted for training quality. If their best is within 5% of the target, baseline is 6-7.
- Use the longitudinal load data (weekly digests + ATL/CTL) to understand volume and intensity trends. This is your primary source for development over the last 3 months.
- Read recent session notes for specific content: exercises, weights, reps, paces, sets. This tells you WHAT was trained.
- Use the knowledge base to map training to race demands.
- Volume and intensity consistency across weeks matters more than any single session.
- RPE is secondary context only.
- Score meaning: 9-10 = athlete is in peak form and very likely to meet or exceed their target. 7-8 = training clearly supports the target; minor gaps only. 5-6 = some concern — athlete may fall short by 5-10%. 3-4 = meaningful risk of missing target by 10%+. 1-2 = major deficit, likely to miss significantly. Do NOT default to 5 as a neutral score. Ground every score in specific evidence from records and training data.

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

// Reads a photo of a cardio machine's display (SkiErg, rower, treadmill, bike...)
// and returns a short text summary of the stats shown. No image is stored —
// this is called once at capture time and only the extracted text is kept.
export async function extractDraftEntryFromImage({ imageBase64, caption }) {
  if (!process.env.OPENAI_API_KEY) return caption || null;
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a photo of a cardio machine's display screen (e.g. SkiErg, rowing erg, treadmill, assault bike) taken right after a workout. Read every stat visible on the screen — time, distance, pace/split, calories, watts, stroke/cadence rate, heart rate, etc. — and return ONE short plain-text line summarizing them, e.g. "SkiErg: 1000m in 3:52, 82 cal, avg HR 168 bpm". If the screen or numbers are unclear, say so briefly instead of guessing values.${caption ? `\n\nAthlete's caption for this photo: "${caption}"` : ''}`,
          },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
    });
    return completion.choices[0].message.content?.trim() || null;
  } catch (err) {
    console.error('extractDraftEntryFromImage: OpenAI vision error:', err?.status, err?.message);
    return caption || null;
  }
}

// Merges the athlete's quick-capture draft entries (voice/text/photo) for a single
// day into structured session fields, so the log form can be pre-filled for review.
export async function extractSessionFromDraft({ date, entries, sessionTypes }) {
  const entryLines = entries.map((e, i) => {
    const label = e.kind === 'photo' ? 'Photo (machine screen) reading' : e.kind === 'voice' ? 'Voice note' : 'Note';
    return `${i + 1}. [${label}] ${e.text}`;
  }).join('\n');

  const typeList = (sessionTypes || []).join(', ');

  const prompt = `The athlete captured these quick notes about their training on ${date}. They may describe one workout or several separate activities done the same day (e.g. a morning kayak session and an afternoon gym session) — combine everything into a single training log entry.

Notes:
${entryLines}

Return JSON only:
{
  "type": "<one of: ${typeList}>",
  "duration": <total minutes across all notes, integer, or null if not mentioned/inferable>,
  "rpe": <integer 1-10 perceived effort if mentioned or clearly implied, else null>,
  "runningDistance": <km as a number, only if a running/hyrox running distance is mentioned, else null>,
  "volume": "<Low, Medium, High, or null>",
  "weightVest": <true only if a weight vest is explicitly mentioned, else false>,
  "notes": "<a clean, well-written summary combining all the notes into one coherent session description, in the athlete's own voice, preserving every specific number/time/rep/HR value mentioned>"
}

Pick "type" based on the dominant or most structured activity described. If nothing in the list fits well (e.g. kayaking, swimming, hiking), use "other". Only fill numeric fields you can actually infer from the notes — do not guess.`;

  return chatJson(prompt, 500);
}

const STATION_KEYS = ['running', 'skierg', 'sled_push', 'sled_pull', 'row_erg', 'farmers_carry', 'sandbag_lunges', 'burpee_broad_jump', 'wall_balls'];

// HYROX Open Men race-standard demand per station — the fixed anchor for
// what "4" means. (Open Men matches this app's other default division
// lookups, e.g. HYROX_WEIGHTS.open_men.)
//
// Two kinds of equivalence, matched to how each station is actually demanding:
// - 'work' stations (sled push/pull, farmers carry, sandbag lunges, wall balls):
//   an external implement is loaded, so mechanical work (weight × volume) is
//   the equalizer — heavier weight for proportionally fewer reps/distance can
//   be genuinely equivalent, not automatically "less".
// - 'cardio' stations (running, skierg, row erg): no implement weight, so the
//   equalizer is effort relative to race pace — a shorter but much harder
//   session can outweigh a longer easy one (see rpeIntensityMultiplier).
// - 'bodyweight' (burpee broad jump): no implement weight; a worn vest is the
//   only load variable, handled as a flat bonus.
const STATION_BENCHMARKS = [
  { key: 'running', label: 'Running', demand: '8 × 1km (8km total) run split across the race, at race pace', kind: 'cardio', raceDistanceM: 8000 },
  { key: 'skierg', label: 'SkiErg', demand: '1000m continuous', kind: 'cardio', raceDistanceM: 1000 },
  { key: 'sled_push', label: 'Sled Push', demand: '50m at ~150kg (sled + plates)', kind: 'work', raceWeightKg: 150, raceVolume: 50, volumeUnit: 'm' },
  { key: 'sled_pull', label: 'Sled Pull', demand: '50m at ~100kg', kind: 'work', raceWeightKg: 100, raceVolume: 50, volumeUnit: 'm' },
  { key: 'row_erg', label: 'Row Erg', demand: '1000m continuous', kind: 'cardio', raceDistanceM: 1000 },
  { key: 'farmers_carry', label: 'Farmers Carry', demand: '200m carrying 2×24kg', kind: 'work', raceWeightKg: 48, raceVolume: 200, volumeUnit: 'm' },
  { key: 'sandbag_lunges', label: 'Sandbag Lunges', demand: '100m of walking lunges with a 20kg sandbag', kind: 'work', raceWeightKg: 20, raceVolume: 100, volumeUnit: 'm' },
  { key: 'burpee_broad_jump', label: 'Burpee Broad Jump', demand: '80m of burpee broad jumps', kind: 'bodyweight', raceVolume: 80, volumeUnit: 'm', repsEquivalent: 50 },
  { key: 'wall_balls', label: 'Wall Balls', demand: '100 reps with a 6kg ball at a 10ft target', kind: 'work', raceWeightKg: 6, raceVolume: 100, volumeUnit: 'reps' },
];

function renderStationBenchmarks() {
  return STATION_BENCHMARKS.map(b => `- ${b.label}: race demand ${b.demand}.`).join('\n');
}

// Effort relative to race pace, applied to distance for cardio stations —
// a short, very hard interval session can be MORE demanding than a longer
// one at race effort, so raw distance alone understates it.
function rpeIntensityMultiplier(rpe) {
  if (rpe == null) return 1.0;
  if (rpe <= 4) return 0.6;   // easy / Zone 2
  if (rpe <= 6) return 0.85;  // moderate / tempo
  if (rpe === 7) return 1.0;  // threshold, ≈ race pace
  if (rpe === 8) return 1.3;  // hard intervals
  return 1.6;                 // 9-10: max / VO2max intervals
}

const EXTRACTION_NAME_TO_STATION = {
  sledPush: 'sled_push',
  sledPull: 'sled_pull',
  farmersCarry: 'farmers_carry',
  wallBalls: 'wall_balls',
  skiErg: 'skierg',
  rowErg: 'row_erg',
  burpeeBroadJump: 'burpee_broad_jump',
  walkingLunges: 'sandbag_lunges',
  run: 'running',
};

// Computes, per station, how the session's logged volume/load/intensity
// compares to HYROX Open Men race demand — as a single ratio the model can
// apply directly, instead of it eyeballing "high volume" from prose (which
// is what let very different sessions land on the identical score before).
function computeStationEquivalence(session) {
  const byStation = {};
  const bump = (key) => (byStation[key] ||= { workKg: 0, distanceM: 0, reps: 0 });

  for (const e of session.extractedExercises?.exercises || []) {
    if (!e?.name) continue;
    let stationKey = EXTRACTION_NAME_TO_STATION[e.name];
    // Thrusters are a near-direct movement match for wall balls (squat-to-press
    // vs. squat-to-throw) — the extraction schema has no dedicated slot for
    // them, so they land in "other" with a note.
    if (!stationKey && e.name === 'other' && /thruster/i.test(e.notes || '')) stationKey = 'wall_balls';
    if (!stationKey) continue;

    const volume = e.distanceM
      ? (e.sets || 1) * e.distanceM
      : (e.sets && e.reps ? e.sets * e.reps : (e.reps || 0));
    if (!volume) continue;

    const station = bump(stationKey);
    if (e.weightKg) {
      station.workKg += e.weightKg * volume;
    } else if (e.distanceM) {
      station.distanceM += volume;
    } else {
      station.reps += volume;
    }
  }

  if (session.runningDistance) {
    bump('running').distanceM += session.runningDistance * 1000;
  }

  const vestBonus = session.weightVest ? 1.15 : 1.0;
  const intensity = rpeIntensityMultiplier(session.rpe);

  const results = {};
  for (const b of STATION_BENCHMARKS) {
    const data = byStation[b.key];
    if (!data) continue;

    if (b.kind === 'work') {
      if (data.workKg > 0) {
        const benchmark = b.raceWeightKg * b.raceVolume;
        results[b.key] = {
          ratio: data.workKg / benchmark,
          basis: `${Math.round(data.workKg).toLocaleString()} kg·${b.volumeUnit} logged (weight × volume) vs ${benchmark.toLocaleString()} kg·${b.volumeUnit} race demand (${b.raceWeightKg}kg × ${b.raceVolume}${b.volumeUnit})`,
        };
      } else {
        // No weight recorded for this movement — fall back to raw volume,
        // conservatively assuming it was near race-standard load.
        const rawVolume = data.distanceM || data.reps;
        if (rawVolume) {
          results[b.key] = {
            ratio: rawVolume / b.raceVolume,
            basis: `${rawVolume}${b.volumeUnit} logged (no weight recorded, assumed near race-standard load) vs ${b.raceVolume}${b.volumeUnit} race demand`,
          };
        }
      }
    } else if (b.kind === 'cardio' && data.distanceM > 0) {
      const effectiveDistance = data.distanceM * intensity;
      results[b.key] = {
        ratio: effectiveDistance / b.raceDistanceM,
        basis: `${Math.round(data.distanceM)}m × ${intensity}x intensity (RPE ${session.rpe ?? '?'}) = ${Math.round(effectiveDistance)}m effective vs ${b.raceDistanceM}m race demand`,
      };
    } else if (b.kind === 'bodyweight') {
      const rawVolume = (data.distanceM || (data.reps ? data.reps * (b.raceVolume / b.repsEquivalent) : 0)) * vestBonus;
      if (rawVolume) {
        results[b.key] = {
          ratio: rawVolume / b.raceVolume,
          basis: `${Math.round(rawVolume)}${b.volumeUnit}-equivalent logged${session.weightVest ? ' (+15% for weight vest)' : ''} vs ${b.raceVolume}${b.volumeUnit} race demand`,
        };
      }
    }
  }
  return results;
}

export async function generateStationScores({ session, knowledge }) {
  const isHyroxSession = session.type === 'hyrox_training' || session.type === 'hyrox_race' || session.type === 'hyrox_competition';
  const isRunSession = session.type === 'running';
  const isStrengthSession = session.type === 'gym_strength';

  const extractedList = session.extractedExercises?.exercises?.length
    ? session.extractedExercises.exercises
        .map(e => {
          const sets = e.sets ? `${e.sets}×${e.reps || '?'}` : (e.reps ? `${e.reps} reps` : '');
          const weight = e.weightKg ? `@ ${e.weightKg}kg` : '';
          const dist = e.distanceM ? `${e.distanceM}m` : '';
          return `- ${e.name}${sets ? ` ${sets}` : ''}${weight ? ` ${weight}` : ''}${dist ? ` ${dist}` : ''}${e.notes ? ` (${e.notes})` : ''}`;
        })
        .join('\n')
    : null;

  const equivalence = computeStationEquivalence(session);
  const equivalenceLines = Object.entries(equivalence).map(([key, { ratio, basis }]) => {
    const label = STATION_BENCHMARKS.find(b => b.key === key)?.label || key;
    return `- ${label}: ${basis} → ${Math.round(ratio * 100)}% of race demand`;
  });
  const volumeBlock = equivalenceLines.length
    ? `\nComputed race-equivalence per station (weight × volume for loaded stations, intensity-adjusted distance for cardio — this arithmetic is ground truth, use it directly rather than re-deriving volume from the notes):\n${equivalenceLines.join('\n')}\nTier mapping for these percentages: ≥150% → 5, 75-150% → 4, 40-75% → 3, under 40% (but nonzero) → 2.`
    : '';

  const notesLower = (session.notes || '').toLowerCase();
  const mentionsOtherCardioMachine = /\b(assault bike|echo bike|air ?bike|fan bike|spin bike|stationary bike|cycling|bike)\b/.test(notesLower);
  const cardioTransferBlock = mentionsOtherCardioMachine
    ? `\nIMPORTANT — cardio machine transfer: the notes describe meaningful work on a bike/cycling machine. That's a genuine aerobic/VO2max stimulus, just like running, rowing, or skiing — do NOT default Running to 1 just because the word "running" itself wasn't used. Score Running 2-3 for a solid bike effort (higher for a long or high-intensity one, e.g. 200+ calories or 15+ minutes at real effort), and give the same aerobic-transfer credit to SkiErg, Row Erg, Wall Balls, and Burpee Broad Jump that a quality run session would get.`
    : '';

  const sessionTypeContext = isHyroxSession
    ? `\nIMPORTANT: Session type is "${session.type}" — this is a full HYROX circuit or class covering all 9 stations. Unless the notes indicate only partial stations were done, assume moderate-to-high contribution across all stations. Adjust up or down based on specific details (loads, duration per station, intensity) if mentioned.${cardioTransferBlock}`
    : isRunSession
    ? `\nIMPORTANT: Session type is "running". Running station score should reflect actual run volume and intensity.
Aerobic transfer rules for running sessions:
- High-intensity running (intervals, tempo, RPE 7+) builds VO2max and lactate threshold that transfers to ALL aerobic HYROX stations. Score SkiErg, Row Erg, Wall Balls, and Burpee Broad Jump at 2-3 for a quality run session — these stations have a significant aerobic demand.
- Sled Push, Sled Pull, Farmers Carry score 1-2 (these are strength/power dominated, running transfer is minimal).
- Sandbag Lunges scores 2 if the run had significant volume (leg endurance transfer).
- Only score other stations at 1 if the run was very short or easy (RPE ≤ 4).`
    : isStrengthSession
    ? `\nIMPORTANT: Session type is "gym_strength". Use the Exercise Transferability library to map logged exercises to HYROX stations. Base the Running score on evidence of aerobic/cardio work in the notes (running, biking, rowing, skiing, high-rep conditioning) — score 1 only if there's genuinely no cardio component. Other stations score based on exercise specificity and load.${cardioTransferBlock}`
    : `${cardioTransferBlock}`;

  const runningBlock = session.runningDistance
    ? `\nRunning distance logged: ${session.runningDistance} km`
    : '';

  const notesBlock = session.notes?.trim()
    ? `\nFreeform session notes (always use this — may contain detail not captured in structured exercises):\n"${session.notes.trim().slice(0, 4000)}"`
    : '';

  const extractedBlock = extractedList
    ? `\nStructured exercises extracted from notes:\n${extractedList}${volumeBlock}`
    : '';

  const knowledgeBlock = knowledge?.trim()
    ? `\nExercise Transferability knowledge library:\n---\n${knowledge}\n---`
    : '';

  const prompt = `You are an expert HYROX coach scoring how much a training session contributed to each of the 9 HYROX stations (1–5).
${sessionTypeContext}
Session data:
- Type: ${session.type}
- Duration: ${session.duration || '?'} min
- RPE: ${session.rpe || '?'}/10${session.volume ? ` | Volume: ${session.volume}` : ''}${runningBlock}${runningBlock ? '' : ''}
${extractedBlock}${notesBlock}
${knowledgeBlock}

HYROX OPEN MEN RACE-STANDARD REFERENCE — the fixed anchor for every score.
${renderStationBenchmarks()}

Scoring scale:
- Wherever the "Computed race-equivalence" figures above give a percentage for a station, USE THAT PERCENTAGE via its tier mapping — that arithmetic (weight × volume for loaded stations, RPE-adjusted distance for cardio) already accounts for load, distance/reps, and intensity together, correctly. Do not override it with a lower score just because the volume or duration "looks short" — a heavier load or a harder effort can legitimately make a shorter session equivalent to or greater than race demand.
- For stations with no computed percentage (no matching structured data), judge qualitatively against the reference above and the notes/knowledge library:
  - 5 = clearly exceeds race demand in volume, load, or intensity, done in a genuinely race-like continuous manner.
  - 4 = roughly matches race demand, or a near-direct movement substitute (e.g. thrusters for wall balls, an assault bike for running/cardio) at equivalent volume/effort.
  - 3 = roughly 40-75% of race demand, OR full volume broken into many small rest-heavy sets (real work, but not race-specific continuous output), OR a genuine indirect transfer exercise at meaningful volume.
  - 2 = well under half of race demand, or only a loose/indirect transfer.
  - 1 = no meaningful contribution — no evidence at all.
- A weight vest or meaningful incline/hill adds difficulty beyond what raw distance/reps shows — factor it in as pushing toward the top of whichever tier otherwise applies, especially for running, burpee broad jump, and sandbag lunges.

Key rules:
- If running distance ≥ 5 km at RPE ≥ 6 and no computed percentage is available, running score = 4 or 5.
- If session type is hyrox_training/hyrox_race and no notes say otherwise, baseline all stations at 3–4 then adjust for detail.
- Do NOT apply a blanket "most scores should be 1-2" rule — let the evidence, compared against the reference above, determine each score independently.
- Only score a station low (1–2) if there is genuinely no evidence of contribution.

Return JSON only:
{
  "running": <1-5>,
  "skierg": <1-5>,
  "sled_push": <1-5>,
  "sled_pull": <1-5>,
  "row_erg": <1-5>,
  "farmers_carry": <1-5>,
  "sandbag_lunges": <1-5>,
  "burpee_broad_jump": <1-5>,
  "wall_balls": <1-5>
}`;

  const result = await chatJson(prompt, 300);
  if (!result) return null;
  const scores = {};
  for (const key of STATION_KEYS) {
    const v = Number(result[key]);
    scores[key] = Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 1;
  }
  return scores;
}
