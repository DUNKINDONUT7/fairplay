import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

const AI_DETECTIONS_KEY = 'fairplay_ai_detections';

export function buildAuditLogs({ users = [], events = [], registrations = [], scores = [], attendance = [], aiLogs = [], aiDetections = [] }) {
  const scoreRows = Array.isArray(scores) ? scores : Object.values(scores || {});
  const logs = [
    ...events.map((event) => ({
      user: event.organizerEmail || users.find((user) => String(user.id) === String(event.organizer_id))?.email || 'Organizer',
      action: `Created or updated event: ${event.title}`,
      target: 'Event',
      timestamp: event.createdAt || event.created_at || event.startDate,
      source: 'events',
    })),
    ...registrations.map((registration) => ({
      user: registration.email || registration.participantName || 'Participant',
      action: `Registered for event ${registration.eventId}`,
      target: 'Registration',
      timestamp: registration.createdAt,
      source: 'registrations',
    })),
    ...scoreRows.map((score) => ({
      user: score.judgeName || score.judgeId || 'Judge',
      action: `Submitted score for ${score.contestantName}`,
      target: 'Score',
      timestamp: score.timestamp,
      source: 'scores',
    })),
    ...attendance.map((row) => ({
      user: row.scannerId || row.attendeeName || 'Attendance Scanner',
      action: `Checked in ${row.attendeeName}`,
      target: 'Attendance',
      timestamp: row.checkedInAt,
      source: 'attendance',
    })),
    ...aiLogs.map((log) => ({
      user: log.eventTitle || 'AI Service',
      action: `${log.success ? 'Generated' : 'Failed'} AI criteria request`,
      target: 'AI Request',
      timestamp: log.timestamp,
      source: 'ai_logs',
    })),
    ...aiDetections.map((detection) => ({
      user: detection.actorName || detection.actorId || 'AI Monitor',
      action: `Flagged ${detection.targetType}: ${detection.reason}`,
      target: 'AI Detection',
      timestamp: detection.detectedAt,
      source: 'ai_detections',
    })),
  ];

  return logs.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

export function deriveAiDetections({ users = [], events = [], registrations = [], scores = [], attendance = [] }) {
  const scoreRows = Array.isArray(scores) ? scores : Object.values(scores || {});
  const detections = [];

  events.forEach((event) => {
    const eventRegistrations = registrations.filter((registration) => String(registration.eventId) === String(event.id));
    const max = Number(event.maxParticipants || 0);
    const participants = Number(event.participants || event.contestants?.length || 0);

    if (max > 0 && participants > max) {
      detections.push({
        id: `event-over-capacity-${event.id}`,
        targetType: 'event',
        targetId: String(event.id),
        targetName: event.title,
        actorId: event.organizer_id || event.organizerAuthProfileId || '',
        actorName: event.organizerEmail || 'Organizer',
        riskLevel: 'high',
        status: 'open',
        reason: `Participants (${participants}) exceed max capacity (${max}).`,
        detectedAt: event.updatedAt || event.createdAt || event.created_at || new Date().toISOString(),
        metadata: { participants, maxParticipants: max },
      });
    }

    if (event.status === 'active' && eventRegistrations.length === 0) {
      detections.push({
        id: `active-no-registration-${event.id}`,
        targetType: 'event',
        targetId: String(event.id),
        targetName: event.title,
        actorId: event.organizer_id || event.organizerAuthProfileId || '',
        actorName: event.organizerEmail || 'Organizer',
        riskLevel: 'medium',
        status: 'open',
        reason: 'Event is active but has no registration records.',
        detectedAt: event.updatedAt || event.createdAt || event.created_at || new Date().toISOString(),
        metadata: { status: event.status },
      });
    }
  });

  const registrationKeys = new Set();
  registrations.forEach((registration) => {
    const key = `${registration.eventId}:${String(registration.email || registration.participantName || registration.teamName).toLowerCase()}`;
    if (registrationKeys.has(key)) {
      detections.push({
        id: `duplicate-registration-${registration.id}`,
        targetType: 'registration',
        targetId: String(registration.id),
        targetName: registration.participantName || registration.teamName || registration.email || 'Registrant',
        actorId: registration.participantId || '',
        actorName: registration.email || registration.participantName || 'Participant',
        riskLevel: 'medium',
        status: 'open',
        reason: 'Possible duplicate registration for the same event.',
        detectedAt: registration.createdAt || new Date().toISOString(),
        metadata: { eventId: registration.eventId },
      });
    }
    registrationKeys.add(key);
  });

  scoreRows.forEach((score) => {
    const values = Object.values(score.criteriaScores || {}).map(Number).filter(Number.isFinite);
    if (values.some((value) => value < 0 || value > 100)) {
      detections.push({
        id: `score-out-of-range-${score.id}`,
        targetType: 'score',
        targetId: String(score.id),
        targetName: score.contestantName || 'Contestant',
        actorId: score.judgeId || '',
        actorName: score.judgeName || 'Judge',
        riskLevel: 'high',
        status: 'open',
        reason: 'Score contains values outside the expected 0-100 range.',
        detectedAt: score.timestamp || new Date().toISOString(),
        metadata: { criteriaScores: score.criteriaScores },
      });
    }
  });

  // Judge consistency check: for each contestant scored by 3+ judges, flag
  // any single judge whose score is far from the group's average — a cheap
  // signal for bias, favoritism, or a data-entry mistake worth a second look.
  const scoreGroups = new Map();
  scoreRows.forEach((score) => {
    const values = Object.values(score.criteriaScores || {}).map(Number).filter(Number.isFinite);
    if (values.length === 0) return;
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    const key = `${score.eventId}:${score.contestantId}`;
    if (!scoreGroups.has(key)) scoreGroups.set(key, []);
    scoreGroups.get(key).push({ score, average });
  });

  scoreGroups.forEach((entries, key) => {
    if (entries.length < 3) return;
    const groupMean = entries.reduce((sum, e) => sum + e.average, 0) / entries.length;
    if (groupMean === 0) return;

    entries.forEach(({ score, average }) => {
      const deviation = Math.abs(average - groupMean) / groupMean;
      if (deviation >= 0.3) {
        detections.push({
          id: `judge-score-outlier-${score.id}`,
          targetType: 'score',
          targetId: String(score.id),
          targetName: score.contestantName || 'Contestant',
          actorId: score.judgeId || '',
          actorName: score.judgeName || 'Judge',
          riskLevel: deviation >= 0.5 ? 'high' : 'medium',
          status: 'open',
          reason: `This judge's average score (${average.toFixed(1)}) is ${Math.round(deviation * 100)}% off from the other judges' average (${groupMean.toFixed(1)}) for the same contestant.`,
          detectedAt: score.timestamp || new Date().toISOString(),
          metadata: { eventId: score.eventId, contestantId: score.contestantId, groupMean, judgeAverage: average },
        });
      }
    });
  });

  const userEmails = new Set(users.map((user) => String(user.email || '').toLowerCase()).filter(Boolean));
  attendance.forEach((row) => {
    if (row.attendeeType === 'judge' && row.attendeeName && !userEmails.has(String(row.attendeeName).toLowerCase())) {
      detections.push({
        id: `unknown-judge-checkin-${row.id}`,
        targetType: 'attendance',
        targetId: String(row.id),
        targetName: row.attendeeName,
        actorId: row.scannerId || '',
        actorName: row.scannerId || 'Scanner',
        riskLevel: 'low',
        status: 'open',
        reason: 'Judge attendance record does not match a known user email.',
        detectedAt: row.checkedInAt || new Date().toISOString(),
        metadata: { eventId: row.eventId },
      });
    }
  });

  return detections.sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime());
}

