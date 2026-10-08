import { forwardRef, useState } from 'react';
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

// An uploaded template is drawn this wide; its height follows the template's
// own shape, so nothing is cropped or stretched.
export const UPLOADED_TEMPLATE_WIDTH = 900;
const DEFAULT_UPLOADED_HEIGHT = 636;
const DEFAULT_NAME_COLOR = '#073047';
const NAME_FONT_FAMILY = '"Segoe UI", Arial, sans-serif';

// Everything that can be written onto an uploaded template. Only the name is
// always there; the rest are switched on by the organizer when their design
// does not already carry them. `box` is where a field starts out, in percent
// of the template's width and height.
export const UPLOADED_FIELD_DEFS = [
  { key: 'name', label: 'Recipient name', weight: 900, uppercase: true, box: { left: 19, top: 44, width: 62, height: 10 } },
  { key: 'title', label: 'Certificate title', weight: 800, box: { left: 20, top: 14, width: 60, height: 9 } },
  { key: 'message', label: 'Message', weight: 500, wrap: true, box: { left: 18, top: 56, width: 64, height: 9 } },
  { key: 'event', label: 'Event name', weight: 800, box: { left: 25, top: 67, width: 50, height: 6 } },
  { key: 'place', label: 'Award / place', weight: 800, uppercase: true, box: { left: 35, top: 74, width: 30, height: 5 } },
  { key: 'organization', label: 'Organization', weight: 800, box: { left: 30, top: 6, width: 40, height: 5 } },
  { key: 'date', label: 'Date issued', weight: 500, box: { left: 70, top: 6, width: 22, height: 3.5 } },
  // One set per signer: the first on the left, a second on the right, a
  // third in the middle. `signer` is which signer the field belongs to.
  ...[
    { suffix: '', signer: 0, left: 8, prefix: '' },
    { suffix: '2', signer: 1, left: 66, prefix: '2nd ' },
    { suffix: '3', signer: 2, left: 37, prefix: '3rd ' },
  ].flatMap(({ suffix, signer, left, prefix }) => [
    { key: `signature${suffix}`, label: `${prefix}Signature`, signer, image: true, box: { left: left + 2, top: 80, width: 22, height: 7 } },
    { key: `signerName${suffix}`, label: `${prefix}Signer name`, signer, weight: 800, box: { left, top: 87.5, width: 26, height: 4 } },
    { key: `signerRole${suffix}`, label: `${prefix}Signer role`, signer, weight: 500, box: { left, top: 92, width: 26, height: 3 } },
  ]),
];

export const MAX_SIGNERS = 3;

// Everyone who signs the certificate: the main signer first, then any added
// on the Certificates page. `dark` and `light` are the same signature in dark
// and white ink.
export function getSigners(template) {
  const tmpl = template || {};
  const main = {
    name: tmpl.signerName || 'FairPlay Event Director',
    role: tmpl.signerRole || 'Event Director',
    dark: tmpl.signatureDataUrl || '',
    light: tmpl.signatureLightDataUrl || '',
  };
  const extras = (Array.isArray(tmpl.extraSigners) ? tmpl.extraSigners : [])
    .slice(0, MAX_SIGNERS - 1)
    .map((signer) => ({
      name: signer?.name || '',
      role: signer?.role || '',
      dark: signer?.signatureDataUrl || '',
      light: signer?.signatureLightDataUrl || '',
    }));
  return [main, ...extras];
}

// Whether a field has anything to show yet: a signature needs its image, and
// a second or third signer's fields need that signer to have been added.
export function isUploadedFieldAvailable(template, key) {
  const definition = UPLOADED_FIELD_DEFS.find((entry) => entry.key === key);
  if (!definition || definition.signer === undefined) return true;
  const signer = getSigners(template)[definition.signer];
  if (!signer) return false;
  return definition.image ? Boolean(signer.dark) : true;
}

const DEFAULT_UPLOADED_FIELDS = {
  name: UPLOADED_FIELD_DEFS[0].box,
};

export function uploadedTemplateHeight(aspect) {
  const ratio = Number(aspect);
  if (!ratio || !Number.isFinite(ratio)) return DEFAULT_UPLOADED_HEIGHT;
  return Math.round(UPLOADED_TEMPLATE_WIDTH / Math.min(2.5, Math.max(0.5, ratio)));
}

const WRAPPED_LINE_HEIGHT = 1.3;

// The largest size at which the text still fits its box, so a long name or
// message shrinks instead of spilling out of the space the template left.
// One line for most fields; `wrap` lets a message run over several.
let measureContext = null;
export function fitTextFontSize(text, boxWidth, boxHeight, { weight = 900, uppercase = false, wrap = false } = {}) {
  const byHeight = boxHeight * 0.72;
  if (typeof document === 'undefined') return byHeight;
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return byHeight;
  measureContext.font = `${weight} 100px ${NAME_FONT_FAMILY}`;
  const content = uppercase ? String(text || '').toUpperCase() : String(text || '');
  const usableWidth = boxWidth * 0.96;

  if (!wrap) {
    const widthAt100 = measureContext.measureText(content).width;
    const byWidth = widthAt100 > 0 ? (usableWidth / widthAt100) * 100 : byHeight;
    return Math.max(6, Math.min(byHeight, byWidth, 110));
  }

  const wordWidths = content.split(/\s+/).filter(Boolean).map((word) => measureContext.measureText(word).width);
  const spaceWidth = measureContext.measureText(' ').width;
  const fits = (size) => {
    const ratio = size / 100;
    let lines = 1;
    let lineWidth = 0;
    for (const wordWidth of wordWidths) {
      const width = wordWidth * ratio;
      if (lineWidth > 0 && lineWidth + spaceWidth * ratio + width > usableWidth) {
        lines += 1;
        lineWidth = width;
      } else {
        lineWidth += (lineWidth > 0 ? spaceWidth * ratio : 0) + width;
      }
      if (width > usableWidth) return false;
    }
    return lines * size * WRAPPED_LINE_HEIGHT <= boxHeight;
  };

  let low = 6;
  let high = Math.max(6, Math.min(byHeight, 60));
  for (let step = 0; step < 12; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle; else high = middle;
  }
  return low;
}

