import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import CertificateRenderer from '../../components/certificates/CertificateRenderer';
import { exportCertificateToPDF } from '../organizer/OrganizerCertificates';
import useCertificateStore from '../../store/certificateStore';

export default function CertificateVerify() {
  const { code } = useParams();
  const { certificates, fetchCertificates } = useCertificateStore();
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const certRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    fetchCertificates().finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, [fetchCertificates]);

  const certificate = certificates.find(
    (c) => String(c.verificationCode).toUpperCase() === String(code).toUpperCase()
  );

  async function handleDownload() {
    if (!certRef.current) return;
    setDownloading(true);
    try {
      await exportCertificateToPDF(certRef.current, `${certificate.recipientName}-certificate.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.brand}>
          <span style={S.brandIcon}>F</span>
          <span style={S.brandText}>FairPlay</span>
        </Link>
      </header>

      <main style={S.main}>
        {!loaded ? (
          <div style={S.centerNote}>
            <i className="bi bi-arrow-repeat" style={{ fontSize: 32, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p>Looking up certificate...</p>
          </div>
        ) : !certificate ? (
          <div style={S.centerNote}>
            <i className="bi bi-x-circle" style={{ fontSize: 40, color: '#ef4444' }} />
            <h1 style={S.notFoundTitle}>Certificate not found</h1>
            <p>No certificate matches code <strong>{code}</strong>. Check the code and try again.</p>
          </div>
        ) : (
          <>
            <div style={S.verifiedPill}>
              <i className="bi bi-patch-check-fill" /> Verified certificate — {certificate.eventTitle}
            </div>
            <div style={S.certWrap}>
              <CertificateRenderer ref={certRef} certificate={certificate} template={certificate.template} />
            </div>
            <button onClick={handleDownload} disabled={downloading} style={S.downloadBtn}>
              <i className={downloading ? 'bi bi-arrow-repeat' : 'bi bi-download'} />
              {downloading ? 'Preparing PDF...' : 'Download PDF'}
            </button>
            <p style={S.codeNote}>Verification code: <span className="mono">{certificate.verificationCode}</span></p>
          </>
        )}
      </main>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg,#f8fbff,#eff6ff)', color: '#0f172a' },
  header: { height: 72, background: 'rgba(255,255,255,0.94)', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'center', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(16px)' },
  brand: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
  brandIcon: { width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 },
  brandText: { color: '#0f172a', fontSize: 20, fontWeight: 900 },
  main: { maxWidth: 980, margin: '0 auto', padding: '48px 24px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 },
  centerNote: { textAlign: 'center', color: '#64748b', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  notFoundTitle: { color: '#0f172a', fontSize: 22, fontWeight: 800, margin: 0 },
  verifiedPill: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 13 },
  certWrap: { width: '100%', maxWidth: 900, boxShadow: '0 24px 60px rgba(37,99,235,0.14)', borderRadius: 16, overflow: 'hidden' },
  downloadBtn: { padding: '13px 22px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  codeNote: { color: '#94a3b8', fontSize: 12 },
};
