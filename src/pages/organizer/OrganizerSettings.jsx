import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useCertificateStore from '../../store/certificateStore';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';

function getInitials(name, email) {
  const source = String(name || email || 'User').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function roleLabel(role) {
  return String(role || 'organizer')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function OrganizerSettings() {
  const { template, updateTemplate } = useCertificateStore();
  const { success, error } = useNotificationStore();
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({
    displayName: user?.name || '',
    email: user?.email || '',
    certificateTitle: template.title,
    signerName: template.signerName,
    signerRole: template.signerRole,
    organizationName: template.organizationName,
    certificateMessage: template.message,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (user?.id) {
        await updateUser(user.id, { name: form.displayName, email: form.email });
      }
      updateTemplate({
        title: form.certificateTitle,
        signerName: form.signerName,
        signerRole: form.signerRole,
        organizationName: form.organizationName,
        message: form.certificateMessage,
      });
      success('Organizer settings and certificate template saved.');
    } catch (err) {
      error(err.message || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Profile Settings" subtitle="Manage organizer preferences and automation templates">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 600px)', gap: 20 }}>
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, padding: 28, boxShadow: '0 20px 45px rgba(37,99,235,0.08)' }}>

          {/* Profile identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid #e5efff' }}>
            <div style={{
              width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user?.avatarUrl ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
              color: '#ffffff', fontSize: 26, fontWeight: 800, border: '3px solid #ffffff',
              boxShadow: '0 8px 24px rgba(37,99,235,0.2)',
            }}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getInitials(user?.name, user?.email)
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{user?.name || 'Organizer User'}</p>
              <p style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, margin: '2px 0' }}>{roleLabel(user?.role)}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Display Name</label>
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Email</label>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={fieldStyle} />
            </div>

            <div style={{ paddingTop: 8, borderTop: '1px solid #e5efff' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Certificate Automation Template</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Certificate Title</label>
                  <input value={form.certificateTitle} onChange={(event) => setForm({ ...form, certificateTitle: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Signer Name</label>
                  <input value={form.signerName} onChange={(event) => setForm({ ...form, signerName: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Signer Role</label>
                  <input value={form.signerRole} onChange={(event) => setForm({ ...form, signerRole: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Organization Name</label>
                  <input value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Certificate Message</label>
                  <textarea value={form.certificateMessage} onChange={(event) => setForm({ ...form, certificateMessage: event.target.value })} rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ marginTop: 24, padding: '12px 32px', borderRadius: 12, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 16px 32px rgba(37,99,235,0.18)' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}

const fieldStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 14,
  outline: 'none',
  boxShadow: 'inset 0 1px 2px rgba(148,163,184,0.08)',
};
