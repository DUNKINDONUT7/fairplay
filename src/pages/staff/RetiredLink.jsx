import { Link } from 'react-router-dom';

// Old shared judge/scorer links (session QR codes, open judge links, scorer
// tokens) let anyone who had the link type any name and score. They were
// replaced by personal accounts (W01 / W10), so these addresses now explain
// where to go instead of opening a scoring page.
export default function RetiredLink() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#ffffff', borderRadius: 20, border: '1px solid #dbeafe', boxShadow: '0 24px 60px rgba(37,99,235,0.12)', padding: 28 }}>
        <img src="/logo.svg" alt="FairPlay" style={{ width: 120, display: 'block', marginBottom: 18 }} />
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>This link no longer opens scoring</h1>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          Judges and scorers now sign in with their own FairPlay account, so every score is tied to the person who gave it.
          Open the <strong>activation link</strong> from your invitation email, or sign in if you already activated it.
          If you don&apos;t have an invitation, ask the event organizer to assign you.
        </p>
        <Link
          to="/?modal=login"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#ffffff', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}
        >
          <i className="bi bi-box-arrow-in-right" /> Sign in
        </Link>
      </div>
    </div>
  );
}
