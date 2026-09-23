import DashboardLayout from '../../components/layout/DashboardLayout';

export default function ParticipantSchedule() {
  const schedule = [
    { date: '2025-06-01', time: '09:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-06-01', time: '14:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-07-15', time: '08:00', event: 'City Basketball Tournament', venue: 'Sports Complex', type: 'Sports' },
  ];

  return (
    <DashboardLayout title="My Schedule" subtitle="View your upcoming events and matches">
      <div style={{ overflowX: 'auto', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 16, boxShadow: '0 10px 30px rgba(37,99,235,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #dbeafe', background: '#eff6ff' }}>
              {['Date', 'Time', 'Event', 'Venue', 'Type', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #dbeafe' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{s.date}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{s.time}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{s.event}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{s.venue}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#2563eb' }}>{s.type}</span></td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>Upcoming</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
