import React, { useState } from 'react';
import './Bracket.css';

const Bracket = ({ matches = [], title = 'Tournament Bracket', editable = false }) => {
  const [bracketMatches, setBracketMatches] = useState(matches);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const handleAdvanceWinner = (matchId, winnerId) => {
    if (!editable) return;

    const updated = bracketMatches.map(m => {
      if (m.id === matchId) {
        return { ...m, winner: winnerId };
      }
      return m;
    });
    setBracketMatches(updated);
  };

  return (
    <div className="bracket-container">
      <h2>{title}</h2>

      <div className="bracket-wrapper">
        <div className="bracket">
          {bracketMatches.map((match, idx) => (
            <div
              key={match.id}
              className={`match-box ${match.winner ? 'winner-set' : ''} ${selectedMatch?.id === match.id ? 'selected' : ''}`}
              onClick={() => setSelectedMatch(match)}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="match-round">
                <span>{match.round}</span>
              </div>

              <div className="match-participants">
                <div className={`participant ${match.winner === match.participant1.id ? 'winner' : ''}`}>
                  <span className="seed">{match.participant1.seed}</span>
                  <span className="name">{match.participant1.name}</span>
                  <span className="score">{match.participant1.score || '-'}</span>
                  {editable && match.winner !== match.participant1.id && (
                    <button
                      className="advance-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceWinner(match.id, match.participant1.id);
                      }}
                    >
                      ✓
                    </button>
                  )}
                </div>

                <div className="match-separator">vs</div>

                <div className={`participant ${match.winner === match.participant2.id ? 'winner' : ''}`}>
                  <span className="seed">{match.participant2.seed}</span>
                  <span className="name">{match.participant2.name}</span>
                  <span className="score">{match.participant2.score || '-'}</span>
                  {editable && match.winner !== match.participant2.id && (
                    <button
                      className="advance-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceWinner(match.id, match.participant2.id);
                      }}
                    >
                      ✓
                    </button>
                  )}
                </div>
              </div>

              <div className="match-status">
                {match.winner ? (
                  <span className="status-complete">Completed</span>
                ) : (
                  <span className="status-pending">Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedMatch && (
        <div className="match-details">
          <h3>Match Details</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Round</label>
              <value>{selectedMatch.round}</value>
            </div>
            <div className="detail-item">
              <label>Match ID</label>
              <value>{selectedMatch.id}</value>
            </div>
            <div className="detail-item">
              <label>Participant 1</label>
              <value>{selectedMatch.participant1.name}</value>
            </div>
            <div className="detail-item">
              <label>Participant 2</label>
              <value>{selectedMatch.participant2.name}</value>
            </div>
            <div className="detail-item">
              <label>Status</label>
              <value>{selectedMatch.winner ? 'Completed' : 'Pending'}</value>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bracket;
