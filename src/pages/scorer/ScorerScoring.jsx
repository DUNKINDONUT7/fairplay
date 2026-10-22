import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import LiveBracket from '../../components/brackets/LiveBracket';
import useEventStore from '../../store/eventStore';
import useTournamentStore from '../../store/tournamentStore';
import useAuthStore from '../../store/authStore';
import { listMyAssignments } from '../../services/staffService';
import { isScoringOpen } from '../../utils/bracketRules';
import { supabase } from '../../utils/supabaseClient';

function belongsToSubEvent(tournament, assignment) {
  if (!assignment?.subEventId && !assignment?.subEventName) return true;
  const id = String(assignment.subEventId || '');
  const name = String(assignment.subEventName || '').trim().toLowerCase();
  return String(tournament.subEventId || tournament.name || '') === id
    || String(tournament.subEventName || '').trim().toLowerCase() === name
    || String(tournament.title || '').trim().toLowerCase().endsWith(`- ${name}`);
}

function formatPH(value) {
  if (!value) return '';
  return `${new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT`;
}

// The assigned scorer records final match results (W01). Scores typed here
// stay on this device until "Save Result"; the database checks the scorer's
// assignment again on every save and refuses anyone else.
export default function ScorerScoring() {
  const { eventId } = useParams();
  const { user } = useAuthStore();
  const { fetchEvents } = useEventStore();
  const event = useEventStore((state) => state.events.find((entry) => String(entry.id) === String(eventId)) || null);
  const tournaments = useTournamentStore((state) => state.tournaments);
  const drafts = useTournamentStore((state) => state.drafts);
  const { fetchTournaments, updateMatchDraft, saveMatchResult } = useTournamentStore();

  const [assignment, setAssignment] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | denied | ready
  const [selectedId, setSelectedId] = useState(null);
  const [savingMatchId, setSavingMatchId] = useState(null);
  const [notice, setNotice] = useState(null); // { tone, text }
  const [entries, setEntries] = useState([]);

  const loadEntries = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('match_result_entries')
      .select('*')
      .eq('event_id', eventId)
      .eq('recorded_by', user.id)
      .order('recorded_at', { ascending: false })
      .limit(10);
    setEntries(data || []);
  }, [eventId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyAssignments();
        const match = mine.find((row) => row.role === 'scorer' && String(row.eventId) === String(eventId) && row.status === 'active');
        if (cancelled) return;
        if (!match) { setPhase('denied'); return; }
        setAssignment(match);
        await Promise.all([fetchEvents(), fetchTournaments(eventId)]);
        await loadEntries();
        if (!cancelled) setPhase('ready');
      } catch (error) {
        if (!cancelled) { setNotice({ tone: 'error', text: error.message }); setPhase('denied'); }
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, fetchEvents, fetchTournaments, loadEntries]);

  const myTournaments = useMemo(
    () => tournaments.filter((entry) => String(entry.eventId) === String(eventId) && belongsToSubEvent(entry, assignment)),
    [assignment, eventId, tournaments]
  );
  const current = myTournaments.find((entry) => String(entry.id) === String(selectedId)) || myTournaments[0] || null;
  const scoringOpen = isScoringOpen(event);
  const editable = Boolean(current) && scoringOpen && !current.isFinalized;

  const save = async (match, scores = null) => {
    setSavingMatchId(match.id);
    setNotice(null);
    try {
      await saveMatchResult(current.id, match.id, scores);
      setNotice({ tone: 'success', text: `Saved: ${match.team1?.name} vs ${match.team2?.name}.` });
      loadEntries();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
      // What is on screen must match what the database has.
      fetchTournaments(eventId, { silent: true });
    } finally {
      setSavingMatchId(null);
    }
  };

  if (phase === 'loading') {
    return <DashboardLayout title="Score Sheet"><div style={cardStyle}>Loading…</div></DashboardLayout>;
  }

  if (phase === 'denied') {
    return (
      <DashboardLayout title="Score Sheet">
        <div role="alert" style={{ ...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}><i className="bi bi-shield-lock" style={{ marginRight: 8 }} />Not assigned to this event</div>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            {notice?.text || 'Your account is not an active scorer for this event, so its results cannot be recorded from here.'}
          </div>
          <Link to="/scorer" style={{ color: '#1d4ed8', fontWeight: 700 }}>Back to my assignments</Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={event?.title || 'Score Sheet'} subtitle={`Scorer${assignment?.subEventName ? ` · ${assignment.subEventName}` : ''} — record final results as games finish`}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ ...cardStyle, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#475569', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><i className="bi bi-person-badge" style={{ marginRight: 6, color: '#2563eb' }} />{user?.name}</span>
            <span><i className={scoringOpen ? 'bi bi-broadcast' : 'bi bi-pause-circle'} style={{ marginRight: 6, color: scoringOpen ? '#16a34a' : '#94a3b8' }} />{scoringOpen ? 'Scoring is open' : 'Scoring is not open'}</span>
          </div>
          {myTournaments.length > 1 && (
            <select value={current?.id || ''} onChange={(changeEvent) => setSelectedId(changeEvent.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}>
              {myTournaments.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
          )}
        </div>

        {notice && (
          <div role={notice.tone === 'error' ? 'alert' : 'status'} style={{ ...cardStyle, padding: '12px 16px', fontSize: 14, borderColor: notice.tone === 'error' ? '#fecaca' : '#bbf7d0', background: notice.tone === 'error' ? '#fef2f2' : '#f0fdf4', color: notice.tone === 'error' ? '#b91c1c' : '#15803d' }}>
            <i className={notice.tone === 'error' ? 'bi bi-x-circle' : 'bi bi-check-circle'} style={{ marginRight: 8 }} />{notice.text}
          </div>
        )}

        {!current || (current.matches || []).length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b' }}>The organizer has not built the bracket yet.</div>
        ) : (
          <>
            {current.isFinalized && (
              <div style={{ ...cardStyle, background: '#f8fafc', color: '#475569', fontSize: 14 }}>
                <i className="bi bi-lock-fill" style={{ marginRight: 8 }} />Results are final. Nothing can be changed.
              </div>
            )}
            <LiveBracket
              tournament={current}
              editable={editable}
              drafts={drafts?.[current.id] || {}}
              savingMatchId={savingMatchId}
              onScoreChange={(matchId, field, value) => updateMatchDraft(current.id, matchId, field, value).catch((error) => setNotice({ tone: 'error', text: error.message }))}
              onSaveMatch={(match) => save(match)}
              onPickWinner={(match, winnerKey) => save(match, { score1: winnerKey === 'score1' ? 1 : 0, score2: winnerKey === 'score2' ? 1 : 0 })}
            />
          </>
        )}

        <div style={cardStyle}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Results you saved</div>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>Nothing saved yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    {['Match', 'Result', 'Saved at'].map((header) => <th key={header} style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td style={cellStyle}>{entry.match_id}</td>
                      <td style={cellStyle}>{entry.team1_name} {Number(entry.score1)} – {Number(entry.score2)} {entry.team2_name}</td>
                      <td style={cellStyle}>{formatPH(entry.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)', padding: 20 };
const cellStyle = { padding: '8px 6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' };
