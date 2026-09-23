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
        <div style={{ padding: 24, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}>
          <h3 style={{ color: '#0f172a', fontSize: 18, marginBottom: 12 }}>No certificate available yet.</h3>
          <p style={{ color: '#64748b', margin: 0 }}>Certificates are generated automatically when your tournament is finalized and the winner is confirmed.</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 18, padding: 24, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 22, fontWeight: 800 }}>{certificate.eventTitle}</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 13 }}>Certificate issued to {certificate.recipientName}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Category</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.category}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Issued</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{new Date(certificate.issuedAt).toLocaleDateString()}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Placement</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.placement || 'Champion'}</p>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Verification</p>
            <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{certificate.verificationCode}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button
            onClick={() => navigator.clipboard.writeText(certificate.verificationUrl)}
            style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}
          >
            Copy verification link
          </button>
          <a
            href={certificate.verificationUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', justifyContent: 'center', padding: '12px 18px', borderRadius: 12, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}
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
        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 10px 30px rgba(37,99,235,0.06)', borderRadius: 16, padding: 28, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <span style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: '#fff' }}>
              {user?.name?.charAt(0) || 'P'}
            </span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{user?.name || 'Participant User'}</h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Participant profile</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: 18, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
              <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Name</p>
              <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{user?.name || 'Not signed in'}</p>
            </div>
            <div style={{ padding: 18, borderRadius: 16, background: '#eff6ff', border: '1px solid #dbeafe' }}>
              <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>Email</p>
              <p style={{ margin: '8px 0 0', color: '#0f172a', fontWeight: 700 }}>{user?.email || 'Not available'}</p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 720, display: 'grid', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18, fontWeight: 800 }}>Certificates</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Your generated certificates appear here after event completion.</p>
          </div>
          {renderCertificateCard(selectedCertificate)}

          {myCertificates.length > 1 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <h4 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 700 }}>Other certificates</h4>
              {myCertificates.filter((cert) => cert.id !== selectedCertificate?.id).map((certificate) => (
                <button
                  key={certificate.id}
                  onClick={() => setSelectedCertificate(certificate)}
                  style={{ textAlign: 'left', padding: '14px 18px', borderRadius: 14, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}
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
