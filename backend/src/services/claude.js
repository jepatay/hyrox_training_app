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
- Class/group session: ${session.isClass ? 'Yes — structure set by instructor' : 'No — self-directed'}${session.weightVest ? '\n- Weight vest (9 kg): worn during session' : ''}
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

DO NOT invent precision the data doesn't support. If the notes only give a TOTAL time for a round covering several exercises, that tells you the round as a whole was faster or slower — it does NOT tell you which specific exercise within it changed pace, felt different, or caused the difference. Only attribute a pacing observation to one particular movement if the notes actually break out that movement's own time/reps/pace separately. Otherwise, comment at the level the data actually supports (e.g. "round 3 was your slowest" — not "the burpees in round 3 were slower").

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

Write a single consolidated "Final Coaching Note" — 3-5 sentences — that updates your assessment using the new context from their reply. Be direct and specific, but don't invent precision the data doesn't support — e.g. if only a round's total time is known, don't attribute a pacing change to one specific exercise within it unless that movement's own time/reps/pace was actually stated. Do not ask further questions. This is the closing word on this session.`;

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
      "name": "<short Title Case name for the movement, e.g. 'Wall Balls', 'Kettlebell Swing', 'Assault Bike', 'Thruster', 'Pull Up'. Use the same consistent name for every mention of the same movement in this response. Do NOT force it into a fixed category — if it's a real, recognizable exercise, name it specifically rather than calling it 'Other'.>",
      "sets": <number or null — ONLY a round/set MULTIPLIER, i.e. how many times the reps value below was repeated (e.g. "3 sets of 8 thrusters" -> sets: 3, reps: 8). If the notes describe just one instance with no round/set language ("8 thrusters"), leave sets null and put the 8 in reps — do NOT put a bare rep count here.>,
      "reps": <number or null — the rep count itself (per set if sets is also given, otherwise the total, e.g. "8 thrusters" -> reps: 8, sets: null)>,
      "weightKg": <number or null — ALWAYS convert to kilograms, even when the notes state lbs/pounds (1 lb = 0.4536 kg) — never copy a lbs number in as if it were kg>,
      "distanceM": <number or null>,
      "calories": <number or null — ONLY for a cardio machine reading given in calories, e.g. an assault bike/echo bike/rower display showing "200 cal". Do not fill both calories and distanceM for the same entry.>,
      "notes": "<any other relevant detail or null>"
    }
  ]
}

Only include what is explicitly mentioned. Return empty exercises array if nothing structured is mentioned.

CIRCUITS AND REPEATED ROUNDS — read this carefully, it's the most common source of error:
Athletes write repeated rounds in many different ways: an explicit "N rounds of the following:" prefix, numbered labels ("Round 1:", "Round 2:", ... "Round N:"), or simply the same (or near-identical) block of exercises appearing multiple times back-to-back with no explicit count or numbering at all (e.g. separated by blank lines, or each just starting with a time like "round, 5 min 51 seconds"). Whatever the format, apply ONE general rule: COUNT how many times each block of exercises actually appears in the text — do not rely on the notes stating a count, and do not guess or under-count — then for every exercise, SUM its reps/distance/calories across ALL of those repetitions into ONE combined total (e.g. an exercise appearing in 4 near-identical blocks has its reps/distance/calories multiplied by 4, not reported as if it happened once — this can be expressed either as sets:4 with the per-round value, or as the single already-multiplied total with sets:1, whichever you're more confident is accurate). If an exercise's weight changes partway through the repeated blocks, output SEPARATE entries per weight bracket, each totaled only across the repetitions logged at that weight. A line that appears only ONCE in the notes (not part of any repeated block) keeps its stated numbers as-is — don't multiply it by the round count of a different, repeated section.`;
  return chatJson(prompt, 1000);
}

