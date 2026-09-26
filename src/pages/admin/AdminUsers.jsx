import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Trash2, Search, RefreshCw, Check, X, ShieldAlert, UserPlus, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useJudgeStore from '../../store/judgeStore';
import useRegistrationStore from '../../store/registrationStore';
import useNotificationStore from '../../store/notificationStore';

export default function AdminUsers() {
  const {
    users,
    organizerApplications,
    refreshProfiles,
    updateUser,
    deleteUser,
    approveOrganizerApplication,
    declineOrganizerApplication,
    createOrganizerAccount,
  } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { success, error } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [userToDelete, setUserToDelete] = useState(null);
  const [showAddOrganizer, setShowAddOrganizer] = useState(false);
  const [newOrganizer, setNewOrganizer] = useState({ name: '', email: '', password: '' });
  const [addOrganizerError, setAddOrganizerError] = useState('');
  const [addingOrganizer, setAddingOrganizer] = useState(false);

  useEffect(() => {
    refreshProfiles();
    fetchEvents();
    fetchJudges();
    fetchRegistrations();
  }, [fetchEvents, fetchJudges, fetchRegistrations, refreshProfiles]);

  const visibleUsers = users;

  const enrichedUsers = useMemo(() => visibleUsers.map((user) => {
    const eventCount = events.filter((event) =>
      String(event.organizer_id) === String(user.id) ||
      String(event.organizerAuthProfileId) === String(user.id) ||
      String(event.organizerEmail || '').toLowerCase() === String(user.email || '').toLowerCase()
    ).length;
    const judgeProfile = judges.find((judge) =>
      String(judge.id) === String(user.id) ||
      String(judge.authProfileId) === String(user.id) ||
      String(judge.email || '').toLowerCase() === String(user.email || '').toLowerCase()
    );
    const registrationCount = registrations.filter((registration) =>
      String(registration.email || '').toLowerCase() === String(user.email || '').toLowerCase()
    ).length;

    return {
      ...user,
      activityCount: eventCount + Number(judgeProfile?.scoreCount || 0) + registrationCount,
      eventCount,
      scoreCount: Number(judgeProfile?.scoreCount || 0),
      registrationCount,
    };
  }), [events, judges, registrations, visibleUsers]);

  const roleCounts = useMemo(() => enrichedUsers.reduce((counts, user) => {
    const role = user.role || 'participant';
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {}), [enrichedUsers]);

  const filtered = enrichedUsers.filter((user) => {
    if (roleFilter !== 'all' && (user.role || 'participant') !== roleFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [user.name, user.email, user.role, user.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedUsers = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  async function handleRefresh() {
    setBusy('refresh');
    await Promise.all([refreshProfiles(), fetchEvents(), fetchJudges(), fetchRegistrations()]);
    setBusy('');
  }

  async function handleToggleStatus(user) {
    setBusy(`status-${user.id}`);
    try {
      await updateUser(user.id, { status: user.status === 'active' ? 'suspended' : 'active' });
      success(user.status === 'active' ? `Suspended ${user.email}.` : `Reactivated ${user.email}.`);
    } catch (err) {
      error(err.message || 'Unable to update this user.');
    } finally {
      setBusy('');
    }
  }

  async function handleApprove(application) {
    setBusy(`approve-${application.id}`);
    try {
      await approveOrganizerApplication(application.id);
      success(`Approved ${application.email} as an organizer.`);
    } catch (err) {
      error(err.message || 'Unable to approve this application.');
    } finally {
      setBusy('');
    }
  }

  async function handleDecline(application) {
    setBusy(`decline-${application.id}`);
    try {
      await declineOrganizerApplication(application.id);
      success(`Declined ${application.email}'s organizer application.`);
    } catch (err) {
      error(err.message || 'Unable to decline this application.');
    } finally {
      setBusy('');
    }
  }

  function closeAddOrganizer() {
    setShowAddOrganizer(false);
    setNewOrganizer({ name: '', email: '', password: '' });
    setAddOrganizerError('');
  }

  async function handleAddOrganizer(event) {
    event.preventDefault();
    setAddOrganizerError('');

    const name = newOrganizer.name.trim();
    const email = newOrganizer.email.trim().toLowerCase();
    const password = newOrganizer.password;

    if (!name || !email || !password) {
      setAddOrganizerError('Please complete every field.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddOrganizerError('Enter a valid email address.');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setAddOrganizerError('Password must be at least 8 characters and include uppercase, lowercase, and a number.');
      return;
    }

    setAddingOrganizer(true);
    try {
      const result = await createOrganizerAccount({ name, email, password });
      if (!result.success) {
        setAddOrganizerError(result.error || 'Unable to create this organizer account.');
        return;
      }
      success(`Created organizer account for ${email}. Share the email and password with them directly.`);
      closeAddOrganizer();
    } finally {
      setAddingOrganizer(false);
    }
  }

  async function handleDelete(user) {
    setBusy(`delete-${user.id}`);
    try {
      await deleteUser(user.id);
      success(`Deleted ${user.email}.`);
    } catch (err) {
      error(err.message || 'Unable to delete this user.');
    } finally {
      setBusy('');
      setUserToDelete(null);
    }
  }

  return (
    <DashboardLayout title="User Management" subtitle="Manage accounts, roles, and organizer approvals">
      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Delete this user?"
        message={userToDelete ? `This permanently deletes ${userToDelete.email}'s account and profile from FairPlay. Their events, scores, and registrations stay in place. This cannot be undone.` : ''}
        confirmLabel="Delete User"
        onCancel={() => setUserToDelete(null)}
        onConfirm={() => handleDelete(userToDelete)}
      />
      {organizerApplications.length > 0 && (
        <div style={applicationsCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <ShieldAlert size={18} color="#b45309" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Pending Organizer Applications ({organizerApplications.length})
            </h3>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {organizerApplications.map((application) => (
              <div key={application.id} style={applicationRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={avatarStyle}>{String(application.avatar || application.name || application.email || 'U').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{application.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{application.email} · applied {application.joined}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleApprove(application)}
                    disabled={Boolean(busy)}
                    style={approveButtonStyle}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => handleDecline(application)}
                    disabled={Boolean(busy)}
                    style={declineButtonStyle}
                  >
                    <X size={14} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={toolbarStyle}>
        <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, role, or status" aria-label="Search users" style={searchStyle} />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 6, border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowAddOrganizer(true)} style={primaryButtonStyle}>
            <UserPlus size={16} />
            Add Organizer
          </button>
          <button onClick={handleRefresh} disabled={busy === 'refresh'} style={{ ...secondaryButtonStyle, opacity: busy === 'refresh' ? 0.7 : 1 }}>
            <RefreshCw size={16} className={busy === 'refresh' ? 'animate-spin' : undefined} />
            {busy === 'refresh' ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {showAddOrganizer && (
        <div onClick={closeAddOrganizer} style={modalOverlayStyle}>
          <div onClick={(event) => event.stopPropagation()} style={modalCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Add Organizer</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Organizer accounts are admin-only. Set their email and password directly — the account is active immediately.
                </p>
              </div>
              <button type="button" onClick={closeAddOrganizer} style={modalCloseButtonStyle} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddOrganizer} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              <div>
                <label style={modalLabelStyle}>Full Name</label>
                <input
                  value={newOrganizer.name}
                  onChange={(event) => setNewOrganizer((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Juan dela Cruz"
                  style={modalInputStyle}
                  disabled={addingOrganizer}
                  autoFocus
                />
              </div>
              <div>
                <label style={modalLabelStyle}>Email Address</label>
                <input
                  type="email"
                  value={newOrganizer.email}
                  onChange={(event) => setNewOrganizer((current) => ({ ...current, email: event.target.value }))}
                  placeholder="organizer@email.com"
                  style={modalInputStyle}
                  disabled={addingOrganizer}
                />
              </div>
              <div>
                <label style={modalLabelStyle}>Password</label>
                <input
                  type="text"
                  value={newOrganizer.password}
                  onChange={(event) => setNewOrganizer((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters, upper + lower + number"
                  style={modalInputStyle}
                  disabled={addingOrganizer}
                />
              </div>

              {addOrganizerError && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
                  {addOrganizerError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={closeAddOrganizer} disabled={addingOrganizer} style={secondaryButtonStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={addingOrganizer} style={primaryButtonStyle}>
                  <UserPlus size={16} />
                  {addingOrganizer ? 'Creating...' : 'Create Organizer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <div role="tablist" aria-label="Filter by role" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 16, marginBottom: 4, borderBottom: '1px solid #f1f5f9' }}>
          {ROLE_TABS.map((tab) => {
            const count = tab.value === 'all' ? enrichedUsers.length : roleCounts[tab.value] || 0;
            const active = roleFilter === tab.value;
            if (tab.value !== 'all' && count === 0 && !active) return null;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRoleFilter(tab.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: active ? '#2563eb' : '#ffffff',
                  color: active ? '#ffffff' : '#475569',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab.label}
                <span style={{ padding: '1px 7px', borderRadius: 999, background: active ? 'rgba(255,255,255,0.22)' : '#f1f5f9', color: active ? '#ffffff' : '#64748b', fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                {['User', 'Role', 'Status', 'Activity', 'Joined', ''].map((header, i) => (
                  <th key={i} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{header || <span style={{ position: 'absolute', left: -9999 }}>Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8' }}>
                    <Users size={32} style={{ display: 'block', margin: '0 auto 10px' }} />
                    <div style={{ fontWeight: 700, color: '#475569', marginBottom: 4 }}>No users found</div>
                    <div style={{ fontSize: 13 }}>
                      {search || roleFilter !== 'all' ? 'Try a different search or role filter.' : 'User accounts will appear here once people sign up.'}
                    </div>
                  </td>
                </tr>
              ) : pagedUsers.map((user, index) => {
                const role = user.role || 'participant';
                const status = user.status || 'active';
                const theme = ROLE_THEME[role] || ROLE_THEME.participant;
                const activity = [
                  user.eventCount ? `${user.eventCount} event${user.eventCount === 1 ? '' : 's'}` : null,
                  user.scoreCount ? `${user.scoreCount} score${user.scoreCount === 1 ? '' : 's'}` : null,
                  user.registrationCount ? `${user.registrationCount} registration${user.registrationCount === 1 ? '' : 's'}` : null,
                ].filter(Boolean);
                return (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ backgroundColor: '#f8fafc' }}
                    transition={{ delay: index * 0.03 }}
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ ...avatarStyle, background: theme.bg, color: theme.fg }}>
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                          ) : String(user.name || user.email || 'U').charAt(0).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{user.name || 'Unnamed User'}</div>
                          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{user.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ ...pillBase, background: theme.bg, color: theme.fg }}>{theme.label}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ ...pillBase, ...statusTheme(status), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {activity.length > 0 ? activity.join(' · ') : <span style={{ color: '#94a3b8' }}>No activity yet</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJoined(user.joined)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          disabled={Boolean(busy) || status === 'pending'}
                          style={{
                            ...actionButtonStyle,
                            color: status === 'active' ? '#b45309' : '#15803d',
                            opacity: busy || status === 'pending' ? 0.5 : 1,
                            cursor: busy || status === 'pending' ? 'not-allowed' : 'pointer',
                          }}
                          title={status === 'pending' ? 'Use the pending applications panel above to approve or decline' : undefined}
                        >
                          {status === 'active' ? <Lock size={14} /> : <Unlock size={14} />}
                          {busy === `status-${user.id}` ? 'Saving...' : status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setUserToDelete(user)}
                          disabled={Boolean(busy)}
                          style={{ ...iconButtonStyle, background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', opacity: busy ? 0.5 : 1 }}
                          aria-label={`Delete ${user.name || user.email}`}
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 16, marginTop: 4, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Showing <strong style={{ color: '#0f172a' }}>{pageStart + 1}–{pageStart + pagedUsers.length}</strong> of <strong style={{ color: '#0f172a' }}>{filtered.length}</strong> users
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{ ...pageButtonStyle, opacity: currentPage === 1 ? 0.45 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                  <button
                    key={number}
                    onClick={() => setPage(number)}
                    aria-current={number === currentPage ? 'page' : undefined}
                    style={number === currentPage
                      ? { ...pageButtonStyle, background: '#2563eb', borderColor: '#2563eb', color: '#ffffff' }
                      : pageButtonStyle}
                  >
                    {number}
                  </button>
                ))}
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{ ...pageButtonStyle, opacity: currentPage === totalPages ? 0.45 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const PAGE_SIZE = 5;
const pageButtonStyle = { minWidth: 36, height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const applicationsCardStyle = { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 18, padding: 20, boxShadow: '0 12px 32px rgba(180,83,9,0.06)', marginBottom: 20 };
const applicationRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#ffffff', border: '1px solid #fde68a', flexWrap: 'wrap' };
const approveButtonStyle = { padding: '8px 14px', borderRadius: 10, background: '#16a34a', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const declineButtonStyle = { padding: '8px 14px', borderRadius: 10, background: '#fef2f2', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const toolbarStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,0.06)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 };
const searchStyle = { padding: '10px 14px 10px 34px', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%' };
const secondaryButtonStyle = { padding: '10px 16px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const primaryButtonStyle = { padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400, display: 'grid', placeItems: 'center', padding: 20 };
const modalCardStyle = { width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: 18, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 24px 80px rgba(15,23,42,0.22)' };
const modalCloseButtonStyle = { width: 32, height: 32, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 };
const modalLabelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 };
const modalInputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 14, outline: 'none' };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', position: 'relative' };
const tdStyle = { padding: '14px 16px', fontSize: 13, color: '#475569', verticalAlign: 'middle' };
const avatarStyle = { width: 36, height: 36, borderRadius: 10, background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0, overflow: 'hidden' };
const iconButtonStyle = { width: 34, height: 34, borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' };
const actionButtonStyle = { height: 34, padding: '0 12px', borderRadius: 9, background: '#ffffff', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const pillBase = { padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };

const ROLE_THEME = {
  admin: { label: 'Admin', bg: '#e0e7ff', fg: '#3730a3' },
  organizer: { label: 'Organizer', bg: '#dbeafe', fg: '#1d4ed8' },
  judge: { label: 'Judge', bg: '#ede9fe', fg: '#6d28d9' },
  participant: { label: 'Participant', bg: '#f1f5f9', fg: '#334155' },
  'institute-coordinator': { label: 'Institute Coordinator', bg: '#e0f2fe', fg: '#075985' },
  'sports-head': { label: 'Sports Head', bg: '#ffedd5', fg: '#9a3412' },
  osds: { label: 'OSDS', bg: '#ccfbf1', fg: '#115e59' },
};

const ROLE_TABS = [
  { value: 'all', label: 'All' },
  ...Object.entries(ROLE_THEME).map(([value, theme]) => ({ value, label: theme.label })),
];

function statusTheme(status) {
  if (status === 'active') return { background: '#dcfce7', color: '#15803d' };
  if (status === 'pending') return { background: '#fef3c7', color: '#b45309' };
  return { background: '#fee2e2', color: '#b91c1c' };
}

function formatJoined(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
