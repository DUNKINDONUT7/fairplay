import { useEffect, useMemo, useState } from 'react';
import LiveBracket from '../components/brackets/LiveBracket';
import useEventStore from '../store/eventStore';
import useTournamentStore from '../store/tournamentStore';

export default function BracketsPage() {
  const { events, fetchEvents } = useEventStore();
  const { tournaments, fetchTournaments } = useTournamentStore();
  const [selectedTournamentId, setSelectedTournamentId] = useState('');

  useEffect(() => {
    fetchEvents();
    fetchTournaments();
  }, [fetchEvents, fetchTournaments]);

  const currentTournament = useMemo(() => {
    if (selectedTournamentId) {
      return tournaments.find((entry) => String(entry.id) === String(selectedTournamentId)) || null;
    }
    return tournaments[0] || null;
  }, [selectedTournamentId, tournaments]);

  const currentEvent = currentTournament
    ? events.find((entry) => String(entry.id) === String(currentTournament.eventId)) || null
    : null;

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-8" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#f8fbff' }}>Tournament Brackets</h1>
          <p style={{ color: '#8ea5c3' }}>
            {currentEvent?.title ? `Live bracket for ${currentEvent.title}` : 'View and monitor tournament progression'}
          </p>
        </div>
        <select
          value={selectedTournamentId}
          onChange={(event) => setSelectedTournamentId(event.target.value)}
          style={{ minWidth: 260, padding: '12px 14px', borderRadius: 12, background: 'rgba(15,20,25,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
        >
          <option value="">Latest tournament</option>
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.title}
            </option>
          ))}
        </select>
      </div>

      {currentTournament ? (
        <LiveBracket tournament={currentTournament} />
      ) : (
        <div style={{ background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 16, padding: 32, color: '#a0aec0' }}>
          No tournament brackets are available yet. Generate one from the organizer bracket page.
        </div>
      )}
    </div>
  );
}
