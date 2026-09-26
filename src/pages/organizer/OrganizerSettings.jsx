import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useCertificateStore from '../../store/certificateStore';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

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
  const { user, updateUser, updateCredentials, uploadAvatar } = useAuthStore();
  const [form, setForm] = useState({
    displayName: user?.name || '',
    certificateTitle: template.title,
    signerName: template.signerName,
    signerRole: template.signerRole,
    organizationName: template.organizationName,
    certificateMessage: template.message,
  });
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    setNewEmail(user?.email || '');
  }, [user?.email]);

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

  async function handleAvatarSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      error('Please choose an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      error('Image is too large — please choose one under 3MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setUploadingAvatar(true);
    try {
      await uploadAvatar(user.id, file);
      success('Profile picture updated.');
    } catch (err) {
      error(err.message || 'Unable to upload the image.');
    } finally {
      setAvatarPreview('');
      setUploadingAvatar(false);
      URL.revokeObjectURL(previewUrl);
    }
  }

  async function handleUpdateEmail() {
    if (!newEmail.trim() || newEmail.trim() === user?.email) return;
    setUpdatingEmail(true);
    try {
      await updateCredentials({ email: newEmail.trim() });
      success('Check your new email inbox for a confirmation link — the change takes effect once you click it.');
    } catch (err) {
      error(err.message || 'Unable to update your email.');
    } finally {
      setUpdatingEmail(false);
    }
  }

  async function handleUpdatePassword() {
    if (newPassword.length < 8) {
      error('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      error('Passwords do not match.');
      return;
    }
    setUpdatingPassword(true);
    try {
      await updateCredentials({ password: newPassword });
      success('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      error(err.message || 'Unable to update your password.');
    } finally {
      setUpdatingPassword(false);
    }
  }

  const avatarSrc = avatarPreview || user?.avatarUrl;

  return (
    <DashboardLayout title="Profile Settings" subtitle="Manage organizer preferences and automation templates">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, alignItems: 'start', maxWidth: 1200 }}>
        <div style={cardStyle}>

          {/* Profile identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid #e5efff' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: avatarSrc ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                color: '#ffffff', fontSize: 26, fontWeight: 800, border: '3px solid #ffffff',
                boxShadow: '0 8px 24px rgba(37,99,235,0.2)',
              }}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploadingAvatar ? 0.5 : 1 }} />
                ) : (
                  getInitials(user?.name, user?.email)
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Change profile picture"
                style={{
                  position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: '50%',
                  background: '#2563eb', color: '#fff', border: '2px solid #fff', cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                }}
              >
                <i className={uploadingAvatar ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-camera-fill'} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} style={{ display: 'none' }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{user?.name || 'Organizer User'}</p>
              <p style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, margin: '2px 0' }}>{roleLabel(user?.role)}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}
              >
                {uploadingAvatar ? 'Uploading...' : 'Change profile picture'}
              </button>
            </div>
          </div>

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

        {/* Account credentials */}
        <div style={{ ...cardStyle, display: 'grid', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="bi bi-shield-lock-fill" style={{ color: '#2563eb' }} /> Account Credentials
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Changing your email requires confirming a link sent to the new address before it takes effect.</p>
          </div>

          <div>
            <label style={labelStyle}>Email Address</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 220 }} />
              <button
                onClick={handleUpdateEmail}
                disabled={updatingEmail || !newEmail.trim() || newEmail.trim() === user?.email}
                style={{ ...buttonStyle, opacity: updatingEmail || !newEmail.trim() || newEmail.trim() === user?.email ? 0.6 : 1 }}
              >
                {updatingEmail ? 'Sending...' : 'Update Email'}
              </button>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid #e5efff', display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Change Password</p>
            <div>
              <label style={labelStyle}>New Password</label>
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={fieldStyle} />
            </div>
            <button
              onClick={handleUpdatePassword}
              disabled={updatingPassword || !newPassword}
              style={{ ...buttonStyle, justifySelf: 'start', opacity: updatingPassword || !newPassword ? 0.6 : 1 }}
            >
              {updatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
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
