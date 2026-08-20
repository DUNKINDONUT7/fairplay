import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import DashboardLayout from '../../components/layout/DashboardLayout';
import CertificateRenderer from '../../components/certificates/CertificateRenderer';
import useCertificateStore from '../../store/certificateStore';
import useEventStore from '../../store/eventStore';
import useScoreStore from '../../store/scoreStore';
import useNotificationStore from '../../store/notificationStore';
import useAuthStore from '../../store/authStore';
import useAttendanceStore from '../../store/attendanceStore';
import btechLogo from '../../../assets/logo/BTECH.jpg';

const JUDGE_CATEGORIES = ['judge'];
const TEMPLATE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const TEMPLATE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const CERTIFICATE_EXPORT_WIDTH = 900;
const CERTIFICATE_EXPORT_HEIGHT = 636;

function categoryFromPlacement(placement) {
  if (placement === 1) return 'champion';
  if (placement === 2) return 'second';
  if (placement === 3) return 'third';
  return 'participant';
}

export async function exportCertificateToPDF(element, filename) {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const exportWrapper = document.createElement('div');
  const exportNode = element.cloneNode(true);

  Object.assign(exportWrapper.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${CERTIFICATE_EXPORT_WIDTH}px`,
    height: `${CERTIFICATE_EXPORT_HEIGHT}px`,
    background: '#ffffff',
    overflow: 'hidden',
    zIndex: '-1',
    pointerEvents: 'none',
  });

  Object.assign(exportNode.style, {
    width: `${CERTIFICATE_EXPORT_WIDTH}px`,
    height: `${CERTIFICATE_EXPORT_HEIGHT}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    margin: '0',
    transform: 'none',
    transformOrigin: 'top left',
  });

  exportWrapper.appendChild(exportNode);
  document.body.appendChild(exportWrapper);

  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(exportNode, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: CERTIFICATE_EXPORT_WIDTH,
      height: CERTIFICATE_EXPORT_HEIGHT,
      windowWidth: CERTIFICATE_EXPORT_WIDTH,
      windowHeight: CERTIFICATE_EXPORT_HEIGHT,
      scrollX: 0,
      scrollY: 0,
      letterRendering: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [CERTIFICATE_EXPORT_WIDTH, CERTIFICATE_EXPORT_HEIGHT],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, CERTIFICATE_EXPORT_WIDTH, CERTIFICATE_EXPORT_HEIGHT, undefined, 'FAST');
    pdf.save(filename);
  } finally {
    document.body.removeChild(exportWrapper);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadTemplateImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load template image'));
    image.src = dataUrl;
  });
}

function averageBackgroundColor(imageData, box, width, height) {
  const data = imageData.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const x1 = clamp(Math.floor(box.x), 0, width - 1);
  const y1 = clamp(Math.floor(box.y), 0, height - 1);
  const x2 = clamp(Math.ceil(box.x + box.w), 0, width - 1);
  const y2 = clamp(Math.ceil(box.y + box.h), 0, height - 1);

  for (let y = y1; y <= y2; y += 3) {
    for (let x = x1; x <= x2; x += 3) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);

      if (alpha > 20 && luminance > 150) {
        r += red;
        g += green;
        b += blue;
        count++;
      }
    }
  }

  if (!count) return 'rgba(255,255,255,0.92)';
  return `rgba(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)},0.92)`;
}

function makeScannedField(band, type, imageData, width, height) {
  const centerX = (band.x1 + band.x2) / 2;
  const centerY = (band.y1 + band.y2) / 2;
  const minimumWidth = type === 'name' ? 340 : type === 'event' ? 380 : 190;
  const minimumHeight = type === 'name' ? 54 : type === 'event' ? 40 : 30;
  const boxWidth = clamp(Math.max((band.x2 - band.x1) + 100, minimumWidth), minimumWidth, 620);
  const boxHeight = clamp(Math.max((band.y2 - band.y1) + 16, minimumHeight), minimumHeight, 86);
  const x = clamp(centerX - boxWidth / 2, 18, width - boxWidth - 18);
  const y = clamp(centerY - boxHeight / 2, 18, height - boxHeight - 18);

  return {
    left: (x / width) * 100,
    top: (y / height) * 100,
    width: (boxWidth / width) * 100,
    height: (boxHeight / height) * 100,
    cover: true,
    background: averageBackgroundColor(imageData, { x, y, w: boxWidth, h: boxHeight }, width, height),
  };
}

function fallbackScannedFields() {
  return {
    name: { left: 28, top: 48, width: 62, height: 10, cover: false },
    event: { left: 32, top: 54, width: 54, height: 7, cover: false },
    place: { left: 38, top: 62, width: 42, height: 6, cover: false },
  };
}

function isPotentialLinePixel(red, green, blue, alpha) {
  if (alpha <= 20) return false;

  const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
  const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
  const isGoldLine = red > 130 && green > 80 && blue < 150 && saturation > 35;
  const isDarkLine = luminance < 125 && saturation > 8;

  return isGoldLine || isDarkLine;
}