// Turns extracted exercises into one plain-text line per exercise, spelling
// out the computed total (e.g. "Thruster: 13 × 15 reps @ 11kg = 195 reps
// total") instead of a table of separate fields — this is what the athlete
// reviews and edits directly before scoring, so what they see IS what gets
// scored, not a paraphrase of it. `library` (from exerciseLibrary.js) supplies
// the recognized label and flags anything still awaiting approval so nothing
// silently counts toward a score the athlete hasn't seen.
export function renderExtractionSummary(extracted, library = []) {
  const exercises = extracted?.exercises || [];
  if (!exercises.length) return '';
  const byKey = new Map(library.map(e => [e.key, e]));
  return exercises.map(e => {
    const entry = e.libraryKey ? byKey.get(e.libraryKey) : null;
    const label = entry?.label || e.name || 'Exercise';
    const pendingTag = entry?.status === 'pending' ? ' [new — pending review in Exercise Library]' : '';
    const weight = e.weightKg ? ` @ ${e.weightKg}kg` : '';
    const sets = e.sets && e.sets > 1 ? e.sets : null;

    if (e.calories) {
      const total = (sets || 1) * e.calories;
      const setsPrefix = sets ? `${sets} × ` : '';
      const totalSuffix = sets ? ` = ${total} cal total` : '';
      return `${label}: ${setsPrefix}${e.calories} cal${totalSuffix}${pendingTag}`;
    }
    if (e.reps) {
      const total = (sets || 1) * e.reps;
      const setsPrefix = sets ? `${sets} × ` : '';
      const totalSuffix = sets ? ` = ${total} reps total` : '';
      return `${label}: ${setsPrefix}${e.reps} reps${weight}${totalSuffix}${pendingTag}`;
    }
    if (e.distanceM) {
      const total = (sets || 1) * e.distanceM;
      const setsPrefix = sets ? `${sets} × ` : '';
      const totalSuffix = sets ? ` = ${total}m total` : '';
      return `${label}: ${setsPrefix}${e.distanceM}m${weight}${totalSuffix}${pendingTag}`;
    }
    if (e.sets) {
      // Only "sets" came back with no reps/distance/calories alongside it —
      // still a real count (e.g. "8 thrusters" landing in the wrong field),
      // not nothing. Show it as-is rather than claiming it won't count.
      return `${label}: ${e.sets} reps${weight}${pendingTag}`;
    }
    return `${label}: ${e.notes || 'logged'} (no reps/distance captured — won't count toward station scores)`;
  }).join('\n');
}

// Parses the athlete's (possibly hand-edited) summary lines straight back
// into raw exercises with plain regex — deterministic, not another AI guess.
// The leading label is kept as-is (not matched against the library here);
// resolveExercisesAgainstLibrary does that next, so a hand-typed new exercise
// name flows through the same pending-approval path as an AI extraction.
export function parseExtractionSummary(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const exercises = [];
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.slice(0, colonIdx).trim();
    let rest = line.slice(colonIdx + 1).trim();
    rest = rest.replace(/\s*\[new[^\]]*\]\s*$/i, '').trim();
    if (!name) continue;

    const weightMatch = rest.match(/@\s*([\d.]+)\s*kg/i);
    const weightKg = weightMatch ? parseFloat(weightMatch[1]) : null;

    const setsCalMatch = rest.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*cal/i);
    const calOnlyMatch = rest.match(/^([\d.]+)\s*cal/i);
    const setsRepsMatch = rest.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*reps/i);
    const setsDistMatch = rest.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*m\b/i);
    const repsOnlyMatch = rest.match(/^([\d.]+)\s*reps/i);
    const distOnlyMatch = rest.match(/^([\d.]+)\s*m\b/i);

    let sets = null, reps = null, distanceM = null, calories = null;
    if (setsCalMatch) {
      sets = parseFloat(setsCalMatch[1]);
      calories = parseFloat(setsCalMatch[2]);
    } else if (calOnlyMatch) {
      calories = parseFloat(calOnlyMatch[1]);
    } else if (setsRepsMatch) {
      sets = parseFloat(setsRepsMatch[1]);
      reps = parseFloat(setsRepsMatch[2]);
    } else if (setsDistMatch) {
      sets = parseFloat(setsDistMatch[1]);
      distanceM = parseFloat(setsDistMatch[2]);
    } else if (repsOnlyMatch) {
      reps = parseFloat(repsOnlyMatch[1]);
    } else if (distOnlyMatch) {
      distanceM = parseFloat(distOnlyMatch[1]);
    }

    if (!reps && !distanceM && !calories) continue;
    exercises.push({ name, sets, reps, weightKg, distanceM, calories, notes: null });
  }
  return { exercises };
}

