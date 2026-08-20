import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Trash2, Search, RefreshCw } from 'lucide-react';
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
    refreshProfiles,
    updateUser,
    deleteUser,
    authMode,
  } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { judges, fetchJudges } = useJudgeStore();
  const { registrations, fetchRegistrations } = useRegistrationStore();
  const { success, error } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [userToDelete, setUserToDelete] = useState(null);

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

  const filtered = enrichedUsers.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [user.name, user.email, user.role, user.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
  });

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
    <DashboardLayout title="User Management" subtitle={`Connected user records from ${authMode} mode`}>
      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Delete this user?"
        message={userToDelete ? `This permanently deletes ${userToDelete.email}'s account and profile from FairPlay. Their events, scores, and registrations stay in place. This cannot be undone.` : ''}
        confirmLabel="Delete User"
        onCancel={() => setUserToDelete(null)}
        onConfirm={() => handleDelete(userToDelete)}
      />
      <div style={toolbarStyle}>
        <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users by name, email, role..." style={searchStyle} />
        </div>
        <button onClick={handleRefresh} disabled={busy === 'refresh'} style={secondaryButtonStyle}>
          <RefreshCw size={16} />
          Refresh Database
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                {['Name', 'Email', 'Role', 'Status', 'System Activity', 'Joined', 'Actions'].map((header) => (
                  <th key={header} style={thStyle}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No user records found.</td>
                </tr>
              ) : filtered.map((user, index) => (
                <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.03 }} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={avatarStyle}>{String(user.avatar || user.name || user.email || 'U').charAt(0).toUpperCase()}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{user.name || 'Unnamed User'}</span>
                  </td>
                  <td style={tdStyle}>{user.email || 'No email'}</td>
                  <td style={{ padding: '12px 16px' }}><span style={rolePill(user.role)}>{user.role || 'participant'}</span></td>
                  <td style={{ padding: '12px 16px' }}><span style={statusPill(user.status)}>{user.status || 'active'}</span></td>
                  <td style={tdStyle}>
                    <div>{user.eventCount} events</div>
                    <div>{user.scoreCount} scores</div>
                    <div>{user.registrationCount} registrations</div>
                  </td>
                  <td style={tdStyle}>{user.joined || 'From database'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleToggleStatus(user)} disabled={Boolean(busy)} style={iconButtonStyle} aria-label="Toggle user status">
                        <Lock size={14} />
                      </button>
                      <button onClick={() => setUserToDelete(user)} disabled={Boolean(busy)} style={{ ...iconButtonStyle, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }} aria-label="Delete user">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 24, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' };
const toolbarStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 10px 24px rgba(15,23,42,0.06)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 };
const searchStyle = { padding: '10px 14px 10px 34px', borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, outline: 'none', width: '100%' };
const secondaryButtonStyle = { padding: '10px 16px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' };
const tdStyle = { padding: '12px 16px', fontSize: 13, color: '#64748b', verticalAlign: 'top' };
const avatarStyle = { width: 32, height: 32, borderRadius: 10, background: 'rgba(37,99,235,0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 };
const iconButtonStyle = { width: 32, height: 32, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' };
function rolePill(role = 'participant') {
  const color = role === 'admin' ? '#1d4ed8' : role === 'organizer' ? '#0284c7' : role === 'judge' ? '#2563eb' : '#475569';
  return { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(37,99,235,0.10)', color };
}

function statusPill(status = 'active') {
  if (status === 'pending') {
    return { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.14)', color: '#b45309' };
  }
  return { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: status === 'active' ? 'rgba(37,99,235,0.12)' : 'rgba(239,68,68,0.12)', color: status === 'active' ? '#1d4ed8' : '#ef4444' };
}
