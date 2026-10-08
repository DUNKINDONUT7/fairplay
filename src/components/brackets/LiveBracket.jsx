import { useState } from 'react';
import { countPlayoffTeams, isLeagueMatch } from '../../utils/bracketEngine';
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

export default function LiveBracket({
  tournament,
  editable = false,
  onScoreChange,
  onSaveMatch,
  onAutoAdvanceMatch,
  onPickWinner,
}) {
  if (!tournament) return null;

  const rounds = tournament.rounds || [];
  const championName = tournament.champion?.name || null;
  const [editedFields, setEditedFields] = useState({});

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
                  const slots = [
                    {
                      key: 'score1',
                      placeholder: match.placeholder1,
                      team: match.team1,
                      value: match.score1,
                      winner: match.winner?.id === match.team1?.id,
                    },
                    {
                      key: 'score2',
                      placeholder: match.placeholder2,
                      team: match.team2,
                      value: match.score2,
                      winner: match.winner?.id === match.team2?.id,
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

                            {editable ? (
                              <input
                                className="live-bracket-score"
                                type="number"
                                min="0"
                                value={renderScoreValue(slot.value)}
                                disabled={!slot.team}
                                onChange={async (event) => {
                                  const nextValue = event.target.value;
                                  const nextTouched = {
                                    ...(editedFields[match.id] || {}),
                                    [slot.key]: true,
                                  };

                                  setEditedFields((current) => ({
                                    ...current,
                                    [match.id]: nextTouched,
                                  }));

                                  await onScoreChange?.(match.id, slot.key, nextValue);

                                  if (isLeague(match) || isFinalMatch(match) || !match.team1 || !match.team2) {
                                    return;
                                  }

                                  const nextScore1 = Number(slot.key === 'score1' ? nextValue : match.score1 || 0);
                                  const nextScore2 = Number(slot.key === 'score2' ? nextValue : match.score2 || 0);
                                  const bothEdited = Boolean(nextTouched.score1) && Boolean(nextTouched.score2);

                                  if (bothEdited && nextScore1 !== nextScore2) {
                                    await onAutoAdvanceMatch?.(match);
                                    setEditedFields((current) => ({
                                      ...current,
                                      [match.id]: {},
                                    }));
                                  }
                                }}
                              />
                            ) : (
                              <div className="live-bracket-score-readonly">
                                {slot.team ? renderScoreValue(slot.value) : '-'}
                              </div>
                            )}
                          </div>
                        ))}

                        {editable && onPickWinner && !isLeague(match) && match.team1 && match.team2 && !['completed', 'bye'].includes(match.status) && (
                          <div className="live-bracket-pick-row">
                            <button
                              type="button"
                              className="live-bracket-pick-btn"
                              onClick={() => onPickWinner(match, 'score1')}
                            >
                              <i className="bi bi-trophy" /> {match.team1.name} wins
                            </button>
                            <button
                              type="button"
                              className="live-bracket-pick-btn"
                              onClick={() => onPickWinner(match, 'score2')}
                            >
                              <i className="bi bi-trophy" /> {match.team2.name} wins
                            </button>
                          </div>
                        )}

                        <div className="live-bracket-footer">
                          <div className="live-bracket-footer-note">
                            {match.winner?.name
                              ? `${match.winner.name} advances`
                              : match.status === 'bye'
                                ? 'Automatic advance'
                                : editable && !isLeague(match) && !isFinalMatch(match)
                                  ? 'Pick a winner above, or enter exact scores below'
                                : 'Waiting for result'}
                          </div>
                          {editable && (isLeague(match) || isFinalMatch(match)) && (
                            <button
                              className="live-bracket-action"
                              type="button"
                              disabled={!match.team1 || !match.team2}
                              onClick={() => onSaveMatch?.(match)}
                            >
                              Save Match
                            </button>
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
    </div>
  );
}
