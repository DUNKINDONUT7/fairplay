import { useMemo, useState } from 'react';
import { formatReportDate } from '../../utils/eventReport';
import { RankBadge } from './ScoreDetails';
import { ReportEmptyState, reportStyles as s } from './reportShared';

// The Scoring page's tabs for events decided by a bracket. They read the same
// brackets the Brackets page edits, so a result saved there (or by a scorer)
// shows up here straight away.

const shortTitle = (bracket, eventTitle) => String(bracket.title || '').replace(`${eventTitle} - `, '') || 'Bracket';

// `match` is passed where there is one, so a group-stage match is never
// mislabelled as a quarterfinal just because of its round number.
function roundLabel(round, totalRounds, match = null) {
  if (match?.stage === 'group') return `Group ${match.group} · Round ${round}`;
  if (!totalRounds) return `Round ${round}`;
  if (round === totalRounds) return 'Finals';
  if (round === totalRounds - 1) return 'Semifinals';
  if (round === totalRounds - 2) return 'Quarterfinals';
  return `Round ${round}`;
}

const MATCH_TONES = {
  completed: { label: 'Final', color: '#047857', background: '#ecfdf5' },
  'in-progress': { label: 'In progress', color: '#1d4ed8', background: '#eff6ff' },
  scheduled: { label: 'To be played', color: '#b45309', background: '#fffbeb' },
  pending: { label: 'Waiting for teams', color: '#64748b', background: '#f1f5f9' },
};

function MatchStatus({ status }) {
  const tone = MATCH_TONES[status] || MATCH_TONES.pending;
  return <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: tone.color, background: tone.background }}>{tone.label}</span>;
}

// One bracket at a time when the event has several (a sports fest).
function BracketTabs({ brackets, eventTitle, value, onChange }) {
  if (brackets.length < 2) return null;
  return (
    <div role="tablist" aria-label="Bracket" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
      {brackets.map((bracket) => {
        const active = bracket.id === value;
        return (
          <button key={bracket.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(bracket.id)} style={{ padding: '7px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569' }}>
            {shortTitle(bracket, eventTitle)}
          </button>
        );
      })}
    </div>
  );
}

function useActiveBracket(report) {
  const brackets = report.tournament.brackets;
  const [selected, setSelected] = useState(null);
  const active = brackets.find((bracket) => bracket.id === selected) || brackets[0] || null;
  return { brackets, active, setSelected };
}

const noBracket = (onOpenBracket) => (
  <ReportEmptyState icon="bi bi-diagram-3" title="No bracket built yet">
    Build the bracket first; match results will then appear here as they are saved.
    {onOpenBracket && (
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={onOpenBracket} style={s.primaryButton}><i className="bi bi-diagram-3" /> Open Brackets</button>
      </div>
    )}
  </ReportEmptyState>
);