function normalizeDetection(row) {
  return {
    id: String(row.id),
    targetType: row.target_type || row.targetType || 'system',
    targetId: row.target_id || row.targetId || '',
    targetName: row.target_name || row.targetName || '',
    actorId: row.actor_id || row.actorId || '',
    actorName: row.actor_name || row.actorName || '',
    riskLevel: row.risk_level || row.riskLevel || 'low',
    status: row.status || 'open',
    reason: row.reason || 'Flagged by AI monitoring.',
    detectedAt: row.detected_at || row.detectedAt || row.created_at || new Date().toISOString(),
    metadata: row.metadata || {},
  };
}

export async function fetchAiDetections(systemData) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('ai_detections')
        .select('*')
        .order('detected_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(normalizeDetection);
    } catch (error) {
      // Fall through to derived monitoring records when the database table is unavailable.
    }
  }

  const local = JSON.parse(localStorage.getItem(AI_DETECTIONS_KEY) || '[]').map(normalizeDetection);
  const derived = deriveAiDetections(systemData);
  const seen = new Set();
  return [...local, ...derived].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function upsertAiDetections(detections) {
  const rows = detections.map(normalizeDetection);
  if (isSupabaseConfigured) {
    const payload = rows.map((row) => ({
      id: row.id,
      target_type: row.targetType,
      target_id: row.targetId,
      target_name: row.targetName,
      actor_id: row.actorId,
      actor_name: row.actorName,
      risk_level: row.riskLevel,
      status: row.status,
      reason: row.reason,
      detected_at: row.detectedAt,
      metadata: row.metadata,
    }));
    const { error } = await supabase.from('ai_detections').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  } else {
    localStorage.setItem(AI_DETECTIONS_KEY, JSON.stringify(rows));
  }
  return rows;
}

