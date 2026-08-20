import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';
import useNotificationStore from './notificationStore';

const defaultTemplate = {
  title: 'Certificate of Achievement',
  participantTitle: 'Certificate of Achievement',
  participantMessage: 'Presented in recognition of outstanding performance and participation as a contestant in this event.',
  judgeTitle: 'Certificate of Appreciation',
  judgeMessage: 'Presented in appreciation of fair judging, professional evaluation, and service as an official for this event.',
  signerName: 'FairPlay Event Director',
  signerRole: 'Event Director',
  organizationName: 'FairPlay',
  accentColor: '#06b6d4',
  message: 'Presented in recognition of performance, participation, and event contribution.',
  customTemplateDataUrl: '',
  customTemplateName: '',
  customTemplateType: '',
  customTemplateFields: null,
  customTemplateScanStatus: '',
};

function normalizeCertificate(certificate) {
  const metadata = certificate.metadata || {};
  const rawRecipientId = certificate.recipientId || certificate.recipient_id || certificate.participant_id || certificate.recipientName;
  const rawRecipientName = certificate.recipientName || certificate.recipient_name || certificate.participant_name || certificate.recipientId || 'Recipient';

  return {
    id: certificate.id || `cert-${Date.now()}`,
    eventId: certificate.eventId || certificate.event_id,
    eventTitle: certificate.eventTitle || certificate.event_title || metadata.event_title || 'Untitled Event',
    recipientId: String(rawRecipientId || metadata.recipient_id || metadata.participant_id || rawRecipientName).trim(),
    recipientName: rawRecipientName,
    recipientEmail: certificate.recipientEmail || certificate.recipient_email || metadata.recipient_email || '',
    category: certificate.category || certificate.certificate_type || metadata.category || 'participant',
    placement: certificate.placement ?? metadata.placement ?? null,
    score: certificate.score ?? metadata.score ?? null,
    issuedAt: certificate.issuedAt || certificate.issued_at || metadata.issued_at || new Date().toISOString(),
    updatedAt: certificate.updatedAt || certificate.updated_at || metadata.updated_at || new Date().toISOString(),
    status: certificate.status || metadata.status || 'generated',
    template: certificate.template || metadata.template || defaultTemplate,
    notes: certificate.notes || metadata.notes || '',
    verificationCode: certificate.verificationCode || certificate.verification_code || metadata.verification_code || `FP-${String(certificate.id || Date.now()).slice(-8)}`.toUpperCase(),
    verificationUrl: certificate.verificationUrl || certificate.verification_url || metadata.verification_url || certificate.file_url || '',
    qrValue: certificate.qrValue || certificate.qr_value || metadata.qr_value || '',
  };
}

function parseNumericId(value) {
  const number = Number(value);
  return Number.isFinite(number) && String(value).trim() !== '' ? number : null;
}

function buildLegacyCertificatePayload(certificate) {
  return {
    id: certificate.id,
    event_id: certificate.eventId,
    participant_id: parseNumericId(certificate.recipientId),
    participant_name: certificate.recipientName,
    certificate_type: certificate.category,
    file_url: certificate.verificationUrl || certificate.qrValue || '',
    metadata: {
      event_title: certificate.eventTitle,
      recipient_id: certificate.recipientId,
      recipient_name: certificate.recipientName,
      category: certificate.category,
      placement: certificate.placement,
      score: certificate.score,
      status: certificate.status,
      template: certificate.template,
      notes: certificate.notes,
      verification_code: certificate.verificationCode,
      verification_url: certificate.verificationUrl,
      qr_value: certificate.qrValue,
      updated_at: certificate.updatedAt,
    },
    issued_at: certificate.issuedAt,
    updated_at: certificate.updatedAt,
  };
}

function buildCertificatePayload(certificate, legacy = false) {
  if (legacy) {
    return buildLegacyCertificatePayload(certificate);
  }

  return {
    id: certificate.id,
    event_id: certificate.eventId,
    event_title: certificate.eventTitle,
    recipient_id: certificate.recipientId,
    recipient_name: certificate.recipientName,
    category: certificate.category,
    placement: certificate.placement,
    score: certificate.score,
    issued_at: certificate.issuedAt,
    updated_at: certificate.updatedAt,
    status: certificate.status,
    template: certificate.template,
    notes: certificate.notes,
    verification_code: certificate.verificationCode,
    verification_url: certificate.verificationUrl,
    qr_value: certificate.qrValue,
  };
}

async function tryUpsertCertificates(payload) {
  const { error } = await supabase.from('certificates').upsert(payload);
  if (!error) return;

  const message = String(error.message || '').toLowerCase();
  const schemaMismatch = [
    'qr_value',
    'verification_url',
    'verification_code',
    'template',
    'category',
    'recipient_name',
    'recipient_id',
    'event_title',
    'updated_at',
  ].some((column) => message.includes(column) || message.includes(`'${column}'`));

  if (!schemaMismatch) {
    throw error;
  }

  const legacyPayload = Array.isArray(payload)
    ? payload.map((certificate) => buildLegacyCertificatePayload(certificate))
    : [buildLegacyCertificatePayload(payload)];

  const { error: fallbackError } = await supabase.from('certificates').upsert(legacyPayload);
  if (fallbackError) throw fallbackError;
}

