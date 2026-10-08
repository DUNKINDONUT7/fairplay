import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { describeScoreBands } from './rubricTools';

const INK = [17, 24, 39];
const MUTED = [90, 99, 115];
const NAVY = [23, 37, 84];
const RULE = [148, 163, 184];
const MARGIN = 20;

// jsPDF's built-in fonts only cover WinAnsi, so AI-written punctuation that
// falls outside it would print as garbage.
export function clean(value) {
  return String(value ?? '')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐-—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '')
    .trim();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatWeight(weight) {
  const number = Number(weight || 0);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

export function buildCriteriaPdf({ event = {}, rubric = {}, preparedBy = '' }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const centerX = pageWidth / 2;
  const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);

  const ensureSpace = (y, needed) => {
    if (y + needed <= pageHeight - 24) return y;
    doc.addPage();
    return MARGIN + 4;
  };

  // ---- Letterhead ----
  let y = MARGIN;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y + 1.4, pageWidth - MARGIN, y + 1.4);

  y += 13;
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  const titleLines = doc.splitTextToSize(clean(event.title || 'Untitled Event').toUpperCase(), contentWidth - 10);
  doc.text(titleLines, centerX, y, { align: 'center' });
  y += titleLines.length * 8;

  const eventLine = [clean(event.typeLabel), formatDate(event.date), clean(event.venue)].filter(Boolean).join('   |   ');
  if (eventLine) {
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    const eventLines = doc.splitTextToSize(eventLine, contentWidth);
    doc.text(eventLines, centerX, y, { align: 'center' });
    y += eventLines.length * 5;
  }

  y += 6;
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  // jsPDF centers on the unspaced width, so pull back half the added tracking.
  const heading = 'OFFICIAL CRITERIA FOR JUDGING';
  doc.text(heading, centerX - (heading.length * 0.6) / 2, y, { align: 'center', charSpace: 0.6 });
  y += 4;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(centerX - 32, y, centerX + 32, y);
  y += 9;

  // ---- Criteria table ----
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 24 },
    theme: 'grid',
    head: [['No.', 'Criteria', 'Score Range', 'Weight']],
    body: criteria.map((criterion, index) => [
      String(index + 1),
      { name: clean(criterion.name), description: clean(criterion.description) },
      clean(criterion.scoringRange),
      formatWeight(criterion.weight),
    ]),
    foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatWeight(totalWeight)]],
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: { font: 'times', fontSize: 11, textColor: INK, lineColor: RULE, lineWidth: 0.2, cellPadding: 3, valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
    },
    // The Criteria cell is drawn by hand so the name can be bold above its
    // description. autoTable still wraps the text and sizes the row; we only
    // take over the painting.
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const { name, description } = data.cell.raw;
      data.cell.criterionName = name;
      data.cell.text = description ? [name, description] : [name];
    },
    willDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const innerWidth = data.cell.width - data.cell.padding('horizontal');
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      data.cell.criterionNameLines = doc.splitTextToSize(data.cell.criterionName, innerWidth).length;
      data.cell.criterionLines = [...data.cell.text];
      data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const lines = data.cell.criterionLines;
      const nameCount = Math.min(data.cell.criterionNameLines, lines.length);
      const lineHeight = (11 * 1.15 * 25.4) / 72;
      const textX = data.cell.x + data.cell.padding('left');
      const textY = data.cell.y + (data.cell.height - lines.length * lineHeight) / 2 + lineHeight * 0.78;
      doc.setFontSize(11);
      doc.setFont('times', 'bold');
      doc.setTextColor(...INK);
      doc.text(lines.slice(0, nameCount), textX, textY, { lineHeightFactor: 1.15 });
      if (lines.length > nameCount) {
        doc.setFont('times', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(lines.slice(nameCount), textX, textY + nameCount * lineHeight, { lineHeightFactor: 1.15 });
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- Section helpers ----
  const sectionHeading = (label) => {
    y = ensureSpace(y, 18);
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(label.toUpperCase(), MARGIN, y, { charSpace: 0.4 });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 1.8, pageWidth - MARGIN, y + 1.8);
    y += 8;
  };

  const numberedItem = (number, label, body) => {
    const indent = 7;
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    const bodyLines = doc.splitTextToSize(body, contentWidth - indent);
    const height = (label ? 5.2 : 0) + bodyLines.length * 5.2 + 2.5;
    y = ensureSpace(y, height);
    doc.setTextColor(...INK);
    doc.text(`${number}.`, MARGIN, y);
    if (label) {
      doc.setFont('times', 'bold');
      doc.text(label, MARGIN + indent, y);
      y += 5.2;
      doc.setFont('times', 'normal');
    }
    doc.text(bodyLines, MARGIN + indent, y, { lineHeightFactor: 1.3 });
    y += bodyLines.length * 5.2 + 2.5;
  };

  // ---- Guidelines for judges ----
  const guidelines = criteria
    .map((criterion) => ({ name: clean(criterion.name), text: clean(criterion.judgeInstructions) }))
    .filter((item) => item.text);
  const generalInstruction = clean(rubric.judgeInstructions);

  if (guidelines.length || generalInstruction) {
    sectionHeading('Guidelines for Judges');
    if (generalInstruction) {
      doc.setFont('times', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(generalInstruction, contentWidth);
      y = ensureSpace(y, lines.length * 5.2 + 3);
      doc.text(lines, MARGIN, y, { lineHeightFactor: 1.3 });
      y += lines.length * 5.2 + 3;
    }
    guidelines.forEach((item, index) => numberedItem(index + 1, item.name, item.text));
    y += 4;
  }

  // ---- Score guide ----
  // Laid out as "Level (scores): text" lines under each criterion's name;
  // parseFairPlayCriteriaDocument reads this section back on re-upload.
  const guided = criteria
    .map((criterion) => ({
      name: clean(criterion.name),
      bands: describeScoreBands(criterion.scoreGuide, criterion.scoringRange).filter((band) => clean(band.description)),
    }))
    .filter((item) => item.bands.length);

  if (guided.length) {
    sectionHeading('Score Guide');
    guided.forEach((item, index) => {
      const indent = 7;
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      const bandLines = item.bands.map((band) => doc.splitTextToSize(`${band.label} (${band.rangeLabel}): ${clean(band.description)}`, contentWidth - indent));
      const lineCount = bandLines.reduce((sum, lines) => sum + lines.length, 0);
      y = ensureSpace(y, 5.2 + lineCount * 5.2 + 2.5);
      doc.setTextColor(...INK);
      doc.text(`${index + 1}.`, MARGIN, y);
      doc.setFont('times', 'bold');
      doc.text(item.name, MARGIN + indent, y);
      y += 5.2;
      doc.setFont('times', 'normal');
      bandLines.forEach((lines) => {
        doc.text(lines, MARGIN + indent, y, { lineHeightFactor: 1.3 });
        y += lines.length * 5.2;
      });
      y += 2.5;
    });
    y += 4;
  }

  // ---- Scoring and tie-breaking ----
  const tieBreakers = (Array.isArray(rubric.tieBreaker) ? rubric.tieBreaker : []).map(clean).filter(Boolean);
  sectionHeading('Scoring and Tie-Breaking');
  const scoringRules = [
    `Scoring method: ${clean(rubric.scoringMethod) || 'Weighted Rubric'}. Each criterion is scored within its stated range and weighted by the percentage shown above.`,
    ...tieBreakers.map((rule, index) => `Tie-breaker ${index + 1}: ${rule}.`.replace(/\.\.$/, '.')),
    'The decision of the Board of Judges is final and irrevocable.',
  ];
  scoringRules.forEach((rule, index) => numberedItem(index + 1, '', rule));

  // ---- Signatures ----
  y = ensureSpace(y + 14, 30) + 14;
  const signatureWidth = 68;
  const signature = (x, name, role) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(x, y, x + signatureWidth, y);
    if (name) {
      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(name, x + signatureWidth / 2, y - 1.8, { align: 'center' });
    }
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(role, x + signatureWidth / 2, y + 4.6, { align: 'center' });
  };
  signature(MARGIN, clean(preparedBy), 'Prepared by: Event Organizer');
  signature(pageWidth - MARGIN - signatureWidth, '', 'Approved by: Chairperson, Board of Judges');

  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  const generatedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 15, pageWidth - MARGIN, pageHeight - 15);
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`Prepared with FairPlay  |  ${generatedOn}`, MARGIN, pageHeight - 10.5);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 10.5, { align: 'right' });
  }

  return doc;
}

export function downloadCriteriaPdf(options) {
  const doc = buildCriteriaPdf(options);
  doc.save(`${slugify(options?.event?.title)}-criteria-for-judging.pdf`);
}