export function buildSystemReport({ users = [], events = [], registrations = [], scores = [], attendance = [], judges = [], aiDetections = [], auditLogs = [] }) {
  const scoreRows = Array.isArray(scores) ? scores : Object.values(scores || {});
  const totalParticipants = events.reduce((sum, event) => sum + Number(event.participants || event.contestants?.length || 0), 0);
  const organizers = users.filter((user) => user.role === 'organizer').length;
  const participants = users.filter((user) => user.role === 'participant').length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalUsers: users.length,
      totalOrganizers: organizers,
      totalParticipants: Math.max(participants, totalParticipants),
      totalEvents: events.length,
      activeEvents: events.filter((event) => ['active', 'ongoing'].includes(event.status)).length,
      completedEvents: events.filter((event) => event.status === 'completed').length,
      pendingEvents: events.filter((event) => ['draft', 'upcoming', 'approved'].includes(event.status)).length,
      flaggedActivities: aiDetections.length,
    },
    users: {
      admins: users.filter((user) => user.role === 'admin').length,
      organizers,
      judges: users.filter((user) => user.role === 'judge').length || judges.length,
      participants,
    },
    events: {
      byStatus: countBy(events, 'status'),
      byType: countBy(events, 'type'),
      participation: events.map((event) => ({
        id: event.id,
        title: event.title,
        status: event.status,
        participants: Number(event.participants || event.contestants?.length || 0),
        maxParticipants: event.maxParticipants || null,
      })),
    },
    registrations: {
      total: registrations.length,
      byStatus: countBy(registrations, 'status'),
      byType: countBy(registrations, 'registrationType'),
    },
    aiMonitoring: {
      totalFlagged: aiDetections.length,
      byRiskLevel: countBy(aiDetections, 'riskLevel'),
      byStatus: countBy(aiDetections, 'status'),
      recent: aiDetections.slice(0, 10),
    },
    audit: {
      total: auditLogs.length,
      bySource: countBy(auditLogs, 'source'),
      recent: auditLogs.slice(0, 10),
    },
    scoring: {
      totalScores: scoreRows.length,
      scoredEvents: new Set(scoreRows.map((score) => String(score.eventId))).size,
    },
    attendance: {
      totalCheckIns: attendance.length,
      byType: countBy(attendance, 'attendeeType'),
    },
  };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Backup file is not a valid JSON object.' };
  const required = ['users', 'events', 'registrations', 'scores'];
  const missing = required.filter((key) => !Array.isArray(payload[key]));
  if (missing.length > 0) return { valid: false, error: `Backup is missing: ${missing.join(', ')}` };
  return { valid: true, error: '' };
}
