import { forwardRef } from 'react';
import btechLogo from '../../../assets/logo/BTECH.jpg';

const CAT = {
  champion:    { accent: '#f6c945', ribbon: '#073047', label: 'Champion · 1st Place', icon: '1ST' },
  second:      { accent: '#d1d9e2', ribbon: '#2d3a4a', label: '2nd Place',            icon: '2ND' },
  third:       { accent: '#f97316', ribbon: '#7c2d12', label: '3rd Place',            icon: '3RD' },
  judge:       { accent: '#f6c945', ribbon: '#073047', label: 'Judge / Official',     icon: 'JDG' },
  participant: { accent: '#f6c945', ribbon: '#073047', label: 'Participant',          icon: 'CERT' },
};

function resolveStyle(cert) {
  if (cert.category === 'judge') return CAT.judge;
  if (cert.placement === 1) return CAT.champion;
  if (cert.placement === 2) return CAT.second;
  if (cert.placement === 3) return CAT.third;
  return CAT.participant;
}

function awardLabel(cert) {
  if (cert.category === 'judge') return null;
  if (cert.placement === 1) return 'Champion';
  if (cert.placement === 2) return '1st Runner Up';
  if (cert.placement === 3) return '2nd Runner Up';
  return null;
}

function uploadedTemplatePlaceLabel(cert) {
  if (cert.category === 'judge') return 'Judge / Official';
  if (cert.placement === 1) return 'Champion';
  if (cert.placement === 2) return '2nd Place';
  if (cert.placement === 3) return '3rd Place';
  if (cert.placement) return `Place #${cert.placement}`;
  return 'Participant';
}

function fitFontSize(text, baseSize, compactSize, maxLength) {
  return String(text || '').length > maxLength ? compactSize : baseSize;
}

function certificateTitleSize(title, isJudgeCertificate) {
  const length = String(title || '').length;
  if (isJudgeCertificate) return length > 24 ? 38 : 42;
  if (length > 24) return 40;
  if (length > 18) return 44;
  return 50;
}

function isImageTemplate(template) {
  return template?.customTemplateDataUrl && String(template.customTemplateType || '').startsWith('image/');
}

const DEFAULT_UPLOADED_FIELDS = {
  name: { left: 28, top: 48, width: 62, height: 10, cover: false },
  event: { left: 32, top: 54, width: 54, height: 7, cover: false },
  place: { left: 38, top: 62, width: 42, height: 6, cover: false },
};

function normalizeUploadedNameField(field) {
  const looksLikeOldFallback =
    field &&
    field.top >= 36 &&
    field.top <= 41 &&
    field.left >= 28 &&
    field.left <= 32 &&
    field.width >= 56 &&
    field.width <= 60;

  return looksLikeOldFallback ? DEFAULT_UPLOADED_FIELDS.name : field;
}

function percentBoxStyle(field) {
  return {
    position: 'absolute',
    left: `${field.left}%`,
    top: `${field.top}%`,
    width: `${field.width}%`,
    height: `${field.height}%`,
  };
}

