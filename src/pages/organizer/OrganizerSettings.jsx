import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useCertificateStore from '../../store/certificateStore';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';
import AccountProfileHeader from '../../components/account/AccountProfileHeader';
import AccountCredentialsCard from '../../components/account/AccountCredentialsCard';

export default function OrganizerSettings() {
  const { template, updateTemplate } = useCertificateStore();
  const { success, error } = useNotificationStore();
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({
    displayName: user?.name || '',
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
        await updateUser(user.id, { name: form.displayName });
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, alignItems: 'start', maxWidth: 1200 }}>
        <div style={cardStyle}>

          <AccountProfileHeader />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Display Name</label>
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} style={fieldStyle} />
            </div>

            <div style={{ paddingTop: 8, borderTop: '1px solid #e5efff' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Certificate Automation Template</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Certificate Title</label>
                  <input value={form.certificateTitle} onChange={(event) => setForm({ ...form, certificateTitle: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Signer Name</label>
                  <input value={form.signerName} onChange={(event) => setForm({ ...form, signerName: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Signer Role</label>
                  <input value={form.signerRole} onChange={(event) => setForm({ ...form, signerRole: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Organization Name</label>
                  <input value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Certificate Message</label>
                  <textarea value={form.certificateMessage} onChange={(event) => setForm({ ...form, certificateMessage: event.target.value })} rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...buttonStyle, marginTop: 24, padding: '12px 32px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 16px 32px rgba(37,99,235,0.18)' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
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