function findHorizontalNameLine(imageData, width, height) {
  const data = imageData.data;
  const scanLeft = Math.floor(width * 0.22);
  const scanRight = Math.floor(width * 0.9);
  const scanTop = Math.floor(height * 0.38);
  const scanBottom = Math.floor(height * 0.68);
  const minimumPixels = Math.floor(width * 0.18);
  const rows = [];

  for (let y = scanTop; y <= scanBottom; y++) {
    let count = 0;
    let xMin = width;
    let xMax = 0;

    for (let x = scanLeft; x <= scanRight; x++) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];

      if (isPotentialLinePixel(red, green, blue, alpha)) {
        count++;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
      }
    }

    if (count >= minimumPixels && xMax - xMin >= width * 0.2) {
      rows.push({ y, count, xMin, xMax });
    }
  }

  const bands = [];
  let active = null;

  rows.forEach((row) => {
    if (!active) {
      active = { y1: row.y, y2: row.y, x1: row.xMin, x2: row.xMax, score: row.count };
      return;
    }

    if (row.y - active.y2 <= 3) {
      active.y2 = row.y;
      active.x1 = Math.min(active.x1, row.xMin);
      active.x2 = Math.max(active.x2, row.xMax);
      active.score += row.count;
    } else {
      bands.push(active);
      active = { y1: row.y, y2: row.y, x1: row.xMin, x2: row.xMax, score: row.count };
    }
  });

  if (active) bands.push(active);

  return bands
    .map((band) => ({
      ...band,
      centerY: (band.y1 + band.y2) / 2,
      centerX: (band.x1 + band.x2) / 2,
      lineWidth: band.x2 - band.x1,
      lineHeight: band.y2 - band.y1 + 1,
    }))
    .filter((band) => (
      band.lineHeight <= 10 &&
      band.lineWidth >= width * 0.24 &&
      band.centerY > height * 0.42 &&
      band.centerY < height * 0.64
    ))
    .sort((a, b) => {
      const targetY = height * 0.54;
      const aScore = a.lineWidth - Math.abs(a.centerY - targetY) * 2;
      const bScore = b.lineWidth - Math.abs(b.centerY - targetY) * 2;
      return bScore - aScore;
    })[0] || null;
}

function makeLineAnchoredNameField(lineBand, imageData, width, height) {
  const boxWidth = clamp(lineBand.lineWidth + 80, 360, 620);
  const boxHeight = 66;
  const x = clamp(lineBand.centerX - boxWidth / 2, 24, width - boxWidth - 24);
  const y = clamp(lineBand.centerY - 56, height * 0.4, height * 0.58);

  return {
    left: (x / width) * 100,
    top: (y / height) * 100,
    width: (boxWidth / width) * 100,
    height: (boxHeight / height) * 100,
    cover: false,
    background: averageBackgroundColor(imageData, { x, y, w: boxWidth, h: boxHeight }, width, height),
  };
}

function makeInferredNameField(anchorBand, imageData, width, height) {
  if (!anchorBand) return fallbackScannedFields().name;

  const centerX = (anchorBand.x1 + anchorBand.x2) / 2;
  const boxWidth = clamp(Math.max((anchorBand.x2 - anchorBand.x1) + 180, 420), 360, 580);
  const boxHeight = 62;
  const x = clamp(centerX - boxWidth / 2, 30, width - boxWidth - 30);
  const y = clamp(anchorBand.y2 + 44, height * 0.42, height * 0.54);

  return {
    left: (x / width) * 100,
    top: (y / height) * 100,
    width: (boxWidth / width) * 100,
    height: (boxHeight / height) * 100,
    cover: false,
    background: averageBackgroundColor(imageData, { x, y, w: boxWidth, h: boxHeight }, width, height),
  };
}