// v2 extraction (Change Brief V2 section 4) — separate from the v1 functions
// above, which stay untouched and keep feeding v1 scoring. Differences:
// every part of the session counts (warm-up, runs, abs, cool-down — nothing
// skipped), each line carries a `part` tag, and lines gain `timeSec` (the
// time for one interval, never a computed pace — that's scoring.js's job)
// alongside the existing weight/distance/calories fields. Cached as-is on
// the session's `extractionV2` field; re-scoring never re-calls this.
export async function extractExercisesFromNotesV2({ type, notes }) {
  if (!notes?.trim()) return null;
  const prompt = `Extract EVERY logged movement from this training session note — including warm-up, cool-down, ab/core work and any runs, wherever they appear in the text. Nothing gets skipped because it looks like a warm-up or an afterthought. Return JSON only.

Session type: ${type}
Notes: "${notes.trim().slice(0, 4000)}"

Return:
{
  "lines": [
    {
      "part": "<warmup|main|finisher|core|cooldown — which section of the session this belongs to. 'warmup' = explicit warm-up work before the main effort. 'finisher' = extra work explicitly after/following the main block (e.g. under a 'Then' or 'Finisher' label). 'core' = ab/core-specific work (sit-ups, planks, leg raises, etc.), wherever it appears. 'cooldown' = explicit cool-down/stretching-adjacent movement (rare). Otherwise 'main'.>",
      "exercise": "<short Title Case name for the movement, e.g. 'Wall Balls', 'Run', 'Sit Up'. Use the same consistent name for every mention of the same movement.>",
      "intervals": <number — how many times this exact effort was repeated (e.g. "3 rounds of 20 wall balls" -> intervals: 3, reps: 20 per round; "10 x 200m ski repeats" -> intervals: 10, distanceM: 200 per repeat). 1 if it happened once. Apply the same round-counting rule as always: if a block of movements visibly repeats in the text (numbered rounds, or the same block appearing back-to-back) without saying so explicitly, count the repeats yourself.>,
      "reps": <number or null — the PER-INTERVAL rep count (not multiplied by intervals)>,
      "distanceM": <number or null — the PER-INTERVAL distance in meters (not multiplied by intervals)>,
      "calories": <number or null — the PER-INTERVAL calories for a cardio machine reading (assault bike/echo bike/rower), not multiplied by intervals>,
      "weightKg": <number or null — ALWAYS convert to kilograms (1 lb = 0.4536 kg)>,
      "timeSec": <number or null — the time taken for ONE interval, in seconds, ONLY if the notes state a time or pace for it (e.g. "200m in 32 seconds" -> timeSec: 32; "5km in 25:00" -> timeSec: 1500). Never compute or estimate a time/pace yourself — leave null if the notes don't state one.>,
      "notes": "<any other relevant detail or null>"
    }
  ]
}

Only include what is explicitly mentioned. Return empty lines array if nothing structured is mentioned.

ROUND-COUNTING — apply the same rule regardless of section: COUNT how many times a block of movements actually appears (explicit count, numbered rounds, or repeated back-to-back blocks with no count stated) and reflect it in "intervals" with the PER-INTERVAL numbers, never a pre-multiplied total. If a movement's weight changes partway through repeated blocks, output SEPARATE lines per weight bracket.`;
  return chatJson(prompt, 1400);
}

const V2_PART_ORDER = ['warmup', 'main', 'finisher', 'core', 'cooldown'];
const V2_PART_LABEL = { warmup: 'Warm-up', main: 'Main', finisher: 'Then', core: 'Core', cooldown: 'Cool-down' };
const V2_HEADER_TO_PART = { 'warm-up': 'warmup', main: 'main', then: 'finisher', core: 'core', 'cool-down': 'cooldown' };

