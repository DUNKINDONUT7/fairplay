import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useCertificateStore from '../../store/certificateStore';

export default function ParticipantProfile() {
  const location = useLocation();
  const { user } = useAuthStore();
  const { certificates, fetchCertificates, getCertificateById, getCertificatesByRecipient } = useCertificateStore();
  const certificateId = location.state?.certificateId || new URLSearchParams(location.search).get('certificateId');
  const [selectedCertificate, setSelectedCertificate] = useState(null);

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
        <div style={{ padding: 24, borderRadius: 18, background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)' }}>
          <h3 style={{ color: '#f8fafc', fontSize: 18, marginBottom: 12 }}>No certificate available yet.</h3>
          <p style={{ color: '#94a3b8', margin: 0 }}>Certificates are generated automatically when your tournament is finalized and the winner is confirmed.</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 18, padding: 24, borderRadius: 18, background: 'rgba(15,20,25,0.7)', border: '1px solid rgba(6,182,212,0.15)' }}>
        <div>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: 22, fontWeight: 800 }}>{certificate.eventTitle}</h2>
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 13 }}>Certificate issued to {certificate.recipientName}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Category</p>
            <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{certificate.category}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Issued</p>
            <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{new Date(certificate.issuedAt).toLocaleDateString()}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Placement</p>
            <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{certificate.placement || 'Champion'}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Verification</p>
            <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{certificate.verificationCode}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button
            onClick={() => navigator.clipboard.writeText(certificate.verificationUrl)}
            style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.08)', color: '#e0f2fe', fontWeight: 700, cursor: 'pointer' }}
          >
            Copy verification link
          </button>
          <a
            href={certificate.verificationUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', justifyContent: 'center', padding: '12px 18px', borderRadius: 12, background: 'linear-gradient(135deg, #06b6d4, #22d3ee)', color: '#0f172a', fontWeight: 700, textDecoration: 'none' }}
          >
            Open certificate details
          </a>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout title="My Profile" subtitle="View your details and any available certificates">
      <div style={{ display: 'grid', gap: 24 }}>
        <div style={{ background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 16, padding: 28, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <span style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #06b6d4, #0084ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: '#000' }}>
              {user?.name?.charAt(0) || 'P'}
            </span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', margin: 0 }}>{user?.name || 'Participant User'}</h2>
              <p style={{ fontSize: 13, color: '#a0aec0', margin: 0 }}>Participant profile</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Name</p>
              <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{user?.name || 'Not signed in'}</p>
            </div>
            <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Email</p>
              <p style={{ margin: '8px 0 0', color: '#f8fafc', fontWeight: 700 }}>{user?.email || 'Not available'}</p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 720, display: 'grid', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 8px', color: '#ffffff', fontSize: 18, fontWeight: 800 }}>Certificates</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Your generated certificates appear here after event completion.</p>
          </div>
          {renderCertificateCard(selectedCertificate)}

          {myCertificates.length > 1 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>Other certificates</h4>
              {myCertificates.filter((cert) => cert.id !== selectedCertificate?.id).map((certificate) => (
                <button
                  key={certificate.id}
                  onClick={() => setSelectedCertificate(certificate)}
                  style={{ textAlign: 'left', padding: '14px 18px', borderRadius: 14, border: '1px solid rgba(6,182,212,0.15)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', cursor: 'pointer' }}
                >
                  {certificate.eventTitle} - {certificate.category} - {certificate.placement || 'Champion'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
