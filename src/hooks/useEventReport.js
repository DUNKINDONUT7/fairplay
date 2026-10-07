import { useEffect, useMemo, useState } from 'react';
import useEventStore from '../store/eventStore';
import useScoreStore from '../store/scoreStore';
import useJudgeStore from '../store/judgeStore';
import useAudienceScoreStore from '../store/audienceScoreStore';
import useTournamentStore from '../store/tournamentStore';
import useRegistrationStore from '../store/registrationStore';
import useAttendanceStore from '../store/attendanceStore';
import { buildEventReport } from '../utils/eventReport';

// Pulls every table an event report reads from. Each fetch merges into its
// store, so loading one event never drops data another screen is showing.
export async function loadEventReportData(eventId) {
  await Promise.all([
    useScoreStore.getState().fetchScores(eventId, { silent: true }),
    useJudgeStore.getState().fetchJudges({ silent: true }),
    useAudienceScoreStore.getState().fetchAudienceScores(eventId, { silent: true }),
    useTournamentStore.getState().fetchTournaments(eventId, { silent: true }),
    useRegistrationStore.getState().fetchRegistrations(eventId),
    useAttendanceStore.getState().fetchAttendance(eventId, { silent: true }),
  ]);
}

// Builds the report from whatever the stores currently hold.
export function composeEventReport(event, { withStandings = true } = {}) {
  if (!event) return null;
  const scoreStore = useScoreStore.getState();
  const judgeStore = useJudgeStore.getState();

  return buildEventReport({
    event,
    scores: scoreStore.getScoresForEvent(event.id),
    assignedJudges: judgeStore.getJudgesByEvent(event.id).map((assignment) => assignment.judge).filter(Boolean),
    leaderboard: withStandings ? scoreStore.calculateLeaderboard(event.id, event.criteria || []) : [],
    calculateWeightedTotal: scoreStore.calculateWeightedTotal,
    tournaments: useTournamentStore.getState().tournaments,
    registrations: useRegistrationStore.getState().registrations.filter((registration) => String(registration.eventId) === String(event.id)),
    attendance: useAttendanceStore.getState().getAttendanceSummary(event.id),
  });
}

export default function useEventReport(eventId) {
  const events = useEventStore((state) => state.events);
  const scores = useScoreStore((state) => state.scores);
  const judges = useJudgeStore((state) => state.judges);
  const assignments = useJudgeStore((state) => state.assignments);
  const submissions = useAudienceScoreStore((state) => state.submissions);
  const tournaments = useTournamentStore((state) => state.tournaments);
  const registrations = useRegistrationStore((state) => state.registrations);
  const attendance = useAttendanceStore((state) => state.attendance);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setLoading(true);
    loadEventReportData(eventId).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [eventId]);

  const event = useMemo(
    () => events.find((entry) => String(entry.id) === String(eventId)) || null,
    [eventId, events]
  );

  const report = useMemo(
    () => composeEventReport(event),
    // The stores are read through getState() inside composeEventReport; these
    // slices are listed so the report recomputes whenever any of them change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, scores, judges, assignments, submissions, tournaments, registrations, attendance]
  );

  return { event, report, loading };
}