// ---- Scores tab: every match and its result ----
export function BracketScores({ report, onOpenBracket }) {
  const { brackets, active, setSelected } = useActiveBracket(report);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  if (!active) return noBracket(onOpenBracket);

  const term = search.trim().toLowerCase();
  const matches = active.matches
    .filter((match) => status === 'all' || match.status === status)
    .filter((match) => !term || `${match.team1} ${match.team2}`.toLowerCase().includes(term));

  return (
    <>
      <BracketTabs brackets={brackets} eventTitle={report.info.title} value={active.id} onChange={setSelected} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a team" aria-label="Find a team" style={{ ...s.field, width: '100%', boxSizing: 'border-box', paddingLeft: 34 }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Match status" style={s.field}>
          <option value="all">All matches</option>
          <option value="completed">Final</option>
          <option value="in-progress">In progress</option>
          <option value="scheduled">To be played</option>
          <option value="pending">Waiting for teams</option>
        </select>
        {onOpenBracket && (
          <button type="button" onClick={onOpenBracket} style={s.secondaryButton}><i className="bi bi-pencil-square" /> Enter results in Brackets</button>
        )}
      </div>

      {active.matches.length === 0 ? noBracket(onOpenBracket) : matches.length === 0 ? (
        <ReportEmptyState icon="bi bi-funnel" title="No matches match these filters">Try a different team or show all matches.</ReportEmptyState>
      ) : (
        <div style={s.tableWrap}>
          <table style={{ ...s.table, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={s.th}>Round</th>
                <th style={s.th}>Match</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Score</th>
                <th style={s.th}>Winner</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const done = match.status === 'completed';
                const win1 = done && match.winner === match.team1;
                const win2 = done && match.winner === match.team2;
                return (
                  <tr key={match.id}>
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontWeight: 700, color: '#475569' }}>{roundLabel(match.round, active.totalRounds, match)}</td>
                    <td style={{ ...s.td, color: '#0f172a' }}>
                      <span style={{ fontWeight: win1 ? 800 : 500 }}>{match.team1}</span>
                      <span style={{ color: '#94a3b8', margin: '0 8px' }}>vs</span>
                      <span style={{ fontWeight: win2 ? 800 : 500 }}>{match.team2}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {done || match.status === 'in-progress' ? `${match.score1 ?? 0} – ${match.score2 ?? 0}` : '—'}
                    </td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>{match.winner || '—'}</td>
                    <td style={s.td}><MatchStatus status={match.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Live Scoring tab: progress per bracket, then results newest first ----
export function BracketFeed({ report, live, onOpenBracket }) {
  const brackets = report.tournament.brackets;
  const feed = useMemo(() => brackets
    .flatMap((bracket) => bracket.matches
      .filter((match) => match.status === 'completed' || match.status === 'in-progress')
      .map((match) => ({ ...match, bracketTitle: shortTitle(bracket, report.info.title), totalRounds: bracket.totalRounds, key: `${bracket.id}-${match.id}` })))
    .sort((left, right) => new Date(right.completedDate || 0).getTime() - new Date(left.completedDate || 0).getTime()),
  [brackets, report.info.title]);

  if (brackets.length === 0) return noBracket(onOpenBracket);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h3 style={{ ...s.heading, marginBottom: 2 }}>Bracket Progress</h3>
          <p style={{ ...s.subheading, margin: 0 }}>{report.tournament.completedMatches} of {report.tournament.totalMatches} matches played</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 800, color: live ? '#047857' : '#475569', background: live ? '#ecfdf5' : '#f1f5f9', border: `1px solid ${live ? '#a7f3d0' : '#e2e8f0'}` }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#10b981' : '#94a3b8' }} />
          {live ? 'Games are live' : report.info.isCompleted ? 'Event completed' : 'Not live right now'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
        {brackets.map((bracket) => {
          const played = bracket.matches.filter((match) => match.status === 'completed').length;
          const total = bracket.matches.length;
          const done = total > 0 && played === total;
          return (
            <div key={bracket.id} style={{ padding: '12px 14px', borderRadius: 12, background: done ? '#f0fdf4' : '#f8fafc', border: `1px solid ${done ? '#bbf7d0' : '#e2e8f0'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflowWrap: 'anywhere' }}>{shortTitle(bracket, report.info.title)}</span>
                {bracket.isFinalized ? <i className="bi bi-shield-lock-fill" title="Finalized" style={{ color: '#16a34a' }} /> : done ? <i className="bi bi-check-circle-fill" style={{ color: '#16a34a' }} /> : null}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{played} / {total} matches played{bracket.champion ? ` · Champion: ${bracket.champion}` : ''}</div>
              <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${total ? (played / total) * 100 : 0}%`, background: done ? '#22c55e' : '#2563eb' }} />
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ ...s.heading, marginBottom: 2 }}>Latest Results</h3>
      <p style={s.subheading}>Match results as they are saved, newest first. This list updates on its own.</p>
      {feed.length === 0 ? (
        <ReportEmptyState icon="bi bi-broadcast" title="No results yet">
          Results appear here the moment a match score is saved, from the Brackets page or by a scorer.
        </ReportEmptyState>
      ) : (
        <div style={s.tableWrap}>
          <table style={{ ...s.table, minWidth: 620 }}>
            <thead>
              <tr>
                <th style={s.th}>Saved</th>
                {brackets.length > 1 && <th style={s.th}>Bracket</th>}
                <th style={s.th}>Round</th>
                <th style={s.th}>Match</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Score</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((match) => (
                <tr key={match.key}>
                  <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: 12 }}>{match.completedDate ? formatReportDate(match.completedDate, true) : '—'}</td>
                  {brackets.length > 1 && <td style={s.td}>{match.bracketTitle}</td>}
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{roundLabel(match.round, match.totalRounds, match)}</td>
                  <td style={{ ...s.td, color: '#0f172a' }}>
                    <span style={{ fontWeight: match.winner === match.team1 ? 800 : 500 }}>{match.team1}</span>
                    <span style={{ color: '#94a3b8', margin: '0 8px' }}>vs</span>
                    <span style={{ fontWeight: match.winner === match.team2 ? 800 : 500 }}>{match.team2}</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{match.score1 ?? 0} – {match.score2 ?? 0}</td>
                  <td style={s.td}><MatchStatus status={match.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Leaderboard tab: placements from the bracket ----
export function BracketLeaderboard({ report, onOpenBracket }) {
  const { brackets, active, setSelected } = useActiveBracket(report);
  if (!active) return noBracket(onOpenBracket);
  const final = active.standings[0]?.final;

  return (
    <>
      <BracketTabs brackets={brackets} eventTitle={report.info.title} value={active.id} onChange={setSelected} />
      <h3 style={{ ...s.heading, marginBottom: 2 }}>{final ? 'Final Standings' : 'Standings So Far'}</h3>
      <p style={s.subheading}>
        {final
          ? 'Placement follows how far each team went. Teams out in the same round are ordered by how close their last game was.'
          : 'Teams still playing are listed first. Placements are set once every match has been played.'}
      </p>
      {active.standings.length === 0 ? noBracket(onOpenBracket) : (
        <div style={s.tableWrap}>
          <table style={{ ...s.table, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 80 }}>Place</th>
                <th style={s.th}>Team</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Win–loss</th>
                <th style={s.th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {active.standings.map((row) => (
                <tr key={row.id} style={{ background: final && row.placement <= 3 ? '#f8fbff' : undefined }}>
                  <td style={s.td}><RankBadge rank={final ? row.placement : null} /></td>
                  <td style={{ ...s.td, fontWeight: 700, color: '#0f172a' }}>{row.name}</td>
                  <td style={{ ...s.td, ...s.num }}>{row.wins}–{row.losses}</td>
                  <td style={s.td}>
                    {!final && row.eliminatedRound === null ? 'Still playing' : final && row.placement === 1 ? 'Champion' : row.eliminatedRound ? `Out in ${roundLabel(row.eliminatedRound, active.totalRounds).toLowerCase()}` : final && row.group ? `Out in the group stage (Group ${row.group})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Finalize tab: lock a bracket's results for good, here or on the Brackets page ----
export function BracketFinalize({ report, busyId, onFinalize, onOpenBracket }) {
  const brackets = report.tournament.brackets;
  if (brackets.length === 0) return noBracket(onOpenBracket);
  const allFinal = brackets.every((bracket) => bracket.isFinalized);

  return (
    <>
      <h3 style={{ ...s.heading, marginBottom: 2 }}>Finalize Scores</h3>
      <p style={s.subheading}>
        Finalizing freezes a bracket's match scores and champion permanently — nobody can edit, undo or delete them afterwards.
        You can do it here or with the same button on the Brackets page; both do exactly the same thing.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {brackets.map((bracket) => {
          const played = bracket.matches.filter((match) => match.status === 'completed').length;
          const total = bracket.matches.length;
          const ready = total > 0 && played === total;
          return (
            <div key={bracket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 14, border: `1px solid ${bracket.isFinalized ? '#a7f3d0' : '#e2e8f0'}`, background: bracket.isFinalized ? '#f0fdf9' : '#ffffff' }}>
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{shortTitle(bracket, report.info.title)}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
                  {played} of {total} matches played
                  {bracket.champion ? <> · Champion: <strong style={{ color: '#0f172a' }}>{bracket.champion}</strong></> : null}
                </div>
                {!bracket.isFinalized && !ready && (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                    <i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />
                    {total === 0 ? 'The bracket has not been built yet.' : `${total - played} match${total - played === 1 ? '' : 'es'} still need a result before this can be finalized.`}
                  </div>
                )}
              </div>
              {bracket.isFinalized ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontWeight: 800, fontSize: 13 }}>
                  <i className="bi bi-shield-lock-fill" />
                  Finalized{bracket.finalizedAt ? ` · ${formatReportDate(bracket.finalizedAt)}` : ''}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onFinalize(bracket)}
                  disabled={!ready || busyId === bracket.id}
                  title={ready ? 'Permanently freeze these results' : 'Every match needs a saved result first'}
                  style={{ ...s.primaryButton, background: '#0f172a', opacity: !ready || busyId === bracket.id ? 0.45 : 1, cursor: !ready || busyId === bracket.id ? 'not-allowed' : 'pointer' }}
                >
                  <i className={busyId === bracket.id ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-shield-lock-fill'} /> Finalize Scores
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
        <span>
          <i className="bi bi-info-circle" style={{ marginRight: 8 }} />
          {allFinal
            ? 'Every bracket is finalized. The event is complete and its results are permanent.'
            : 'Match results are entered on the Brackets page. Once every bracket of the event is finalized, the event is marked completed.'}
        </span>
        {onOpenBracket && (
          <button type="button" onClick={onOpenBracket} style={s.secondaryButton}><i className="bi bi-diagram-3" /> Open Brackets</button>
        )}
      </div>
    </>
  );
}
