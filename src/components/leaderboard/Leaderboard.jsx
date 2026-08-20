import React, { useState, useMemo } from 'react';
import './Leaderboard.css';

const Leaderboard = ({ data = [], title = 'Leaderboard', animated = false }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'ascending' });

  const sortedData = useMemo(() => {
    let sortableData = [...data];
    if (sortConfig !== null) {
      sortableData.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'ascending' ? '▲' : '▼';
  };

  const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  };

  return (
    <div className={`leaderboard-container ${animated ? 'animated' : ''}`}>
      <h2 className="leaderboard-title">{title}</h2>
      <div className="leaderboard-table-wrapper">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('rank')}>Rank {getSortIndicator('rank')}</th>
              <th onClick={() => requestSort('name')}>Player {getSortIndicator('name')}</th>
              <th>Accuracy</th>
              <th onClick={() => requestSort('score')}>Score {getSortIndicator('score')}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, index) => (
              <tr key={row.rank || index} style={{ animationDelay: `${index * 0.05}s` }}>
                <td className="rank-cell">
                  <span className={`rank-badge rank-${row.rank}`}>{getMedal(row.rank)}</span>
                </td>
                <td className="player-cell">
                  <div className="player-info">
                    <div className="player-avatar">{row.name.charAt(0)}</div>
                    <div className="player-details">
                      <span className="player-name">{row.name}</span>
                      <span className="player-team">{row.team}</span>
                    </div>
                  </div>
                </td>
                <td className="accuracy-cell">
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${row.accuracy}%` }}
                    ></div>
                  </div>
                  <span className="accuracy-text">{row.accuracy}%</span>
                </td>
                <td className="score-cell">
                  {row.score}
                  {row.scoreChange && (
                    <span className={`score-change ${row.scoreChange > 0 ? 'positive' : 'negative'}`}>
                      {row.scoreChange > 0 ? '↑' : '↓'}
                      {Math.abs(row.scoreChange)}
                    </span>
                  )}
                </td>
                <td className="status-cell">
                  <span className={`status-badge status-${row.status}`}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Leaderboard;