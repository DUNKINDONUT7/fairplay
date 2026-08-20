import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAttendanceStore from '../../store/attendanceStore';
import useCertificateStore from '../../store/certificateStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import useScoreStore from '../../store/scoreStore';
import useTournamentStore from '../../store/tournamentStore';
import useAuthStore from '../../store/authStore';
import { callAiProxy } from '../../services/criteriaApiService';

function formatBytes(value) {
  return `${Math.max(1, Math.ceil(value / 1024))} KB`;
}

function getSavedTournamentReport(event) {
  if (!event?.metadata || !Array.isArray(event.metadata.generatedReports)) {
    return null;
  }

  return event.metadata.generatedReports.find((report) => report.category === 'tournament-result') || null;
}

function getChampionshipMatch(tournaments = [], eventId) {
  const related = tournaments.filter((tournament) => String(tournament.eventId) === String(eventId));

  for (const tournament of related) {
    const finalMatch = (tournament.matches || []).find(
      (match) =>
        Number(match.round || 0) === Number(tournament.totalRounds || 0) &&
        match.status === 'completed' &&
        match.winner
    );

    if (finalMatch) {
      return {
        tournament,
        match: finalMatch,
      };
    }
  }

  return null;
}

export default function OrganizerReports() {
  const { events, fetchEvents } = useEventStore();
  const { certificates, fetchCertificates, generateCertificatesForEvent } = useCertificateStore();
  const { fetchScores, calculateLeaderboard } = useScoreStore();
  const { fetchAttendance, getAttendanceSummary } = useAttendanceStore();
  const { tournaments, fetchTournaments } = useTournamentStore();
  const { success, error } = useNotificationStore();
  const { user } = useAuthStore();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [exportMode, setExportMode] = useState('pdf');
  const [previewCertificate, setPreviewCertificate] = useState(null);
  const [aiReport, setAiReport] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user?.id) fetchEvents(user.id);
    fetchAttendance();
    fetchCertificates();
    fetchScores();
    fetchTournaments();
  }, [fetchAttendance, fetchCertificates, fetchEvents, fetchScores, fetchTournaments, user?.id]);

  useEffect(() => {
    if (!selectedEventId) return;
    fetchAttendance(selectedEventId);
    fetchCertificates(selectedEventId);
    fetchScores(selectedEventId);
    fetchTournaments(selectedEventId);
  }, [fetchAttendance, fetchCertificates, fetchScores, fetchTournaments, selectedEventId]);

  const selectedEvent = events.find((event) => String(event.id) === String(selectedEventId)) || null;
  const attendanceSummary = selectedEvent ? getAttendanceSummary(selectedEvent.id) : null;
  const selectedSavedTournamentReport = selectedEvent ? getSavedTournamentReport(selectedEvent) : null;
  const selectedChampionshipMatch = selectedEvent ? getChampionshipMatch(tournaments, selectedEvent.id) : null;

  const reports = useMemo(() => {
    return events.map((event) => {
      const leaderboard = calculateLeaderboard(event.id, event.criteria || []);
      const eventCertificates = certificates.filter((certificate) => String(certificate.eventId) === String(event.id));
      const savedTournamentReport = getSavedTournamentReport(event);
      const championshipMatch = getChampionshipMatch(tournaments, event.id);
      const payload = JSON.stringify({
        event: event.title,
        leaderboard,
        certificates: eventCertificates,
        approvalWorkflow: event.approvalWorkflow || [],
        attendanceSummary: getAttendanceSummary(event.id),
        championshipMatch: savedTournamentReport
          ? {
              tournament: savedTournamentReport.tournamentTitle,
              round: savedTournamentReport.finalMatch?.round || null,
              matchId: savedTournamentReport.finalMatch?.id || null,
              winner: savedTournamentReport.champion?.name || savedTournamentReport.finalMatch?.winner?.name || null,
              score: `${savedTournamentReport.finalMatch?.score1 || 0}-${savedTournamentReport.finalMatch?.score2 || 0}`,
              contenders: [
                savedTournamentReport.finalMatch?.team1?.name || 'TBD',
                savedTournamentReport.finalMatch?.team2?.name || 'TBD',
              ],
              completedDate: savedTournamentReport.finalMatch?.completedDate || savedTournamentReport.savedAt || null,
              source: 'saved-report',
            }
          : championshipMatch
            ? {
                tournament: championshipMatch.tournament.title || championshipMatch.tournament.name,
                round: championshipMatch.match.round,
                matchId: championshipMatch.match.id,
                winner: championshipMatch.match.winner?.name || null,
                score: `${championshipMatch.match.score1 || 0}-${championshipMatch.match.score2 || 0}`,
                contenders: [
                  championshipMatch.match.team1?.name || 'TBD',
                  championshipMatch.match.team2?.name || 'TBD',
                ],
                completedDate: championshipMatch.match.completedDate || null,
                source: 'live-bracket',
              }
            : null,
      });

      return {
        id: event.id,
        name: `${event.title} Operational Report`,
        event: event.title,
        type: 'JSON',
        size: formatBytes(payload.length),
        date:
          savedTournamentReport?.savedAt ||
          savedTournamentReport?.finalMatch?.completedDate ||
          event.endDate ||
          event.startDate ||
          new Date().toISOString().slice(0, 10),
        downloadContent: payload,
      };
    });
  }, [calculateLeaderboard, certificates, events, getAttendanceSummary, tournaments]);

  const downloadTextReport = (fileName, content) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    success(`${fileName} downloaded.`);
  };

  const handleGenerateCertificates = async () => {
    if (!selectedEvent) {
      error('Select an event first.');
      return;
    }

    const leaderboard = calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || []);
    const generated = await generateCertificatesForEvent({
      event: selectedEvent,
      recipients: leaderboard.map((entry) => ({
        id: entry.contestantId,
        name: entry.contestantName,
        score: entry.averageScore,
        placement: entry.rank,
      })),
    });

    if (generated.length > 0) {
      setPreviewCertificate(generated[0]);
    }

    success(`Generated ${generated.length} certificates for ${selectedEvent.title}.`);
  };

  const printEventReport = (eventToPrint) => {
    if (!eventToPrint) {
      error('Select an event first.');
      return;
    }

    const leaderboard = calculateLeaderboard(eventToPrint.id, eventToPrint.criteria || []);
    const attendance = getAttendanceSummary(eventToPrint.id);
    const championshipMatch = getChampionshipMatch(tournaments, eventToPrint.id);
    const html = `
      <html>
        <head>
          <title>${eventToPrint.title} Report</title>
          <style>
            body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 32px; color: #111827; background: #fff; }
            h1 { font-size: 32px; margin-bottom: 8px; }
            p { margin: 0 0 16px; line-height: 1.6; }
            .badge { display:inline-block; padding:8px 14px; border-radius:999px; background:#eff6ff; color:#2563eb; font-weight:700; font-size:13px; }
            .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin-bottom:24px; }
            .panel { padding:18px; border:1px solid #e5e7eb; border-radius:18px; }
            .panel h2 { margin-bottom:12px; font-size:18px; }
            table { width:100%; border-collapse:collapse; }
            th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
            th { background:#f9fafb; }
          </style>
        </head>
        <body>
          <h1>${eventToPrint.title}</h1>
          <p><span class="badge">Event Report</span> Generated on ${new Date().toLocaleDateString()}</p>
          <div class="grid">
            <div class="panel">
              <h2>Attendance</h2>
              <p>Total: ${attendance?.total || 0}</p>
              <p>Participants: ${attendance?.participants || 0}</p>
              <p>Judges: ${attendance?.judges || 0}</p>
            </div>
            <div class="panel">
              <h2>Top Scoring Entry</h2>
              <p>${leaderboard[0]?.contestantName || 'TBD'}</p>
              <p>Avg. Score: ${leaderboard[0]?.averageScore ?? 'N/A'}</p>
              <p>Rank: ${leaderboard[0]?.rank ?? 'N/A'}</p>
            </div>
          </div>
          <div class="panel" style="margin-bottom:24px;">
            <h2>Championship Match</h2>
            <p>${championshipMatch ? `${championshipMatch.match.team1?.name || 'TBD'} vs ${championshipMatch.match.team2?.name || 'TBD'}` : 'No final match saved yet.'}</p>
            <p>${championshipMatch ? `Winner: ${championshipMatch.match.winner?.name || 'TBD'}` : ''}</p>
            <p>${championshipMatch ? `Final Score: ${championshipMatch.match.score1 || 0} - ${championshipMatch.match.score2 || 0}` : ''}</p>
          </div>
          <div class="panel">
            <h2>Top 5 Leaderboard</h2>
            <table>
              <thead>
                <tr><th>Rank</th><th>Contestant</th><th>Average</th><th>Submissions</th></tr>
              </thead>
              <tbody>
                ${leaderboard.slice(0, 5).map((row) => `
                  <tr>
                    <td>${row.rank}</td>
                    <td>${row.contestantName}</td>
                    <td>${row.averageScore}</td>
                    <td>${row.totalScores}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const closePreviewCertificate = () => setPreviewCertificate(null);

  const generateAISmartReport = async () => {
    if (!selectedEvent) {
      error('Select an event first.');
      return;
    }
    
    setIsGenerating(true);
    setAiReport('');

    const leaderboard = calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || []);
    try {
      const model = import.meta.env.VITE_AI_CHATBOT_MODEL || 'openai/gpt-4o-mini';
      const payload = {
        title: selectedEvent.title,
        type: selectedEvent.type,
        leaderboard: leaderboard.slice(0, 5), // Top 5
        attendance: attendanceSummary
      };

      const json = await callAiProxy({
        model,
        temperature: 0.5,
        messages: [
          { role: 'system', content: 'You are an AI Smart Reports Generator for an event management system. Write a concise, professional 3-paragraph summary report highlighting the top winners, overall attendance, and general success of the event.' },
          { role: 'user', content: `Generate a narrative report for: ${JSON.stringify(payload)}` }
        ],
      });

      const aiResponse = json?.choices?.[0]?.message?.content;
      if (aiResponse) {
        setAiReport(aiResponse);
        success('Smart Report generated successfully.');
      } else {
        throw new Error('Empty response');
      }
    } catch (e) {
      console.warn(e);
      // Fallback mock report — keeps the feature usable even if the AI
      // provider isn't configured or the request fails.
      setAiReport(`The ${selectedEvent.title} concluded successfully. The top performer was ${leaderboard[0]?.contestantName || 'TBA'}, showcasing outstanding skills.\n\nAttendance was solid, with a total of ${attendanceSummary?.total || 0} individuals participating. Organizers and judges noted a smooth workflow throughout.\n\nOverall, the event hit its objectives and set a great benchmark for future competitions.`);
      success('Smart Report generated (Fallback Mode).');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardLayout title="Reports and Workflow Summary" subtitle="Review attendance, approvals, and downloadable event operations data">
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} style={fieldStyle}>
          <option value="">Select event for workflow summary</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.title}</option>
          ))}
        </select>
        <select value={exportMode} onChange={(event) => setExportMode(event.target.value)} style={{ ...fieldStyle, width: 220 }}>
          <option value="pdf">PDF Report</option>
          <option value="certificate">Generate Certificate</option>
        </select>
        {exportMode === 'certificate' ? (
          <button onClick={handleGenerateCertificates} style={primaryButtonStyle}>Generate Event Certificates</button>
        ) : (
          selectedEvent && (
            <button onClick={() => printEventReport(selectedEvent)} style={primaryButtonStyle}>Print / Save as PDF</button>
          )
        )}
        {selectedEvent && exportMode === 'pdf' && (
          <button
            onClick={() => downloadTextReport(`${selectedEvent.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.json`, reports.find((report) => report.id === selectedEvent.id)?.downloadContent || '{}')}
            style={secondaryButtonStyle}
          >
            Download JSON
          </button>
        )}
      </div>

      {selectedEvent && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          <div style={panelStyle}>
            <h3 style={headingStyle}>Attendance Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {[
                ['Total', attendanceSummary?.total || 0],
                ['Participants', attendanceSummary?.participants || 0],
                ['Audience', attendanceSummary?.audience || 0],
                ['Judges', attendanceSummary?.judges || 0],
              ].map(([label, value]) => (
                <div key={label} style={metricStyle}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <h3 style={headingStyle}>Approval Workflow</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(selectedEvent.approvalWorkflow || []).map((step) => (
                <div key={step.role} style={{ padding: 12, borderRadius: 12, background: '#f8fbff', border: '1px solid #dbeafe' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{step.label}</div>
                  <div style={{ fontSize: 12, color: step.status === 'approved' ? '#22c55e' : step.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                    {step.status}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{step.actedByName || 'Awaiting action'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={analyticsCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Event analytics</p>
              <h3 style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Live analytics dashboard</h3>
            </div>
            <span style={{ padding: '10px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, color: '#2563eb', fontWeight: 700 }}>{selectedEvent.status || 'Active'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[
              ['Total Attendance', attendanceSummary?.total || 0],
              ['Certificates', certificates.filter((cert) => String(cert.eventId) === String(selectedEvent.id)).length],
              ['Top Contestant', calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || [])[0]?.contestantName || 'TBA'],
              ['Completion Score', calculateLeaderboard(selectedEvent.id, selectedEvent.criteria || [])[0]?.averageScore ?? 'N/A'],
            ].map(([label, value]) => (
              <div key={label} style={analyticsMetricStyle}>
                <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panelStyle, marginTop: 24, marginBottom: 24 }}>
          <h3 style={headingStyle}>Championship Match Report</h3>
          {selectedSavedTournamentReport || selectedChampionshipMatch ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={metricStyle}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Tournament</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {selectedSavedTournamentReport?.tournamentTitle || selectedChampionshipMatch?.tournament.title || selectedChampionshipMatch?.tournament.name || 'Tournament Finals'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={metricStyle}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Final Match</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {selectedSavedTournamentReport?.finalMatch?.team1?.name || selectedChampionshipMatch?.match.team1?.name || 'TBD'} vs {selectedSavedTournamentReport?.finalMatch?.team2?.name || selectedChampionshipMatch?.match.team2?.name || 'TBD'}
                  </div>
                </div>
                <div style={metricStyle}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Winner</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                    {selectedSavedTournamentReport?.champion?.name || selectedSavedTournamentReport?.finalMatch?.winner?.name || selectedChampionshipMatch?.match.winner?.name || 'TBD'}
                  </div>
                </div>
                <div style={metricStyle}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Saved Score</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {selectedSavedTournamentReport?.finalMatch?.score1 ?? selectedChampionshipMatch?.match.score1 ?? 0} - {selectedSavedTournamentReport?.finalMatch?.score2 ?? selectedChampionshipMatch?.match.score2 ?? 0}
                  </div>
                </div>
                <div style={metricStyle}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Saved On</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {selectedSavedTournamentReport?.savedAt || selectedSavedTournamentReport?.finalMatch?.completedDate || selectedChampionshipMatch?.match.completedDate
                      ? new Date(selectedSavedTournamentReport?.savedAt || selectedSavedTournamentReport?.finalMatch?.completedDate || selectedChampionshipMatch?.match.completedDate).toLocaleString()
                      : 'Pending'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 14 }}>
              No championship match has been saved yet. Only the completed finals match will appear in reports.
            </div>
          )}
        </div>
      </>
      )}

      {selectedEvent && (
        <div style={{ ...panelStyle, marginBottom: 24, border: '1px solid rgba(139,92,246,0.3)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #8b5cf6, #c084fc)' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ ...headingStyle, color: '#c084fc', margin: 0 }}><i className="bi bi-robot" style={{ marginRight: 8 }}></i> AI Smart Report</h3>
            <button onClick={generateAISmartReport} disabled={isGenerating} style={{ ...primaryButtonStyle, background: 'linear-gradient(135deg, #8b5cf6, #c084fc)' }}>
              {isGenerating ? <i className="bi bi-arrow-repeat spin"></i> : 'Generate Narrative'}
            </button>
          </div>
          {aiReport ? (
            <div style={{ padding: 16, background: 'rgba(139,92,246,0.05)', borderRadius: 12, border: '1px solid rgba(139,92,246,0.1)', whiteSpace: 'pre-wrap', color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
              {aiReport}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: 14, fontStyle: 'italic' }}>Click generate to create an AI-powered narrative summary of this event's results.</p>
          )}
        </div>
      )}

      <div style={panelStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5efff' }}>
              {['Report', 'Event', 'Type', 'Size', 'Date', 'Actions'].map((heading) => (
                <th key={heading} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{report.name}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{report.event}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>{report.type}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{report.size}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{report.date}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => downloadTextReport(`${report.event.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.json`, report.downloadContent)} style={{ ...secondaryButtonStyle, padding: '6px 14px' }}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewCertificate && (
        <CertificatePreviewModal certificate={previewCertificate} onClose={closePreviewCertificate} />
      )}
    </DashboardLayout>
  );
}

function CertificatePreviewModal({ certificate, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.82)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ width: 'min(960px, 100%)', background: '#f8fafc', borderRadius: 24, overflow: 'hidden', boxShadow: '0 28px 80px rgba(15, 23, 42, 0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '24px 28px 16px', background: 'linear-gradient(135deg, #2563eb, #8b5cf6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <p style={{ margin: 0, color: '#c7d2fe', textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.18em' }}>Event Certificate</p>
              <h2 style={{ margin: '10px 0 0', color: '#fff', fontSize: 28, fontWeight: 800 }}>Beautiful event certificate preview</h2>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.16)', color: '#eef2ff', width: 42, height: 42, borderRadius: 14, cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>
        </div>
        <div style={{ background: '#fff', padding: 28, borderRadius: '0 0 24px 24px' }}>
          <div style={{ border: '2px solid #e5e7eb', borderRadius: 24, padding: 30, position: 'relative', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
            <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#6366f1' }}>
              <span style={{ fontSize: 28 }}>🏆</span>
              <span style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase' }}>FairPlay Certified</span>
            </div>
            <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#8b5cf6', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700 }}>Certificate of Recognition</p>
              <h1 style={{ margin: '18px 0 4px', color: '#111827', fontSize: 44, lineHeight: 1.05 }}>Certificate of Completion</h1>
              <p style={{ margin: '0 0 28px', color: '#6b7280', fontSize: 16 }}>This certificate is proudly awarded to</p>
              <h2 style={{ margin: 0, color: '#111827', fontSize: 34, fontWeight: 800 }}>{certificate.recipientName}</h2>
              <p style={{ margin: '16px 0 0', color: '#4b5563', fontSize: 16 }}>for outstanding performance at</p>
              <p style={{ margin: '4px 0 0', color: '#111827', fontSize: 20, fontWeight: 700 }}>{certificate.eventTitle}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 36, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Placement</p>
                <p style={{ margin: 0, color: '#111827', fontSize: 18, fontWeight: 700 }}>{certificate.placement ? `#${certificate.placement}` : 'Participant'}</p>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Score</p>
                <p style={{ margin: 0, color: '#111827', fontSize: 18, fontWeight: 700 }}>{certificate.score ?? 'N/A'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18, marginTop: 36, paddingTop: 22, borderTop: '1px dashed #e5e7eb' }}>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>Issued</p>
                <p style={{ margin: 0, color: '#111827', fontWeight: 700 }}>{new Date(certificate.issuedAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>Certificate ID</p>
                <p style={{ margin: 0, color: '#111827', fontWeight: 700 }}>{certificate.verificationCode}</p>
              </div>
              <div style={{ minWidth: 120, borderRadius: 18, padding: '14px 18px', background: '#eef2ff', textAlign: 'center' }}>
                <p style={{ margin: 0, color: '#4338ca', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Verified at</p>
                <p style={{ margin: 6, color: '#111827', fontSize: 14, fontWeight: 700 }}>{new URL(certificate.verificationUrl).host}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const analyticsCardStyle = {
  background: '#ffffff',
  color: '#0f172a',
  borderRadius: 20,
  padding: 22,
  border: '1px solid #dbeafe',
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
};

const analyticsMetricStyle = {
  borderRadius: 20,
  padding: 18,
  background: '#f8fbff',
  border: '1px solid #dbeafe',
};

const panelStyle = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 20px 45px rgba(37,99,235,0.08)',
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
};

const metricStyle = {
  padding: 14,
  borderRadius: 12,
  background: '#f8fbff',
  border: '1px solid #dbeafe',
};

const headingStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 16,
  color: '#0f172a',
};