function normalizeUploadedNameField(field) {
  // A box the organizer placed by hand is never second-guessed.
  if (field?.manual) return field;
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

// Where one field goes on an uploaded template and whether it is shown. The
// name is always shown; anything else only once the organizer switched it on.
export function getUploadedField(template, key) {
  const definition = UPLOADED_FIELD_DEFS.find((entry) => entry.key === key) || UPLOADED_FIELD_DEFS[0];
  const stored = template?.customTemplateFields?.[key];
  const isName = key === 'name';
  return {
    ...definition.box,
    // Positions an old scan guessed for anything but the name were never
    // shown and are not trusted now.
    ...(isName ? normalizeUploadedNameField(stored) : stored?.manual ? stored : null),
    enabled: isName || Boolean(stored?.enabled),
    cover: false,
  };
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
  const [measuredAspect, setMeasuredAspect] = useState(null);
  const s    = resolveStyle(certificate);
  const tmpl = template || certificate.template || {};
  const placementLabel = awardLabel(certificate);
  const isJudgeCertificate = certificate.category === 'judge';

  const orgName    = tmpl.organizationName || 'FairPlay';
  const signers    = getSigners(tmpl);
  // An added signer left blank is not printed on the built-in certificate.
  const footerSigners = signers.filter((signer, index) => index === 0 || signer.name || signer.dark);
  const signerWidth = footerSigners.length > 2 ? 132 : footerSigners.length > 1 ? 160 : 180;
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
    // Templates saved before the shape was recorded are measured as they load.
    const height = uploadedTemplateHeight(tmpl.customTemplateAspect || measuredAspect);
    const values = {
      name: certificate.recipientName || 'Recipient Name',
      title: certTitle,
      message,
      event: certificate.eventTitle || '',
      place: uploadedTemplatePlaceLabel(certificate),
      organization: orgName,
      date: issuedDate,
    };
    signers.forEach((signer, index) => {
      const suffix = index === 0 ? '' : String(index + 1);
      values[`signature${suffix}`] = signer.dark;
      values[`signerName${suffix}`] = signer.name;
      values[`signerRole${suffix}`] = signer.role;
    });

    return (
      <div
        ref={ref}
        style={{
          width: UPLOADED_TEMPLATE_WIDTH,
          height,
          boxSizing: 'border-box',
          position: 'relative',
          fontFamily: NAME_FONT_FAMILY,
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <img
          src={tmpl.customTemplateDataUrl}
          alt={tmpl.customTemplateName || 'Uploaded certificate template'}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!tmpl.customTemplateAspect && naturalWidth && naturalHeight) setMeasuredAspect(naturalWidth / naturalHeight);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
        />
        {UPLOADED_FIELD_DEFS.map((definition) => {
          const field = getUploadedField(tmpl, definition.key);
          const text = values[definition.key];
          if (!field.enabled || !text) return null;
          if (definition.image) {
            return (
              <img
                key={definition.key}
                src={text}
                alt={definition.label}
                style={{ ...percentBoxStyle(field), objectFit: 'contain', zIndex: 1 }}
              />
            );
          }
          return (
            <UploadedField
              key={definition.key}
              field={field}
              textStyle={{
                color: field.color || DEFAULT_NAME_COLOR,
                fontSize: fitTextFontSize(text, (field.width / 100) * UPLOADED_TEMPLATE_WIDTH, (field.height / 100) * height, definition),
                fontWeight: definition.weight,
                lineHeight: definition.wrap ? WRAPPED_LINE_HEIGHT : 1.05,
                whiteSpace: definition.wrap ? 'normal' : 'nowrap',
                textTransform: definition.uppercase ? 'uppercase' : 'none',
              }}
            >
              {text}
            </UploadedField>
          );
        })}
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

        {/* Signatures — side by side, lined up on their signing lines */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: footerSigners.length > 2 ? 14 : 22 }}>
          {footerSigners.map((signer, index) => (
            <div key={index} style={{ textAlign: 'center', width: signerWidth }}>
              {(signer.light || signer.dark) && (
                <img
                  src={signer.light || signer.dark}
                  alt="Signature"
                  style={{ display: 'block', height: 26, maxWidth: signerWidth, objectFit: 'contain', margin: '0 auto 1px' }}
                />
              )}
              <div style={{ color: '#fff', fontSize: footerSigners.length > 2 ? 11 : 13, fontWeight: 900, marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{signer.name}</div>
              <div style={{ borderBottom: '1.5px solid rgba(246,201,69,0.55)', margin: '0 auto 5px' }} />
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: footerSigners.length > 2 ? 8 : 9, fontWeight: 900, letterSpacing: footerSigners.length > 1 ? 1.4 : 2.4, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{signer.role}</div>
            </div>
          ))}
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
