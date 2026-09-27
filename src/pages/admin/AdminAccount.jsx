import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import AccountProfileHeader from '../../components/account/AccountProfileHeader';
import AccountCredentialsCard from '../../components/account/AccountCredentialsCard';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';

export default function AdminAccount() {
  const { user, updateUser } = useAuthStore();
  const { success, error } = useNotificationStore();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: user?.name || '', phone: user?.phone || '' });
  }, [user?.name, user?.phone]);

  const changed = form.name.trim() !== (user?.name || '') || form.phone.trim() !== (user?.phone || '');

  async function handleSave() {
    if (!form.name.trim()) {
      error('Display name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateUser(user.id, { name: form.name.trim(), phone: form.phone.trim() });
      success('Profile saved.');
    } catch (err) {
      error(err.message || 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout title="My Account" subtitle="Your admin profile, email and password">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, alignItems: 'start', maxWidth: 1200 }}>
        <div style={cardStyle}>
          <AccountProfileHeader />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="admin-display-name" style={labelStyle}>Display name</label>
              <input id="admin-display-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label htmlFor="admin-phone" style={labelStyle}>Phone number <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
              <input id="admin-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="e.g. 0917 123 4567" style={fieldStyle} />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !changed}
            style={{ ...buttonStyle, marginTop: 24, padding: '12px 32px', cursor: saving || !changed ? 'not-allowed' : 'pointer', opacity: saving || !changed ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <AccountCredentialsCard />
      </div>
    </DashboardLayout>
  );
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 28,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 };

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 14,
  outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(148,163,184,0.08)',
};

const buttonStyle = {
  padding: '10px 20px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  border: 'none',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
