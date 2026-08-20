import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

export default function Register() {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'organizer' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Please fill in all required fields');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    const result = await register({ name: form.name, email: form.email, password: form.password, role: 'organizer' });
    if (!result.success) {
      setError(result.error || 'Registration failed.');
      return;
    }
    if (result.requiresEmailConfirmation) {
      setNotice(result.message || 'Check your email to confirm your account, then sign in.');
      return;
    }
    navigate('/organizer', { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 480,
          background: '#ffffff',
          border: '1px solid #dbeafe',
          borderRadius: 20, padding: 32,
          boxShadow: '0 20px 60px rgba(37,99,235,0.12)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
            margin: '0 auto 12px',
            boxShadow: '0 10px 30px rgba(37,99,235,0.25)',
          }}>
            F
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>Create Account</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Join FairPlay today</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: '#fef2f2', border: '1px solid #fecaca',
            color: '#dc2626', fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        {notice ? (
          <div style={{ textAlign: 'center', padding: '20px 4px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
              background: '#dcfce7', color: '#15803d', display: 'grid', placeItems: 'center', fontSize: 22,
            }}>
              <i className="bi bi-envelope-check" />
            </div>
            <p style={{ color: '#0f172a', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{notice}</p>
            <Link to="/login" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
              Go to Sign In
            </Link>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter your name"
                style={registerInputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Enter your email"
                style={registerInputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Create a password (8+ characters)"
                style={registerInputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Confirm Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                style={registerInputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Role</label>
              <div style={{ ...registerInputStyle, color: '#64748b' }}>
                Event Organizer only - redirects to organizer dashboard after registration
              </div>
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: '100%', marginTop: 24, padding: '12px 24px',
              background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(37,99,235,0.25)',
            }}
          >
            Create Account
          </button>
        </form>
        )}

        {!notice && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 20 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}

const registerInputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: '#f8fafc', border: '1px solid #cbd5e1',
  color: '#0f172a', fontSize: 14, outline: 'none',
};