async function scanCertificateTemplate(dataUrl) {
  const image = await loadTemplateImage(dataUrl);
  const width = 900;
  const height = 636;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const rowStats = [];
  const scanLeft = Math.floor(width * 0.23);
  const scanRight = Math.floor(width * 0.94);
  const scanTop = Math.floor(height * 0.18);
  const scanBottom = Math.floor(height * 0.76);

  for (let y = scanTop; y <= scanBottom; y += 2) {
    let count = 0;
    let xMin = width;
    let xMax = 0;

    for (let x = scanLeft; x <= scanRight; x += 2) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);

      if (alpha > 20 && luminance < 150 && saturation > 8) {
        count++;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
      }
    }

    rowStats.push({ y, count, xMin, xMax });
  }

  const maxCount = Math.max(...rowStats.map((row) => row.count), 0);
  const threshold = Math.max(8, maxCount * 0.18);
  const rawBands = [];
  let active = null;

  rowStats.forEach((row) => {
    if (row.count >= threshold) {
      if (!active) {
        active = { y1: row.y, y2: row.y, x1: row.xMin, x2: row.xMax, score: row.count };
      } else {
        active.y2 = row.y;
        active.x1 = Math.min(active.x1, row.xMin);
        active.x2 = Math.max(active.x2, row.xMax);
        active.score += row.count;
      }
    } else if (active) {
      rawBands.push(active);
      active = null;
    }
  });
  if (active) rawBands.push(active);

  const mergedBands = [];
  rawBands
    .filter((band) => band.y2 - band.y1 >= 3 && band.x2 - band.x1 >= 45)
    .forEach((band) => {
      const previous = mergedBands[mergedBands.length - 1];
      if (previous && band.y1 - previous.y2 <= 10) {
        previous.y2 = band.y2;
        previous.x1 = Math.min(previous.x1, band.x1);
        previous.x2 = Math.max(previous.x2, band.x2);
        previous.score += band.score;
      } else {
        mergedBands.push({ ...band });
      }
    });

  const candidates = mergedBands
    .map((band) => ({ ...band, centerY: (band.y1 + band.y2) / 2 }))
    .filter((band) => band.centerY > height * 0.26 && band.centerY < height * 0.72)
    .sort((a, b) => a.centerY - b.centerY);

  const horizontalNameLine = findHorizontalNameLine(imageData, width, height);

  const pickNearest = (targetY, options) => (
    options.reduce((best, band) => {
      if (!best) return band;
      return Math.abs(band.centerY - targetY) < Math.abs(best.centerY - targetY) ? band : best;
    }, null)
  );

  const nameCandidates = candidates.filter((band) => (
    band.centerY > height * 0.4 &&
    band.centerY < height * 0.58 &&
    band.x2 - band.x1 >= 90
  ));
  const strongNameBand = nameCandidates
    .filter((band) => band.y2 - band.y1 >= 18)
    .sort((a, b) => b.score - a.score)[0];
  const labelAnchorBand = pickNearest(
    height * 0.36,
    candidates.filter((band) => band.centerY > height * 0.28 && band.centerY < height * 0.44)
  );
  const nameBand = strongNameBand || labelAnchorBand;
  const eventBand = pickNearest(height * 0.58, candidates.filter((band) => !nameBand || band.centerY > nameBand.centerY + 34));
  const placeBand = pickNearest(height * 0.64, candidates.filter((band) => !eventBand || band.centerY > eventBand.centerY + 8));

  if (!nameBand && !horizontalNameLine) {
    return {
      fields: fallbackScannedFields(),
      status: 'Scan used fallback name position. Try a Canva template with a visible sample name for better auto-placement.',
    };
  }

  return {
    fields: {
      name: horizontalNameLine
        ? makeLineAnchoredNameField(horizontalNameLine, imageData, width, height)
        : strongNameBand
        ? { ...makeScannedField(strongNameBand, 'name', imageData, width, height), cover: false }
        : makeInferredNameField(labelAnchorBand, imageData, width, height),
      event: eventBand
        ? makeScannedField(eventBand, 'event', imageData, width, height)
        : { left: 32, top: 54, width: 54, height: 7, cover: false },
      place: placeBand
        ? makeScannedField(placeBand, 'place', imageData, width, height)
        : { left: 38, top: 62, width: 42, height: 6, cover: false },
    },
    status: horizontalNameLine
      ? `Scanned ${candidates.length} text band(s). Name position was placed on the detected certificate line.`
      : strongNameBand
      ? `Scanned ${candidates.length} text band(s). Name position was auto-detected.`
      : `Scanned ${candidates.length} text band(s). Name position was inferred from the blank area after the certificate label.`,
  };
}

