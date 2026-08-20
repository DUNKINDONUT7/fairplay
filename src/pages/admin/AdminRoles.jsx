import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DashboardLayout from '../../components/layout/DashboardLayout';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';

const APPROVAL_ROLES = [
  { role: 'institute-coordinator', label: 'Institute Coordinator', color: '#8b5cf6' },
  { role: 'sports-head', label: 'Sports Head', color: '#3b82f6' },
  { role: 'osds', label: 'OSDS', color: '#ec4899' },
];

export default function AdminRoles() {
  const { users } = useAuthStore();
  const { events, fetchEvents, submitApprovalAction } = useEventStore();
  const { success, error } = useNotificationStore();
  const [selectedActorRole, setSelectedActorRole] = useState('institute-coordinator');

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const approvalEvents = useMemo(
    () => events.filter((event) => Array.isArray(event.approvalWorkflow) && event.approvalWorkflow.length > 0),
    [events]
  );

  const selectedActor = users.find((user) => user.role === selectedActorRole) || { role: selectedActorRole, name: selectedActorRole };

  const handleDecision = async (eventId, decision) => {
    try {
      await submitApprovalAction({
        eventId,
        role: selectedActorRole,
        decision,
        actor: selectedActor,
        notes: `${selectedActor.name} marked this event as ${decision}.`,
      });
      success(`Event ${decision} by ${selectedActor.name}.`);
    } catch (decisionError) {
      error('Unable to save approval action.');
    }
  };

  return (
    <DashboardLayout title="Approval Workflow" subtitle="Review and update the live institute-to-OSDS approval chain">
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 10px 24px rgba(15,23,42,0.06)',
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8' }}>
          Approval actors
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {APPROVAL_ROLES.map((item) => (
            <button
              key={item.role}
              onClick={() => setSelectedActorRole(item.role)}
              style={{
                padding: '10px 14px',
                borderRadius: 999,
                border: `1px solid ${selectedActorRole === item.role ? '#2563eb' : '#e2e8f0'}`,
                background: selectedActorRole === item.role ? 'rgba(37,99,235,0.12)' : '#ffffff',
                color: selectedActorRole === item.role ? '#2563eb' : '#475569',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {approvalEvents.length === 0 ? (
          <div style={{ padding: 24, borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No events with approval workflow are currently available.
          </div>
        ) : (
          approvalEvents.map((event, index) => {
            const currentStep = event.approvalWorkflow.find((step) => step.role === selectedActorRole);
            const canAct = currentStep?.status === 'pending';

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 22, boxShadow: '0 12px 32px rgba(15,23,42,0.06)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>{event.title}</h3>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 0 }}>{event.type} • Current status: {event.status}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleDecision(event.id, 'approved')}
                      disabled={!canAct}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: canAct ? 'rgba(37,99,235,0.12)' : '#f8fafc', color: canAct ? '#2563eb' : '#94a3b8', fontWeight: 700, cursor: canAct ? 'pointer' : 'not-allowed' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecision(event.id, 'rejected')}
                      disabled={!canAct}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: canAct ? 'rgba(239,68,68,0.1)' : '#f8fafc', color: canAct ? '#ef4444' : '#94a3b8', fontWeight: 700, cursor: canAct ? 'pointer' : 'not-allowed' }}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {event.approvalWorkflow.map((step) => (
                    <div key={step.role} style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{step.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: step.status === 'approved' ? '#2563eb' : step.status === 'rejected' ? '#ef4444' : '#0ea5e9', marginBottom: 6 }}>
                        {step.status}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{step.actedByName || 'Awaiting action'}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