function UploadedField({ field, children, textStyle }) {
  return (
    <div style={{ ...percentBoxStyle(field), display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      {field.cover && (
        <div
          style={{
            position: 'absolute',
            inset: '-2px -6px',
            background: field.background || 'rgba(255,255,255,0.9)',
            borderRadius: 5,
            boxShadow: `0 0 8px ${field.background || 'rgba(255,255,255,0.7)'}`,
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', ...textStyle }}>
        {children}
      </div>
    </div>
  );
}

function Seal({ logoSrc, accent, ribbon }) {
  return (
    <div style={{ position: 'relative', width: 170, height: 206 }}>
      {/* Left ribbon tail */}
      <div style={{ position: 'absolute', left: 36, top: 108, width: 36, height: 80, background: ribbon,  clipPath: 'polygon(0 0,100% 0,70% 100%,40% 74%,0 100%)', transform: 'rotate(16deg)', zIndex: 1 }} />
      <div style={{ position: 'absolute', left: 28, top: 116, width: 28, height: 66, background: accent,  clipPath: 'polygon(0 0,100% 0,70% 100%,40% 74%,0 100%)', transform: 'rotate(16deg)', zIndex: 0 }} />
      {/* Right ribbon tail */}
      <div style={{ position: 'absolute', left: 98, top: 108, width: 36, height: 80, background: ribbon, clipPath: 'polygon(0 0,100% 0,100% 100%,60% 74%,30% 100%)', transform: 'rotate(-16deg)', zIndex: 1 }} />
      <div style={{ position: 'absolute', left: 106, top: 116, width: 28, height: 66, background: accent, clipPath: 'polygon(0 0,100% 0,100% 100%,60% 74%,30% 100%)', transform: 'rotate(-16deg)', zIndex: 0 }} />
      {/* Gear ring */}
      <div style={{
        position: 'absolute', top: 6, left: 12, width: 146, height: 146, borderRadius: '50%',
        background: 'repeating-conic-gradient(from 0deg,#073047 0deg 9deg,#0b4a6e 9deg 18deg)',
        boxShadow: '0 12px 30px rgba(7,48,71,0.35)', display: 'grid', placeItems: 'center', zIndex: 4,
      }}>
        <div style={{ width: 116, height: 116, borderRadius: '50%', background: `linear-gradient(135deg,#ffe57a,${accent})`, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 6px rgba(255,247,200,0.5)' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `4px solid ${accent}`, boxShadow: '0 6px 16px rgba(7,48,71,0.25)' }}>
            <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const CertificateRenderer = forwardRef(function CertificateRenderer({ certificate, template }, ref) {
  const s    = resolveStyle(certificate);
  const tmpl = template || certificate.template || {};
  const placementLabel = awardLabel(certificate);
  const isJudgeCertificate = certificate.category === 'judge';

  const signerName = tmpl.signerName       || 'FairPlay Event Director';
  const signerRole = tmpl.signerRole       || 'Event Director';
  const orgName    = tmpl.organizationName || 'FairPlay';
  const certTitle  = isJudgeCertificate
    ? tmpl.judgeTitle || 'Certificate of Appreciation'
    : tmpl.participantTitle || tmpl.title || 'Certificate of Achievement';
  const titleSize  = certificateTitleSize(certTitle, isJudgeCertificate);
  const logoSrc    = tmpl.logoUrl          || btechLogo;
  const message    = isJudgeCertificate
    ? tmpl.judgeMessage || 'Presented in appreciation of fair judging, professional evaluation, and service as an official for this event.'
    : tmpl.participantMessage || tmpl.message || 'Presented in recognition of outstanding performance and participation as a contestant in this event.';
  const issuedDate = certificate.issuedAt
    ? new Date(certificate.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (isImageTemplate(tmpl)) {
    const recipientName = certificate.recipientName || 'Recipient Name';
    const fields = {
      ...DEFAULT_UPLOADED_FIELDS,
      ...(tmpl.customTemplateFields || {}),
    };
    const nameField = {
      ...normalizeUploadedNameField(fields.name),
      cover: false,
    };

    return (
      <div
        ref={ref}
        style={{
          width: 900,
          height: 636,
          boxSizing: 'border-box',
          position: 'relative',
          fontFamily: '"Segoe UI", Arial, sans-serif',
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <img
          src={tmpl.customTemplateDataUrl}
          alt={tmpl.customTemplateName || 'Uploaded certificate template'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <UploadedField
          field={nameField}
          textStyle={{
            color: '#073047',
            fontSize: fitFontSize(recipientName, 42, 32, 22),
            fontWeight: 900,
            lineHeight: 1.05,
            wordBreak: 'break-word',
            textTransform: 'uppercase',
            textShadow: '0 1px 0 rgba(255,255,255,0.75)',
          }}
        >
          {recipientName}
        </UploadedField>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        width: 900,
        height: 636,
        boxSizing: 'border-box',
        border: '10px solid #073047',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {/* ── Top navy header ── */}
      <div style={{ background: '#073047', height: 112, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 14 }}>
        {/* Gold diagonal accent blocks — pushed to the RIGHT so they never touch the logo/text */}
        <div style={{ position: 'absolute', top: 0, right: 160, width: 90, height: 112, background: 'linear-gradient(135deg,#f8d95d,#c9900e)', transform: 'skewX(-18deg)', opacity: 0.92 }} />
        <div style={{ position: 'absolute', top: 0, right: 116, width: 28, height: 112, background: '#073047', transform: 'skewX(-18deg)' }} />
        <div style={{ position: 'absolute', top: 0, right: 80,  width: 50, height: 112, background: 'linear-gradient(135deg,#f8d95d,#c9900e)', transform: 'skewX(-18deg)', opacity: 0.55 }} />

        {/* Logo circle */}
        <div style={{ width: 62, height: 62, borderRadius: '50%', overflow: 'hidden', border: '3px solid #f6c945', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', flexShrink: 0, zIndex: 2, background: '#fff' }}>
          <img src={logoSrc} alt={orgName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Org text */}
        <div style={{ zIndex: 2 }}>
          <div style={{ color: '#f6c945', fontSize: 17, fontWeight: 900, letterSpacing: 0.4 }}>{orgName}</div>
          <div style={{ color: '#ffffff', fontSize: 9, fontWeight: 900, letterSpacing: 4.5, textTransform: 'uppercase', marginTop: 2 }}>Official Certificate</div>
        </div>
      </div>

      {/* Gold separator line */}
      <div style={{ height: 5, background: 'linear-gradient(90deg,#c9900e,#f8d95d 25%,#f6c945 50%,#f8d95d 75%,#c9900e)', flexShrink: 0 }} />

      {/* ── White body — flex row: left text | right seal column ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Dot watermark */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(7,48,71,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px', zIndex: 0, pointerEvents: 'none' }} />

        {/* ── Left: text ── */}
        <div style={{ flex: '1 1 auto', minWidth: 0, padding: '22px 8px 18px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>

          {/* Certificate title — same line, no separator */}
          <div style={{ marginBottom: 14, paddingLeft: 8, width: '100%' }}>
            <div style={{
              color: '#073047',
              fontFamily: '"Brush Script MT","Segoe Script",cursive',
              fontSize: titleSize,
              fontWeight: 400,
              lineHeight: 1.05,
              textShadow: '2px 3px 0 rgba(246,201,69,0.28)',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              paddingLeft: 4,
            }}>
              {certTitle}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 2, background: 'linear-gradient(90deg,#073047 40%,transparent)', margin: '12px 0 10px', maxWidth: 520 }} />

          <div style={{ color: '#334155', fontSize: 13, fontStyle: 'italic', fontWeight: 700, marginBottom: 8 }}>
            This certificate is proudly presented to:
          </div>

          {/* Recipient */}
          <div style={{ color: '#073047', fontSize: 36, fontWeight: 900, letterSpacing: 1.2, lineHeight: 1.12, wordBreak: 'break-word', maxWidth: 500, marginBottom: 18 }}>
            {certificate.recipientName || 'Recipient Name'}
          </div>

          <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.7, maxWidth: 500, clear: 'both' }}>{message}</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, color: '#64748b', fontSize: 16, marginTop: 14 }}>
            <span>for</span>
            <span style={{ color: '#073047', fontWeight: 900, fontSize: 24, lineHeight: 1.1 }}>
              {certificate.eventTitle || 'Event'}
            </span>
          </div>
        </div>

        {/* ── Right: seal + badge (proper flex column, guaranteed centered) ── */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
          <Seal logoSrc={logoSrc} accent={s.accent} ribbon={s.ribbon} />
          {placementLabel && (
            <div style={{
              color: '#073047',
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 2,
              textAlign: 'center',
              textTransform: 'uppercase',
            }}>
              {placementLabel}
            </div>
          )}
        </div>

      </div>

      {/* Gold separator line */}
      <div style={{ height: 5, background: 'linear-gradient(90deg,#c9900e,#f8d95d 25%,#f6c945 50%,#f8d95d 75%,#c9900e)', flexShrink: 0 }} />

      {/* ── Bottom navy footer ── */}
      <div style={{ background: '#073047', height: 80, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px' }}>
        {/* Date */}
        <div>
          <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 900 }}>{issuedDate}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: 900, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 3 }}>Date Issued</div>
        </div>

        {/* Signature */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, marginBottom: 5 }}>{signerName}</div>
          <div style={{ width: 180, borderBottom: '1.5px solid rgba(246,201,69,0.55)', margin: '0 auto 5px' }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 900, letterSpacing: 2.4, textTransform: 'uppercase' }}>{signerRole}</div>
        </div>

        {/* Verification */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#f6c945', fontFamily: 'Consolas,monospace', fontSize: 11, letterSpacing: 0.8 }}>
            {certificate.verificationCode || 'FP-000000'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', marginTop: 3 }}>Valid · FairPlay Certified</div>
        </div>
      </div>
    </div>
  );
});

export default CertificateRenderer;
