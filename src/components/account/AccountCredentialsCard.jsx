import { useEffect, useState } from 'react';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';

// Same rule the organizer/admin account forms use everywhere else.
function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password needs at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password needs at least one number.';
  return '';
}

// Email + password change for the signed-in user. Both changes ask for the
// current password first (checked in authStore.updateCredentials).
export default function AccountCredentialsCard() {
  const { user, updateCredentials } = useAuthStore();
  const { success, error } = useNotificationStore();

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    setNewEmail(user?.email || '');
  }, [user?.email]);

  const emailChanged = Boolean(newEmail.trim()) && newEmail.trim().toLowerCase() !== String(user?.email || '').toLowerCase();

  async function handleUpdateEmail() {
    if (!emailChanged) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      error('Enter a valid email address.');
      return;
    }
    setUpdatingEmail(true);
    try {
      await updateCredentials({ email: newEmail.trim(), currentPassword: emailPassword });
      success('Check your new email inbox for a confirmation link — the change takes effect once you click it.');
      setEmailPassword('');
    } catch (err) {
      error(err.message || 'Unable to update your email.');
    } finally {
      setUpdatingEmail(false);
    }
  }

  async function handleUpdatePassword() {
    const problem = passwordProblem(newPassword);
    if (problem) {
      error(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      error('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      error('Your new password must be different from your current one.');
      return;
    }
    setUpdatingPassword(true);
    try {
      await updateCredentials({ password: newPassword, currentPassword });
      success('Password updated. Use your new password the next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      error(err.message || 'Unable to update your password.');
    } finally {
      setUpdatingPassword(false);
    }
  }

  const passwordType = showPasswords ? 'text' : 'password';
  const newPasswordProblem = newPassword ? passwordProblem(newPassword) : '';
  const mismatch = Boolean(confirmPassword) && confirmPassword !== newPassword;
  const canUpdatePassword = Boolean(currentPassword && newPassword && confirmPassword) && !newPasswordProblem && !mismatch;

  return (
    <div style={{ ...cardStyle, display: 'grid', gap: 20 }}>
      <div>
        <h3 style={headingStyle}>
          <i className="bi bi-shield-lock-fill" style={{ color: '#2563eb' }} /> Account Credentials
        </h3>
        <p style={mutedStyle}>For your security, you'll need your current password to change your email or password.</p>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <p style={sectionTitleStyle}>Email Address</p>
        <div>
          <label htmlFor="account-email" style={labelStyle}>New email</label>
          <input id="account-email" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} style={fieldStyle} />
        </div>
        {emailChanged && (
          <div>
            <label htmlFor="account-email-password" style={labelStyle}>Current password</label>
            <input id="account-email-password" type="password" autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} style={fieldStyle} />
          </div>
        )}
        <button
          type="button"
          onClick={handleUpdateEmail}
          disabled={updatingEmail || !emailChanged || !emailPassword}
          style={{ ...buttonStyle, justifySelf: 'start', opacity: updatingEmail || !emailChanged || !emailPassword ? 0.6 : 1 }}
        >
          {updatingEmail ? 'Sending...' : 'Update Email'}
        </button>
        <p style={{ ...mutedStyle, fontSize: 12 }}>We'll send a confirmation link to the new address. Your email only changes after you click it.</p>
      </div>

      <div style={{ paddingTop: 16, borderTop: '1px solid #e5efff', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={sectionTitleStyle}>Change Password</p>
          <button type="button" onClick={() => setShowPasswords((value) => !value)} style={linkButtonStyle}>
            <i className={showPasswords ? 'bi bi-eye-slash' : 'bi bi-eye'} /> {showPasswords ? 'Hide' : 'Show'}
          </button>
        </div>
        <div>
          <label htmlFor="account-current-password" style={labelStyle}>Current password</label>
          <input id="account-current-password" type={passwordType} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="account-new-password" style={labelStyle}>New password</label>
          <input id="account-new-password" type={passwordType} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8+ characters, upper & lowercase, a number" style={fieldStyle} />
          {newPasswordProblem && <p style={hintErrorStyle}>{newPasswordProblem}</p>}
        </div>
        <div>
          <label htmlFor="account-confirm-password" style={labelStyle}>Confirm new password</label>
          <input id="account-confirm-password" type={passwordType} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={fieldStyle} />
          {mismatch && <p style={hintErrorStyle}>Passwords do not match.</p>}
        </div>
        <button
          type="button"
          onClick={handleUpdatePassword}
          disabled={updatingPassword || !canUpdatePassword}
          style={{ ...buttonStyle, justifySelf: 'start', opacity: updatingPassword || !canUpdatePassword ? 0.6 : 1 }}
        >
          {updatingPassword ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 28,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const headingStyle = {
  margin: '0 0 6px',
  color: '#0f172a',
  fontSize: 16,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const mutedStyle = { margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.5 };

const sectionTitleStyle = { fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 };

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 };

const hintErrorStyle = { margin: '6px 0 0', fontSize: 12, color: '#dc2626' };

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

const linkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  color: '#2563eb',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
};
