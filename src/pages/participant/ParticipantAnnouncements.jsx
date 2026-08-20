import { useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function ParticipantAnnouncements() {
  const announcements = [
    { id: 1, title: 'Schedule Update: National Coding Challenge', text: 'The schedule for the National Coding Challenge has been updated. Please check the schedule tab for the latest information.', date: '2025-05-20', type: 'update', author: 'Event Admin' },
    { id: 2, title: 'Welcome to FairPlay!', text: 'Welcome to the FairPlay event management platform. We are excited to have you participate in our upcoming events.', date: '2025-05-15', type: 'info', author: 'System' },
    { id: 3, title: 'Results Published', text: 'The results for the Inter-School Debate Cup have been published. Check your scores tab to see how you performed.', date: '2025-04-12', type: 'result', author: 'Judging Panel' },
  ];

  return (
    <DashboardLayout title="Announcements" subtitle="Latest updates and notifications">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            style={{
              background: 'rgba(15,20,25,0.6)', border: '1px solid rgba(6,182,212,0.1)',
              borderRadius: 16, padding: 20, borderLeft: `3px solid ${
                a.type === 'update' ? '#fbbf24' : a.type === 'result' ? '#10b981' : '#06b6d4'
              }`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{a.title}</h3>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                background: a.type === 'update' ? 'rgba(251,191,36,0.15)' : a.type === 'result' ? 'rgba(16,185,129,0.15)' : 'rgba(6,182,212,0.15)',
                color: a.type === 'update' ? '#fbbf24' : a.type === 'result' ? '#10b981' : '#06b6d4',
              }}>
                {a.type}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#a0aec0', marginBottom: 8, lineHeight: 1.5 }}>{a.text}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
              <span>By {a.author}</span>
              <span>{a.date}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </DashboardLayout>
  );
}