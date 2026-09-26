import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import MaintenanceScreen, { formatBackAt } from '../../components/common/MaintenanceScreen';
import useAuthStore from '../../store/authStore';
import useEventStore from '../../store/eventStore';
import useNotificationStore from '../../store/notificationStore';
import usePlatformSettingsStore from '../../store/platformSettingsStore';
import { getAppBaseUrl } from '../../utils/appUrl';

const MESSAGE_LIMIT = 280;

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function quickTime(kind) {
  const date = new Date();
  if (kind === '30m') date.setMinutes(date.getMinutes() + 30);
  if (kind === '1h') date.setHours(date.getHours() + 1);
  if (kind === '3h') date.setHours(date.getHours() + 3);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0);
  }
  return toLocalInput(date.toISOString());
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        border: 'none',
        padding: 3,
        background: checked ? '#2563eb' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.2s ease',
        flexShrink: 0,
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(15,23,42,0.3)' }} />
    </button>
  );
}

export default function AdminSettings() {
  const { user, users, refreshProfiles } = useAuthStore();
  const { events, fetchEvents } = useEventStore();
  const { success, error } = useNotificationStore();
  const settings = usePlatformSettingsStore();
  const { fetchSettings, saveSettings } = settings;

  const [maintenanceOn, setMaintenanceOn] = useState(settings.maintenanceEnabled);
  const [message, setMessage] = useState(settings.maintenanceMessage);
  const [backAt, setBackAt] = useState(toLocalInput(settings.maintenanceUntil));
  const [saving, setSaving] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    refreshProfiles();
    fetchEvents();
    fetchSettings();
  }, [fetchEvents, fetchSettings, refreshProfiles]);

  // Load the saved values into the form once they arrive (and after each save).
  useEffect(() => {
    setMaintenanceOn(settings.maintenanceEnabled);
    setMessage(settings.maintenanceMessage);
    setBackAt(toLocalInput(settings.maintenanceUntil));
  }, [settings.maintenanceEnabled, settings.maintenanceMessage, settings.maintenanceUntil]);

  const dirty = maintenanceOn !== settings.maintenanceEnabled
    || message !== settings.maintenanceMessage
    || backAt !== toLocalInput(settings.maintenanceUntil);

  const backAtIso = fromLocalInput(backAt);
  const backAtInPast = Boolean(backAtIso) && new Date(backAtIso).getTime() < Date.now();
  const turningOn = maintenanceOn && !settings.maintenanceEnabled;

  const updatedByName = useMemo(() => {
    if (!settings.updatedBy) return '';
    const match = users.find((entry) => String(entry.id) === String(settings.updatedBy));
    return match?.name || match?.email || '';
  }, [settings.updatedBy, users]);

  const systemInfo = [
    { label: 'Site URL', value: getAppBaseUrl() || 'Not configured' },
    { label: 'Database', value: import.meta.env.VITE_SUPABASE_URL ? 'Connected to Supabase' : 'Not connected' },
    { label: 'Registered users', value: users.length },
    { label: 'Events', value: events.length },
  ];

  async function persistMaintenance() {
    setSaving(true);
    try {
      await saveSettings({
        maintenanceEnabled: maintenanceOn,
        maintenanceMessage: message.trim(),
        maintenanceUntil: backAtIso,
      }, user?.id);
      success(maintenanceOn ? 'Maintenance mode is on. Only admins can use FairPlay now.' : 'Maintenance settings saved.');
    } catch (err) {
      error(err.message || 'Unable to save maintenance settings.');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSaveMaintenance() {
    if (turningOn) {
      setConfirmOpen(true);
      return;
    }
    persistMaintenance();
  }

  async function handleToggleAi(next) {
    setSavingAi(true);
    try {
      await saveSettings({ aiEnabled: next }, user?.id);
      success(next ? 'AI features are on.' : 'AI features are off. The chatbot and AI generators are hidden.');
    } catch (err) {
      error(err.message || 'Unable to update AI features.');
    } finally {
      setSavingAi(false);
    }
  }

  const setupLocked = settings.setupNeeded;
  const saveDisabled = !dirty || saving || setupLocked;

  return (
    <DashboardLayout title="Platform Settings" subtitle="Control maintenance mode and AI features for everyone on FairPlay">
      <ConfirmDialog
        open={confirmOpen}
        title="Turn on maintenance mode?"
        message="Everyone except admins will immediately see the maintenance screen instead of FairPlay until you turn it off."
        confirmLabel={saving ? 'Turning on...' : 'Turn on maintenance'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={persistMaintenance}
      />

      <div style={{ maxWidth: 1120, display: 'grid', gap: 20 }}>
        {setupLocked && (
          <div style={{ padding: '14px 16px', borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <i className="bi bi-database-exclamation" style={{ fontSize: 18 }} />
            <span style={{ flex: '1 1 320px' }}>
              These settings can't be saved yet. Run the <strong>Platform settings</strong> section at the end of <code>supabase/schema.sql</code> in the Supabase SQL Editor, then check again.
            </span>
            <button type="button" onClick={fetchSettings} style={{ ...secondaryButtonStyle, background: '#ffffff', borderColor: '#fde68a', color: '#92400e' }}>
              <i className="bi bi-arrow-clockwise" /> Check again
            </button>
          </div>
        )}

        {/* Current status at a glance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          <StatusTile
            icon="bi bi-tools"
            label="Maintenance"
            value={settings.maintenanceEnabled ? 'On' : 'Off'}
            hint={settings.maintenanceEnabled
              ? (settings.maintenanceUntil ? `Back ${formatBackAt(settings.maintenanceUntil)}` : 'Users see the maintenance screen')
              : 'FairPlay is open to everyone'}
            tone={settings.maintenanceEnabled ? 'warning' : 'success'}
          />
          <StatusTile
            icon="bi bi-stars"
            label="AI features"
            value={settings.aiEnabled ? 'On' : 'Off'}
            hint={settings.aiEnabled ? 'Chatbot and AI generators available' : 'Chatbot and AI generators hidden'}
            tone={settings.aiEnabled ? 'success' : 'muted'}
          />
          <StatusTile
            icon="bi bi-clock-history"
            label="Last change"
            value={settings.updatedAt ? new Date(settings.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            hint={settings.updatedAt ? `${new Date(settings.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${updatedByName ? ` · ${updatedByName}` : ''}` : 'No changes saved yet'}
            tone="info"
          />
        </div>

        {/* Maintenance mode */}
        <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <header style={cardHeaderStyle}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
              <span style={{ ...iconChipStyle, background: '#fef3c7', color: '#b45309' }}><i className="bi bi-tools" /></span>
              <div style={{ minWidth: 0 }}>
                <h2 style={cardTitleStyle}>Maintenance mode</h2>
                <p style={cardTextStyle}>Show a maintenance screen to everyone except admins while you make changes.</p>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: maintenanceOn ? '#b45309' : '#64748b', cursor: setupLocked ? 'not-allowed' : 'pointer' }}>
              {maintenanceOn ? 'On' : 'Off'}
              <Switch checked={maintenanceOn} onChange={setMaintenanceOn} disabled={saving || setupLocked} label="Maintenance mode" />
            </label>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
            {/* Form */}
            <div style={{ padding: 24, display: 'grid', gap: 20, alignContent: 'start' }}>
              <div>
                <label htmlFor="maintenance-message" style={labelStyle}>Message to users</label>
                <textarea
                  id="maintenance-message"
                  value={message}
                  maxLength={MESSAGE_LIMIT}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  placeholder="e.g. We're upgrading the scoring system. Babalik kami ng 8PM."
                  style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                  disabled={setupLocked}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  <span>Leave empty to use the default message.</span>
                  <span>{message.length}/{MESSAGE_LIMIT}</span>
                </div>
              </div>

              <div>
                <label htmlFor="maintenance-until" style={labelStyle}>Expected back</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="maintenance-until"
                    type="datetime-local"
                    value={backAt}
                    onChange={(event) => setBackAt(event.target.value)}
                    style={{ ...fieldStyle, paddingRight: backAt ? 40 : 14 }}
                    disabled={setupLocked}
                  />
                  {backAt && !setupLocked && (
                    <button
                      type="button"
                      onClick={() => setBackAt('')}
                      aria-label="Clear expected back time"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <i className="bi bi-x-lg" style={{ fontSize: 11 }} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {[['30m', '+30 min'], ['1h', '+1 hour'], ['3h', '+3 hours'], ['tomorrow', 'Tomorrow, 8 AM']].map(([kind, text]) => (
                    <button key={kind} type="button" onClick={() => setBackAt(quickTime(kind))} style={{ ...chipStyle, opacity: setupLocked ? 0.5 : 1, cursor: setupLocked ? 'not-allowed' : 'pointer' }} disabled={setupLocked}>
                      {text}
                    </button>
                  ))}
                </div>
                <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, margin: '10px 0 0', color: backAtInPast ? '#b91c1c' : '#64748b' }}>
                  <i className={backAtInPast ? 'bi bi-exclamation-circle' : 'bi bi-info-circle'} style={{ marginTop: 1 }} />
                  {backAtInPast
                    ? 'This time has already passed. Users will see "should be back any moment".'
                    : backAtIso
                      ? `Users will see a countdown to ${formatBackAt(backAtIso)}.`
                      : 'Optional. Leave empty if you are not sure when you will be back.'}
                </p>
              </div>
            </div>

            {/* Preview */}
            <div style={{ padding: 24, background: '#f8fafc', borderLeft: '1px solid #eef2f7', display: 'grid', gap: 10, alignContent: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...labelStyle, marginBottom: 0 }}>What users will see</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 10px' }}>Live preview</span>
              </div>
              <div aria-hidden="true" style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 12px 28px rgba(15,23,42,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: '1px solid #eef2f7', background: '#ffffff' }}>
                  {['#fca5a5', '#fcd34d', '#86efac'].map((dot) => (
                    <span key={dot} style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
                  ))}
                  <span style={{ marginLeft: 8, flex: 1, fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '3px 10px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {(getAppBaseUrl() || 'fairplay').replace(/^https?:\/\//, '')}
                  </span>
                </div>
                <div style={{ height: 360, pointerEvents: 'none' }}>
                  <MaintenanceScreen message={message} until={backAtIso} preview />
                </div>
              </div>
            </div>
          </div>

          <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 24px', borderTop: '1px solid #eef2f7', background: '#ffffff' }}>
            <span style={{ fontSize: 13, color: dirty ? '#b45309' : '#94a3b8', fontWeight: dirty ? 700 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={dirty ? 'bi bi-pencil-square' : 'bi bi-check2-circle'} />
              {dirty ? 'You have unsaved changes' : 'All changes saved'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {dirty && !saving && (
                <button
                  type="button"
                  onClick={() => {
                    setMaintenanceOn(settings.maintenanceEnabled);
                    setMessage(settings.maintenanceMessage);
                    setBackAt(toLocalInput(settings.maintenanceUntil));
                  }}
                  style={ghostButtonStyle}
                >
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveMaintenance}
                disabled={saveDisabled}
                style={{ ...primaryButtonStyle, ...(turningOn ? { background: '#b45309', boxShadow: '0 8px 20px rgba(180,83,9,0.25)' } : {}), opacity: saveDisabled ? 0.45 : 1, cursor: saveDisabled ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving...' : turningOn ? 'Turn on maintenance' : 'Save changes'}
              </button>
            </div>
          </footer>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20, alignItems: 'stretch' }}>
          {/* AI features */}
          <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <header style={cardHeaderStyle}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
                <span style={{ ...iconChipStyle, background: '#ede9fe', color: '#6d28d9' }}><i className="bi bi-stars" /></span>
                <div style={{ minWidth: 0 }}>
                  <h2 style={cardTitleStyle}>AI features</h2>
                  <p style={cardTextStyle}>Applies right away for everyone.</p>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: settings.aiEnabled ? '#6d28d9' : '#64748b', cursor: setupLocked ? 'not-allowed' : 'pointer' }}>
                {savingAi ? 'Saving...' : settings.aiEnabled ? 'On' : 'Off'}
                <Switch checked={settings.aiEnabled} onChange={handleToggleAi} disabled={savingAi || setupLocked} label="AI features" />
              </label>
            </header>
            <div style={{ padding: '16px 24px 24px', display: 'grid', gap: 8 }}>
              {[
                ['bi bi-chat-dots', 'AI chatbot', 'The help button on every page'],
                ['bi bi-list-check', 'AI criteria generator', 'Create Event, scoring criteria step'],
                ['bi bi-file-text', 'AI writing', 'Event descriptions and report summaries'],
              ].map(([icon, title, sub]) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                  <i className={icon} style={{ fontSize: 16, color: settings.aiEnabled ? '#6d28d9' : '#94a3b8' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>
                  </div>
                  <span style={{ ...miniPillStyle, ...(settings.aiEnabled ? { background: '#dcfce7', color: '#15803d' } : { background: '#f1f5f9', color: '#64748b' }) }}>
                    {settings.aiEnabled ? 'Available' : 'Hidden'}
                  </span>
                </div>
              ))}
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>
                Turn this off if AI credits run out or the AI provider is having problems. Organizers can still build criteria from FairPlay's built-in templates.
              </p>
            </div>
          </section>

          {/* System information */}
          <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <header style={cardHeaderStyle}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ ...iconChipStyle, background: '#e0f2fe', color: '#0369a1' }}><i className="bi bi-hdd-network" /></span>
                <div>
                  <h2 style={cardTitleStyle}>System information</h2>
                  <p style={cardTextStyle}>Read-only details about this deployment.</p>
                </div>
              </div>
            </header>
            <dl style={{ margin: 0, padding: '8px 24px 16px' }}>
              {systemInfo.map((item, index) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: index === 0 ? 'none' : '1px solid #f1f5f9', fontSize: 13 }}>
                  <dt style={{ color: '#64748b' }}>{item.label}</dt>
                  <dd style={{ margin: 0, color: '#0f172a', fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

const STATUS_TONES = {
  success: { bg: '#ecfdf5', fg: '#047857', dot: '#10b981' },
  warning: { bg: '#fffbeb', fg: '#b45309', dot: '#f59e0b' },
  muted: { bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' },
  info: { bg: '#eff6ff', fg: '#1d4ed8', dot: '#3b82f6' },
};

function StatusTile({ icon, label, value, hint, tone }) {
  const colors = STATUS_TONES[tone] || STATUS_TONES.info;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ ...iconChipStyle, background: colors.bg, color: colors.fg }}><i className={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{value}</span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)' };
const cardHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '20px 24px', borderBottom: '1px solid #eef2f7' };
const cardTitleStyle = { margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' };
const cardTextStyle = { margin: '3px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 };
const iconChipStyle = { width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 };
const miniPillStyle = { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 };
const fieldStyle = { width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const chipStyle = { padding: '7px 12px', borderRadius: 999, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700 };
const primaryButtonStyle = { padding: '11px 20px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 14, boxShadow: '0 8px 20px rgba(37,99,235,0.2)' };
const ghostButtonStyle = { padding: '11px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const secondaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
