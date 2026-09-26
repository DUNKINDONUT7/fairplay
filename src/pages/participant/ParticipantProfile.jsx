import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useCertificateStore from '../../store/certificateStore';
import useNotificationStore from '../../store/notificationStore';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export default function ParticipantProfile() {
  const location = useLocation();
  const { user, updateUser, updateCredentials, uploadAvatar } = useAuthStore();
  const { success, error } = useNotificationStore();
  const { certificates, fetchCertificates, getCertificateById, getCertificatesByRecipient } = useCertificateStore();
  const certificateId = location.state?.certificateId || new URLSearchParams(location.search).get('certificateId');
  const [selectedCertificate, setSelectedCertificate] = useState(null);

  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [details, setDetails] = useState({ bio: user?.bio || '', phone: user?.phone || '' });
  const [savingDetails, setSavingDetails] = useState(false);

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    setDetails({ bio: user?.bio || '', phone: user?.phone || '' });
    setNewEmail(user?.email || '');
  }, [user?.bio, user?.phone, user?.email]);

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
      setAvatarPreview('');
    } finally {
      setUploadingAvatar(false);
      URL.revokeObjectURL(previewUrl);
    }
  }

  async function handleSaveDetails() {
    if (!user?.id) return;
    setSavingDetails(true);
    try {
      await updateUser(user.id, { bio: details.bio, phone: details.phone });
      success('Profile details saved.');
    } catch (err) {
      error(err.message || 'Unable to save your profile details.');
    } finally {
      setSavingDetails(false);
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

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  useEffect(() => {
    if (certificateId) {
      setSelectedCertificate(getCertificateById(certificateId));
      return;
    }

    const recipientName = user?.name || '';
    const recipientCertificates = getCertificatesByRecipient(recipientName);
    setSelectedCertificate(recipientCertificates[0] || null);
  }, [certificateId, certificates, getCertificateById, getCertificatesByRecipient, user?.name]);

  const myCertificates = useMemo(() => {
    const recipientName = user?.name || '';
    return getCertificatesByRecipient(recipientName);
  }, [certificates, getCertificatesByRecipient, user?.name]);

  const renderCertificateCard = (certificate) => {
    if (!certificate) {
      return (
        <div style={{ padding: 32, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', textAlign: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: '#eff6ff', color: '#93c5fd', fontSize: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <i className="bi bi-award" />
          </span>
          <h3 style={{ color: '#0f172a', fontSize: 17, marginBottom: 8 }}>No certificate available yet</h3>
          <p style={{ color: '#64748b', margin: 0, fontSize: 13, lineHeight: 1.6 }}>Certificates are generated automatically when your tournament is finalized and the winner is confirmed.</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 18, padding: 24, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="bi bi-patch-check-fill" />
          </span>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: 20, fontWeight: 800 }}>{certificate.eventTitle}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Certificate issued to {certificate.recipientName}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Category</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.category}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Issued</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{new Date(certificate.issuedAt).toLocaleDateString()}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Placement</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.placement || 'Champion'}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Verification</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.verificationCode}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => navigator.clipboard.writeText(certificate.verificationUrl)}
            style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <i className="bi bi-link-45deg" /> Copy verification link
          </motion.button>
          <motion.a
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            href={certificate.verificationUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 18px', borderRadius: 12, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}
          >
            <i className="bi bi-box-arrow-up-right" /> Open certificate details
          </motion.a>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout title="My Profile" subtitle="View your details and any available certificates">
      <div style={{ display: 'grid', gap: 24 }}>
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', borderRadius: 16, padding: 28, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span style={{
                width: 72, height: 72, borderRadius: 16, overflow: 'hidden',
                background: (avatarPreview || user?.avatarUrl) ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, fontWeight: 700, color: '#fff', boxShadow: '0 8px 20px rgba(37,99,235,0.25)',
              }}>
                {avatarPreview || user?.avatarUrl ? (
                  <img src={avatarPreview || user.avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploadingAvatar ? 0.5 : 1 }} />
                ) : (
                  user?.name?.charAt(0) || 'P'
                )}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Change profile picture"
                style={{
                  position: 'absolute', bottom: -6, right: -6, width: 28, height: 28, borderRadius: '50%',
                  background: '#2563eb', color: '#fff', border: '2px solid #fff', cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                }}
              >
                <i className={uploadingAvatar ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-camera-fill'} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} style={{ display: 'none' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{user?.name || 'Participant User'}</h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-person-badge" /> Participant profile
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14, paddingTop: 20, borderTop: '1px solid #e5efff' }}>
            <div>
              <label style={labelStyle}>About Me</label>
              <textarea
                value={details.bio}
                onChange={(event) => setDetails((prev) => ({ ...prev, bio: event.target.value }))}
                placeholder="Tell organizers and teammates a bit about yourself..."
                rows={3}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                value={details.phone}
                onChange={(event) => setDetails((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="e.g. 0917 123 4567"
                style={fieldStyle}
              />
            </div>
            <button onClick={handleSaveDetails} disabled={savingDetails} style={{ ...saveButtonStyle, justifySelf: 'start' }}>
              {savingDetails ? 'Saving...' : 'Save Profile Details'}
            </button>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', borderRadius: 16, padding: 28, maxWidth: 720, display: 'grid', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="bi bi-shield-lock-fill" style={{ color: '#2563eb' }} /> Account Credentials
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Changing your email requires confirming a link sent to the new address before it takes effect.</p>
          </div>

          <div>
            <label style={labelStyle}>Email Address</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 220 }} />
              <button onClick={handleUpdateEmail} disabled={updatingEmail || !newEmail.trim() || newEmail.trim() === user?.email} style={saveButtonStyle}>
                {updatingEmail ? 'Sending...' : 'Update Email'}
              </button>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid #e5efff', display: 'grid', gap: 12 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={fieldStyle} />
            </div>
            <button onClick={handleUpdatePassword} disabled={updatingPassword || !newPassword} style={{ ...saveButtonStyle, justifySelf: 'start' }}>
              {updatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 720, display: 'grid', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="bi bi-award-fill" style={{ color: '#d97706' }} /> Certificates
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Your generated certificates appear here after event completion.</p>
          </div>
          {renderCertificateCard(selectedCertificate)}

          {myCertificates.length > 1 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <h4 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 700 }}>Other certificates</h4>
              {myCertificates.filter((cert) => cert.id !== selectedCertificate?.id).map((certificate) => (
                <motion.button
                  key={certificate.id}
                  whileHover={{ scale: 1.008, background: '#dbeafe' }}
                  whileTap={{ scale: 0.995 }}
                  onClick={() => setSelectedCertificate(certificate)}
                  style={{ textAlign: 'left', padding: '14px 18px', borderRadius: 14, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <i className="bi bi-award" />
                  {certificate.eventTitle} - {certificate.category} - {certificate.placement || 'Champion'}
                </motion.button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}

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
const saveButtonStyle = {
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
