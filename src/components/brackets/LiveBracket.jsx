import { useState } from 'react';
import { countPlayoffTeams, isLeagueMatch } from '../../utils/bracketEngine';
import ConfirmDialog from '../common/ConfirmDialog';
import './LiveBracket.css';

function getMatchStatusClass(status) {
  if (status === 'completed') return 'live-bracket-pill-complete';
  if (status === 'in-progress' || status === 'live') return 'live-bracket-pill-live';
  return 'live-bracket-pill-pending';
}

function getMatchStatusLabel(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'in-progress' || status === 'live') return 'Live';
  if (status === 'bye') return 'Bye';
  return 'Pending';
}

function renderScoreValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

// `editable`: the assigned scorer's view — type scores (kept as a draft on
// this device) and save each result explicitly. Nothing is saved while
// typing: a saved result can only be changed by the organizer afterwards.
// `correctable`: the organizer's view — saved results get Correct / Undo,
// both of which ask for a reason.
export default function LiveBracket({
  tournament,
  editable = false,
  drafts = {},
  savingMatchId = null,
  onScoreChange,
  onSaveMatch,
  onPickWinner,
  correctable = false,
  onCorrectMatch,
  onUndoMatch,
}) {
  const [confirming, setConfirming] = useState(null);
  if (!tournament) return null;

  const rounds = tournament.rounds || [];
  const championName = tournament.champion?.name || null;

  // League-style matches (round robin, or the group stage of Group Stage +
  // Knockout) are saved with a button and may be drawn.
  const isLeague = (match) => isLeagueMatch(tournament, match);
  const isGroupKnockout = tournament.bracketType === 'group-knockout';
  const groupLabels = isGroupKnockout
    ? Array.from(new Set((tournament.standings || []).map((entry) => entry.group).filter(Boolean))).sort()
    : [];
  const isLeaguePlayoff = tournament.bracketType === 'league-playoff';
  const playoffTeams = isLeaguePlayoff ? countPlayoffTeams(tournament.matches) : 0;
  const leagueDone = isLeaguePlayoff && (tournament.matches || []).filter((match) => match.stage === 'league').every((match) => match.status === 'completed');
  const isFinalMatch = (match) => Number(match.round || 0) === Number(tournament.totalRounds || 0);

  return (
    <div className="live-bracket-shell">
      <div className="live-bracket-meta">
        {[
          { label: 'Bracket Type', value: tournament.bracketType || 'single' },
          { label: 'Match Progress', value: tournament.liveStatus || tournament.status || 'waiting' },
          { label: 'Rounds', value: tournament.totalRounds || rounds.length || 0 },
          { label: 'Teams', value: (tournament.teams || []).length },
        ].map((item) => (
          <div key={item.label} className="live-bracket-stat">
            <div className="live-bracket-stat-label">{item.label}</div>
            <div className="live-bracket-stat-value">{item.value}</div>
          </div>
        ))}
      </div>

      {(championName || tournament.streamMessage) && (
        <div className="live-bracket-banner">
          <div className="live-bracket-banner-title">
            {championName ? `Champion: ${championName}` : (tournament.streamTitle || 'Live Tournament Update')}
          </div>
          <div className="live-bracket-banner-copy">
            {tournament.streamMessage || 'Follow the bracket as each match result updates in real time.'}
          </div>
        </div>
      )}

      <div className="live-bracket-board">
        <div className="live-bracket-rounds">
          {rounds.map((round, roundIndex) => (
            <div
              key={round.round}
              className="live-bracket-round"
              data-round-index={roundIndex}
            >
              <div className="live-bracket-round-header">
                <div className="live-bracket-round-title">{round.label || `Round ${round.round}`}</div>
                <div className="live-bracket-round-subtitle">
                  {(round.matches || []).length} match{(round.matches || []).length === 1 ? '' : 'es'}
                </div>
              </div>

              <div className="live-bracket-round-matches">
                {(round.matches || []).map((match) => {
                  const draft = drafts?.[match.id] || {};
                  const playable = Boolean(match.team1 && match.team2) && !['completed', 'bye'].includes(match.status);
                  const scoreable = editable && playable;
                  const draftScore1 = Number(draft.score1 ?? match.score1 ?? 0);
                  const draftScore2 = Number(draft.score2 ?? match.score2 ?? 0);
                  const tieNotAllowed = !isLeague(match) && draftScore1 === draftScore2;
                  const saving = savingMatchId === match.id;
                  const slots = [
                    {
                      key: 'score1',
                      placeholder: match.placeholder1,
                      team: match.team1,
                      value: scoreable ? draftScore1 : match.score1,
                      winner: Boolean(match.winner) && match.winner?.id === match.team1?.id,
                    },
                    {
                      key: 'score2',
                      placeholder: match.placeholder2,
                      team: match.team2,
                      value: scoreable ? draftScore2 : match.score2,
                      winner: Boolean(match.winner) && match.winner?.id === match.team2?.id,
                    },
                  ];

                  return (
                    <div key={match.id} className="live-bracket-match-wrap">
                      <div className="live-bracket-match">
                        <div className="live-bracket-match-status">
                          <span className={`live-bracket-pill ${getMatchStatusClass(match.status)}`}>
                            {getMatchStatusLabel(match.status)}
                          </span>
                          <span className="live-bracket-match-id">{match.group ? `Group ${match.group} · ` : ''}{match.id}</span>
                        </div>

                        {slots.map((slot) => (
                          <div
                            key={slot.key}
                            className={`live-bracket-slot ${slot.winner ? 'live-bracket-slot-winner' : ''}`}
                          >
                            <div className="live-bracket-slot-main">
                              <div className="live-bracket-slot-name">{slot.team?.name || 'TBD'}</div>
                              <div className="live-bracket-slot-subtitle">
                                {slot.team ? `No. ${slot.team.seed || '-'}` : (slot.placeholder || 'Waiting for prior result')}
                              </div>
                            </div>

                            {scoreable ? (
                              <input
                                className="live-bracket-score"
                                type="number"
                                min="0"
                                inputMode="numeric"
                                aria-label={`${slot.team?.name || 'Team'} score`}
                                value={renderScoreValue(slot.value)}
                                disabled={!slot.team || saving}
                                onChange={(event) => onScoreChange?.(match.id, slot.key, event.target.value)}
                              />
                            ) : (
                              <div className="live-bracket-score-readonly">
                                {slot.team ? renderScoreValue(slot.value) : '-'}
                              </div>
                            )}
                          </div>
                        ))}

                        {scoreable && onPickWinner && !isLeague(match) && (
                          <div className="live-bracket-pick-row">
                            <button
                              type="button"
                              className="live-bracket-pick-btn"
                              disabled={saving}
                              onClick={() => setConfirming({ match, kind: 'pick', winnerKey: 'score1' })}
                            >
                              <i className="bi bi-trophy" /> {match.team1.name} wins
                            </button>
                            <button
                              type="button"
                              className="live-bracket-pick-btn"
                              disabled={saving}
                              onClick={() => setConfirming({ match, kind: 'pick', winnerKey: 'score2' })}
                            >
                              <i className="bi bi-trophy" /> {match.team2.name} wins
                            </button>
                          </div>
                        )}

                        <div className="live-bracket-footer">
                          <div className="live-bracket-footer-note">
                            {match.winner?.name
                              ? `${match.winner.name} ${isFinalMatch(match) ? 'won' : 'advances'}`
                              : match.status === 'bye'
                                ? 'Automatic advance'
                                : match.status === 'completed'
                                  ? 'Draw'
                                  : scoreable && tieNotAllowed
                                    ? 'Enter the final score (no ties in knockout games)'
                                    : scoreable
                                      ? 'Check the score, then save the result'
                                      : 'Waiting for result'}
                          </div>
                          {scoreable && (
                            <button
                              className="live-bracket-action"
                              type="button"
                              disabled={saving || tieNotAllowed}
                              onClick={() => setConfirming({ match, kind: 'save' })}
                            >
                              {saving ? 'Saving…' : 'Save Result'}
                            </button>
                          )}
                          {correctable && match.status === 'completed' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="live-bracket-action" type="button" onClick={() => onCorrectMatch?.(match)}>
                                Correct
                              </button>
                              <button className="live-bracket-action" type="button" onClick={() => onUndoMatch?.(match)}>
                                Undo
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {groupLabels.map((group) => (
        <div key={group} className="live-bracket-banner">
          <div className="live-bracket-banner-title">Group {group} Standings</div>
          <div className="live-bracket-banner-copy">The top two go through to the knockout.</div>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table className="live-bracket-standings">
              <thead>
                <tr>
                  {['Rank', 'Team', 'P', 'W', 'L', 'D', 'Pts', 'Diff'].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tournament.standings.filter((entry) => entry.group === group).map((entry) => (
                  <tr key={entry.teamId}>
                    <td>{entry.rank}</td>
                    <td className="live-bracket-standings-team">{entry.teamName}</td>
                    <td>{entry.played}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.losses}</td>
                    <td>{entry.draws}</td>
                    <td className="live-bracket-standings-points">{entry.points}</td>
                    <td>{entry.scoreDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {isLeaguePlayoff && Array.isArray(tournament.standings) && tournament.standings.length > 0 ? (
        <div className="live-bracket-banner">
          <div className="live-bracket-banner-title">League Standings</div>
          <div className="live-bracket-banner-copy">
            {leagueDone
              ? `League games are done. The top ${playoffTeams} are in the playoffs.`
              : `The top ${playoffTeams} move on to the playoffs. Ranks can still change until all league games are played.`}
          </div>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table className="live-bracket-standings">
              <thead>
                <tr>
                  {['Rank', 'Team', 'P', 'W', 'L', 'D', 'Pts', 'Diff'].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tournament.standings.map((entry) => {
                  // The playoff line: everyone below it is out.
                  const cell = entry.rank === playoffTeams + 1 ? { borderTop: '2px dashed #2563eb' } : undefined;
                  return (
                    <tr key={entry.teamId} style={entry.rank > playoffTeams ? { opacity: 0.6 } : undefined}>
                      <td style={cell}>{entry.rank}</td>
                      <td style={cell} className="live-bracket-standings-team">{entry.teamName}</td>
                      <td style={cell}>{entry.played}</td>
                      <td style={cell}>{entry.wins}</td>
                      <td style={cell}>{entry.losses}</td>
                      <td style={cell}>{entry.draws}</td>
                      <td style={cell} className="live-bracket-standings-points">{entry.points}</td>
                      <td style={cell}>{entry.scoreDifference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tournament.bracketType === 'round-robin' && Array.isArray(tournament.standings) && tournament.standings.length > 0 ? (
        <div className="live-bracket-banner">
          <div className="live-bracket-banner-title">Round-Robin Standings</div>
          <div className="live-bracket-banner-copy">
            Rankings update whenever a round-robin match is saved.
          </div>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table className="live-bracket-standings">
              <thead>
                <tr>
                  {['Rank', 'Team', 'P', 'W', 'L', 'D', 'Pts', 'Diff'].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tournament.standings.map((entry) => (
                  <tr key={entry.teamId}>
                    <td>{entry.rank}</td>
                    <td className="live-bracket-standings-team">{entry.teamName}</td>
                    <td>{entry.played}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.losses}</td>
                    <td>{entry.draws}</td>
                    <td className="live-bracket-standings-points">{entry.points}</td>
                    <td>{entry.scoreDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirming)}
        danger={false}
        title="Save this result?"
        message={describeConfirmation(confirming, drafts)}
        confirmLabel="Save Result"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const { match, kind, winnerKey } = confirming;
          setConfirming(null);
          if (kind === 'pick') onPickWinner?.(match, winnerKey);
          else onSaveMatch?.(match);
        }}
      />
    </div>
  );
}

function describeConfirmation(confirming, drafts) {
  if (!confirming) return '';
  const { match, kind, winnerKey } = confirming;
  if (kind === 'pick') {
    const winner = winnerKey === 'score1' ? match.team1 : match.team2;
    return `${winner?.name || 'Winner'} wins (recorded as 1 – 0). Once saved, only the organizer can correct it.`;
  }
  const draft = drafts?.[match.id] || {};
  const score1 = Number(draft.score1 ?? match.score1 ?? 0);
  const score2 = Number(draft.score2 ?? match.score2 ?? 0);
  return `${match.team1?.name || 'TBD'} ${score1} – ${score2} ${match.team2?.name || 'TBD'}. Once saved, only the organizer can correct it.`;
}
