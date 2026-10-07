import { useEffect, useMemo, useState } from 'react';
import EventPicker from '../../components/common/EventPicker';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import useRememberedEvent from '../../hooks/useRememberedEvent';
import PaginationControls from '../../components/admin/PaginationControls';
import ScoreMatrix from '../../components/reports/ScoreMatrix';
import { BracketFeed, BracketFinalize, BracketLeaderboard, BracketScores } from '../../components/reports/BracketScoring';
import useTournamentStore from '../../store/tournamentStore';
import { ParticipantDialog, StatTile } from '../../components/reports/ScoreDetails';
import { EventStatusBadge, ReportEmptyState, ReportStatusBadge, reportStyles } from '../../components/reports/reportShared';
import useEventReport from '../../hooks/useEventReport';
import { formatScore } from '../../utils/eventReport';
import { getCurrentRoundIndex, getRounds, planRoundAdvance } from '../../utils/rounds';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useScoreStore from '../../store/scoreStore';
import useAudienceScoreStore from '../../store/audienceScoreStore';
import useJudgeStore from '../../store/judgeStore';
import { finalizeEventWorkflow } from '../../services/automationService';

export default function OrganizerScoring() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { events, fetchEvents, updateEvent } = useEventStore();
  const { success, error, notifyResultsFinalized } = useNotificationStore();
  const { fetchScores, getLiveFeed, calculateLeaderboard, scores } = useScoreStore();
  const { fetchAudienceScores, getAudienceSummary, subscribeToAudienceScores, submissions } = useAudienceScoreStore();
  const { fetchJudges, getJudgesByEvent } = useJudgeStore();
  const eventIdFromUrl = searchParams.get('eventId');
  const [selectedEvent, setSelectedEvent] = useRememberedEvent(eventIdFromUrl || '');
  const [activeTab, setActiveTab] = useState('scores');
  const [participantId, setParticipantId] = useState(null);
  const [feedJudge, setFeedJudge] = useState('all');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedLimit, setFeedLimit] = useState(10);
  const [feedPage, setFeedPage] = useState(1);
  // The same report object the Ranking page and the PDF are built from, so
  // every figure on this page matches them.
  const { report } = useEventReport(selectedEvent || null);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmingAdvance, setConfirmingAdvance] = useState(false);
  const [bracketToFinalize, setBracketToFinalize] = useState(null);
  const [finalizingBracketId, setFinalizingBracketId] = useState(null);
  const finalizeTournament = useTournamentStore((state) => state.finalizeTournament);
  const [confirmingUndoRound, setConfirmingUndoRound] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchEvents(user.id);
    }
    fetchJudges();
  }, [fetchEvents, fetchJudges, user?.id]);

  useEffect(() => {
    fetchScores(selectedEvent || undefined);
    if (selectedEvent) fetchAudienceScores(selectedEvent);
  }, [fetchAudienceScores, fetchScores, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    return subscribeToAudienceScores(selectedEvent);
  }, [selectedEvent, subscribeToAudienceScores]);

  const activeEvents = events.filter((event) => event.status !== 'draft');
  const selectedParticipant = report?.participants.find((participant) => participant.id === participantId) || null;
  const selected = events.find((event) => String(event.id) === String(selectedEvent)) || null;
  const liveFeed = useMemo(
    () => (selected ? getLiveFeed(selected.id, selected.criteria || []) : []),
    [getLiveFeed, scores, selected]
  );
  const leaderboard = useMemo(
    () => (selected ? calculateLeaderboard(selected.id, selected.criteria || []) : []),
    [calculateLeaderboard, scores, selected, submissions]
  );
  const audienceSummary = useMemo(
    () => (selected ? getAudienceSummary(selected.id) : { totalSubmissions: 0, byContestant: {} }),
    [getAudienceSummary, selected, submissions]
  );
  const audienceEnabled = Boolean(selected?.audienceImpactEnabled ?? selected?.audienceImpact);

  const judgeProgress = useMemo(() => {
    if (!selected) return [];
    const contestantCount = Array.isArray(selected.contestants) ? selected.contestants.length : 0;
    const assignments = getJudgesByEvent(selected.id);
    return assignments
      .filter((assignment) => assignment.judge)
      .map((assignment) => {
        const scoredCount = new Set(
          liveFeed
            .filter((item) => String(item.judgeId).toLowerCase() === String(assignment.judge.id).toLowerCase()
              || String(item.judgeId).toLowerCase() === String(assignment.judge.email || '').toLowerCase())
            .map((item) => item.contestantId)
        ).size;
        return {
          judgeId: assignment.judge.id,
          judgeName: assignment.judge.name,
          scoredCount,
          contestantCount,
          done: contestantCount > 0 && scoredCount >= contestantCount,
        };
      });
  }, [getJudgesByEvent, liveFeed, selected]);

  const eliminatedIds = new Set((selected?.eliminatedContestantIds || []).map(String));

  // A double-check pass before locking anything in: group every judge's raw
  // total for each contestant, and flag any single judge whose number is far
  // from the rest of the panel's for that same contestant — the same
  // deviation-from-group-average signal AdminAIMonitor already uses to spot
  // bias or a mistyped score, just scoped to this one event so the organizer
  // can catch it before finalizing instead of after the fact in an audit.
  const scoreReview = useMemo(() => {
    const byContestant = new Map();
    liveFeed.forEach((item) => {
      const key = String(item.contestantId);
      if (!byContestant.has(key)) {
        byContestant.set(key, { contestantId: item.contestantId, contestantName: item.contestantName, entries: [] });
      }
      byContestant.get(key).entries.push(item);
    });

    return Array.from(byContestant.values()).map((row) => {
      const scores = row.entries.map((entry) => Number(entry.totalScore) || 0);
      const average = scores.reduce((sum, value) => sum + value, 0) / (scores.length || 1);
      const entries = row.entries.map((entry) => {
        const deviation = average > 0 ? Math.abs((Number(entry.totalScore) || 0) - average) / average : 0;
        return { ...entry, deviation, flagged: row.entries.length >= 2 && deviation >= 0.3 };
      });
      return { ...row, entries, average, hasFlag: entries.some((entry) => entry.flagged) };
    });
  }, [liveFeed]);

  const flaggedCount = scoreReview.filter((row) => row.hasFlag).length;

  // The live feed, narrowed by the two things an organizer watches for:
  // one judge's submissions, or one participant's.
  const feedJudges = useMemo(() => Array.from(new Set(liveFeed.map((item) => item.judgeName).filter(Boolean))).sort(), [liveFeed]);
  const filteredFeed = useMemo(() => {
    const term = feedSearch.trim().toLowerCase();
    return liveFeed.filter((item) => (
      (feedJudge === 'all' || item.judgeName === feedJudge) &&
      (!term || String(item.contestantName || '').toLowerCase().includes(term))
    ));
  }, [feedJudge, feedSearch, liveFeed]);
  const totalExpected = judgeProgress.reduce((sum, judge) => sum + judge.contestantCount, 0);
  const totalScored = judgeProgress.reduce((sum, judge) => sum + Math.min(judge.scoredCount, judge.contestantCount), 0);
  const judgesDone = judgeProgress.filter((judge) => judge.done).length;
  const scoringLive = selected?.status === 'active' && selected?.scoringActive !== false;

  // Back to the first page whenever what is being listed changes.
  useEffect(() => { setFeedPage(1); }, [feedJudge, feedSearch, feedLimit, selectedEvent]);
  const feedTotalPages = Math.max(1, Math.ceil(filteredFeed.length / feedLimit));
  // New submissions can shrink or grow the list; never sit on a page that no longer exists.
  const feedCurrentPage = Math.min(feedPage, feedTotalPages);
  const feedRows = filteredFeed.slice((feedCurrentPage - 1) * feedLimit, feedCurrentPage * feedLimit);

  // ---- Rounds, as set up in Create Event ----
  const rounds = getRounds(selected);
  const roundIndex = getCurrentRoundIndex(selected);
  const currentRound = rounds[roundIndex] || null;
  const isLastRound = rounds.length > 0 && roundIndex === rounds.length - 1;
  const roundResults = Array.isArray(selected?.roundResults) ? selected.roundResults : [];
  // This round's ranking: everyone still in, best first.
  const roundStandings = leaderboard.filter((row) => !row.eliminatedIn && !eliminatedIds.has(String(row.contestantId)));
  const stillIn = (selected?.contestants || []).filter((contestant) => !eliminatedIds.has(String(contestant.id)));
  const judgesThisRound = judgeProgress.length || new Set(liveFeed.map((item) => String(item.judgeId))).size;
  // The round is over once every judge has scored everyone still in.
  const roundComplete = stillIn.length > 0 && judgesThisRound > 0 &&
    stillIn.every((contestant) => (roundStandings.find((row) => String(row.contestantId) === String(contestant.id))?.totalScores || 0) >= judgesThisRound);
  const scoresThisRound = liveFeed.length;
  const scoresNeeded = stillIn.length * judgesThisRound;
  const advancePlan = rounds.length > 0 && !isLastRound ? planRoundAdvance(selected, roundStandings) : null;

  const handleAdvanceRound = async () => {
    if (!selected || !advancePlan) return;
    setAdvancing(true);
    try {
      const advancingIds = new Set(advancePlan.advancing.map((row) => String(row.contestantId)));
      // The finished round is written onto the event in full, because judges
      // will overwrite their own score rows in the next round.
      const snapshot = {
        id: advancePlan.round.id,
        name: advancePlan.round.name,
        advanceTo: advancePlan.quota,
        completedAt: new Date().toISOString(),
        standings: roundStandings.map((row, position) => ({
          contestantId: String(row.contestantId),
          name: row.contestantName,
          score: row.averageScore,
          rank: position + 1,
          submissions: row.totalScores,
          advanced: advancingIds.has(String(row.contestantId)),
        })),
        scores: liveFeed.map((item) => ({
          contestantId: String(item.contestantId),
          judgeId: String(item.judgeId),
          judgeName: item.judgeName,
          criteriaScores: item.criteriaScores,
          total: item.totalScore,
        })),
      };
      await updateEvent(selected.id, {
        roundResults: [...roundResults, snapshot],
        eliminatedContestantIds: [...new Set([...eliminatedIds, ...advancePlan.eliminated.map((row) => String(row.contestantId))])],
        currentRoundIndex: roundIndex + 1,
      });
      success(`${advancePlan.round.name} closed. ${advancePlan.advancing.length} advance to ${advancePlan.next.name}; judges now have a fresh sheet for them.`);
    } catch (advanceError) {
      error(String(advanceError?.message || 'The round could not be advanced.'));
    } finally {
      setAdvancing(false);
      setConfirmingAdvance(false);
    }
  };

  // Only while the new round is still untouched — once judges have scored in
  // it, their rows for the previous round are gone and can't be brought back.
  const lastRoundResult = roundResults[roundResults.length - 1] || null;
  const canUndoRound = Boolean(lastRoundResult) && scoresThisRound === 0 && selected?.status !== 'completed';
  const handleUndoRound = async () => {
    if (!selected || !lastRoundResult) return;
    const cutThen = new Set(lastRoundResult.standings.filter((row) => !row.advanced).map((row) => String(row.contestantId)));
    await updateEvent(selected.id, {
      roundResults: roundResults.slice(0, -1),
      eliminatedContestantIds: [...eliminatedIds].filter((contestantId) => !cutThen.has(contestantId)),
      currentRoundIndex: Math.max(0, roundIndex - 1),
    });
    setConfirmingUndoRound(false);
    success(`Back to ${lastRoundResult.name}. Everyone cut in that round is in again.`);
  };

  const isFinalized = selected?.status === 'completed';

  // Events decided by a bracket use the same four tabs, fed by the bracket.
  const bracketMode = Boolean(report) && !report.isJudged && (report.isTournament || report.tournament.brackets.length > 0);
  const openBracket = () => navigate(`/organizer/brackets?eventId=${selected.id}`);
  const bracketsLive = selected?.status === 'active';

  // Same action as "Finalize Scores" on the Brackets page.
  const handleFinalizeBracket = async () => {
    const target = bracketToFinalize;
    setBracketToFinalize(null);
    if (!target || !selected) return;
    setFinalizingBracketId(target.id);
    try {
      await finalizeTournament(target.id);
      const eventBrackets = useTournamentStore.getState().tournaments.filter(
        (tournament) => String(tournament.eventId) === String(selected.id)
      );
      // When this was the event's last open bracket, the event itself is done.
      if (eventBrackets.length > 0 && eventBrackets.every((tournament) => tournament.isFinalized)) {
        await updateEvent(selected.id, { status: 'completed', scoringActive: false });
      }
      success('Scores finalized. This bracket can no longer be changed.');
    } catch (finalizeError) {
      error(String(finalizeError?.message || 'The scores could not be finalized.'));
    } finally {
      setFinalizingBracketId(null);
    }
  };

  const handleFinalize = async () => {
    if (!selected || isFinalized) return;
    setFinalizing(true);
    try {
      const result = await finalizeEventWorkflow(selected);
      // Flips the event itself into the same "closed" state the judge-facing
      // screens (JudgeScoring, JudgeLiveScoring, JudgePublicScoring) already
      // gate on, and doubles as the one-time flag that hides this button
      // once finalized — see isFinalized above.
      await updateEvent(selected.id, { scoringActive: false, status: 'completed' });
      const judgeEmails = getJudgesByEvent(selected.id)
        .filter((assignment) => assignment.judge)
        .map((assignment) => assignment.judge.email)
        .filter(Boolean);
      await notifyResultsFinalized(selected, { judgeEmails });
      success(`Locked ${result.lockedCount} score submission${result.lockedCount === 1 ? '' : 's'} for ${selected.title}. Judges can no longer submit or edit scores, and participants were notified.`);
    } finally {
      setFinalizing(false);
      setConfirmingFinalize(false);
    }
  };

  return (
    <DashboardLayout title="Scoring" subtitle={selected ? selected.title : 'Every score, ranking and finalization for your events, in one place'}>
      <ConfirmDialog
        open={Boolean(bracketToFinalize)}
        title="Finalize the scores for good?"
        message={bracketToFinalize ? `This permanently freezes every match score and the champion of "${bracketToFinalize.title}". After this nobody can edit, undo, rebuild or delete it — not you, not an admin. This cannot be undone.` : ''}
        confirmLabel="Finalize Scores"
        requireText="FINALIZE"
        onCancel={() => setBracketToFinalize(null)}
        onConfirm={handleFinalizeBracket}
      />
      <ConfirmDialog
        open={confirmingAdvance}
        danger={false}
        title={advancePlan ? `Close ${advancePlan.round.name} and advance ${advancePlan.advancing.length}?` : ''}
        message={advancePlan
          ? `Advancing to ${advancePlan.next.name}: ${advancePlan.advancing.map((row) => row.contestantName).join(', ')}. ${advancePlan.eliminated.length > 0 ? `Out: ${advancePlan.eliminated.map((row) => row.contestantName).join(', ')}. ` : ''}${advancePlan.tieAtCutoff ? `There is a tie at the cutoff, so ${advancePlan.advancing.length} advance instead of ${advancePlan.quota}. ` : ''}Judges get a fresh score sheet for the next round.`
          : ''}
        confirmLabel={advancing ? 'Advancing...' : 'Close Round and Advance'}
        onCancel={() => setConfirmingAdvance(false)}
        onConfirm={handleAdvanceRound}
      />
      <ConfirmDialog
        open={confirmingUndoRound}
        title="Reopen the previous round?"
        message={lastRoundResult ? `This goes back to ${lastRoundResult.name} and brings back everyone who was cut in it. Its scores are still in place because no one has been scored in the new round yet.` : ''}
        confirmLabel="Reopen Round"
        onCancel={() => setConfirmingUndoRound(false)}
        onConfirm={handleUndoRound}
      />
      {selectedParticipant && <ParticipantDialog report={report} participant={selectedParticipant} onClose={() => setParticipantId(null)} />}
      {selected && (
        <Breadcrumbs items={[
          { label: 'My Events', to: '/organizer/events' },
          { label: selected.title, to: `/organizer/events/${selected.id}` },
          { label: 'Scoring' },
        ]} />
      )}
      <ConfirmDialog
        open={confirmingFinalize}
        title="Finalize and lock scores?"
        message={selected ? `This permanently locks all submitted scores for "${selected.title}". Judges will no longer be able to edit or resubmit — this cannot be undone.` : ''}
        confirmLabel={finalizing ? 'Locking...' : 'Finalize and Lock'}
        onCancel={() => setConfirmingFinalize(false)}
        onConfirm={handleFinalize}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <EventPicker events={activeEvents} value={selectedEvent} onChange={setSelectedEvent} />
        {selected && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <EventStatusBadge status={selected.status} />
            {report && <ReportStatusBadge status={report.reportStatus} />}
            <button type="button" onClick={() => navigate(`/organizer/events/${selected.id}`)} style={reportStyles.secondaryButton}>
              <i className="bi bi-gear" /> Manage Event
            </button>
            <button type="button" onClick={() => navigate(`/organizer/reports/${selected.id}`)} style={reportStyles.secondaryButton}>
              <i className="bi bi-file-earmark-text" /> Report
            </button>
            <button type="button" onClick={() => navigate(`/organizer/events/${selected.id}/ranking`)} style={reportStyles.primaryButton}>
              <i className="bi bi-trophy" /> View Ranking
            </button>
          </div>
        )}
      </div>

      {selected && rounds.length > 0 && (
        <section aria-label="Rounds" style={{ ...panelStyle, marginBottom: 20, borderLeft: '5px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Round {roundIndex + 1} of {rounds.length}
              </div>
              <ol style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {rounds.map((round, index) => {
                  const done = index < roundIndex;
                  const active = index === roundIndex;
                  return (
                    <li key={round.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {index > 0 && <i className="bi bi-chevron-right" aria-hidden="true" style={{ fontSize: 11, color: '#cbd5e1' }} />}
                      <span
                        aria-current={active ? 'step' : undefined}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: active ? '#1d4ed8' : done ? '#047857' : '#64748b', background: active ? '#eff6ff' : done ? '#ecfdf5' : '#f8fafc', border: `1px solid ${active ? '#93c5fd' : done ? '#a7f3d0' : '#e2e8f0'}` }}
                      >
                        {done && <i className="bi bi-check-lg" />}
                        {round.name}
                        {round.advanceTo ? <span style={{ fontWeight: 600, opacity: 0.8 }}>· top {round.advanceTo} advance</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
                {isFinalized
                  ? 'All rounds are finished and the results are final.'
                  : isLastRound
                    ? `${currentRound.name} is the last round. ${scoresThisRound} of ${scoresNeeded} scores are in — finalize from the Finalize tab when it is complete.`
                    : roundComplete
                      ? `${currentRound.name} is complete: all ${scoresNeeded} scores are in. ${advancePlan.advancing.length} will advance to ${advancePlan.next.name}.`
                      : `${currentRound.name} is in progress: ${scoresThisRound} of ${scoresNeeded} scores in from ${judgesThisRound} judge${judgesThisRound === 1 ? '' : 's'} for ${stillIn.length} contestant${stillIn.length === 1 ? '' : 's'}. The round can be closed once every score is in.`}
              </p>
            </div>
            {!isFinalized && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canUndoRound && (
                  <button type="button" onClick={() => setConfirmingUndoRound(true)} style={reportStyles.secondaryButton}>
                    <i className="bi bi-arrow-counterclockwise" /> Reopen {lastRoundResult.name}
                  </button>
                )}
                {advancePlan && (
                  <button
                    type="button"
                    onClick={() => setConfirmingAdvance(true)}
                    disabled={!roundComplete}
                    title={roundComplete ? undefined : 'Every judge must score everyone still in before the round can be closed'}
                    style={{ ...reportStyles.primaryButton, opacity: roundComplete ? 1 : 0.5, cursor: roundComplete ? 'pointer' : 'not-allowed' }}
                  >
                    <i className="bi bi-arrow-right-circle" /> Advance Top {advancePlan.quota} to {advancePlan.next.name}
                  </button>
                )}
              </div>
            )}
          </div>

          {roundResults.length > 0 && (
            <details style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Results of earlier rounds</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
                {roundResults.map((round) => (
                  <div key={round.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{round.name}</div>
                    {round.standings.map((row) => (
                      <div key={row.contestantId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderTop: '1px solid #f1f5f9', fontSize: 13, opacity: row.advanced ? 1 : 0.65 }}>
                        <span style={{ width: 22, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{row.rank}</span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: '#0f172a', overflowWrap: 'anywhere' }}>{row.name}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#334155' }}>{formatScore(row.score)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', color: row.advanced ? '#047857' : '#64748b', background: row.advanced ? '#ecfdf5' : '#f1f5f9' }}>
                          {row.advanced ? 'Advanced' : 'Out'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {selected && bracketMode && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          <StatTile label="Teams" value={report.stats.totalParticipants} />
          <StatTile label={report.tournament.brackets.length === 1 ? 'Bracket' : 'Brackets'} value={report.tournament.brackets.length} hint={`${report.tournament.brackets.filter((bracket) => bracket.isFinalized).length} finalized`} />
          <StatTile label="Matches played" value={`${report.tournament.completedMatches} / ${report.tournament.totalMatches}`} />
          <StatTile label="Matches left" value={Math.max(0, report.tournament.totalMatches - report.tournament.completedMatches)} />
          <StatTile label={report.tournament.champions.length > 1 ? 'Champions' : 'Champion'} value={report.tournament.champions.length > 1 ? `${report.tournament.champions.length} decided` : (report.tournament.champions[0]?.name || 'To be decided')} />
        </div>
      )}

      {selected && report && report.isJudged && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          <StatTile label="Participants" value={report.stats.totalParticipants} />
          <StatTile label="Judges" value={report.stats.totalJudges} />
          <StatTile label="Scores submitted" value={`${report.stats.completedEvaluations} / ${report.stats.expectedEvaluations}`} hint={report.stats.lockedEvaluations ? `${report.stats.lockedEvaluations} locked` : undefined} />
          <StatTile label="Scores pending" value={report.stats.pendingEvaluations} />
          <StatTile label="Average score" value={formatScore(report.stats.averageScore)} hint={report.stats.maxScore ? `out of ${formatScore(report.stats.maxScore)}` : undefined} />
          <StatTile label="Highest score" value={formatScore(report.stats.highestScore)} hint={report.stats.highestParticipant?.name} />
        </div>
      )}

      {selected ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { id: 'scores', label: 'Scores' },
              { id: 'live', label: 'Live Scoring' },
              { id: 'leaderboard', label: 'Leaderboard' },
              ...(audienceEnabled ? [{ id: 'audience', label: 'Audience Impact' }] : []),
              { id: 'finalize', label: 'Finalize' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...tabButtonStyle,
                  background: activeTab === tab.id ? 'rgba(37,99,235,0.12)' : '#ffffff',
                  borderColor: activeTab === tab.id ? '#93c5fd' : '#dbeafe',
                  color: activeTab === tab.id ? '#2563eb' : '#64748b',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={panelStyle}
          >
            {activeTab === 'scores' && (
              <div>
                <h3 style={sectionTitleStyle}>{bracketMode ? 'Match Results' : 'All Scores'}</h3>
                <p style={sectionBodyStyle}>
                  {bracketMode
                    ? 'Every match in the bracket and its score. Results are entered on the Brackets page or by a scorer, and show up here.'
                    : "Each judge's weighted total for every participant. Open a row to see the score for each criterion."}
                </p>
                {!report ? (
                  <div style={emptyStateStyle}>Loading scores…</div>
                ) : report.isJudged ? (
                  <ScoreMatrix report={report} onOpenParticipant={setParticipantId} />
                ) : (
                  <BracketScores report={report} onOpenBracket={openBracket} />
                )}
              </div>
            )}

            {activeTab === 'live' && bracketMode && <BracketFeed report={report} live={bracketsLive} onOpenBracket={openBracket} />}

            {activeTab === 'live' && !bracketMode && (
              <div>
                {judgeProgress.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div>
                        <h3 style={{ ...sectionTitleStyle, marginBottom: 2 }}>Judge Progress</h3>
                        <p style={{ ...sectionBodyStyle, margin: 0 }}>
                          {judgesDone} of {judgeProgress.length} judge{judgeProgress.length === 1 ? '' : 's'} finished · {totalScored} of {totalExpected} scores in
                        </p>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 800, color: scoringLive ? '#047857' : '#475569', background: scoringLive ? '#ecfdf5' : '#f1f5f9', border: `1px solid ${scoringLive ? '#a7f3d0' : '#e2e8f0'}` }}>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: scoringLive ? '#10b981' : '#94a3b8' }} />
                        {scoringLive ? 'Scoring is live' : isFinalized ? 'Scoring finalized' : 'Scoring session closed'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {judgeProgress.map((jp) => (
                        <div key={jp.judgeId} style={{ padding: '12px 14px', borderRadius: 12, background: jp.done ? '#f0fdf4' : '#f8fafc', border: `1px solid ${jp.done ? '#bbf7d0' : '#e2e8f0'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{jp.judgeName}</span>
                            {jp.done && <i className="bi bi-check-circle-fill" style={{ color: '#16a34a' }} />}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                            {jp.scoredCount} / {jp.contestantCount} contestants scored
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${jp.contestantCount ? Math.min(100, (jp.scoredCount / jp.contestantCount) * 100) : 0}%`,
                              background: jp.done ? '#22c55e' : 'linear-gradient(90deg,#2563eb,#0ea5e9)',
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ ...sectionTitleStyle, marginBottom: 2 }}>Live Scoring Feed</h3>
                    <p style={{ ...sectionBodyStyle, margin: 0 }}>Every score a judge submits, newest first. This list updates on its own.</p>
                  </div>
                  {liveFeed.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative' }}>
                        <i className="bi bi-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }} />
                        <input
                          value={feedSearch}
                          onChange={(e) => setFeedSearch(e.target.value)}
                          placeholder="Find a participant"
                          aria-label="Find a participant in the feed"
                          style={{ ...reportStyles.field, paddingLeft: 30, width: 200 }}
                        />
                      </div>
                      {feedJudges.length > 1 && (
                        <select value={feedJudge} onChange={(e) => setFeedJudge(e.target.value)} aria-label="Show one judge" style={reportStyles.field}>
                          <option value="all">All judges</option>
                          {feedJudges.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {liveFeed.length === 0 ? (
                  <ReportEmptyState icon="bi bi-broadcast" title="No scores submitted yet">
                    {scoringLive
                      ? 'Scoring is live. Each score appears here the moment a judge submits it.'
                      : 'Scores will appear here once the scoring session starts and judges begin submitting.'}
                  </ReportEmptyState>
                ) : filteredFeed.length === 0 ? (
                  <ReportEmptyState icon="bi bi-funnel" title="No submissions match">Try a different name or show all judges.</ReportEmptyState>
                ) : (
                  <>
                    <div style={reportStyles.tableWrap}>
                      <table style={{ ...reportStyles.table, minWidth: 620 }}>
                        <thead>
                          <tr>
                            <th style={reportStyles.th}>Submitted</th>
                            <th style={reportStyles.th}>Participant</th>
                            <th style={reportStyles.th}>Judge</th>
                            <th style={reportStyles.th}>Status</th>
                            <th style={{ ...reportStyles.th, textAlign: 'right' }}>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feedRows.map((item) => {
                            const when = item.timestamp ? new Date(item.timestamp) : null;
                            const validDate = when && !Number.isNaN(when.getTime());
                            return (
                              <tr key={`${item.eventId}-${item.judgeId}-${item.contestantId}`}>
                                <td style={{ ...reportStyles.td, whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                                    {validDate ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                    {validDate ? when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                  </div>
                                </td>
                                <td style={{ ...reportStyles.td, fontWeight: 700, color: '#0f172a' }}>{item.contestantName}</td>
                                <td style={reportStyles.td}>{item.judgeName}</td>
                                <td style={reportStyles.td}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: item.locked ? '#047857' : '#b45309', background: item.locked ? '#ecfdf5' : '#fffbeb' }}>
                                    <i className={item.locked ? 'bi bi-lock-fill' : 'bi bi-pencil'} />
                                    {item.locked ? 'Locked' : 'Can still be edited'}
                                  </span>
                                </td>
                                <td style={{ ...reportStyles.td, ...reportStyles.num, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{formatScore(item.totalScore)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControls
                      page={feedCurrentPage}
                      totalPages={feedTotalPages}
                      limit={feedLimit}
                      totalItems={filteredFeed.length}
                      onPageChange={setFeedPage}
                      onLimitChange={setFeedLimit}
                      pageSizes={[10, 25, 50]}
                    />
                  </>
                )}
              </div>
            )}

            {activeTab === 'leaderboard' && bracketMode && <BracketLeaderboard report={report} onOpenBracket={openBracket} />}

            {activeTab === 'leaderboard' && !bracketMode && (
              <div>
                <h3 style={sectionTitleStyle}>Current Leaderboard</h3>
                {rounds.length > 0 && (
                  <p style={{ ...sectionBodyStyle, marginBottom: 14 }}>
                    Ranked on {currentRound.name} scores. Contestants cut in an earlier round are listed below, in the order they finished that round.
                  </p>
                )}
                {leaderboard.length === 0 ? (
                  <div style={emptyStateStyle}>
                    Leaderboard will appear once judges submit at least one score.
                  </div>
                ) : (
                  leaderboard.map((item, index) => {
                    const isEliminated = Boolean(item.eliminatedIn) || eliminatedIds.has(String(item.contestantId));
                    return (
                    <div
                      key={item.contestantId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid #e5efff',
                        background: isEliminated ? '#fef2f2' : index % 2 === 0 ? '#f8fbff' : '#ffffff',
                        opacity: isEliminated ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: item.rank <= 3 ? 'rgba(37,99,235,0.12)' : '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#2563eb',
                          }}
                        >
                          {item.rank}
                        </span>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'block' }}>{item.contestantName}</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            {item.eliminatedIn ? `Out in ${item.eliminatedIn}` : `${item.totalScores} submission${item.totalScores === 1 ? '' : 's'}`}
                          </span>
                          {audienceEnabled && (
                            <span style={{ display: 'block', fontSize: 11, color: '#059669', marginTop: 2 }}>
                              Judges {(item.judgeAverage?.toFixed?.(2) ?? item.judgeAverage) || 0} · Audience {(item.audienceAverage?.toFixed?.(2) ?? item.audienceAverage) || 0}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isEliminated && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', letterSpacing: '0.04em' }}>ELIMINATED</span>
                        )}
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>{item.averageScore}</span>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'audience' && audienceEnabled && (
              <div>
                <h3 style={sectionTitleStyle}>Audience Impact Results</h3>
                <p style={sectionBodyStyle}>
                  {audienceSummary.totalSubmissions} audience submission{audienceSummary.totalSubmissions === 1 ? '' : 's'} collected. Audience weight: {selected.audienceImpactWeight || 10}%.
                </p>
                {(selected.contestants || []).map((contestant) => {
                  const row = audienceSummary.byContestant[String(contestant.id)];
                  return (
                    <div key={contestant.id} style={rowCardStyle}>
                      <div>
                        <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{contestant.name || contestant.teamName}</p>
                        <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>{row?.count || 0} audience submission{row?.count === 1 ? '' : 's'}</p>
                      </div>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#059669' }}>{row ? row.averageScore.toFixed(2) : '--'}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'finalize' && bracketMode && (
              <BracketFinalize report={report} busyId={finalizingBracketId} onFinalize={setBracketToFinalize} onOpenBracket={openBracket} />
            )}

            {activeTab === 'finalize' && !bracketMode && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <h3 style={{ ...sectionTitleStyle, fontSize: 18, marginBottom: 8 }}>Finalize Scores</h3>
                <p style={{ ...sectionBodyStyle, marginBottom: 20 }}>
                  Lock all current submissions for this event and prevent further edits.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <div style={summaryCardStyle}>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Submitted Entries</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{liveFeed.length}</p>
                  </div>
                  <div style={summaryCardStyle}>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Ranked Contestants</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{leaderboard.length}</p>
                  </div>
                  <div style={{ ...summaryCardStyle, background: flaggedCount > 0 ? '#fef2f2' : summaryCardStyle.background, border: flaggedCount > 0 ? '1px solid #fecaca' : summaryCardStyle.border }}>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Flagged for Review</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: flaggedCount > 0 ? '#dc2626' : '#2563eb' }}>{flaggedCount}</p>
                  </div>
                </div>

                {scoreReview.length > 0 && (
                  <div style={{ textAlign: 'left', marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Double-Check Judge Scores</h4>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      Review every raw score before locking. A judge's score highlighted below is 30% or more off from the other judges' average for that same contestant — worth a second look before finalizing, since nothing can be corrected afterward.
                    </p>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {scoreReview.map((row) => (
                        <div key={row.contestantId} style={{ padding: '12px 14px', borderRadius: 12, background: row.hasFlag ? '#fef2f2' : '#f8fafc', border: `1px solid ${row.hasFlag ? '#fecaca' : '#e2e8f0'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{row.contestantName}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>Average: <strong style={{ color: '#2563eb' }}>{row.average.toFixed(1)}</strong></span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {row.entries.map((entry) => (
                              <span
                                key={`${entry.judgeId}-${entry.contestantId}`}
                                title={entry.flagged ? `${Math.round(entry.deviation * 100)}% off from the average` : ''}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  background: entry.flagged ? '#fee2e2' : '#eff6ff',
                                  color: entry.flagged ? '#dc2626' : '#2563eb',
                                }}
                              >
                                {entry.flagged && <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }} />}
                                {entry.judgeName}: {entry.totalScore}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isFinalized ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 800 }}>
                    <i className="bi bi-lock-fill" />
                    Scores Finalized and Locked
                  </div>
                ) : (
                  <button onClick={() => setConfirmingFinalize(true)} style={primaryButtonStyle}>
                    Finalize and Lock Scores
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      ) : (
        <div style={panelStyle}>
          <div style={{ color: '#64748b' }}>
            Choose an event above to see its scores, ranking and finalization status.
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

const tabButtonStyle = {
  padding: '8px 20px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  border: '1px solid #dbeafe',
  boxShadow: '0 6px 18px rgba(37,99,235,0.05)',
};

const panelStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 16,
  color: '#0f172a',
};

const sectionBodyStyle = {
  color: '#64748b',
  fontSize: 13,
  marginBottom: 16,
};

const emptyStateStyle = {
  padding: '28px',
  borderRadius: 16,
  background: '#eff6ff',
  border: '1px dashed #bfdbfe',
  color: '#64748b',
};

const rowCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  background: '#f8fbff',
  border: '1px solid #dbeafe',
  borderRadius: 14,
  flexWrap: 'wrap',
};

const summaryCardStyle = {
  padding: '14px',
  borderRadius: 14,
  background: '#eff6ff',
  border: '1px solid #dbeafe',
};

const primaryButtonStyle = {
  padding: '12px 32px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  border: 'none',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 16px 32px rgba(37,99,235,0.18)',
};

const secondaryButtonStyle = {
  padding: '12px 32px',
  borderRadius: 12,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};