function CertificateModal({ certificate, template, onClose }) {
  const certRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    if (!certRef.current) return;
    setExporting(true);
    try {
      const filename = `${certificate.recipientName.replace(/\s+/g, '-')}-${certificate.eventTitle.replace(/\s+/g, '-')}-certificate.pdf`;
      await exportCertificateToPDF(certRef.current, filename);
    } catch {
      // silently fail — user can use browser print as fallback
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={handleDownload}
            disabled={exporting}
            style={{
              padding: '10px 24px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className={exporting ? 'bi bi-arrow-repeat' : 'bi bi-download'} />
            {exporting ? 'Exporting...' : 'Download PDF'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Certificate preview */}
        <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
          <CertificateRenderer ref={certRef} certificate={certificate} template={template} />
        </div>
      </div>
    </div>
  );
}

export default function OrganizerCertificates() {
  const { user } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { certificates, fetchCertificates, generateCertificatesForEvent, template, updateTemplate } = useCertificateStore();
  const { calculateLeaderboard, fetchScores, getScoresForEvent } = useScoreStore();
  const { success, error } = useNotificationStore();
  const { attendance, fetchAttendance } = useAttendanceStore();

  const [selectedEventId, setSelectedEventId] = useState('');
  const [activeTab, setActiveTab] = useState('contestants');
  const [previewCert, setPreviewCert] = useState(null);
  const [judgeNames, setJudgeNames] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isScanningTemplate, setIsScanningTemplate] = useState(false);
  const hiddenCertRef = useRef(null);
  const [hiddenCertData, setHiddenCertData] = useState(null);

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
  }, [fetchEvents, user?.id]);

  useEffect(() => {
    const firstEventId = events[0]?.id;
    if (firstEventId == null) return;

    const selectedEventExists = events.some((event) => String(event.id) === String(selectedEventId));
    if (!selectedEventId || !selectedEventExists) {
      setSelectedEventId(String(firstEventId));
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    fetchAttendance(selectedEventId);
    fetchScores(selectedEventId);
    fetchCertificates(selectedEventId);
  }, [fetchScores, fetchCertificates, selectedEventId]);

  const selectedEvent = events.find((e) => String(e.id) === String(selectedEventId)) || null;

  const leaderboard = selectedEvent
    ? calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || [])
    : [];

  const autoJudgeNames = selectedEvent
    ? [...new Set(
        getScoresForEvent(selectedEvent.id)
          .map((s) => s.judgeName)
          .filter((n) => n && n !== 'Judge')
      )]
    : [];

  const eventCertificates = certificates.filter(
    (c) => String(c.eventId) === String(selectedEventId)
  );

  const attendanceRequired = Boolean(selectedEvent?.attendanceTracking);
  const checkedInIds = new Set(
    attendance
      .filter((record) => String(record.eventId) === String(selectedEventId) && record.checkInStatus !== 'absent')
      .map((record) => String(record.attendeeId))
  );

  const eligibleLeaderboard = attendanceRequired
    ? leaderboard.filter((entry) => checkedInIds.has(String(entry.contestantId)))
    : leaderboard;
  const excludedForAbsence = attendanceRequired ? leaderboard.length - eligibleLeaderboard.length : 0;

  const participantRecipients = eligibleLeaderboard.map((entry) => ({
    id: entry.contestantId,
    name: entry.contestantName,
    score: entry.averageScore,
    placement: entry.rank,
  }));

  const manualNames = judgeNames.split('\n').map((n) => n.trim()).filter(Boolean);
  const allJudgeNames = [...new Set([...autoJudgeNames, ...manualNames])];
  const judgeRecipients = allJudgeNames.map((name, i) => ({ id: `judge-${i}`, name, category: 'judge' }));
  const hasUploadedTemplate = Boolean(template.customTemplateDataUrl);
  const uploadedTemplateIsPdf = template.customTemplateType === 'application/pdf';

  const buildPreviewCertificate = (recipient = {}) => {
    const fallbackRecipient = participantRecipients[0] || judgeRecipients[0] || {};
    const previewRecipient = { ...fallbackRecipient, ...recipient };
    const placement = previewRecipient.placement || previewRecipient.rank || null;
    const category = previewRecipient.category || categoryFromPlacement(placement);
    const recipientName = previewRecipient.name || previewRecipient.contestantName || 'Sample Recipient';

    return {
      id: `preview-${selectedEvent.id}-${previewRecipient.id || recipientName}`,
      eventId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      recipientId: previewRecipient.id || recipientName,
      recipientName,
      category,
      placement,
      score: previewRecipient.score ?? null,
      issuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'preview',
      template,
      notes: '',
      verificationCode: 'FP-PREVIEW',
      verificationUrl: `${window.location.origin}/events/${selectedEvent.id}`,
      qrValue: `${window.location.origin}/events/${selectedEvent.id}?certificate=FP-PREVIEW`,
    };
  };

  const handlePreviewTemplate = (recipient) => {
    if (!selectedEvent) return;
    setPreviewCert(buildPreviewCertificate(recipient));
  };

  const handleTemplateUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isAllowedType = TEMPLATE_UPLOAD_TYPES.includes(file.type) || file.type.startsWith('image/');
    if (!isAllowedType) {
      error('Upload a Canva export as PNG, JPG, WEBP, or PDF.');
      return;
    }

    if (file.size > TEMPLATE_UPLOAD_MAX_BYTES) {
      error(`Template file is too large. Maximum is ${formatFileSize(TEMPLATE_UPLOAD_MAX_BYTES)}.`);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      let scanResult = null;

      if (file.type.startsWith('image/')) {
        setIsScanningTemplate(true);
        scanResult = await scanCertificateTemplate(dataUrl);
      }

      updateTemplate({
        customTemplateDataUrl: dataUrl,
        customTemplateName: file.name,
        customTemplateType: file.type,
        customTemplateSize: file.size,
        customTemplateFields: scanResult?.fields || null,
        customTemplateScanStatus: scanResult?.status || '',
      });
      success(scanResult ? `${file.name} uploaded and scanned.` : `${file.name} uploaded as certificate template.`);
    } catch {
      error('Failed to read the uploaded template.');
    } finally {
      setIsScanningTemplate(false);
    }
  };

  const handleScanUploadedTemplate = async () => {
    if (!template.customTemplateDataUrl || !String(template.customTemplateType || '').startsWith('image/')) {
      error('Upload a PNG, JPG, or WEBP template before scanning.');
      return;
    }

    setIsScanningTemplate(true);
    try {
      const scanResult = await scanCertificateTemplate(template.customTemplateDataUrl);
      updateTemplate({
        customTemplateFields: scanResult.fields,
        customTemplateScanStatus: scanResult.status,
      });
      success('Template scan completed.');
    } catch {
      error('Failed to scan the uploaded template.');
    } finally {
      setIsScanningTemplate(false);
    }
  };

  const handleRemoveUploadedTemplate = () => {
    updateTemplate({
      customTemplateDataUrl: '',
      customTemplateName: '',
      customTemplateType: '',
      customTemplateSize: '',
      customTemplateFields: null,
      customTemplateScanStatus: '',
    });
  };

  const handleGenerateAll = async () => {
    if (!selectedEvent) {
      error('Select an event first.');
      return;
    }
    setIsGenerating(true);
    try {
      const allRecipients = [
        ...participantRecipients,
        ...judgeRecipients.map((r) => ({ ...r, category: 'judge' })),
      ];
      const generated = await generateCertificatesForEvent({
        event: selectedEvent,
        recipients: allRecipients,
      });
      success(`Generated ${generated.length} certificate(s) for ${selectedEvent.title}.`);
    } catch {
      error('Failed to generate certificates.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportAllPDF = async () => {
    if (eventCertificates.length === 0) {
      error('Generate certificates first before exporting.');
      return;
    }
    setIsExportingAll(true);
    try {
      for (const cert of eventCertificates) {
        setHiddenCertData(cert);
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (hiddenCertRef.current) {
          const filename = `${cert.recipientName.replace(/\s+/g, '-')}-certificate.pdf`;
          await exportCertificateToPDF(hiddenCertRef.current, filename);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      setHiddenCertData(null);
      success(`Exported ${eventCertificates.length} certificate(s) as PDF.`);
    } catch {
      error('Some certificates failed to export.');
    } finally {
      setIsExportingAll(false);
    }
  };

  const placementLabel = (placement, category) => {
    if (category === 'judge') return 'Judge';
    if (placement === 1) return '🏆 1st';
    if (placement === 2) return '🥈 2nd';
    if (placement === 3) return '🥉 3rd';
    return `#${placement}`;
  };

  return (
    <DashboardLayout title="Certificate Generator" subtitle="Generate and download official certificates for your events">
      {/* Event selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          style={fieldStyle}
        >
          <option value="">Select an event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>

        {selectedEvent && (
          <>
            <button
              onClick={async () => { await fetchScores(selectedEventId); await fetchCertificates(selectedEventId); }}
              title="Refresh scores from database"
              style={{ ...secondaryButtonStyle, padding: '10px 14px' }}
            >
              <i className="bi bi-arrow-clockwise" style={{ marginRight: 6 }} />
              Refresh
            </button>
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating}
              style={{ ...primaryButtonStyle, opacity: isGenerating ? 0.7 : 1 }}
            >
              <i className={isGenerating ? 'bi bi-arrow-repeat' : 'bi bi-award'} style={{ marginRight: 8 }} />
              {isGenerating ? 'Generating...' : 'Generate All Certificates'}
            </button>

            {attendanceRequired && excludedForAbsence > 0 && (
              <span style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '6px 12px', fontWeight: 700 }}>
                <i className="bi bi-info-circle" style={{ marginRight: 6 }} />
                {excludedForAbsence} contestant{excludedForAbsence === 1 ? '' : 's'} excluded — not checked in via QR attendance
              </span>
            )}

            {eventCertificates.length > 0 && (
              <button
                onClick={handleExportAllPDF}
                disabled={isExportingAll}
                style={{ ...secondaryButtonStyle, opacity: isExportingAll ? 0.7 : 1 }}
              >
                <i className="bi bi-download" style={{ marginRight: 8 }} />
                {isExportingAll ? 'Exporting...' : `Export All (${eventCertificates.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {selectedEvent && (
        <>
          <div style={summaryGridStyle}>
            <SummaryCard
              icon="bi bi-calendar-event"
              label="Selected event"
              value={selectedEvent.title}
              helper={selectedEvent.eventType || selectedEvent.type || 'event'}
            />
            <SummaryCard
              icon="bi bi-people"
              label="Ranked recipients"
              value={participantRecipients.length}
              helper="contestants from scores"
            />
            <SummaryCard
              icon="bi bi-person-badge"
              label="Officials"
              value={judgeRecipients.length}
              helper="judges and manual names"
            />
            <SummaryCard
              icon="bi bi-award"
              label="Generated"
              value={eventCertificates.length}
              helper="ready for preview or PDF"
            />
          </div>

          {/* Template customization */}
          <div style={{ ...panelStyle, marginBottom: 20 }}>
            <div style={templateHeaderStyle}>
              <h3 style={{ ...headingStyle, marginBottom: 0 }}>
                <i className="bi bi-palette" style={{ marginRight: 8, color: '#2563eb' }} />
                Certificate Template
              </h3>
              <button
                type="button"
                onClick={() => handlePreviewTemplate()}
                style={templatePreviewButtonStyle}
              >
                <i className="bi bi-eye" style={{ marginRight: 8 }} />
                Preview Template
              </button>
            </div>
            <div style={logoPreviewStyle}>
              <img
                src={btechLogo}
                alt="Certificate logo"
                style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: '50%' }}
              />
              <div>
                <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 900 }}>BTECH Logo</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>Included in the certificate header and watermark</div>
              </div>
            </div>

            <div style={templateUploadGridStyle}>
              <div style={templateUploadBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={templateUploadIconStyle}>
                    <i className="bi bi-cloud-arrow-up" />
                  </div>
                  <div>
                    <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 900 }}>Upload Canva / PDF Template</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>PNG, JPG, WEBP, or PDF up to {formatFileSize(TEMPLATE_UPLOAD_MAX_BYTES)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ ...secondaryButtonStyle, display: 'inline-flex' }}>
                    <i className="bi bi-upload" style={{ marginRight: 8 }} />
                    Choose File
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleTemplateUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {hasUploadedTemplate && !uploadedTemplateIsPdf && (
                    <button
                      type="button"
                      onClick={handleScanUploadedTemplate}
                      disabled={isScanningTemplate}
                      style={{ ...secondaryButtonStyle, opacity: isScanningTemplate ? 0.7 : 1 }}
                    >
                      <i className={isScanningTemplate ? 'bi bi-arrow-repeat' : 'bi bi-magic'} style={{ marginRight: 8 }} />
                      {isScanningTemplate ? 'Scanning...' : 'Scan Template'}
                    </button>
                  )}
                  {hasUploadedTemplate && (
                    <button type="button" onClick={handleRemoveUploadedTemplate} style={removeTemplateButtonStyle}>
                      <i className="bi bi-x-lg" style={{ marginRight: 6 }} />
                      Remove
                    </button>
                  )}
                </div>
                {hasUploadedTemplate && (
                  <div style={{ color: '#475569', fontSize: 12 }}>
                    Using <strong>{template.customTemplateName}</strong>
                    {template.customTemplateSize ? ` (${formatFileSize(template.customTemplateSize)})` : ''}
                    {uploadedTemplateIsPdf ? ' as PDF preview.' : ' as certificate background.'}
                  </div>
                )}
                {template.customTemplateScanStatus && (
                  <div style={templateScanStatusStyle}>
                    <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />
                    {template.customTemplateScanStatus}
                  </div>
                )}
                <div style={templateUploadNoteStyle}>
                  Uploaded templates will only receive the recipient name. Keep the event, role, place, and other wording inside the Canva/PDF design.
                </div>
              </div>

              <div style={templatePreviewBoxStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Uploaded Preview
                  </div>
                </div>
                {hasUploadedTemplate ? (
                  uploadedTemplateIsPdf ? (
                    <iframe
                      src={template.customTemplateDataUrl}
                      title="Uploaded certificate PDF preview"
                      style={templatePreviewFrameStyle}
                    />
                  ) : (
                    <img
                      src={template.customTemplateDataUrl}
                      alt={template.customTemplateName || 'Uploaded certificate template preview'}
                      style={templatePreviewImageStyle}
                    />
                  )
                ) : (
                  <div style={templatePreviewEmptyStyle}>
                    <i className="bi bi-file-earmark-image" style={{ fontSize: 28, color: '#bfdbfe' }} />
                    <span>No uploaded template yet</span>
                  </div>
                )}
                {uploadedTemplateIsPdf && (
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>
                    PDF is preview-only here. Export as PNG/JPG if you want the system to place the recipient name on top.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
              {[
                ['Signer Name', 'signerName', tmpl.signerName],
                ['Signer Role', 'signerRole', tmpl.signerRole],
                ['Organization', 'organizationName', tmpl.organizationName],
              ].map(([label, key, val]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    value={template[key] || val || ''}
                    onChange={(e) => updateTemplate({ [key]: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            <div style={roleCopyGridStyle}>
              <div style={roleCopyBoxStyle}>
                <div style={roleCopyHeadingStyle}>
                  <i className="bi bi-trophy" style={{ color: '#2563eb' }} />
                  Contestant / Participant Certificate
                </div>
                <label style={labelStyle}>Certificate Title</label>
                <input
                  value={template.participantTitle || template.title || tmpl.participantTitle}
                  onChange={(e) => updateTemplate({ participantTitle: e.target.value })}
                  style={inputStyle}
                />
                <label style={{ ...labelStyle, marginTop: 10 }}>Message</label>
                <textarea
                  rows={3}
                  value={template.participantMessage || template.message || tmpl.participantMessage}
                  onChange={(e) => updateTemplate({ participantMessage: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical', height: 'auto' }}
                />
              </div>

              <div style={roleCopyBoxStyle}>
                <div style={roleCopyHeadingStyle}>
                  <i className="bi bi-person-badge" style={{ color: '#8b5cf6' }} />
                  Judge / Official Certificate
                </div>
                <label style={labelStyle}>Certificate Title</label>
                <input
                  value={template.judgeTitle || tmpl.judgeTitle}
                  onChange={(e) => updateTemplate({ judgeTitle: e.target.value })}
                  style={inputStyle}
                />
                <label style={{ ...labelStyle, marginTop: 10 }}>Message</label>
                <textarea
                  rows={3}
                  value={template.judgeMessage || tmpl.judgeMessage}
                  onChange={(e) => updateTemplate({ judgeMessage: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical', height: 'auto' }}
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '2px solid #e5efff' }}>
            {[['contestants', 'Contestants'], ['judges', 'Judges / Officials'], ['generated', `Generated (${eventCertificates.length})`]].map(
              ([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    background: 'transparent',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: activeTab === key ? '#2563eb' : '#64748b',
                    borderBottom: activeTab === key ? '2px solid #2563eb' : '2px solid transparent',
                    marginBottom: -2,
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>

          {/* Contestants tab */}
          {activeTab === 'contestants' && (
            <div style={panelStyle}>
              {leaderboard.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 14 }}>No scores found for this event yet. Score data is needed to generate contestant certificates.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5efff' }}>
                      {['Rank', 'Name', 'Score', 'Category', 'Actions'].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => {
                      const cert = eventCertificates.find(
                        (c) => String(c.recipientId) === String(entry.contestantId) && !JUDGE_CATEGORIES.includes(c.category)
                      );
                      return (
                        <tr key={entry.contestantId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              background: entry.rank <= 3 ? '#fef3c7' : '#eff6ff',
                              color: entry.rank <= 3 ? '#92400e' : '#1d4ed8',
                            }}>
                              {placementLabel(entry.rank, null)}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#0f172a' }}>{entry.contestantName}</td>
                          <td style={tdStyle}>{entry.averageScore}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(categoryFromPlacement(entry.rank))}>
                              {categoryFromPlacement(entry.rank)}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {cert ? (
                              <button
                                onClick={() => setPreviewCert(cert)}
                                style={{ ...actionButtonStyle }}
                              >
                                <i className="bi bi-eye" style={{ marginRight: 6 }} />
                                Preview & Download
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePreviewTemplate({
                                  id: entry.contestantId,
                                  name: entry.contestantName,
                                  score: entry.averageScore,
                                  placement: entry.rank,
                                })}
                                style={{ ...actionButtonStyle, background: '#ffffff' }}
                              >
                                <i className="bi bi-eye" style={{ marginRight: 6 }} />
                                Preview Template
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Judges tab */}
          {activeTab === 'judges' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Auto-detected from scores */}
              <div style={panelStyle}>
                <h3 style={headingStyle}>
                  <i className="bi bi-magic" style={{ marginRight: 8, color: '#8b5cf6' }} />
                  Detected from Scores
                </h3>
                {autoJudgeNames.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    No judges detected yet. Judges will appear here automatically after they submit scores via QR.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {autoJudgeNames.map((name) => (
                      <span key={name} style={{ padding: '6px 14px', borderRadius: 999, background: '#ede9fe', color: '#5b21b6', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="bi bi-person-check" />
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual additions */}
              <div style={panelStyle}>
                <h3 style={headingStyle}>Additional Officials (Optional)</h3>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>Add organizers or officials who didn't score but should receive a certificate. One name per line.</p>
                <textarea
                  rows={4}
                  value={judgeNames}
                  onChange={(e) => setJudgeNames(e.target.value)}
                  placeholder="Maria Santos&#10;..."
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              {/* Combined preview */}
              {judgeRecipients.length > 0 && (
                <div style={panelStyle}>
                  <h3 style={headingStyle}>All Judge / Official Certificates ({judgeRecipients.length})</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {judgeRecipients.map((j) => {
                      const cert = eventCertificates.find(
                        (c) => c.category === 'judge' && c.recipientName === j.name
                      );
                      const isAuto = autoJudgeNames.includes(j.name);
                      return (
                        <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fbff', borderRadius: 10, border: '1px solid #dbeafe' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="bi bi-person-badge" style={{ color: '#8b5cf6' }} />
                            {j.name}
                            {isAuto && (
                              <span style={{ fontSize: 10, background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>
                                from scores
                              </span>
                            )}
                          </span>
                          {cert ? (
                            <button onClick={() => setPreviewCert(cert)} style={actionButtonStyle}>
                              <i className="bi bi-eye" style={{ marginRight: 6 }} /> Preview & Download
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePreviewTemplate(j)}
                              style={{ ...actionButtonStyle, background: '#ffffff' }}
                            >
                              <i className="bi bi-eye" style={{ marginRight: 6 }} /> Preview Template
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated tab */}
          {activeTab === 'generated' && (
            <div style={panelStyle}>
              {eventCertificates.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 14 }}>No certificates generated yet. Click "Generate All Certificates" above.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5efff' }}>
                      {['Recipient', 'Category', 'Cert ID', 'Issued', 'Actions'].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eventCertificates.map((cert) => (
                      <tr key={cert.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#0f172a' }}>{cert.recipientName}</td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(cert.category === 'judge' ? 'judge' : categoryFromPlacement(cert.placement))}>
                            {cert.category === 'judge' ? 'judge' : categoryFromPlacement(cert.placement)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{cert.verificationCode}</td>
                        <td style={tdStyle}>{new Date(cert.issuedAt).toLocaleDateString()}</td>
                        <td style={tdStyle}>
                          <button onClick={() => setPreviewCert(cert)} style={actionButtonStyle}>
                            <i className="bi bi-eye" style={{ marginRight: 6 }} /> Preview & Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {!selectedEvent && (
        <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 60, color: '#94a3b8' }}>
          <i className="bi bi-award" style={{ fontSize: 56, color: '#bfdbfe' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b' }}>Select an event to get started</div>
          <div style={{ fontSize: 14 }}>Choose an event from the dropdown above to generate and manage certificates.</div>
        </div>
      )}

      {/* Certificate preview modal */}
      {previewCert && (
        <CertificateModal
          certificate={previewCert}
          template={template}
          onClose={() => setPreviewCert(null)}
        />
      )}

      {/* Hidden certificate for bulk export */}
      {hiddenCertData && (
        <div style={{ position: 'fixed', left: -9999, top: -9999, zIndex: -1 }}>
          <CertificateRenderer ref={hiddenCertRef} certificate={hiddenCertData} template={template} />
        </div>
      )}
    </DashboardLayout>
  );
}

const tmpl = {
  title: 'Certificate of Achievement',
  participantTitle: 'Certificate of Achievement',
  participantMessage: 'Presented in recognition of outstanding performance and participation as a contestant in this event.',
  judgeTitle: 'Certificate of Appreciation',
  judgeMessage: 'Presented in appreciation of fair judging, professional evaluation, and service as an official for this event.',
  signerName: 'FairPlay Event Director',
  signerRole: 'Event Director',
  organizationName: 'FairPlay',
  message: 'Presented in recognition of outstanding performance and participation.',
};

const CATEGORY_BADGE_COLORS = {
  champion: { bg: '#fef3c7', color: '#92400e' },
  second: { bg: '#f3f4f6', color: '#374151' },
  third: { bg: '#fde8d0', color: '#92400e' },
  judge: { bg: '#ede9fe', color: '#5b21b6' },
  participant: { bg: '#eff6ff', color: '#1d4ed8' },
};

function badgeStyle(category) {
  const colors = CATEGORY_BADGE_COLORS[category] || CATEGORY_BADGE_COLORS.participant;
  return {
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: colors.bg,
    color: colors.color,
    display: 'inline-block',
    textTransform: 'capitalize',
  };
}

function SummaryCard({ icon, label, value, helper }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryIconStyle}>
        <i className={icon} />
      </div>
      <div>
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ color: '#0f172a', fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
          {String(value ?? '-')}
        </div>
        <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
          {helper}
        </div>
      </div>
    </div>
  );
}

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 14,
  marginBottom: 20,
};

const summaryCardStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 18,
  padding: 18,
  boxShadow: '0 16px 34px rgba(37,99,235,0.08)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const summaryIconStyle = {
  width: 42,
  height: 42,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #dbeafe, #e0f2fe)',
  color: '#2563eb',
  fontSize: 18,
  flexShrink: 0,
};

const logoPreviewStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  marginBottom: 16,
  borderRadius: 14,
  border: '1px solid #bfdbfe',
  background: 'linear-gradient(135deg, #eff6ff, #f8fbff)',
};

const templateHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 16,
};

const templatePreviewButtonStyle = {
  padding: '8px 14px',
  borderRadius: 10,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#2563eb',
  fontWeight: 800,
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

const templateUploadGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 14,
  marginBottom: 16,
  alignItems: 'stretch',
};

const templateUploadBoxStyle = {
  border: '1px dashed #93c5fd',
  borderRadius: 14,
  padding: 14,
  background: '#f8fbff',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const templateUploadIconStyle = {
  width: 42,
  height: 42,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  background: '#eff6ff',
  color: '#2563eb',
  fontSize: 18,
  flexShrink: 0,
};

const templateUploadNoteStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#fff7ed',
  border: '1px solid #fed7aa',
  color: '#9a3412',
  fontSize: 12,
  lineHeight: 1.45,
};

const templateScanStatusStyle = {
  padding: '9px 12px',
  borderRadius: 10,
  background: '#ecfdf5',
  border: '1px solid #bbf7d0',
  color: '#047857',
  fontSize: 12,
  lineHeight: 1.45,
  display: 'flex',
  alignItems: 'flex-start',
};

const roleCopyGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: 14,
};

const roleCopyBoxStyle = {
  padding: 14,
  borderRadius: 14,
  border: '1px solid #dbeafe',
  background: '#f8fbff',
};

const roleCopyHeadingStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#0f172a',
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 12,
};

const templatePreviewBoxStyle = {
  border: '1px solid #dbeafe',
  borderRadius: 14,
  padding: 12,
  background: '#ffffff',
  minHeight: 198,
};

const templatePreviewFrameStyle = {
  width: '100%',
  height: 170,
  border: '1px solid #dbeafe',
  borderRadius: 10,
  background: '#f8fafc',
};

const templatePreviewImageStyle = {
  width: '100%',
  height: 170,
  objectFit: 'contain',
  border: '1px solid #dbeafe',
  borderRadius: 10,
  background: '#f8fafc',
  display: 'block',
};

const templatePreviewEmptyStyle = {
  height: 170,
  border: '1px dashed #bfdbfe',
  borderRadius: 10,
  background: '#f8fbff',
  color: '#94a3b8',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 12,
};

const removeTemplateButtonStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #fecaca',
  color: '#dc2626',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

const fieldStyle = {
  padding: '10px 16px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  minWidth: 260,
  boxShadow: '0 10px 30px rgba(37,99,235,0.08)',
};

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #bfdbfe',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 4,
};

const primaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  color: '#ffffff',
  border: 'none',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  boxShadow: '0 16px 32px rgba(37,99,235,0.18)',
  display: 'flex',
  alignItems: 'center',
};

const secondaryButtonStyle = {
  padding: '10px 20px',
  borderRadius: 12,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#2563eb',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const actionButtonStyle = {
  padding: '6px 14px',
  borderRadius: 10,
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  color: '#2563eb',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const panelStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const headingStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 16,
  marginTop: 0,
  color: '#0f172a',
};

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  color: '#64748b',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 13,
  color: '#475569',
};