function formatMinSec(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatV2Line(line, entry) {
  const label = entry?.label || line.exercise || 'Exercise';
  const pendingTag = entry?.status === 'pending' ? ' [new — pending review in Exercise Library]' : '';
  const n = line.intervals && line.intervals > 1 ? line.intervals : null;
  const prefix = n ? `${n} × ` : '';
  const modifier = line.weightKg ? ` @ ${line.weightKg} kg` : line.timeSec ? ` @ ${formatMinSec(line.timeSec)}` : '';

  if (line.calories) {
    const total = (n || 1) * line.calories;
    const totalSuffix = n ? ` = ${total.toLocaleString()} cal` : '';
    return `${label}: ${prefix}${line.calories} cal${modifier}${totalSuffix}${pendingTag}`;
  }
  if (line.reps) {
    const total = (n || 1) * line.reps;
    const totalSuffix = n ? ` = ${total.toLocaleString()} reps` : '';
    return `${label}: ${prefix}${line.reps} reps${modifier}${totalSuffix}${pendingTag}`;
  }
  if (line.distanceM) {
    const total = (n || 1) * line.distanceM;
    const totalSuffix = n ? ` = ${total.toLocaleString()} m` : '';
    return `${label}: ${prefix}${line.distanceM} m${modifier}${totalSuffix}${pendingTag}`;
  }
  return `${label}: ${line.notes || 'logged'} (no reps/distance/calories captured — won't count toward a score)${pendingTag}`;
}

// Renders extractionV2 lines as plain text grouped under section headers
// (Warm-up / Main / Then / Core / Cool-down), each line spelling out its
// interval count, load-or-pace modifier and total — e.g.
// "Ski: 10 × 200 m @ 0:32 = 2,000 m" — exactly what parseExtractionSummaryV2
// reads back, so what the athlete edits IS what gets scored.
export function renderExtractionSummaryV2(extractionV2, library = []) {
  const lines = extractionV2?.lines || [];
  if (!lines.length) return '';
  const byKey = new Map(library.map(e => [e.key, e]));
  const byPart = new Map(V2_PART_ORDER.map(p => [p, []]));
  for (const line of lines) {
    (byPart.get(line.part) || byPart.get('main')).push(line);
  }

  const blocks = [];
  for (const part of V2_PART_ORDER) {
    const partLines = byPart.get(part);
    if (!partLines.length) continue;
    // A round count in the header (e.g. "Main (3 rounds)") is just a label a
    // person might type — it isn't derived from any line's own interval
    // count (a "10 x 200m" ski block inside a "3 rounds" class isn't itself
    // done 3 times), so it's never synthesized here; parsing strips whatever
    // free text follows the section name regardless.
    const header = V2_PART_LABEL[part];
    const body = partLines.map(l => {
      const entry = l.libraryKey ? byKey.get(l.libraryKey) : null;
      return formatV2Line(l, entry);
    }).join('\n');
    blocks.push(`${header}\n${body}`);
  }
  return blocks.join('\n');
}

// Deterministic regex parser — the inverse of renderExtractionSummaryV2, so
// a hand-edited review text flows back into the same line shape extraction
// produces. No AI call.
export function parseExtractionSummaryV2(text) {
  const rawLines = (text || '').split('\n').map(l => l.trim());
  const lines = [];
  let currentPart = 'main';

  for (const raw of rawLines) {
    if (!raw) continue;
    if (!raw.includes(':')) {
      const headerMatch = raw.match(/^(warm-up|main|then|core|cool-down)\b/i);
      if (headerMatch) {
        currentPart = V2_HEADER_TO_PART[headerMatch[1].toLowerCase()];
        continue;
      }
    }

    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) continue;
    const exercise = raw.slice(0, colonIdx).trim();
    if (!exercise) continue;
    let rest = raw.slice(colonIdx + 1).trim();
    rest = rest.replace(/\s*\[new[^\]]*\]\s*$/i, '').trim();
    rest = rest.replace(/\s*=\s*[\d,.]+\s*(reps|m|cal)\s*$/i, '').trim();

    let intervals = 1;
    const intervalsMatch = rest.match(/^(\d+)\s*[×x]\s*/i);
    if (intervalsMatch) {
      intervals = parseInt(intervalsMatch[1], 10);
      rest = rest.slice(intervalsMatch[0].length);
    }

    let weightKg = null;
    const weightMatch = rest.match(/@\s*([\d.]+)\s*kg/i);
    if (weightMatch) {
      weightKg = parseFloat(weightMatch[1]);
      rest = rest.replace(weightMatch[0], '').trim();
    }

    let timeSec = null;
    const paceMatch = rest.match(/@\s*(\d+):(\d{2})\b/);
    if (paceMatch) {
      timeSec = parseInt(paceMatch[1], 10) * 60 + parseInt(paceMatch[2], 10);
      rest = rest.replace(paceMatch[0], '').trim();
    }

    let reps = null, distanceM = null, calories = null;
    const calMatch = rest.match(/^([\d.]+)\s*cal/i);
    const repsMatch = rest.match(/^([\d.]+)\s*reps/i);
    const distMatch = rest.match(/^([\d.]+)\s*m\b/i);
    if (calMatch) calories = parseFloat(calMatch[1]);
    else if (repsMatch) reps = parseFloat(repsMatch[1]);
    else if (distMatch) distanceM = parseFloat(distMatch[1]);

    if (!reps && !distanceM && !calories) continue;
    lines.push({ part: currentPart, exercise, intervals, reps, distanceM, calories, weightKg, timeSec, notes: null });
  }
  return { lines };
}

