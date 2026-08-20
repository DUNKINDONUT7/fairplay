import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useRegistrationStore from '../../store/registrationStore';
import useTeamStore from '../../store/teamStore';

export default function OrganizerContestants() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { teams, fetchTeams, updateTeam } = useTeamStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [activeTab, setActiveTab] = useState('teams');
  const [selectedTeam, setSelectedTeam] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchEvents(user.id);
    fetchTeams();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations, fetchTeams, user?.id]);

  const activeEvents = useMemo(() => events.filter((event) => event.status !== 'draft'), [events]);
  const organizerEventIds = useMemo(() => new Set(activeEvents.map((event) => String(event.id))), [activeEvents]);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      if (!organizerEventIds.has(String(team.eventId))) return false;
      const matchesSearch = [team.name, team.eventId?.toString()].some((value) =>
        value?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesEvent = !eventFilter || String(team.eventId) === String(eventFilter);
      return matchesSearch && matchesEvent;
    });
  }, [teams, organizerEventIds, searchTerm, eventFilter]);

  const individualRegistrations = useMemo(() => {
    return registrations.filter((registration) =>
      registration.registrationType === 'individual' &&
      organizerEventIds.has(String(registration.eventId))
    );
  }, [organizerEventIds, registrations]);

  const filteredIndividuals = useMemo(() => {
    return individualRegistrations.filter((registration) => {
      const matchesSearch = [
        registration.individualDetails.name,
        registration.individualDetails.email,
        registration.individualDetails.phone,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesEvent = !eventFilter || String(registration.eventId) === String(eventFilter);
      return matchesSearch && matchesEvent;
    });
  }, [individualRegistrations, searchTerm, eventFilter]);

  const summary = useMemo(() => ({
    totalTeams: teams.filter((team) => organizerEventIds.has(String(team.eventId))).length,
    totalIndividuals: individualRegistrations.length,
    totalEvents: new Set(
      registrations
        .filter((registration) => organizerEventIds.has(String(registration.eventId)))
        .map((registration) => registration.eventId)
    ).size,
  }), [teams, organizerEventIds, individualRegistrations.length, registrations]);

  const cardStyle = {
    background: '#ffffff',
    border: '1px solid #bfdbfe',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 14px 32px rgba(59,130,246,0.08)',
  };

  const tabStyle = (tab) => ({
    flex: 1,
    minWidth: 130,
    padding: '12px 16px',
    borderRadius: 14,
    border: activeTab === tab ? '1px solid #2563eb' : '1px solid #bfdbfe',
    background: activeTab === tab ? 'linear-gradient(135deg, #2563eb, #60a5fa)' : '#ffffff',
    color: activeTab === tab ? '#ffffff' : '#2563eb',
    boxShadow: activeTab === tab ? '0 12px 28px rgba(37,99,235,0.18)' : '0 8px 18px rgba(59,130,246,0.08)',
    cursor: 'pointer',
    fontWeight: 700,
  });

  const filterStyle = {
    flex: 1,
    minWidth: 220,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid #bfdbfe',
    background: '#ffffff',
    color: '#1d4ed8',
    outline: 'none',
    boxShadow: '0 8px 18px rgba(59,130,246,0.06)',
  };

  return (
    <DashboardLayout title="Participant Management" subtitle="Review registration status, teams, and individual entries">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>Team registrations</p>
          <h2 style={{ margin: '10px 0 0', color: '#2563eb' }}>{summary.totalTeams}</h2>
        </div>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>Individual registrations</p>
          <h2 style={{ margin: '10px 0 0', color: '#2563eb' }}>{summary.totalIndividuals}</h2>
        </div>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>Events with registrations</p>
          <h2 style={{ margin: '10px 0 0', color: '#2563eb' }}>{summary.totalEvents}</h2>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setActiveTab('teams')} style={tabStyle('teams')}>
          Team entries
        </button>
        <button onClick={() => setActiveTab('individuals')} style={tabStyle('individuals')}>
          Individual entries
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by name, email, event"
          style={filterStyle}
        />
        <select
          value={eventFilter}
          onChange={(event) => setEventFilter(event.target.value)}
          style={{ ...filterStyle, flex: '0 0 220px' }}
        >
          <option value="">All events</option>
          {activeEvents.map((event) => (
            <option key={event.id} value={event.id}>{event.title}</option>
          ))}
        </select>
      </div>

      <div
        style={{
          overflowX: 'auto',
          background: '#ffffff',
          border: '1px solid #bfdbfe',
          borderRadius: 16,
          boxShadow: '0 18px 36px rgba(59,130,246,0.08)',
        }}
      >
        {activeTab === 'teams' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#60a5fa', fontSize: 12, background: '#eff6ff' }}>
                {['Team', 'Event', 'Roster size', 'Requirements', 'Status', 'Actions'].map((column) => (
                  <th key={column} style={{ padding: '16px 18px', borderBottom: '1px solid #dbeafe' }}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTeams.length > 0 ? (
                filteredTeams.map((team) => {
                  const event = events.find((item) => String(item.id) === String(team.eventId));
                  const rosterSize = (team.players || team.members || []).length;
                  const min = Number(team.minParticipants || event?.minParticipants || 0);
                  const max = Number(team.maxParticipants || event?.maxTeamMembers || event?.maxParticipants || 0);
                  const complete = (!min || rosterSize >= min) && (!max || rosterSize <= max);
                  return (
                    <tr key={team.id} style={{ borderBottom: '1px solid #dbeafe' }}>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{team.name}</td>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{event?.title || 'Unknown event'}</td>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{rosterSize}{max ? ` / ${max}` : ''}</td>
                      <td style={{ padding: '16px 18px' }}>
                        <span style={{ padding: '6px 10px', borderRadius: 999, background: complete ? '#dcfce7' : '#fef3c7', color: complete ? '#15803d' : '#92400e', fontSize: 12, fontWeight: 800 }}>
                          {complete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <span style={{ padding: '6px 10px', borderRadius: 999, background: team.status === 'Approved' ? '#dcfce7' : team.status === 'Rejected' ? '#fee2e2' : '#dbeafe', color: team.status === 'Approved' ? '#15803d' : team.status === 'Rejected' ? '#dc2626' : '#2563eb', fontSize: 12, fontWeight: 700 }}>
                          {team.status || 'Confirmed'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => setSelectedTeam(team)} style={miniAction}>View</button>
                          <button onClick={() => updateTeam(team.id, { status: 'Approved' })} style={{ ...miniAction, color: '#15803d' }}>Approve</button>
                          <button onClick={() => updateTeam(team.id, { status: 'Rejected' })} style={{ ...miniAction, color: '#dc2626' }}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ padding: '20px 18px', color: '#60a5fa' }}>No team entries match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#60a5fa', fontSize: 12, background: '#eff6ff' }}>
                {['Participant', 'Event', 'Email', 'Status', 'Registered'].map((column) => (
                  <th key={column} style={{ padding: '16px 18px', borderBottom: '1px solid #dbeafe' }}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIndividuals.length > 0 ? (
                filteredIndividuals.map((registration) => {
                  const event = events.find((item) => String(item.id) === String(registration.eventId));
                  return (
                    <tr key={registration.id} style={{ borderBottom: '1px solid #dbeafe' }}>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{registration.individualDetails.name}</td>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{event?.title || 'Unknown event'}</td>
                      <td style={{ padding: '16px 18px', color: '#1d4ed8' }}>{registration.individualDetails.email || '-'}</td>
                      <td style={{ padding: '16px 18px' }}>
                        <span style={{ padding: '6px 10px', borderRadius: 999, background: '#dbeafe', color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
                          {registration.status || 'submitted'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 18px', color: '#60a5fa' }}>
                        {registration.createdAt ? new Date(registration.createdAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ padding: '20px 18px', color: '#60a5fa' }}>No individual entries match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {selectedTeam && (
        <div onClick={() => setSelectedTeam(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', zIndex: 1400, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: 18, padding: 24, border: '1px solid #bfdbfe', boxShadow: '0 24px 80px rgba(15,23,42,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, color: '#0f172a' }}>{selectedTeam.name}</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>{selectedTeam.sportType || 'Team event'} - {selectedTeam.status || 'Pending'}</p>
              </div>
              <button onClick={() => setSelectedTeam(null)} style={miniAction}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Info label="School / Organization" value={selectedTeam.schoolOrganization || '-'} />
              <Info label="Division" value={selectedTeam.division || '-'} />
              <Info label="Representative" value={selectedTeam.representativeType || '-'} />
              <Info label="Members" value={`${(selectedTeam.players || selectedTeam.members || []).length} / ${selectedTeam.maxParticipants || '-'}`} />
            </div>
            <h3 style={{ color: '#0f172a', fontSize: 16 }}>Team Leader</h3>
            <p style={{ color: '#475569' }}>{selectedTeam.teamLeader?.fullName || 'Not provided'}</p>
            <h3 style={{ color: '#0f172a', fontSize: 16 }}>Coach</h3>
            <p style={{ color: '#475569' }}>{selectedTeam.coach?.fullName || 'Not provided'}</p>
            <h3 style={{ color: '#0f172a', fontSize: 16 }}>Members</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {(selectedTeam.players || selectedTeam.members || []).map((member, index) => (
                <div key={member.id || `${member.fullName}-${index}`} style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                  <strong>{index + 1}. {member.fullName || member.name || member}</strong>
                  {typeof member === 'object' && (
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      Age {member.age || '-'} - {member.schoolYear || member.school_year || 'School year not set'}{member.roleOrPosition ? ` - ${member.roleOrPosition}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
      <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#1d4ed8', fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const miniAction = {
  border: '1px solid #bfdbfe',
  background: '#ffffff',
  color: '#2563eb',
  borderRadius: 10,
  padding: '7px 10px',
  fontWeight: 800,
  cursor: 'pointer',
};
