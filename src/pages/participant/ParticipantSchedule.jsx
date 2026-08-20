import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function ParticipantSchedule() {
  const schedule = [
    { date: '2025-06-01', time: '09:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-06-01', time: '14:00', event: 'National Coding Challenge', venue: 'Online', type: 'Contest' },
    { date: '2025-07-15', time: '08:00', event: 'City Basketball Tournament', venue: 'Sports Complex', type: 'Sports' },
  ];

  return (
    <DashboardLayout title="My Schedule" subtitle="View your upcoming events and matches">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 16, overflow: 'hidden' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Date', 'Time', 'Event', 'Venue', 'Type', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#a0aec0' }}>{s.date}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>{s.time}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.event}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#a0aec0' }}>{s.venue}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>{s.type}</span></td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Upcoming</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}