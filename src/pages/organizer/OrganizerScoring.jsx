import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useScoreStore from '../../store/scoreStore';
import useAudienceScoreStore from '../../store/audienceScoreStore';
import useJudgeStore from '../../store/judgeStore';
import { finalizeEventWorkflow } from '../../services/automationService';

function formatTimestamp(value) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString();
}

export default function OrganizerScoring() {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { events, fetchEvents, updateEvent } = useEventStore();
  const { success } = useNotificationStore();
  const { fetchScores, getLiveFeed, calculateLeaderboard, scores } = useScoreStore();
  const { fetchAudienceScores, getAudienceSummary, subscribeToAudienceScores, submissions } = useAudienceScoreStore();
  const { fetchJudges, getJudgesByEvent } = useJudgeStore();
  const eventIdFromUrl = searchParams.get('eventId');
  const [selectedEvent, setSelectedEvent] = useState(eventIdFromUrl || '');
  const [activeTab, setActiveTab] = useState('live');
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [cutCount, setCutCount] = useState('');

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

  const activeEvents = events.filter((event) => event.status === 'active' || event.status === 'upcoming');
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

  const handleCutToTop = async () => {
    const n = Number(cutCount);
    if (!selected || !Number.isFinite(n) || n <= 0) {
      error('Enter how many contestants should advance.');
      return;
    }
    const eliminated = leaderboard.slice(n).map((item) => String(item.contestantId));
    await updateEvent(selected.id, { eliminatedContestantIds: eliminated });
    success(`Advanced the top ${Math.min(n, leaderboard.length)} contestant${n === 1 ? '' : 's'} — the rest are marked eliminated for this event.`);
  };

  const handleRestoreCut = async () => {
    if (!selected) return;
    await updateEvent(selected.id, { eliminatedContestantIds: [] });
    success('Restored all contestants — no one is marked eliminated.');
  };

  const handleFinalize = async () => {
    if (!selected) return;
    setFinalizing(true);
    try {
      const result = await finalizeEventWorkflow(selected);
      success(`Locked ${result.lockedCount} score submission${result.lockedCount === 1 ? '' : 's'} for ${selected.title}.`);
    } finally {
      setFinalizing(false);
      setConfirmingFinalize(false);
    }
  };

  return (
    <DashboardLayout title={selected ? `Rankings · ${selected.title}` : 'Live Scoring'} subtitle={selected ? `Event ID: ${selected.id}` : 'Monitor actual judge submissions, rankings, and finalization status'}>
      <ConfirmDialog
        open={confirmingFinalize}
        title="Finalize and lock scores?"
        message={selected ? `This permanently locks all submitted scores for "${selected.title}". Judges will no longer be able to edit or resubmit — this cannot be undone.` : ''}
        confirmLabel={finalizing ? 'Locking...' : 'Finalize and Lock'}
        onCancel={() => setConfirmingFinalize(false)}
        onConfirm={handleFinalize}
      />
      {!eventIdFromUrl && (
        <div style={{ marginBottom: 24 }}>
          <select
            value={selectedEvent}
            onChange={(event) => setSelectedEvent(event.target.value)}
            style={selectStyle}
          >
            <option value="">Select an event</option>
            {activeEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {selected ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { id: 'live', label: 'Live Feed' },
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
            {activeTab === 'live' && (
              <div>
                {judgeProgress.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={sectionTitleStyle}>Judge Progress</h3>
                    <p style={sectionBodyStyle}>Who's done scoring, live.</p>
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
                <h3 style={sectionTitleStyle}>Live Score Feed</h3>
                <p style={sectionBodyStyle}>Real submissions from judges are listed here in newest-first order.</p>
                {liveFeed.length === 0 ? (
                  <div style={emptyStateStyle}>
                    No score submissions yet for this event.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {liveFeed.map((item) => (
                      <div key={`${item.eventId}-${item.judgeId}-${item.contestantId}`} style={rowCardStyle}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{item.contestantName}</p>
                          <p style={{ fontSize: 12, color: '#64748b' }}>
                            {item.judgeName} · {formatTimestamp(item.timestamp)} · {item.locked ? 'Locked' : 'Editable'}
                          </p>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{item.totalScore}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'leaderboard' && (
              <div>
                <h3 style={sectionTitleStyle}>Current Leaderboard</h3>
                {leaderboard.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Multi-round cut:</span>
                    <input
                      type="number"
                      min="1"
                      value={cutCount}
                      onChange={(e) => setCutCount(e.target.value)}
                      placeholder="Top N"
                      style={{ width: 80, padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                    <button onClick={handleCutToTop} style={{ ...primaryButtonStyle, padding: '8px 14px', fontSize: 12 }}>
                      Advance Top N
                    </button>
                    {eliminatedIds.size > 0 && (
                      <>
                        <span style={{ fontSize: 12, color: '#b45309' }}>{eliminatedIds.size} eliminated this round</span>
                        <button onClick={handleRestoreCut} style={{ ...secondaryButtonStyle, padding: '8px 14px', fontSize: 12, marginLeft: 'auto' }}>
                          Restore All
                        </button>
                      </>
                    )}
                  </div>
                )}
                {leaderboard.length === 0 ? (
                  <div style={emptyStateStyle}>
                    Leaderboard will appear once judges submit at least one score.
                  </div>
                ) : (
                  leaderboard.map((item, index) => {
                    const isEliminated = eliminatedIds.has(String(item.contestantId));
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
                          <span style={{ fontSize: 12, color: '#64748b' }}>{item.totalScores} submission{item.totalScores === 1 ? '' : 's'}</span>
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

            {activeTab === 'finalize' && (
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
                </div>
                <button onClick={() => setConfirmingFinalize(true)} style={primaryButtonStyle}>
                  Finalize and Lock Scores
                </button>
              </div>
            )}
          </motion.div>
        </>
      ) : (
        <div style={panelStyle}>
          <div style={{ color: '#64748b' }}>
            Select an active event to inspect live scoring.
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

const selectStyle = {
  padding: '10px 16px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  width: 320,
  boxShadow: '0 10px 30px rgba(37,99,235,0.08)',
};

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