async function tryFetchCertificates(eventId) {
  const query = supabase.from('certificates').select('*').order('issued_at', { ascending: false });
  const request = eventId ? query.eq('event_id', eventId) : query;

  const { data, error } = await request;
  if (!error) {
    return { data, error: null };
  }

  const message = String(error.message || '').toLowerCase();
  const schemaMismatch = [
    'event_title',
    'recipient_id',
    'recipient_name',
    'category',
    'placement',
    'score',
    'status',
    'template',
    'notes',
    'verification_code',
    'verification_url',
    'qr_value',
  ].some((column) => message.includes(column) || message.includes(`'${column}'`));

  if (!schemaMismatch) {
    return { data, error };
  }

  const fallbackColumns = [
    'id',
    'event_id',
    'participant_id',
    'participant_name',
    'certificate_type',
    'file_url',
    'metadata',
    'issued_at',
    'updated_at',
  ].join(',');

  const fallbackQuery = supabase.from('certificates').select(fallbackColumns).order('issued_at', { ascending: false });
  const fallbackRequest = eventId ? fallbackQuery.eq('event_id', eventId) : fallbackQuery;
  const { data: fallbackData, error: fallbackError } = await fallbackRequest;
  return { data: fallbackData, error: fallbackError || error };
}

const useCertificateStore = create(
  persist(
    (set, get) => ({
      certificates: [],
      template: defaultTemplate,
      loading: false,
      error: null,

      fetchCertificates: async (eventId) => {
        set({ loading: true, error: null });

        if (!isSupabaseConfigured) {
          const records = eventId ? get().getCertificatesByEvent(eventId) : get().certificates;
          set({ loading: false });
          return records;
        }

        try {
          const { data, error } = await tryFetchCertificates(eventId);
          if (error) throw error;

          const certificates = (data || []).map(normalizeCertificate);
          set((state) => ({
            certificates: eventId
              ? [...certificates, ...state.certificates.filter((record) => String(record.eventId) !== String(eventId))]
              : certificates,
            loading: false,
            error: null,
          }));
          return certificates;
        } catch (error) {
          console.error('Error fetching certificates:', error.message);
          set({ loading: false, error: error.message, certificates: [] });
          return [];
        }
      },

      updateTemplate: (updates) => {
        set((state) => ({
          template: {
            ...state.template,
            ...updates,
          },
        }));
      },

      generateCertificatesForEvent: async ({ event, recipients = [], category = 'participant' }) => {
        const existing = get().certificates;
        const generatedAt = new Date().toISOString();
        const newlyIssued = [];

        const nextCertificates = recipients.map((recipient, index) => {
          const existingCertificate = existing.find(
            (certificate) =>
              String(certificate.eventId) === String(event.id) &&
              String(certificate.recipientId) === String(recipient.id || recipient.name)
          );
          if (!existingCertificate) newlyIssued.push(recipient.id || recipient.name);

          const verificationCode = existingCertificate?.verificationCode || `FP-${String(event.id)}-${index + 1}`.toUpperCase();
          const verificationUrl = `${window.location.origin}/certificates/${verificationCode}`;

          return normalizeCertificate({
            id: existingCertificate?.id || `cert-${event.id}-${index + 1}-${Date.now()}`,
            eventId: event.id,
            eventTitle: event.title,
            recipientId: recipient.id || recipient.name,
            recipientName: recipient.name,
            recipientEmail: recipient.email || '',
            category: recipient.category || category,
            placement: recipient.placement || null,
            score: recipient.score ?? null,
            issuedAt: existingCertificate?.issuedAt || generatedAt,
            updatedAt: generatedAt,
            status: 'generated',
            template: get().template,
            notes: recipient.notes || '',
            verificationCode,
            verificationUrl,
            qrValue: `${verificationUrl}?certificate=${verificationCode}`,
          });
        });

        set((state) => {
          const untouched = state.certificates.filter(
            (certificate) => String(certificate.eventId) !== String(event.id)
          );
          return {
            certificates: [...untouched, ...nextCertificates],
          };
        });

        if (isSupabaseConfigured && nextCertificates.length > 0) {
          try {
            const payload = nextCertificates.map((certificate) => buildCertificatePayload(certificate));
            await tryUpsertCertificates(payload);
          } catch (error) {
            console.error('Error syncing certificates:', error.message);
            set({ error: error.message });
          }
        }

        nextCertificates
          .filter((certificate) => newlyIssued.includes(certificate.recipientId))
          .forEach((certificate) => {
            useNotificationStore.getState().notifyCertificateReady(certificate).catch(() => {});
          });

        return nextCertificates;
      },

      updateCertificate: async (certificateId, updates) => {
        const current = get().certificates.find((certificate) => String(certificate.id) === String(certificateId));
        if (!current) return null;

        const updatedCertificate = normalizeCertificate({
          ...current,
          ...updates,
          id: certificateId,
          updatedAt: new Date().toISOString(),
        });

        set((state) => ({
          certificates: state.certificates.map((certificate) =>
            String(certificate.id) === String(certificateId) ? updatedCertificate : certificate
          ),
        }));

        if (!isSupabaseConfigured) {
          return updatedCertificate;
        }

        try {
          const payload = buildCertificatePayload(updatedCertificate);
          await tryUpsertCertificates(payload);
        } catch (error) {
          console.error('Error updating certificate:', error.message);
          set({ error: error.message });
        }

        return updatedCertificate;
      },

      getCertificateById: (certificateId) =>
        get().certificates.find((certificate) => String(certificate.id) === String(certificateId)) || null,

      getCertificatesByEvent: (eventId) =>
        get().certificates.filter((certificate) => String(certificate.eventId) === String(eventId)),

      getCertificatesByRecipient: (recipientName) =>
        get().certificates.filter((certificate) => certificate.recipientName === recipientName),
    }),
    {
      name: 'fairplay_certificates',
      merge: (persistedState, currentState) => {
        if (isSupabaseConfigured) {
          return {
            ...currentState,
            ...(persistedState || {}),
            certificates: currentState.certificates,
          };
        }

        return {
          ...currentState,
          ...(persistedState || {}),
        };
      },
    }
  )
);

export default useCertificateStore;