// Fallback lines for a run/Strava-imported session whose extraction found no
// run line — built from data that's already on the session rather than
// guessed. Strava lap/split detail arrives as plain text in `notes` (see
// strava.js's activity-detail renderer), so that's parsed first for
// per-lap distance+time (each lap keeping its own pace, per section 2.4);
// only when that's absent too does this fall back to one line from the
// session's total `runningDistance` (and `duration`, if logged), which
// carries no pace and scores at a neutral factor.
export function parseStravaLapsFromNotes(notes) {
  if (!notes) return [];
  const lines = notes.split('\n');

  const lapHeaderIdx = lines.findIndex(l => /^Laps \(\d+\):/i.test(l.trim()));
  if (lapHeaderIdx !== -1) {
    const laps = [];
    for (let i = lapHeaderIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s*Lap\s+\d+:\s*([\d.]+)\s*m.*?\((\d+):(\d{2})\)/i);
      if (!m) break;
      laps.push({
        part: 'main', exercise: 'Run', intervals: 1,
        distanceM: parseFloat(m[1]), timeSec: parseInt(m[2], 10) * 60 + parseInt(m[3], 10),
      });
    }
    if (laps.length) return laps;
  }

  const splitHeaderIdx = lines.findIndex(l => /^Km splits:/i.test(l.trim()));
  if (splitHeaderIdx !== -1) {
    const splits = [];
    for (let i = splitHeaderIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s*km\s+\d+:\s*(\d+):(\d{2})\/km/i);
      if (!m) break;
      splits.push({
        part: 'main', exercise: 'Run', intervals: 1,
        distanceM: 1000, timeSec: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
      });
    }
    if (splits.length) return splits;
  }

  return [];
}

// Adds a run line to extractionV2 lines when a running session's extraction
// didn't find one — never overwrites a run the extraction DID find (which
// may carry better per-interval pace data than a lap/split text parse would).
export function ensureRunLines(lines, session) {
  const hasRun = (lines || []).some(l => /run/i.test(l.exercise || ''));
  if (hasRun || session?.type !== 'running') return lines || [];

  const fromLaps = parseStravaLapsFromNotes(session.notes);
  if (fromLaps.length) return [...(lines || []), ...fromLaps];

  if (session?.runningDistance) {
    return [...(lines || []), {
      part: 'main', exercise: 'Run', intervals: 1,
      distanceM: session.runningDistance * 1000,
      timeSec: session.duration ? session.duration * 60 : null,
      notes: 'from runningDistance, no per-interval pace',
    }];
  }
  return lines || [];
}

// Asks the model how a not-yet-recognized exercise should count toward the 9
// HYROX stations — used only to seed a new library entry, which starts
// 'pending' and excluded from scoring until the athlete reviews and approves
// it. Multiple stations can get partial credit (e.g. a kettlebell swing
// splitting credit between burpee broad jump and sandbag lunges).
export async function suggestExerciseStationCredits({ name, notes }) {
  const prompt = `You are a HYROX exercise-transfer expert. An athlete logged an exercise that isn't yet in the training app's library: "${name}"${notes ? ` (context: ${notes})` : ''}.

The 9 HYROX stations and their race demand:
${renderStationBenchmarks()}

Decide how much this exercise should count toward each station, as a weight from 0 to 1 (1 = fully equivalent to doing that station itself, 0 = no meaningful transfer). Only include stations with genuine transfer — omit the rest rather than listing them at 0. Most exercises meaningfully transfer to at most 1-3 stations; only give a plain literal match (e.g. "Sled Push") a weight of 1. "core" is not a race station — it's a daily-baseline category (100 reps = 1.0) for ab/core work (sit-ups, planks, leg raises, etc.); give it a weight there instead of guessing a race-station transfer for pure core movements.

Also decide:
- "unit": "reps", "m" (distance-based), "km" (long-distance running), or "cal" (a cardio machine reading given in calories)
- if unit is "cal", "metersPerCal": a reasonable meters-per-calorie conversion for that specific machine (e.g. ~10-15 for an assault/air bike, ~15-20 for a rower)
- "referenceLoadKg": only if this exercise is normally done against an external load (barbell, dumbbell, kettlebell, sandbag, sled, etc.) AND it's credited toward a weighted station (sled_push, sled_pull, farmers_carry, sandbag_lunges, wall_balls) — a reasonable reference load in kg for an average athlete at that movement, used to scale the credit up or down from actual logged load. null otherwise (bodyweight moves, cardio, no weighted-station credit).

Return JSON only:
{
  "unit": "<reps|m|km|cal>",
  "metersPerCal": <number or null>,
  "credits": { "<stationKey>": <0-1>, ... },
  "referenceLoadKg": <number or null>,
  "reasoning": "<one sentence explaining the transfer logic>"
}

Valid station keys: running, skierg, sled_push, sled_pull, row_erg, farmers_carry, sandbag_lunges, burpee_broad_jump, wall_balls, core.`;
  return chatJson(prompt, 400);
}

