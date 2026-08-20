import { useState } from 'react';

const SPORT_CONFIGS = {
  basketball: {
    label: 'Basketball Score Sheet',
    stats: ['Points', 'Assists', 'Rebounds', 'Steals', 'Blocks', 'Fouls', 'Turnovers', 'FG%', '3PT%', 'FT%'],
    periods: ['1st Q', '2nd Q', '3rd Q', '4th Q', 'Final'],
    teamSize: 5,
  },
  volleyball: {
    label: 'Volleyball Score Sheet',
    stats: ['Points', 'Aces', 'Blocks', 'Digs', 'Assists', 'Kills', 'Errors', 'Service %'],
    periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
    teamSize: 6,
  },
  soccer: {
    label: 'Soccer Score Sheet',
    stats: ['Goals', 'Assists', 'Shots', 'Shots on Goal', 'Fouls', 'Yellow Cards', 'Red Cards', 'Offsides'],
    periods: ['1st Half', '2nd Half', 'Final'],
    teamSize: 11,
  },
  esports: {
    label: 'Esports Match Sheet',
    stats: ['Kills', 'Deaths', 'Assists', 'CS', 'Gold', 'Damage', 'Vision', 'Objectives'],
    periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5'],
    teamSize: 5,
  },
};

function PrintableScoreSheet({ event, teamA, teamB, sportType }) {
  const config = SPORT_CONFIGS[sportType] || SPORT_CONFIGS.basketball;
  const [scores, setScores] = useState({});
  const [teamAPlayers, setTeamAPlayers] = useState(
    Array(config.teamSize).fill(null).map((_, i) => ({
      name: teamA?.players?.[i]?.name || `Player ${i + 1}`,
      jersey: teamA?.players?.[i]?.jerseyNumber || '',
    }))
  );
  const [teamBPlayers, setTeamBPlayers] = useState(
    Array(config.teamSize).fill(null).map((_, i) => ({
      name: teamB?.players?.[i]?.name || `Player ${i + 1}`,
      jersey: teamB?.players?.[i]?.jerseyNumber || '',
    }))
  );

  const playerStatsStyle = {
    padding: '4px 6px', fontSize: 11, textAlign: 'center',
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.2)', color: '#a0aec0',
    width: 48, outline: 'none', borderRadius: 4,
  };

  return (
    <div id="score-sheet" style={{ fontFamily: 'monospace', color: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 20, padding: 16, borderBottom: '2px solid #06b6d4' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{config.label}</h2>
        <p style={{ fontSize: 13, color: '#a0aec0' }}>{event?.title || 'Match Score Sheet'}</p>
        <p style={{ fontSize: 12, color: '#666' }}>
          {event?.startDate || new Date().toLocaleDateString()} | {event?.venue || 'Venue TBD'}
        </p>
      </div>

      {/* Teams */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ padding: 16, background: 'rgba(6,182,212,0.08)', borderRadius: 12, textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{teamA?.name || "Team A"}</h3>
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#06b6d4' }}>VS</div>
        <div style={{ padding: 16, background: 'rgba(6,182,212,0.08)', borderRadius: 12, textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{teamB?.name || "Team B"}</h3>
        </div>
      </div>

      {/* Score Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'rgba(15,20,25,0.6)', borderRadius: 12, padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#06b6d4' }}>{teamA?.name || "Team A"} - Stats</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left', minWidth: 80 }}>Name</th>
                  {config.stats.map(s => (
                    <th key={s} style={{ padding: '4px 6px', textAlign: 'center' }}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamAPlayers.map((player, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={player.jersey} onChange={(e) => {
                        const updated = [...teamAPlayers];
                        updated[idx].jersey = e.target.value;
                        setTeamAPlayers(updated);
                      }} style={{ ...playerStatsStyle, width: 30 }} placeholder="#" />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={player.name} onChange={(e) => {
                        const updated = [...teamAPlayers];
                        updated[idx].name = e.target.value;
                        setTeamAPlayers(updated);
                      }} style={{ ...playerStatsStyle, width: 90, textAlign: 'left' }} />
                    </td>
                    {config.stats.map(stat => (
                      <td key={stat}>
                        <input
                          type="number"
                          min="0"
                          value={scores[`A-${idx}-${stat}`] || ''}
                          onChange={(e) => setScores({ ...scores, [`A-${idx}-${stat}`]: e.target.value })}
                          style={playerStatsStyle}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: 'rgba(15,20,25,0.6)', borderRadius: 12, padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#10b981' }}>{teamB?.name || "Team B"} - Stats</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left', minWidth: 80 }}>Name</th>
                  {config.stats.map(s => (
                    <th key={s} style={{ padding: '4px 6px', textAlign: 'center' }}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamBPlayers.map((player, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={player.jersey} onChange={(e) => {
                        const updated = [...teamBPlayers];
                        updated[idx].jersey = e.target.value;
                        setTeamBPlayers(updated);
                      }} style={{ ...playerStatsStyle, width: 30 }} placeholder="#" />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={player.name} onChange={(e) => {
                        const updated = [...teamBPlayers];
                        updated[idx].name = e.target.value;
                        setTeamBPlayers(updated);
                      }} style={{ ...playerStatsStyle, width: 90, textAlign: 'left' }} />
                    </td>
                    {config.stats.map(stat => (
                      <td key={stat}>
                        <input
                          type="number"
                          min="0"
                          value={scores[`B-${idx}-${stat}`] || ''}
                          onChange={(e) => setScores({ ...scores, [`B-${idx}-${stat}`]: e.target.value })}
                          style={playerStatsStyle}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Period Scores */}
      <div style={{ background: 'rgba(15,20,25,0.6)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#fbbf24' }}>Score by Period</h4>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.periods.length + 1}, 1fr)`, gap: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>Team</div>
          {config.periods.map(p => <div key={p} style={{ fontWeight: 700, textAlign: 'center' }}>{p}</div>)}
          <div style={{ display: 'flex', gap: 4, gridColumn: `1 / ${config.periods.length + 2}` }}>
            <input placeholder={`${teamA?.name || "A"} scores`} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, textAlign: 'center' }} />
            <input placeholder={`${teamB?.name || "B"} scores`} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, textAlign: 'center' }} />
          </div>
        </div>
      </div>

      {/* Referee Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {['Referee', 'Scorekeeper', 'Timekeeper'].map(role => (
          <div key={role} style={{ background: 'rgba(15,20,25,0.6)', borderRadius: 12, padding: 12 }}>
            <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{role}</p>
            <div style={{ height: 24, borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        ))}
      </div>

      {/* Print Button */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '12px 32px', borderRadius: 10,
            background: 'linear-gradient(135deg, #06b6d4, #0084ff)',
            color: '#000', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          🖨️ Print Score Sheet
        </button>
      </div>
    </div>
  );
}

export { SPORT_CONFIGS, PrintableScoreSheet };
export default PrintableScoreSheet;