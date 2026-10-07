import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clean } from './criteriaPdf';
import { formatReportDate, formatScore, ordinal } from './eventReport';

// Same navy / slate palette as the admin system report so every FairPlay PDF
// reads as one family.
const NAVY = [13, 21, 54];
const INK = [15, 23, 42];
const BODY = [51, 65, 85];
const MUTED = [100, 116, 139];
const RULE = [226, 232, 240];
const SOFT = [241, 245, 249];
const ACCENT = [37, 99, 235];
const MARGIN = 14;

const text = (value, fallback = '-') => clean(value) || fallback;
const score = (value) => (value === null || value === undefined ? '-' : formatScore(value));

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

export function buildEventReportPdf(report, { organizerName = '', organizerEmail = '' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const generatedAt = new Date();
  const { info, stats } = report;
  const isFinal = report.reportStatus === 'final';
  const bottomLimit = pageHeight - 18;
  let y = 0;

  const tableDefaults = {
    margin: { left: MARGIN, right: MARGIN, top: 22, bottom: 18 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: BODY, lineColor: RULE, lineWidth: 0.2, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    rowPageBreak: 'avoid',
  };

  const ensureSpace = (needed) => {
    if (y + needed <= bottomLimit) return;
    doc.addPage();
    y = 24;
  };

  const sectionTitle = (label, note = '') => {
    ensureSpace(16);
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y - 3.4, 1.4, 4.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(label, MARGIN + 4, y);
    if (note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(note, pageWidth - MARGIN, y, { align: 'right' });
    }
    y += 5.5;
  };

  const paragraph = (value, { size = 8.5, color = BODY, gap = 4 } = {}) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(value), contentWidth);
    ensureSpace(lines.length * (size * 0.42) + gap);
    doc.setTextColor(...color);
    doc.text(lines, MARGIN, y);
    y += lines.length * (size * 0.42) + gap;
  };

  // =========================== PAGE 1 ===========================
  // ---- Cover banner ----
  const bannerHeight = 40;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, 8, 14, 14, 3.5, 3.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text('F', MARGIN + 7, 17.4, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('FairPlay', MARGIN + 18, 13.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(176, 190, 230);
  doc.text('EVENT MANAGEMENT & JUDGING PLATFORM', MARGIN + 18, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(176, 190, 230);
  doc.text(isFinal ? 'OFFICIAL EVENT REPORT' : 'PRELIMINARY EVENT REPORT', pageWidth - MARGIN, 13.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Generated ${clean(formatReportDate(generatedAt, true))}`, pageWidth - MARGIN, 18, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(text(info.title, 'Untitled Event'), contentWidth).slice(0, 2);
  doc.text(titleLines, MARGIN, 31 - (titleLines.length - 1) * 3);
  y = bannerHeight + 9;

  if (!isFinal) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(MARGIN, y - 4, contentWidth, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 64, 14);
    doc.text('PRELIMINARY - This event has not been finalized. Scores and rankings may still change.', MARGIN + 3, y + 1.6);
    y += 11;
  }

  // ---- Event information ----
  sectionTitle('Event Information');
  const organizer = [clean(organizerName), clean(organizerEmail || info.organizerEmail)].filter(Boolean).join('  |  ');
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    theme: 'plain',
    styles: { ...tableDefaults.styles, lineWidth: 0, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 3 }, fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 30, textColor: MUTED },
      1: { cellWidth: contentWidth / 2 - 30, textColor: INK, fontStyle: 'bold' },
      2: { cellWidth: 30, textColor: MUTED },
      3: { textColor: INK, fontStyle: 'bold' },
    },
    alternateRowStyles: {},
    body: [
      ['Event name', text(info.title), 'Category', text(info.category)],
      ['Starts', clean(formatReportDate(info.start, true)), 'Ends', clean(formatReportDate(info.end, true))],
      ['Venue', text(info.venue, 'Not set'), 'Event status', `${text(info.status)} (${info.completionLabel})`],
      ['Organizer', organizer || '-', 'Scoring method', text(info.scoringMethod, report.isTournament ? 'Bracket results' : '-')],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---- Event summary tiles ----
  sectionTitle('Event Summary');
  const tiles = report.isJudged
    ? [
        ['Participants', stats.totalParticipants],
        ['Judges', stats.totalJudges],
        ['Evaluations', `${stats.completedEvaluations}/${stats.expectedEvaluations}`],
        ['Average Score', score(stats.averageScore)],
        ['Champion', text(report.champion, 'TBD')],
      ]
    : [
        ['Participants', stats.totalParticipants],
        ['Brackets', report.tournament.brackets.length],
        ['Matches', `${report.tournament.completedMatches}/${report.tournament.totalMatches}`],
        ['Rounds', report.tournament.totalRounds || '-'],
        ['Champion', text(report.champion, 'TBD')],
      ];
  const tileGap = 3;
  const tileWidth = (contentWidth - tileGap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], index) => {
    const x = MARGIN + index * (tileWidth + tileGap);
    doc.setDrawColor(...RULE);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, tileWidth, 17, 1.8, 1.8, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(String(label).toUpperCase(), x + 3, y + 5.5);
    doc.setFont('helvetica', 'bold');
    const valueText = String(value);
    doc.setFontSize(valueText.length > 12 ? 8 : 12);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(valueText, tileWidth - 6).slice(0, 2), x + 3, y + (valueText.length > 12 ? 10.5 : 12.5));
  });
  y += 25;

  // ---- Overall statistics ----
  if (report.isJudged) {
    sectionTitle('Overall Statistics', stats.maxScore ? `Scores are on a ${formatScore(stats.maxScore)}-point scale` : '');
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Measure', 'Value', 'Measure', 'Value']],
      columnStyles: { 0: { cellWidth: 46 }, 1: { fontStyle: 'bold', textColor: INK }, 2: { cellWidth: 46 }, 3: { fontStyle: 'bold', textColor: INK } },
      body: [
        ['Total participants', stats.totalParticipants, 'Total judges', stats.totalJudges],
        ['Scores submitted', stats.scoresSubmitted, 'Teams / groups', stats.totalTeams || '-'],
        ['Completed evaluations', stats.completedEvaluations, 'Pending evaluations', stats.pendingEvaluations],
        ['Average event score', score(stats.averageScore), 'Locked evaluations', stats.lockedEvaluations],
        ['Highest score', stats.highestParticipant ? `${score(stats.highestScore)} - ${text(stats.highestParticipant.name)}` : '-',
          'Lowest score', stats.lowestParticipant ? `${score(stats.lowestScore)} - ${text(stats.lowestParticipant.name)}` : '-'],
      ],
    });
    y = doc.lastAutoTable.finalY + 8;

    if (report.criteriaAnalysis.length) {
      sectionTitle('Criteria Performance');
      autoTable(doc, {
        ...tableDefaults,
        startY: y,
        head: [['Criterion', 'Weight', 'Max Points', 'Average', '% of Max', 'Highest', 'Lowest']],
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold', textColor: INK }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' } },
        body: report.criteriaAnalysis.map((criterion) => [
          text(criterion.name), `${criterion.weight}%`, criterion.max, score(criterion.average),
          criterion.percent === null ? '-' : `${criterion.percent.toFixed(1)}%`, criterion.highest ?? '-', criterion.lowest ?? '-',
        ]),
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    if (report.judgeAnalysis.length) {
      sectionTitle('Judging Activity');
      autoTable(doc, {
        ...tableDefaults,
        startY: y,
        head: [['Judge', 'Scored', 'Completion', 'Average Given', 'Highest Given', 'Lowest Given']],
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold', textColor: INK }, 4: { halign: 'center' }, 5: { halign: 'center' } },
        body: report.judgeAnalysis.map((judge) => [
          text(judge.name), `${judge.scored} of ${judge.expected}`, `${judge.completion.toFixed(0)}%`,
          score(judge.average), score(judge.highest), score(judge.lowest),
        ]),
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ---- Tournament results ----
  if (report.tournament.brackets.length) {
    report.tournament.brackets.forEach((bracket) => {
      sectionTitle(`Bracket Results - ${text(bracket.title)}`, bracket.champion ? `Champion: ${text(bracket.champion)}` : 'No champion yet');
      if (bracket.matches.length === 0) {
        paragraph('No matches have been generated for this bracket yet.', { color: MUTED });
        return;
      }
      if (bracket.standings.length) {
        autoTable(doc, {
          ...tableDefaults,
          startY: y,
          head: [['Place', 'Team', 'Win-Loss', 'Result']],
          columnStyles: { 0: { cellWidth: 18, halign: 'center', fontStyle: 'bold', textColor: INK }, 1: { halign: 'left', textColor: INK }, 2: { cellWidth: 26, halign: 'center' }, 3: { halign: 'left' } },
          body: bracket.standings.map((row) => [
            row.final ? ordinal(row.placement) : '-',
            text(row.name),
            `${row.wins}-${row.losses}`,
            !row.final ? 'In progress' : row.placement === 1 ? 'Champion' : row.eliminatedRound ? `Eliminated in round ${row.eliminatedRound}` : '-',
          ]),
          didParseCell: (data) => {
            if (data.section === 'body' && bracket.standings[data.row.index]?.final && bracket.standings[data.row.index].placement <= 3) {
              data.cell.styles.fillColor = bracket.standings[data.row.index].placement === 1 ? [219, 234, 254] : [239, 246, 255];
            }
          },
        });
        y = doc.lastAutoTable.finalY + 5;
      }
      autoTable(doc, {
        ...tableDefaults,
        startY: y,
        head: [['Round', 'Match', 'Score', 'Winner', 'Status']],
        columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { halign: 'left' }, 2: { cellWidth: 22, halign: 'center' }, 3: { fontStyle: 'bold', textColor: INK }, 4: { cellWidth: 24, halign: 'center' } },
        body: bracket.matches.map((match) => [
          match.round || '-', `${text(match.team1)} vs ${text(match.team2)}`,
          match.status === 'completed' ? `${match.score1 ?? 0} - ${match.score2 ?? 0}` : '-',
          text(match.winner), text(match.status),
        ]),
      });
      y = doc.lastAutoTable.finalY + 8;
    });
  }

  if (!report.isJudged && report.tournament.brackets.length === 0) {
    paragraph('No scores or match results have been recorded for this event yet. Results will appear in this report once judges submit their evaluations or matches are completed.', { color: MUTED });
  }

  // =========================== PAGE 2: rankings ===========================
  if (report.isJudged) {
    doc.addPage();
    y = 24;
    sectionTitle('Final Rankings and Participant Results', `${report.ranked.length} of ${report.participants.length} participants ranked`);
    if (info.audienceEnabled) {
      paragraph(`Final score = judges' average (${100 - info.audienceWeight}%) + audience average (${info.audienceWeight}%).`, { size: 7.5, color: MUTED, gap: 3 });
    }
    if (report.participants.length === 0) {
      paragraph('This event has no participants yet.', { color: MUTED });
    } else {
      autoTable(doc, {
        ...tableDefaults,
        startY: y,
        head: [['Rank', 'No.', 'Participant', 'Team / Organization', 'Total', 'Average', 'Final', 'Placement', 'Status']],
        columnStyles: {
          0: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: INK },
          1: { cellWidth: 11, halign: 'center' },
          2: { halign: 'left', textColor: INK },
          3: { halign: 'left' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 17, halign: 'center' },
          6: { cellWidth: 16, halign: 'center', fontStyle: 'bold', textColor: INK },
          7: { cellWidth: 26, halign: 'center' },
          8: { cellWidth: 22, halign: 'center' },
        },
        body: report.participants.map((participant) => [
          participant.rank || '-', participant.number || '-', text(participant.name), text(participant.team),
          score(participant.total), score(participant.average), score(participant.final),
          participant.rank ? (participant.award ? `${participant.placement}\n${participant.award}` : participant.placement) : '-',
          participant.status,
        ]),
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const rank = report.participants[data.row.index]?.rank;
          if (rank && rank <= 3) {
            data.cell.styles.fillColor = rank === 1 ? [219, 234, 254] : [239, 246, 255];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // ---- Score matrix: every judge's total for every participant ----
    if (report.judges.length && report.evaluations.length) {
      sectionTitle('Judge Score Matrix', 'Each cell is the judge\'s weighted total');
      autoTable(doc, {
        ...tableDefaults,
        startY: y,
        styles: { ...tableDefaults.styles, fontSize: report.judges.length > 6 ? 6.5 : 7.5, halign: 'center' },
        head: [['Rank', 'Participant', ...report.judges.map((judge) => text(judge.name)), 'Total', 'Average', 'Final']],
        columnStyles: { 0: { cellWidth: 11 }, 1: { halign: 'left', textColor: INK } },
        body: report.participants.map((participant) => [
          participant.rank || '-', text(participant.name),
          ...report.judges.map((judge) => (participant.byJudge[judge.key] ? score(participant.byJudge[judge.key].total) : '-')),
          score(participant.total), score(participant.average), score(participant.final),
        ]),
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // =========================== PAGE 3+: per-participant detail ===========================
    const detailed = report.participants.filter((participant) => participant.evaluations.length > 0);
    if (detailed.length && report.criteria.length) {
      doc.addPage();
      y = 24;
      sectionTitle('Detailed Judge Scores per Participant', 'Criterion scores exactly as each judge submitted them');
      y += 1;

      detailed.forEach((participant) => {
        const scoringJudges = report.judges.filter((judge) => participant.byJudge[judge.key]);
        // Keep a participant's heading together with at least the start of their table.
        ensureSpace(16 + Math.min(report.criteria.length + 2, 8) * 6);

        doc.setFillColor(...SOFT);
        doc.setDrawColor(...RULE);
        doc.roundedRect(MARGIN, y, contentWidth, 11, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        const heading = `${participant.rank ? `${ordinal(participant.rank)}  ` : ''}${text(participant.name)}${participant.number ? `  (No. ${participant.number})` : ''}`;
        doc.text(doc.splitTextToSize(heading, contentWidth - 96)[0], MARGIN + 3, y + 4.6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(text(participant.team, 'No team / organization'), MARGIN + 3, y + 8.8);
        doc.setFontSize(7.5);
        doc.text(`Total ${score(participant.total)}   |   Average ${score(participant.average)}`, pageWidth - MARGIN - 34, y + 6.8, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...ACCENT);
        doc.text(`Final ${score(participant.final)}`, pageWidth - MARGIN - 3, y + 7, { align: 'right' });
        y += 12.5;

        autoTable(doc, {
          ...tableDefaults,
          startY: y,
          styles: { ...tableDefaults.styles, fontSize: scoringJudges.length > 6 ? 6.5 : 7.5, halign: 'center', cellPadding: 1.6 },
          head: [['Criterion', 'Weight', 'Max', ...scoringJudges.map((judge) => text(judge.name)), 'Average', '% of Max']],
          columnStyles: { 0: { halign: 'left', textColor: INK, cellWidth: 44 }, 1: { cellWidth: 14 }, 2: { cellWidth: 11 } },
          body: report.criteria.map((criterion) => {
            const values = scoringJudges.map((judge) => (
              participant.byJudge[judge.key].breakdown.find((item) => item.criterionId === criterion.id)?.score ?? 0
            ));
            const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
            return [
              text(criterion.name), `${criterion.weight}%`, criterion.max, ...values,
              mean.toFixed(2), criterion.max ? `${((mean / criterion.max) * 100).toFixed(1)}%` : '-',
            ];
          }),
          foot: [[
            { content: 'Weighted total per judge', colSpan: 3, styles: { halign: 'left' } },
            ...scoringJudges.map((judge) => ({ content: score(participant.byJudge[judge.key].total), styles: { halign: 'center' } })),
            { content: score(participant.average), styles: { halign: 'center' } },
            { content: stats.maxScore && participant.average !== null ? `${((participant.average / stats.maxScore) * 100).toFixed(1)}%` : '-', styles: { halign: 'center' } },
          ]],
          showFoot: 'lastPage',
        });
        y = doc.lastAutoTable.finalY + 2.5;

        if (participant.audienceAverage !== null) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...MUTED);
          ensureSpace(5);
          doc.text(`Audience average ${score(participant.audienceAverage)} from ${participant.audienceSubmissions} vote(s), weighted ${info.audienceWeight}% of the final score.`, MARGIN, y + 2);
          y += 4;
        }
        y += 5;
      });
    }
  }

  // ---- Certification block ----
  ensureSpace(34);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      isFinal
        ? 'This report reflects the finalized and locked results recorded in FairPlay for this event.'
        : 'This report reflects the results recorded in FairPlay at the time it was generated. The event has not been finalized.',
      contentWidth
    ),
    MARGIN,
    y
  );
  y += 18;
  const signatureWidth = 66;
  [[MARGIN, clean(organizerName), 'Event Organizer'], [pageWidth - MARGIN - signatureWidth, '', 'Chairperson, Board of Judges']].forEach(([x, name, role]) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(x, y, x + signatureWidth, y);
    if (name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(name, x + signatureWidth / 2, y - 1.8, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(role, x + signatureWidth / 2, y + 4.2, { align: 'center' });
  });

  // ---- Running header and footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text('FairPlay', MARGIN, 12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(text(info.title), contentWidth - 70)[0], MARGIN + 16, 12);
      doc.text(isFinal ? 'Official Event Report' : 'Preliminary Event Report', pageWidth - MARGIN, 12, { align: 'right' });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, 15, pageWidth - MARGIN, 15);
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 12, pageWidth - MARGIN, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${clean(formatReportDate(generatedAt, true))} with FairPlay`, MARGIN, pageHeight - 7.5);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 7.5, { align: 'right' });
  }

  return doc;
}

export function getEventReportFileName(report) {
  return `${slugify(report.info.title)}-${report.reportStatus === 'final' ? 'official' : 'preliminary'}-report.pdf`;
}
