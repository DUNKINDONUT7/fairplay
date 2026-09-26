import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PaginationControls from '../../components/admin/PaginationControls';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useRegistrationStore from '../../store/registrationStore';
import useTeamStore from '../../store/teamStore';

const PAGE_SIZES = [5, 10, 20];

const STATUS_THEME = {
  approved: { bg: '#dcfce7', fg: '#15803d' },
  confirmed: { bg: '#dcfce7', fg: '#15803d' },
  rejected: { bg: '#fee2e2', fg: '#b91c1c' },
  pending: { bg: '#fef3c7', fg: '#b45309' },
  submitted: { bg: '#dbeafe', fg: '#1d4ed8' },
};

function statusKey(status) {
  return String(status || 'pending').toLowerCase();
}

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusPill({ status }) {
  const theme = STATUS_THEME[statusKey(status)] || { bg: '#f1f5f9', fg: '#475569' };
  return <span style={{ ...pillStyle, background: theme.bg, color: theme.fg }}>{titleCase(status || 'Pending')}</span>;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initialOf(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

export default function OrganizerContestants() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { teams, fetchTeams, updateTeam } = useTeamStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { success, error: notifyError } = useNotificationStore();

  const [chosenTab, setChosenTab] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [teamToReject, setTeamToReject] = useState(null);
  const [savingTeamId, setSavingTeamId] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    fetchEvents(user.id);
    fetchTeams();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations, fetchTeams, user?.id]);

  const activeEvents = useMemo(() => events.filter((event) => event.status !== 'draft'), [events]);
  const eventsById = useMemo(() => new Map(activeEvents.map((event) => [String(event.id), event])), [activeEvents]);

  const myTeams = useMemo(() => teams.filter((team) => eventsById.has(String(team.eventId))), [teams, eventsById]);
  const myIndividuals = useMemo(() => registrations.filter((registration) =>
    registration.registrationType === 'individual' && eventsById.has(String(registration.eventId))
  ), [registrations, eventsById]);

  // Open on whichever list actually has entries, unless the organizer picked one.
  const activeTab = chosenTab || (myTeams.length === 0 && myIndividuals.length > 0 ? 'individuals' : 'teams');

  const summary = useMemo(() => ({
    teams: myTeams.length,
    teamsPending: myTeams.filter((team) => statusKey(team.status) === 'pending').length,
    individuals: myIndividuals.length,
    events: new Set(registrations.filter((r) => eventsById.has(String(r.eventId))).map((r) => String(r.eventId))).size,
  }), [myTeams, myIndividuals, registrations, eventsById]);

  const term = searchTerm.trim().toLowerCase();

  const filteredTeams = useMemo(() => myTeams.filter((team) => {
    if (eventFilter && String(team.eventId) !== String(eventFilter)) return false;
    if (statusFilter && statusKey(team.status) !== statusFilter) return false;
    if (!term) return true;
    const event = eventsById.get(String(team.eventId));
    return [team.name, event?.title, team.schoolOrganization, team.teamLeader?.fullName, team.coach?.fullName]
      .some((value) => String(value || '').toLowerCase().includes(term));
  }), [myTeams, eventFilter, statusFilter, term, eventsById]);

  const filteredIndividuals = useMemo(() => myIndividuals.filter((registration) => {
    if (eventFilter && String(registration.eventId) !== String(eventFilter)) return false;
    if (statusFilter && statusKey(registration.status) !== statusFilter) return false;
    if (!term) return true;
    const event = eventsById.get(String(registration.eventId));
    return [registration.individualDetails.name, registration.individualDetails.email, registration.individualDetails.phone, event?.title, registration.subEventName]
      .some((value) => String(value || '').toLowerCase().includes(term));
  }), [myIndividuals, eventFilter, statusFilter, term, eventsById]);

  const statusOptions = useMemo(() => {
    const source = activeTab === 'teams' ? myTeams : myIndividuals;
    return [...new Set(source.map((item) => statusKey(item.status)))].sort();
  }, [activeTab, myTeams, myIndividuals]);

  const rows = activeTab === 'teams' ? filteredTeams : filteredIndividuals;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [activeTab, term, eventFilter, statusFilter, pageSize]);

  function switchTab(tab) {
    setChosenTab(tab);
    setStatusFilter('');
  }

  async function setTeamStatus(team, status) {
    setSavingTeamId(String(team.id));
    useTeamStore.setState({ error: null });
    try {
      const updated = await updateTeam(team.id, { status });
      const failed = !updated || useTeamStore.getState().error;
      if (failed) throw new Error(useTeamStore.getState().error || 'Update failed');
      success(status === 'Approved' ? `${team.name} approved.` : `${team.name} rejected.`);
      setSelectedTeam((current) => (current && String(current.id) === String(team.id) ? { ...current, status } : current));
    } catch {
      notifyError(`Could not update ${team.name}. Please try again.`);
    } finally {
      setSavingTeamId('');
      setTeamToReject(null);
    }
  }

  const filtersActive = Boolean(term || eventFilter || statusFilter);

  return (
    <DashboardLayout title="Participant Management" subtitle="Review registrations, approve teams, and see who joined your events">
      <ConfirmDialog
        open={Boolean(teamToReject)}
        title="Reject this team?"
        message={teamToReject ? `${teamToReject.name} will be marked as rejected for this event. You can approve them again later if needed.` : ''}
        confirmLabel="Reject team"
        onCancel={() => setTeamToReject(null)}
        onConfirm={() => setTeamStatus(teamToReject, 'Rejected')}
      />

      <div style={{ display: 'grid', gap: 20 }}>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
          <StatTile icon="bi bi-people" tone="info" label="Teams" value={summary.teams} hint={summary.teams ? `${summary.teamsPending} waiting for approval` : 'No team registrations yet'} />
          <StatTile icon="bi bi-hourglass-split" tone={summary.teamsPending ? 'warning' : 'success'} label="Teams to review" value={summary.teamsPending} hint={summary.teamsPending ? 'Approve or reject these' : 'Nothing waiting'} />
          <StatTile icon="bi bi-person" tone="info" label="Individual participants" value={summary.individuals} hint="Registered on their own" />
          <StatTile icon="bi bi-calendar-event" tone="info" label="Events with registrations" value={summary.events} hint={`of ${activeEvents.length} published event${activeEvents.length === 1 ? '' : 's'}`} />
        </div>

        <section style={cardStyle}>
          {/* Tabs + filters */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef2f7', display: 'grid', gap: 14 }}>
            <div role="tablist" aria-label="Entry type" style={{ display: 'inline-flex', padding: 4, borderRadius: 14, background: '#f1f5f9', gap: 4, justifySelf: 'start', flexWrap: 'wrap' }}>
              {[
                ['teams', 'bi bi-people', 'Team entries', summary.teams],
                ['individuals', 'bi bi-person', 'Individual entries', summary.individuals],
              ].map(([tab, icon, label, count]) => {
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchTab(tab)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: active ? '#ffffff' : 'transparent', color: active ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: active ? '0 2px 8px rgba(15,23,42,0.08)' : 'none' }}
                  >
                    <i className={icon} /> {label}
                    <span style={{ padding: '0 8px', borderRadius: 999, fontSize: 12, background: active ? '#dbeafe' : '#e2e8f0', color: active ? '#1d4ed8' : '#64748b' }}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 260px' }}>
                <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={activeTab === 'teams' ? 'Search team, school, leader, or event' : 'Search name, email, phone, or event'}
                  aria-label="Search entries"
                  style={{ ...fieldStyle, paddingLeft: 34 }}
                />
              </div>
              <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} aria-label="Filter by event" style={{ ...fieldStyle, flex: '0 1 220px' }}>
                <option value="">All events</option>
                {activeEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" style={{ ...fieldStyle, flex: '0 1 170px' }}>
                <option value="">All statuses</option>
                {statusOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
              </select>
              {filtersActive && (
                <button type="button" onClick={() => { setSearchTerm(''); setEventFilter(''); setStatusFilter(''); }} style={ghostButtonStyle}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            {activeTab === 'teams' ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['Team', 'Event', 'Roster', 'Requirements', 'Status', ''].map((column, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{column || <span style={srOnly}>Actions</span>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 ? (
                    <EmptyRow colSpan={6} filtered={filtersActive} kind="team" />
                  ) : pagedRows.map((team) => {
                    const event = eventsById.get(String(team.eventId));
                    const rosterSize = (team.players?.length ? team.players : team.members || []).length;
                    const min = Number(team.minParticipants || event?.minParticipants || 0);
                    const max = Number(team.maxParticipants || event?.maxTeamMembers || event?.maxParticipants || 0);
                    const complete = (!min || rosterSize >= min) && (!max || rosterSize <= max);
                    const key = statusKey(team.status);
                    const saving = savingTeamId === String(team.id);
                    return (
                      <tr key={team.id} style={rowStyle}>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={avatarStyle}>{initialOf(team.name)}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{team.name}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{team.schoolOrganization || team.teamLeader?.fullName || 'No school listed'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>{event?.title || 'Unknown event'}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#0f172a' }}>{rosterSize}</strong>{max ? ` / ${max}` : ''} member{rosterSize === 1 && !max ? '' : 's'}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ ...pillStyle, background: complete ? '#dcfce7' : '#fef3c7', color: complete ? '#15803d' : '#b45309' }} title={complete ? 'Roster size is within the limit' : `Needs ${min ? `at least ${min}` : ''}${min && max ? ' and ' : ''}${max ? `at most ${max}` : ''} members`}>
                            <i className={complete ? 'bi bi-check2' : 'bi bi-exclamation-triangle'} /> {complete ? 'Complete' : 'Incomplete'}
                          </span>
                        </td>
                        <td style={tdStyle}><StatusPill status={team.status} /></td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button type="button" onClick={() => setSelectedTeam(team)} style={iconButtonStyle} aria-label={`View ${team.name}`} title="View details"><i className="bi bi-eye" /></button>
                            {key !== 'approved' && (
                              <button type="button" onClick={() => setTeamStatus(team, 'Approved')} disabled={saving} style={{ ...smallButtonStyle, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4', opacity: saving ? 0.6 : 1 }}>
                                <i className={saving ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-check-lg'} /> Approve
                              </button>
                            )}
                            {key !== 'rejected' && (
                              <button type="button" onClick={() => setTeamToReject(team)} disabled={saving} style={{ ...smallButtonStyle, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', opacity: saving ? 0.6 : 1 }}>
                                <i className="bi bi-x-lg" /> Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['Participant', 'Event', 'Phone', 'Status', 'Registered', ''].map((column, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{column || <span style={srOnly}>Actions</span>}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 ? (
                    <EmptyRow colSpan={6} filtered={filtersActive} kind="individual" />
                  ) : pagedRows.map((registration) => {
                    const event = eventsById.get(String(registration.eventId));
                    const details = registration.individualDetails || {};
                    return (
                      <tr key={registration.id} style={rowStyle}>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={avatarStyle}>{initialOf(details.name || registration.participantName)}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{details.name || registration.participantName || 'Unnamed'}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{details.email || registration.email || 'No email'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div>{event?.title || 'Unknown event'}</div>
                          {registration.subEventName && <div style={{ fontSize: 12, color: '#94a3b8' }}>{registration.subEventName}</div>}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{details.phone || '—'}</td>
                        <td style={tdStyle}><StatusPill status={registration.status} /></td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(registration.createdAt)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button type="button" onClick={() => setSelectedPerson(registration)} style={iconButtonStyle} aria-label={`View ${details.name || 'participant'}`} title="View details"><i className="bi bi-eye" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {rows.length > 0 && (
            <div style={{ padding: '0 20px 16px' }}>
              <PaginationControls
                page={currentPage}
                totalPages={totalPages}
                limit={pageSize}
                totalItems={rows.length}
                onPageChange={setPage}
                onLimitChange={setPageSize}
                pageSizes={PAGE_SIZES}
              />
            </div>
          )}
        </section>
      </div>

      {selectedTeam && (
        <Modal onClose={() => { if (!teamToReject) setSelectedTeam(null); }} title={selectedTeam.name} subtitle={`${eventsById.get(String(selectedTeam.eventId))?.title || 'Team event'}${selectedTeam.sportType ? ` · ${selectedTeam.sportType}` : ''}`} badge={<StatusPill status={selectedTeam.status} />}
          footer={(
            <>
              {statusKey(selectedTeam.status) !== 'rejected' && (
                <button type="button" onClick={() => setTeamToReject(selectedTeam)} style={{ ...smallButtonStyle, color: '#dc2626', borderColor: '#fecaca', background: '#ffffff', padding: '10px 14px' }}><i className="bi bi-x-lg" /> Reject</button>
              )}
              {statusKey(selectedTeam.status) !== 'approved' && (
                <button type="button" onClick={() => setTeamStatus(selectedTeam, 'Approved')} disabled={savingTeamId === String(selectedTeam.id)} style={{ ...smallButtonStyle, color: '#ffffff', borderColor: '#16a34a', background: '#16a34a', padding: '10px 14px' }}><i className="bi bi-check-lg" /> Approve team</button>
              )}
            </>
          )}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Info label="School / Organization" value={selectedTeam.schoolOrganization || '—'} />
            <Info label="Division" value={selectedTeam.division || '—'} />
            <Info label="Representative" value={selectedTeam.representativeType || '—'} />
            <Info label="Members" value={`${(selectedTeam.players?.length ? selectedTeam.players : selectedTeam.members || []).length}${selectedTeam.maxParticipants ? ` / ${selectedTeam.maxParticipants}` : ''}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
            <PersonCard label="Team leader" person={selectedTeam.teamLeader} />
            <PersonCard label="Coach" person={selectedTeam.coach} />
          </div>
          <h3 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 15, fontWeight: 800 }}>Members</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(selectedTeam.players?.length ? selectedTeam.players : selectedTeam.members || []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>No members listed.</div>
            ) : (selectedTeam.players?.length ? selectedTeam.players : selectedTeam.members || []).map((member, index) => (
              <div key={member.id || `${member.fullName}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                <span style={{ ...avatarStyle, width: 30, height: 30, fontSize: 12 }}>{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{member.fullName || member.name || String(member)}</div>
                  {typeof member === 'object' && (
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      {[member.age ? `Age ${member.age}` : null, member.schoolYear || member.school_year, member.roleOrPosition].filter(Boolean).join(' · ') || 'No other details'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {selectedPerson && (
        <Modal onClose={() => setSelectedPerson(null)} title={selectedPerson.individualDetails?.name || selectedPerson.participantName || 'Participant'} subtitle={eventsById.get(String(selectedPerson.eventId))?.title || 'Event'} badge={<StatusPill status={selectedPerson.status} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Info label="Email" value={selectedPerson.individualDetails?.email || selectedPerson.email || '—'} />
            <Info label="Phone" value={selectedPerson.individualDetails?.phone || '—'} />
            <Info label="Category" value={selectedPerson.subEventName || selectedPerson.category || '—'} />
            <Info label="School / Organization" value={selectedPerson.schoolOrganization || '—'} />
            <Info label="Registered" value={formatDate(selectedPerson.createdAt)} />
            <Info label="Check-in QR" value={selectedPerson.individualDetails?.qrToken ? 'Issued' : 'Not issued'} />
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function EmptyRow({ colSpan, filtered, kind }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '44px 18px', textAlign: 'center', color: '#94a3b8' }}>
        <i className={filtered ? 'bi bi-search' : kind === 'team' ? 'bi bi-people' : 'bi bi-person'} style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
        <div style={{ fontWeight: 700, color: '#475569' }}>{filtered ? 'No entries match your filters' : kind === 'team' ? 'No team registrations yet' : 'No individual registrations yet'}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>{filtered ? 'Try clearing the search or filters.' : 'They will appear here as soon as people register.'}</div>
      </td>
    </tr>
  );
}

function Modal({ title, subtitle, badge, children, footer, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ width: 'min(720px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 24px 80px rgba(15,23,42,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '20px 22px', borderBottom: '1px solid #eef2f7' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 19, fontWeight: 800 }}>{title}</h2>
              {badge}
            </div>
            {subtitle && <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={iconButtonStyle}><i className="bi bi-x-lg" /></button>
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #eef2f7' }}>{footer}</div>}
      </div>
    </div>
  );
}

function PersonCard({ label, person }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: '1px solid #eef2f7' }}>
      <div style={infoLabelStyle}>{label}</div>
      {person?.fullName ? (
        <>
          <div style={{ color: '#0f172a', fontWeight: 700, marginTop: 4 }}>{person.fullName}</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{[person.email, person.phone].filter(Boolean).join(' · ') || 'No contact details'}</div>
        </>
      ) : (
        <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>Not provided</div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 700, marginTop: 4, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

const TONES = {
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  success: { bg: '#ecfdf5', fg: '#047857' },
  warning: { bg: '#fffbeb', fg: '#b45309' },
};

function StatTile({ icon, tone, label, value, hint }) {
  const colors = TONES[tone] || TONES.info;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: colors.bg, color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><i className={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', minWidth: 820 };
const thStyle = { padding: '12px 18px', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0', background: '#fbfcfe' };
const tdStyle = { padding: '14px 18px', fontSize: 13, color: '#475569', verticalAlign: 'middle' };
const rowStyle = { borderBottom: '1px solid #f1f5f9' };
const pillStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const avatarStyle = { width: 36, height: 36, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 };
const fieldStyle = { width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const iconButtonStyle = { width: 34, height: 34, borderRadius: 9, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
const smallButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const infoLabelStyle = { color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' };
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
