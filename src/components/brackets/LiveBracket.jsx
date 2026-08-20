import { useState } from 'react';
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
}) {
  if (!tournament) return null;

  const rounds = tournament.rounds || [];
  const championName = tournament.champion?.name || null;
  const [editedFields, setEditedFields] = useState({});

  const isRoundRobin = tournament.bracketType === 'round-robin';
  const isFinalMatch = (match) => Number(match.round || 0) === Number(tournament.totalRounds || 0);

  return (
    <div className="live-bracket-shell">
      <div className="live-bracket-meta">
        {[
          { label: 'Bracket Type', value: tournament.bracketType || 'single' },
          { label: 'Match Progress', value: tournament.liveStatus || tournament.status || 'waiting' },
          { label: 'Rounds', value: tournament.totalRounds || rounds.length || 0 },
          { label: 'Teams', value: (tournament.teams || []).length },
          { label: 'Public Visibility', value: tournament.isPublished ? 'published' : 'not published' },
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
                      team: match.team1,
                      value: match.score1,
                      winner: match.winner?.id === match.team1?.id,
                    },
                    {
                      key: 'score2',
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
                          <span className="live-bracket-match-id">{match.id}</span>
                        </div>

                        {slots.map((slot) => (
                          <div
                            key={slot.key}
                            className={`live-bracket-slot ${slot.winner ? 'live-bracket-slot-winner' : ''}`}
                          >
                            <div className="live-bracket-slot-main">
                              <div className="live-bracket-slot-name">{slot.team?.name || 'TBD'}</div>
                              <div className="live-bracket-slot-subtitle">
                                {slot.team ? `Seed ${slot.team.seed || '-'}` : 'Waiting for prior result'}
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

                                  if (isRoundRobin || isFinalMatch(match) || !match.team1 || !match.team2) {
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

                        <div className="live-bracket-footer">
                          <div className="live-bracket-footer-note">
                            {match.winner?.name
                              ? `${match.winner.name} advances`
                              : match.status === 'bye'
                                ? 'Automatic advance'
                                : editable && !isRoundRobin && !isFinalMatch(match)
                                  ? 'Auto-advances when both scores are entered'
                                : 'Waiting for result'}
                          </div>
                          {editable && (isRoundRobin || isFinalMatch(match)) && (
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

      {tournament.bracketType === 'round-robin' && Array.isArray(tournament.standings) && tournament.standings.length > 0 ? (
        <div className="live-bracket-banner">
          <div className="live-bracket-banner-title">Round-Robin Standings</div>
          <div className="live-bracket-banner-copy">
            Rankings update whenever a round-robin match is saved.
          </div>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f8fbff' }}>
              <thead>
                <tr style={{ color: '#8ea5c3', fontSize: 11 }}>
                  {['Rank', 'Team', 'P', 'W', 'L', 'D', 'Pts', 'Diff'].map((header) => (
                    <th key={header} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tournament.standings.map((entry) => (
                  <tr key={entry.teamId}>
                    <td style={{ padding: '9px 10px' }}>{entry.rank}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>{entry.teamName}</td>
                    <td style={{ padding: '9px 10px' }}>{entry.played}</td>
                    <td style={{ padding: '9px 10px' }}>{entry.wins}</td>
                    <td style={{ padding: '9px 10px' }}>{entry.losses}</td>
                    <td style={{ padding: '9px 10px' }}>{entry.draws}</td>
                    <td style={{ padding: '9px 10px', color: '#67e8f9', fontWeight: 700 }}>{entry.points}</td>
                    <td style={{ padding: '9px 10px' }}>{entry.scoreDifference}</td>
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
