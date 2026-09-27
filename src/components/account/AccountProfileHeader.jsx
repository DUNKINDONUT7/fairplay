import { useRef, useState } from 'react';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';

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
  return String(role || 'user')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Avatar (with upload), name, role and email of the signed-in user.
export default function AccountProfileHeader() {
  const { user, uploadAvatar } = useAuthStore();
  const { success, error } = useNotificationStore();
  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const avatarSrc = avatarPreview || user?.avatarUrl;

  return (
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
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          title="Change profile picture"
          aria-label="Change profile picture"
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
        <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{user?.name || 'FairPlay User'}</p>
        <p style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, margin: '2px 0' }}>{roleLabel(user?.role)}</p>
        <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}
        >
          {uploadingAvatar ? 'Uploading...' : 'Change profile picture'}
        </button>
      </div>
    </div>
  );
}