export async function generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge, trainingLoadBlock, stationVolumeBlock, transferabilityNotes, readinessScaleNotes }) {
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

  const volumeBlock = stationVolumeBlock
    ? `\n${stationVolumeBlock}\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. Analyse their readiness for their upcoming goal and return a JSON response.${knowledgeBlock}${scaleBlock}${transferabilityBlock}

Athlete: ${profileLine}

Objective:
${objectiveDetail}${stationInfo}
${loadBlock}${volumeBlock}
Recent sessions — last 20, most recent first (read notes for actual content: exercises, weights, distances, paces):
${recentSummary}

Past race records/PRs:
${recordsSummary}

How to score readiness:
- Use past race records/PRs as the primary calibration anchor. If the athlete has a record at or faster than the target, readiness starts at 7+ and is adjusted for training quality. If their best is within 5% of the target, baseline is 6-7.
- Use the longitudinal load data (weekly digests + ATL/CTL) to understand volume and intensity trends. This is your primary source for development over the last 3 months.
${stationVolumeBlock ? '- The accumulated RE volume block above is ground truth, computed directly from scored sessions, not an impression from note text. Use it PER STATION, on its own terms -- never by comparing one station\'s volume against another\'s to force a matching rank order across the radar (a strong runner needs far less recent volume to stay run-ready than a station still being built up, so "lower RE than other stations" alone is not evidence of anything). Concretely: (1) If a station has a supporting record/PR, or the notes name a specific strong result for it (a heavy weight, a fast split, a long distance/duration), that evidence anchors the score for THAT station even if its own accumulated RE this window looks modest. (2) A station scores low only when its own accumulated RE is genuinely low (near zero) AND there is no record/PR AND no specific strong session named for it -- that combination is a real gap. (3) Never let one vague or offhand note comment ("felt tired", "wall balls were rough today") drag a station\'s score below what its own volume and any specific session evidence for that exact station already support.\n' : ''}- Read recent session notes for specific content: exercises, weights, reps, paces, sets. This tells you WHAT was trained.
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

export const STATION_KEYS = ['running', 'skierg', 'sled_push', 'sled_pull', 'row_erg', 'farmers_carry', 'sandbag_lunges', 'burpee_broad_jump', 'wall_balls'];

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

// Applies a user's saved customization (profile.stationModel.benchmarks[key])
// on top of the hardcoded defaults. Only raceVolume (which doubles as
// raceDistanceM for cardio stations) and raceWeightKg are overridable — kind,
// label and unit stay fixed, they're properties of the station, not a demand
// figure someone would want to retune.
function benchmarkFor(b, overrides) {
  const o = overrides?.[b.key];
  if (!o) return b;
  return {
    ...b,
    raceVolume: o.raceVolume ?? b.raceVolume,
    raceDistanceM: o.raceVolume ?? b.raceDistanceM,
    raceWeightKg: o.raceWeightKg ?? b.raceWeightKg,
  };
}

// Default station model in the shape the frontend edits and profile.stationModel
// is stored in — a flat raceVolume per station (cardio's raceDistanceM folded
// into the same field, since to an editor they're the same "how much" number).
export function getDefaultStationModel() {
  return {
    thresholds: { t5: 150, t4: 75, t3: 40 },
    benchmarks: STATION_BENCHMARKS.reduce((acc, b) => {
      acc[b.key] = {
        label: b.label,
        kind: b.kind,
        volumeUnit: b.kind === 'cardio' ? 'm' : b.volumeUnit,
        raceVolume: b.kind === 'cardio' ? b.raceDistanceM : b.raceVolume,
        raceWeightKg: b.raceWeightKg ?? null,
      };
      return acc;
    }, {}),
  };
}

function renderStationBenchmarks(overrides) {
  return STATION_BENCHMARKS.map(raw => {
    const b = benchmarkFor(raw, overrides);
    const demand = b.kind === 'cardio'
      ? `${b.raceDistanceM}m at race pace`
      : b.raceWeightKg
      ? `${b.raceVolume}${b.volumeUnit} at ~${b.raceWeightKg}kg`
      : `${b.raceVolume}${b.volumeUnit}`;
    return `- ${b.label}: race demand ${demand}.`;
  }).join('\n');
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

// Computes, per station, how the session's logged volume/load/intensity
// compares to HYROX Open Men race demand — as a single ratio the model can
// apply directly, instead of it eyeballing "high volume" from prose (which
// is what let very different sessions land on the identical score before).
// `library` (from exerciseLibrary.js) drives which station(s) each extracted
// exercise counts toward and at what weight — a movement can split credit
// across several stations (e.g. an assault bike crediting running/ski/row).
// Only 'approved' library entries count; a still-pending exercise (unrecognized,
// awaiting the athlete's review) contributes nothing until approved.
function computeStationEquivalence(session, benchmarkOverrides, library = []) {
  const byStation = {};
  const bump = (key) => (byStation[key] ||= { workKg: 0, volume: 0, distanceM: 0, reps: 0 });
  const libraryByKey = new Map(library.map(e => [e.key, e]));

  for (const e of session.extractedExercises?.exercises || []) {
    const entry = e?.libraryKey ? libraryByKey.get(e.libraryKey) : null;
    if (!entry || entry.status !== 'approved' || !entry.credits) continue;

    let rawVolume;
    if (e.calories) {
      rawVolume = (e.sets || 1) * e.calories * (entry.metersPerCal || 10);
    } else if (e.distanceM) {
      rawVolume = (e.sets || 1) * e.distanceM;
    } else if (e.sets && e.reps) {
      rawVolume = e.sets * e.reps;
    } else {
      // Only one of sets/reps came back populated — that's still a real
      // count, not zero. A line like "8 thrusters" with no round/set
      // language can land in either field depending on phrasing; treating
      // the lone number as "no volume" silently drops the whole entry.
      rawVolume = e.reps || e.sets || 0;
    }
    if (!rawVolume) continue;
    const isDistanceLike = !!(e.distanceM || e.calories);

    for (const [stationKey, weight] of Object.entries(entry.credits)) {
      if (!weight) continue;
      const station = bump(stationKey);
      const creditedVolume = rawVolume * weight;
      // Which bucket a credit lands in depends on the DESTINATION station's
      // kind, not just whether the source exercise had a weight — a weighted
      // kettlebell swing crediting bodyweight-kind burpee broad jump still
      // needs to land as volume/reps, since that station has no weight axis
      // for the results loop below to read workKg back out of.
      const destKind = STATION_BENCHMARKS.find(b => b.key === stationKey)?.kind;
      if (destKind === 'work' && e.weightKg) {
        station.workKg += e.weightKg * creditedVolume;
        station.volume += creditedVolume;
      } else if (isDistanceLike) {
        station.distanceM += creditedVolume;
      } else {
        station.reps += creditedVolume;
      }
    }
  }

  if (session.runningDistance) {
    bump('running').distanceM += session.runningDistance * 1000;
  }

  const vestBonus = session.weightVest ? 1.15 : 1.0;
  const intensity = rpeIntensityMultiplier(session.rpe);

  const results = {};
  for (const raw of STATION_BENCHMARKS) {
    const data = byStation[raw.key];
    if (!data) continue;
    const b = benchmarkFor(raw, benchmarkOverrides);

    // Every result carries volumeRatio × loadRatio === ratio exactly — the
    // two factors a single combined score collapses together. "Load" means
    // different things per kind: actual implement weight for 'work' stations,
    // effort-vs-race-pace for 'cardio', a worn vest for 'bodyweight'.
    if (b.kind === 'work') {
      if (data.workKg > 0) {
        const benchmark = b.raceWeightKg * b.raceVolume;
        const volumeRatio = data.volume / b.raceVolume;
        const avgWeight = data.workKg / data.volume;
        const loadRatio = avgWeight / b.raceWeightKg;
        results[b.key] = {
          ratio: data.workKg / benchmark,
          volumeRatio, loadRatio,
          basis: `${Math.round(data.workKg).toLocaleString()} kg·${b.volumeUnit} logged (weight × volume) vs ${benchmark.toLocaleString()} kg·${b.volumeUnit} race demand (${b.raceWeightKg}kg × ${b.raceVolume}${b.volumeUnit})`,
        };
      } else {
        // No weight recorded for this movement — fall back to raw volume,
        // conservatively assuming it was near race-standard load.
        const rawVolume = data.distanceM || data.reps;
        if (rawVolume) {
          const ratio = rawVolume / b.raceVolume;
          results[b.key] = {
            ratio, volumeRatio: ratio, loadRatio: 1.0,
            basis: `${rawVolume}${b.volumeUnit} logged (no weight recorded, assumed near race-standard load) vs ${b.raceVolume}${b.volumeUnit} race demand`,
          };
        }
      }
    } else if (b.kind === 'cardio' && data.distanceM > 0) {
      const effectiveDistance = data.distanceM * intensity;
      results[b.key] = {
        ratio: effectiveDistance / b.raceDistanceM,
        volumeRatio: data.distanceM / b.raceDistanceM, loadRatio: intensity,
        basis: `${Math.round(data.distanceM)}m × ${intensity}x intensity (RPE ${session.rpe ?? '?'}) = ${Math.round(effectiveDistance)}m effective vs ${b.raceDistanceM}m race demand`,
      };
    } else if (b.kind === 'bodyweight') {
      const rawVolumeNoVest = data.distanceM || (data.reps ? data.reps * (b.raceVolume / b.repsEquivalent) : 0);
      if (rawVolumeNoVest) {
        results[b.key] = {
          ratio: (rawVolumeNoVest * vestBonus) / b.raceVolume,
          volumeRatio: rawVolumeNoVest / b.raceVolume, loadRatio: vestBonus,
          basis: `${Math.round(rawVolumeNoVest * vestBonus)}${b.volumeUnit}-equivalent logged${session.weightVest ? ' (+15% for weight vest)' : ''} vs ${b.raceVolume}${b.volumeUnit} race demand`,
        };
      }
    }
  }
  return results;
}

// Deterministic tier lookup for a computed race-equivalence ratio — kept
// separate from the LLM entirely. Text instructions telling the model to
// "use this percentage directly" were not reliably obeyed; it kept blending
// in other qualitative signals (like rest between rounds) even when the
// precomputed number said otherwise. For any station this function can
// compute, that's a bug we can just remove by not asking the model at all.
function tierFromRatio(ratio, thresholds) {
  const t5 = thresholds?.t5 ?? 1.5;
  const t4 = thresholds?.t4 ?? 0.75;
  const t3 = thresholds?.t3 ?? 0.4;
  if (ratio >= t5) return 5;
  if (ratio >= t4) return 4;
  if (ratio >= t3) return 3;
  if (ratio > 0) return 2;
  return 1;
}

export async function generateStationScores({ session, knowledge, stationModel, library }) {
  const isHyroxSession = session.type === 'hyrox_training' || session.type === 'hyrox_race' || session.type === 'hyrox_competition';
  const isRunSession = session.type === 'running';
  const isStrengthSession = session.type === 'gym_strength';
  // Percentages as the UI naturally edits them (150/75/40) — converted to the
  // fraction form ratios are expressed in internally (1.5/0.75/0.4).
  const thresholds = stationModel?.thresholds
    ? { t5: stationModel.thresholds.t5 / 100, t4: stationModel.thresholds.t4 / 100, t3: stationModel.thresholds.t3 / 100 }
    : undefined;
  const benchmarkOverrides = stationModel?.benchmarks;

  const extractedList = session.extractedExercises?.exercises?.length
    ? session.extractedExercises.exercises
        .map(e => {
          const sets = e.sets ? `${e.sets}×${e.reps || '?'}` : (e.reps ? `${e.reps} reps` : '');
          const weight = e.weightKg ? `@ ${e.weightKg}kg` : '';
          const dist = e.distanceM ? `${e.distanceM}m` : '';
          const cal = e.calories ? `${e.calories} cal` : '';
          return `- ${e.name}${sets ? ` ${sets}` : ''}${weight ? ` ${weight}` : ''}${dist ? ` ${dist}` : ''}${cal ? ` ${cal}` : ''}${e.notes ? ` (${e.notes})` : ''}`;
        })
        .join('\n')
    : null;

  const equivalence = computeStationEquivalence(session, benchmarkOverrides, library);
  const equivalenceLines = Object.entries(equivalence).map(([key, { ratio, basis }]) => {
    const label = STATION_BENCHMARKS.find(b => b.key === key)?.label || key;
    return `- ${label}: ${basis} → ${Math.round(ratio * 100)}% of race demand`;
  });
  const volumeBlock = equivalenceLines.length
    ? `\nComputed race-equivalence per station (weight × volume for loaded stations, intensity-adjusted distance for cardio) — FOR YOUR CONTEXT ONLY, these stations' final scores are already decided by this arithmetic and will NOT use whatever value you return for them, so don't spend effort second-guessing or overriding these specific ones:\n${equivalenceLines.join('\n')}`
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
${renderStationBenchmarks(benchmarkOverrides)}

Scoring scale (this only affects stations WITHOUT a computed percentage above — the rest are already locked in):
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
    // Stations with a computed race-equivalence ratio are scored deterministically
    // in code, not by the model — see tierFromRatio for why.
    if (equivalence[key]) {
      scores[key] = tierFromRatio(equivalence[key].ratio, thresholds);
      continue;
    }
    const v = Number(result[key]);
    scores[key] = Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 1;
  }
  // The fuller per-station breakdown (volumeRatio/loadRatio/basis) is kept
  // alongside the 1-5 scores so callers can persist it for trend charting —
  // the score alone can't be decomposed back into volume vs. load later.
  return { scores, equivalence };
}
