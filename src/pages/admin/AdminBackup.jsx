import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';
import useNotificationStore from '../../store/notificationStore';
import {
  BACKUP_ONLY_TABLES,
  BACKUP_TABLE_GROUPS,
  BACKUP_TABLES,
  TABLE_LABELS,
  callBackupFunction,
  downloadFromUrl,
  downloadJson,
  exportDirect,
  formatBytes,
  inspectBackupFile,
} from '../../services/backupService';

const PAGE_SIZE = 8;

const KIND_THEME = {
  manual: { label: 'Manual', bg: '#dbeafe', fg: '#1d4ed8', icon: 'bi bi-person-check' },
  automatic: { label: 'Automatic', bg: '#dcfce7', fg: '#15803d', icon: 'bi bi-clock-history' },
  'pre-restore': { label: 'Before restore', bg: '#fef3c7', fg: '#b45309', icon: 'bi bi-shield-check' },
  uploaded: { label: 'Uploaded', bg: '#ede9fe', fg: '#6d28d9', icon: 'bi bi-upload' },
};

function formatRelative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fileStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export default function AdminBackup() {
  const { user } = useAuthStore();
  const { success, error: notifyError } = useNotificationStore();
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [serviceState, setServiceState] = useState('ok'); // ok | notDeployed | sqlNeeded | error
  const [serviceMessage, setServiceMessage] = useState('');
  const [counts, setCounts] = useState({});
  const [backups, setBackups] = useState([]);
  const [automaticConfigured, setAutomaticConfigured] = useState(false);
  const [keepAutomatic, setKeepAutomatic] = useState(10);
  const [intervalDays, setIntervalDays] = useState(3);
  const [showTables, setShowTables] = useState(false);

  const [selectedTables, setSelectedTables] = useState(() => new Set(BACKUP_TABLES));
  const [note, setNote] = useState('');
  const [alsoDownload, setAlsoDownload] = useState(true);
  const [creating, setCreating] = useState(false);

  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [uploadInfo, setUploadInfo] = useState(null);

  const actor = useMemo(() => ({ id: user?.id || null, email: user?.email || null, name: user?.name || null }), [user]);
  const serviceReady = serviceState === 'ok';

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callBackupFunction({ action: 'overview' });
      setCounts(data.counts || {});
      setBackups(data.backups || []);
      setAutomaticConfigured(Boolean(data.automaticConfigured));
      setKeepAutomatic(data.keepAutomatic || 10);
      setIntervalDays(data.intervalDays || 3);
      setServiceState('ok');
      setServiceMessage('');
    } catch (err) {
      setServiceState(err.notDeployed ? 'notDeployed' : err.sqlNeeded ? 'sqlNeeded' : 'error');
      setServiceMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const totalRecords = useMemo(() => Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0), [counts]);
  const selectedRecords = useMemo(() => [...selectedTables].reduce((sum, t) => sum + (Number(counts[t]) || 0), 0), [counts, selectedTables]);
  const lastBackup = backups[0];
  const lastAutomatic = backups.find((b) => b.kind === 'automatic');
  const storedSize = backups.reduce((sum, b) => sum + Number(b.size_bytes || 0), 0);
  const allTablesSelected = selectedTables.size === BACKUP_TABLES.length;

  // The cron runs daily at 2:00 AM (PH time); a backup is taken on the first
  // run at least `intervalDays` after the last automatic one.
  const nextAutomatic = useMemo(() => {
    if (!automaticConfigured) return null;
    const earliest = lastAutomatic
      ? new Date(new Date(lastAutomatic.created_at).getTime() + (intervalDays * 24 - 1) * 60 * 60 * 1000)
      : new Date();
    const next = new Date(earliest);
    next.setUTCHours(18, 0, 0, 0);
    if (next < earliest) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }, [automaticConfigured, intervalDays, lastAutomatic]);

  const lastBackupAgeDays = lastBackup ? (Date.now() - new Date(lastBackup.created_at).getTime()) / 86400000 : Infinity;
  const health = !lastBackup ? 'none' : lastBackupAgeDays > intervalDays + 1 ? 'stale' : 'good';

  const filteredBackups = kindFilter === 'all' ? backups : backups.filter((b) => b.kind === kindFilter);
  const totalPages = Math.max(1, Math.ceil(filteredBackups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedBackups = filteredBackups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [kindFilter]);

  function toggleTable(table) {
    setSelectedTables((current) => {
      const next = new Set(current);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  }

  function toggleGroup(tables, allOn) {
    setSelectedTables((current) => {
      const next = new Set(current);
      tables.forEach(([table]) => (allOn ? next.delete(table) : next.add(table)));
      return next;
    });
  }

  async function downloadBackup(backup) {
    setBusyId(`download-${backup.id}`);
    try {
      const { url, fileName } = await callBackupFunction({ action: 'download', id: backup.id });
      downloadFromUrl(url, fileName);
    } catch (err) {
      notifyError(err.message || 'Could not download this backup.');
    } finally {
      setBusyId('');
    }
  }

  async function handleQuickBackup() {
    setCreating(true);
    try {
      const { backup } = await callBackupFunction({ action: 'create' });
      success(`Backup created: ${backup.total_records.toLocaleString()} records saved.`);
      await loadOverview();
    } catch (err) {
      notifyError(err.message || 'Could not create the backup.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreate() {
    if (selectedTables.size === 0) return;
    setCreating(true);
    try {
      if (!serviceReady) {
        const { payload, skipped } = await exportDirect(actor);
        const wanted = Object.fromEntries(Object.entries(payload.tables).filter(([t]) => selectedTables.has(t)));
        payload.tables = wanted;
        payload.counts = Object.fromEntries(Object.entries(wanted).map(([t, rows]) => [t, rows.length]));
        downloadJson(payload, `fairplay-backup-${fileStamp()}.json`);
        success(skipped.length ? `Backup downloaded. ${skipped.length} table(s) could not be read with your access.` : 'Backup downloaded to your computer.');
        return;
      }
      const tables = selectedTables.size === BACKUP_TABLES.length ? undefined : [...selectedTables];
      const { backup, skipped } = await callBackupFunction({ action: 'create', tables, note: note.trim() });
      setNote('');
      success(`Backup created: ${backup.total_records.toLocaleString()} records saved.${skipped?.length ? ` Skipped ${skipped.length} table(s) that do not exist yet.` : ''}`);
      await loadOverview();
      if (alsoDownload) await downloadBackup(backup);
    } catch (err) {
      notifyError(err.message || 'Could not create the backup.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(backup) {
    setBusyId(`delete-${backup.id}`);
    try {
      await callBackupFunction({ action: 'delete', id: backup.id });
      success('Backup deleted.');
      await loadOverview();
    } catch (err) {
      notifyError(err.message || 'Could not delete this backup.');
    } finally {
      setBusyId('');
      setToDelete(null);
    }
  }

  async function handleFilePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const info = inspectBackupFile(await file.text());
    setUploadInfo({ ...info, fileName: file.name, size: file.size });
  }

  return (
    <DashboardLayout title="Backup & Restore" subtitle="Keep a full copy of FairPlay's data and bring it back when something goes wrong">
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this backup?"
        message={toDelete ? `The ${KIND_THEME[toDelete.kind]?.label.toLowerCase() || ''} backup from ${formatDateTime(toDelete.created_at)} will be permanently removed. This cannot be undone.` : ''}
        confirmLabel="Delete backup"
        onCancel={() => setToDelete(null)}
        onConfirm={() => handleDelete(toDelete)}
      />
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFilePicked} style={{ display: 'none' }} />

      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onFinished={loadOverview}
          onDownloadSafety={downloadBackup}
        />
      )}
      {uploadInfo && (
        <UploadModal
          info={uploadInfo}
          serviceReady={serviceReady}
          onClose={() => setUploadInfo(null)}
          onImported={async (backup) => {
            setUploadInfo(null);
            await loadOverview();
            success('Backup file added to your history. You can restore it from the list.');
            setRestoreTarget(backup);
          }}
        />
      )}

      <div style={{ maxWidth: 1180, display: 'grid', gap: 20 }}>
        {!loading && !serviceReady && <SetupBanner state={serviceState} message={serviceMessage} onRetry={loadOverview} />}

        {!loading && serviceReady && (
          <HealthBanner
            health={health}
            lastBackup={lastBackup}
            nextAutomatic={nextAutomatic}
            intervalDays={intervalDays}
            creating={creating}
            onBackupNow={handleQuickBackup}
          />
        )}

        {/* At a glance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
          <StatTile
            icon="bi bi-cloud-check"
            tone={lastBackup ? 'success' : 'muted'}
            label="Last backup"
            value={lastBackup ? formatRelative(lastBackup.created_at) : 'None yet'}
            hint={lastBackup ? `${KIND_THEME[lastBackup.kind]?.label} · ${formatDateTime(lastBackup.created_at)}` : 'Create your first backup below'}
          />
          <StatTile
            icon="bi bi-calendar-check"
            tone={automaticConfigured ? 'success' : 'warning'}
            label={`Automatic · every ${intervalDays} days`}
            value={automaticConfigured ? (nextAutomatic ? formatShortDate(nextAutomatic) : 'Scheduled') : 'Not set up'}
            hint={automaticConfigured
              ? `Next run, 2:00 AM${lastAutomatic ? ` · last ${formatRelative(lastAutomatic.created_at)}` : ''}`
              : 'Needs the cron secret (see setup)'}
          />
          <StatTile
            icon="bi bi-archive"
            tone="info"
            label="Stored backups"
            value={backups.length}
            hint={backups.length ? `${formatBytes(storedSize)} in private storage` : 'Nothing stored yet'}
          />
          <StatTile
            icon="bi bi-database"
            tone="info"
            label="Records in database"
            value={serviceReady ? totalRecords.toLocaleString() : '—'}
            hint={`${BACKUP_TABLES.length} tables covered`}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, alignItems: 'start' }}>
          {/* Create */}
          <section style={cardStyle}>
            <header style={cardHeaderStyle}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ ...iconChipStyle, background: '#dbeafe', color: '#1d4ed8' }}><i className="bi bi-cloud-arrow-up" /></span>
                <div>
                  <h2 style={cardTitleStyle}>Create a backup</h2>
                  <p style={cardTextStyle}>A full copy of the selected tables, exactly as stored.</p>
                </div>
              </div>
            </header>

            <div style={{ padding: '16px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                <i className={allTablesSelected ? 'bi bi-check2-all' : 'bi bi-funnel'} style={{ fontSize: 18, color: allTablesSelected ? '#15803d' : '#b45309' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    {allTablesSelected ? 'Everything' : `${selectedTables.size} of ${BACKUP_TABLES.length} tables`}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {allTablesSelected ? `All ${BACKUP_TABLES.length} tables` : 'Custom selection'}
                    {serviceReady ? ` · ${selectedRecords.toLocaleString()} records` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTables((open) => !open)}
                  aria-expanded={showTables}
                  style={{ ...secondaryButtonStyle, background: '#ffffff' }}
                >
                  {showTables ? 'Done' : 'Customize'}
                  <i className={showTables ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} />
                </button>
              </div>
            </div>

            {showTables && (
            <div style={{ padding: '16px 24px', display: 'grid', gap: 14, maxHeight: 420, overflowY: 'auto' }}>
              {!allTablesSelected && (
                <button type="button" onClick={() => setSelectedTables(new Set(BACKUP_TABLES))} style={{ ...linkButtonStyle, justifySelf: 'start' }}>
                  Select everything again
                </button>
              )}
              {BACKUP_TABLE_GROUPS.map((group) => {
                const allOn = group.tables.every(([t]) => selectedTables.has(t));
                return (
                  <div key={group.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group.label}</span>
                      <button type="button" onClick={() => toggleGroup(group.tables, allOn)} style={linkButtonStyle}>
                        {allOn ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {group.tables.map(([table, label]) => {
                        const count = counts[table];
                        return (
                          <label key={table} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, background: selectedTables.has(table) ? '#f8fafc' : 'transparent', cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={selectedTables.has(table)} onChange={() => toggleTable(table)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                            <span style={{ flex: 1, color: '#0f172a', fontWeight: 600 }}>{label}</span>
                            <span style={{ color: count === null ? '#b45309' : '#64748b', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                              {!serviceReady ? '' : count === null ? 'not set up' : `${Number(count || 0).toLocaleString()} records`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            <div style={{ padding: '14px 24px', marginTop: showTables ? 0 : 16, borderTop: '1px solid #eef2f7', display: 'grid', gap: 12 }}>
              {serviceReady && (
                <>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={200}
                    placeholder="Note (optional), e.g. Before intramurals finals"
                    aria-label="Backup note"
                    style={fieldStyle}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={alsoDownload} onChange={(event) => setAlsoDownload(event.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                    Also download a copy to this computer
                  </label>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedTables.size} of {BACKUP_TABLES.length} tables{serviceReady ? ` · ${selectedRecords.toLocaleString()} records` : ''}
                </span>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || selectedTables.size === 0}
                  style={{ ...primaryButtonStyle, opacity: creating || selectedTables.size === 0 ? 0.5 : 1, cursor: creating || selectedTables.size === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <i className={creating ? 'bi bi-arrow-repeat animate-spin' : serviceReady ? 'bi bi-cloud-arrow-up' : 'bi bi-download'} />
                  {creating ? 'Backing up...' : serviceReady ? 'Create backup' : 'Download backup file'}
                </button>
              </div>
            </div>
          </section>

          {/* History */}
          <section style={cardStyle}>
            <header style={cardHeaderStyle}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ ...iconChipStyle, background: '#e0f2fe', color: '#0369a1' }}><i className="bi bi-archive" /></span>
                <div>
                  <h2 style={cardTitleStyle}>Backup history</h2>
                  <p style={cardTextStyle}>Stored privately. Only admins can see these.</p>
                </div>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} style={secondaryButtonStyle}>
                <i className="bi bi-upload" /> Upload file
              </button>
            </header>

            <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all', 'All'], ...Object.entries(KIND_THEME).map(([k, t]) => [k, t.label])].map(([value, label]) => {
                const active = kindFilter === value;
                const count = value === 'all' ? backups.length : backups.filter((b) => b.kind === value).length;
                if (value !== 'all' && count === 0) return null;
                return (
                  <button key={value} type="button" onClick={() => setKindFilter(value)} style={{ padding: '6px 12px', borderRadius: 999, border: active ? '1px solid #2563eb' : '1px solid #e2e8f0', background: active ? '#2563eb' : '#ffffff', color: active ? '#ffffff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {label} · {count}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '12px 24px 20px', display: 'grid', gap: 8 }}>
              {loading ? (
                <div style={emptyStyle}>Loading backups...</div>
              ) : !serviceReady ? (
                <div style={emptyStyle}>
                  <i className="bi bi-cloud-slash" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                  Backup history appears here once the backup service is set up.
                  <div style={{ marginTop: 6, fontSize: 12 }}>You can still download a backup file and preview uploaded files.</div>
                </div>
              ) : pagedBackups.length === 0 ? (
                <div style={emptyStyle}>
                  <i className="bi bi-archive" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                  No backups yet. Create one on the left.
                </div>
              ) : pagedBackups.map((backup) => {
                const theme = KIND_THEME[backup.kind] || KIND_THEME.manual;
                return (
                  <div key={backup.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eef2f7', borderRadius: 14, flexWrap: 'wrap' }}>
                    <span style={{ ...iconChipStyle, width: 38, height: 38, fontSize: 16, background: theme.bg, color: theme.fg }}><i className={theme.icon} /></span>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{formatDateTime(backup.created_at)}</span>
                        <span style={{ ...pillStyle, background: theme.bg, color: theme.fg }}>{theme.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {[
                          `${Number(backup.total_records || 0).toLocaleString()} records`,
                          formatBytes(backup.size_bytes),
                          backup.kind === 'automatic' ? 'by schedule' : backup.created_by_email ? `by ${backup.created_by_email}` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                      {backup.note && <div style={{ fontSize: 12, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{backup.note}”</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => downloadBackup(backup)} disabled={Boolean(busyId)} style={iconButtonStyle} aria-label="Download backup" title="Download">
                        <i className={busyId === `download-${backup.id}` ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-download'} />
                      </button>
                      <button type="button" onClick={() => setRestoreTarget(backup)} disabled={Boolean(busyId)} style={{ ...iconButtonStyle, width: 'auto', padding: '0 12px', gap: 6, color: '#b45309', borderColor: '#fde68a', background: '#fffbeb', fontWeight: 700, fontSize: 12 }}>
                        <i className="bi bi-arrow-counterclockwise" /> Restore
                      </button>
                      <button type="button" onClick={() => setToDelete(backup)} disabled={Boolean(busyId)} style={{ ...iconButtonStyle, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }} aria-label="Delete backup" title="Delete">
                        <i className={busyId === `delete-${backup.id}` ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-trash'} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {serviceReady && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Page {currentPage} of {totalPages}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} style={{ ...iconButtonStyle, opacity: currentPage === 1 ? 0.4 : 1 }} aria-label="Previous page"><i className="bi bi-chevron-left" /></button>
                    <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} style={{ ...iconButtonStyle, opacity: currentPage === totalPages ? 0.4 : 1 }} aria-label="Next page"><i className="bi bi-chevron-right" /></button>
                  </div>
                </div>
              )}
              {serviceReady && backups.some((b) => b.kind === 'automatic') && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>Automatic backups keep the latest {keepAutomatic}; older ones are removed. Manual backups are kept until you delete them.</p>
              )}
            </div>
          </section>
        </div>

        <section style={{ ...cardStyle, padding: '18px 24px', display: 'grid', gap: 10 }}>
          <h2 style={{ ...cardTitleStyle, fontSize: 15 }}><i className="bi bi-info-circle" style={{ color: '#2563eb', marginRight: 8 }} />Good to know</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            <li>An <strong>automatic backup runs every {intervalDays} days</strong> at 2:00 AM. The latest {keepAutomatic} are kept, about a month of history.</li>
            <li><strong>Restoring never deletes anything.</strong> It adds records that are missing and puts changed records back the way they were in the backup.</li>
            <li>Before every restore, FairPlay automatically saves a <strong>“Before restore”</strong> backup of the current data, so a restore can always be undone.</li>
            <li>Login accounts and passwords are managed by Supabase Auth and are not part of these backups. Profile details (name, role, status) are.</li>
            <li>The audit log is backed up for your records but is never overwritten by a restore.</li>
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}

function HealthBanner({ health, lastBackup, nextAutomatic, intervalDays, creating, onBackupNow }) {
  const theme = {
    good: { bg: 'linear-gradient(135deg, #ecfdf5, #f0fdfa)', border: '#a7f3d0', icon: 'bi bi-shield-fill-check', iconBg: '#10b981', title: 'Your data is backed up' },
    stale: { bg: 'linear-gradient(135deg, #fffbeb, #fff7ed)', border: '#fde68a', icon: 'bi bi-shield-fill-exclamation', iconBg: '#f59e0b', title: 'Your last backup is getting old' },
    none: { bg: 'linear-gradient(135deg, #fef2f2, #fff1f2)', border: '#fecaca', icon: 'bi bi-shield-fill-x', iconBg: '#ef4444', title: 'No backups yet' },
  }[health];

  const detail = health === 'none'
    ? 'Create your first backup now so FairPlay can be restored if something goes wrong.'
    : `Last backup ${formatRelative(lastBackup.created_at)} (${formatDateTime(lastBackup.created_at)}).${
      nextAutomatic ? ` Next automatic backup ${formatShortDate(nextAutomatic)}, 2:00 AM — every ${intervalDays} days.` : ''}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 24px', borderRadius: 18, background: theme.bg, border: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, background: theme.iconBg, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, boxShadow: '0 10px 24px rgba(15,23,42,0.12)' }}>
        <i className={theme.icon} />
      </span>
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{theme.title}</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{detail}</div>
      </div>
      <button
        type="button"
        onClick={onBackupNow}
        disabled={creating}
        style={{ ...primaryButtonStyle, opacity: creating ? 0.6 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
      >
        <i className={creating ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-cloud-arrow-up'} />
        {creating ? 'Backing up...' : 'Back up now'}
      </button>
    </div>
  );
}

function SetupBanner({ state, message, onRetry }) {
  const isSql = state === 'sqlNeeded';
  const isDeploy = state === 'notDeployed';
  return (
    <div style={{ padding: '16px 20px', borderRadius: 16, background: '#fffbeb', border: '1px solid #fde68a', color: '#78350f', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 15 }}>
        <i className="bi bi-tools" />
        {isSql ? 'One database step left' : isDeploy ? 'Backup service not set up yet' : 'Backup service is unavailable'}
      </div>
      {isSql || isDeploy ? (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
          {isSql && <li>Run the <strong>Backups</strong> section at the end of <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>}
          {isDeploy && (
            <>
              <li>Run the <strong>Backups</strong> section at the end of <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>
              <li>Deploy the service: <code>npx supabase functions deploy admin-backup --no-verify-jwt</code></li>
              <li>For automatic backups every 3 days, set the same secret in Supabase (<code>npx supabase secrets set BACKUP_CRON_SECRET=...</code>) and in Vercel env vars as <code>BACKUP_CRON_SECRET</code>.</li>
            </>
          )}
        </ol>
      ) : (
        <p style={{ margin: 0, fontSize: 13 }}>{message}</p>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={onRetry} style={{ ...secondaryButtonStyle, background: '#ffffff', borderColor: '#fde68a', color: '#92400e' }}>
          <i className="bi bi-arrow-clockwise" /> Check again
        </button>
        <span style={{ fontSize: 12 }}>Until then you can still download a backup file and preview uploaded files.</span>
      </div>
    </div>
  );
}

function RestoreModal({ backup, onClose, onFinished, onDownloadSafety }) {
  const [stage, setStage] = useState('loading'); // loading | choose | running | done | error
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [results, setResults] = useState([]);
  const [safetyBackup, setSafetyBackup] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    callBackupFunction({ action: 'preview-restore', id: backup.id })
      .then((data) => {
        if (!active) return;
        const rows = data.tables || [];
        setTables(rows);
        setSelected(new Set(rows.filter((t) => t.restorable && (t.newCount + t.changedCount) > 0).map((t) => t.table)));
        setStage('choose');
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(err.message || 'Could not read this backup.');
        setStage('error');
      });
    return () => { active = false; };
  }, [backup.id]);

  const willWrite = tables.filter((t) => selected.has(t.table)).reduce((sum, t) => sum + t.newCount + t.changedCount, 0);
  const canRestore = selected.size > 0 && confirmText.trim().toUpperCase() === 'RESTORE';

  async function runRestore() {
    setStage('running');
    try {
      const data = await callBackupFunction({ action: 'restore', id: backup.id, tables: [...selected] }, { timeoutMs: 300000 });
      setResults(data.results || []);
      setSafetyBackup(data.safetyBackup || null);
      setStage('done');
      onFinished();
    } catch (err) {
      setErrorMessage(err.message || 'The restore did not finish.');
      setStage('error');
      onFinished();
    }
  }

  const failedTotal = results.reduce((sum, r) => sum + r.failed, 0);
  const writtenTotal = results.reduce((sum, r) => sum + r.written, 0);

  return (
    <div onClick={stage === 'running' ? undefined : onClose} style={overlayStyle}>
      <div onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="restore-title" style={{ ...modalStyle, width: 'min(760px, 100%)' }}>
        <div style={{ ...cardHeaderStyle, padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ ...iconChipStyle, background: '#fef3c7', color: '#b45309' }}><i className="bi bi-arrow-counterclockwise" /></span>
            <div>
              <h2 id="restore-title" style={cardTitleStyle}>Restore backup</h2>
              <p style={cardTextStyle}>{KIND_THEME[backup.kind]?.label} backup from {formatDateTime(backup.source_created_at || backup.created_at)}</p>
            </div>
          </div>
          {stage !== 'running' && (
            <button type="button" onClick={onClose} aria-label="Close" style={iconButtonStyle}><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 16, maxHeight: '65vh', overflowY: 'auto' }}>
          {stage === 'loading' && <div style={emptyStyle}><i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />Comparing the backup with the current data...</div>}

          {stage === 'error' && (
            <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{errorMessage}</div>
          )}

          {stage === 'choose' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                Choose what to bring back. <strong>New</strong> records are missing now and will be added; <strong>changed</strong> records will be put back to how they were in the backup. Nothing is deleted.
              </p>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', width: 36 }} />
                      <th style={{ padding: '10px 12px' }}>Table</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>In backup</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>New</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Changed</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Same</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => {
                      const nothingToDo = t.restorable && t.newCount + t.changedCount === 0;
                      return (
                        <tr key={t.table} style={{ borderTop: '1px solid #f1f5f9', opacity: t.restorable ? 1 : 0.6 }}>
                          <td style={{ padding: '9px 12px' }}>
                            <input
                              type="checkbox"
                              aria-label={`Restore ${TABLE_LABELS[t.table] || t.table}`}
                              disabled={!t.restorable}
                              checked={selected.has(t.table)}
                              onChange={() => setSelected((current) => {
                                const next = new Set(current);
                                if (next.has(t.table)) next.delete(t.table);
                                else next.add(t.table);
                                return next;
                              })}
                              style={{ width: 16, height: 16, accentColor: '#b45309' }}
                            />
                          </td>
                          <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 600 }}>
                            {TABLE_LABELS[t.table] || t.table}
                            {!t.restorable && <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontWeight: 500 }}>kept for records only</span>}
                            {nothingToDo && <span style={{ marginLeft: 8, fontSize: 11, color: '#15803d', fontWeight: 600 }}>already up to date</span>}
                          </td>
                          <td style={numCell}>{t.inBackup.toLocaleString()}</td>
                          <td style={{ ...numCell, color: t.newCount ? '#15803d' : '#94a3b8', fontWeight: t.newCount ? 800 : 500 }}>{t.restorable ? t.newCount : '—'}</td>
                          <td style={{ ...numCell, color: t.changedCount ? '#b45309' : '#94a3b8', fontWeight: t.changedCount ? 800 : 500 }}>{t.restorable ? t.changedCount : '—'}</td>
                          <td style={{ ...numCell, color: '#94a3b8' }}>{t.restorable ? t.unchangedCount : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: 14, borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 13, display: 'flex', gap: 10 }}>
                <i className="bi bi-shield-check" style={{ fontSize: 16 }} />
                <span>A <strong>“Before restore”</strong> backup of the current data is saved automatically first, so you can undo this.</span>
              </div>

              <div>
                <label htmlFor="restore-confirm" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Type <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 6 }}>RESTORE</code> to confirm
                </label>
                <input id="restore-confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" style={fieldStyle} />
              </div>
            </>
          )}

          {stage === 'running' && (
            <div style={emptyStyle}>
              <i className="bi bi-arrow-repeat animate-spin" style={{ fontSize: 28, display: 'block', marginBottom: 10, color: '#b45309' }} />
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Restoring…</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Saving a safety backup first, then writing {willWrite.toLocaleString()} records. Please keep this window open.</div>
            </div>
          )}

          {stage === 'done' && (
            <>
              <div style={{ padding: 16, borderRadius: 14, background: failedTotal ? '#fffbeb' : '#ecfdf5', border: `1px solid ${failedTotal ? '#fde68a' : '#a7f3d0'}`, color: failedTotal ? '#92400e' : '#065f46', display: 'flex', gap: 12, alignItems: 'center' }}>
                <i className={failedTotal ? 'bi bi-exclamation-triangle' : 'bi bi-check-circle'} style={{ fontSize: 22 }} />
                <div>
                  <div style={{ fontWeight: 800 }}>{failedTotal ? 'Restore finished with some problems' : 'Restore complete'}</div>
                  <div style={{ fontSize: 13 }}>{writtenTotal.toLocaleString()} records restored{failedTotal ? `, ${failedTotal.toLocaleString()} could not be written` : ''}.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {results.map((r) => (
                  <div key={r.table} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #eef2f7', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{TABLE_LABELS[r.table] || r.table}</span>
                      <span style={{ color: r.failed ? '#b45309' : '#15803d', fontWeight: 700 }}>{r.written} restored{r.failed ? ` · ${r.failed} failed` : ''}</span>
                    </div>
                    {r.errors?.map((message) => <div key={message} style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>{message}</div>)}
                  </div>
                ))}
              </div>
              {safetyBackup && (
                <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                  To undo, restore the <strong>“Before restore”</strong> backup from {formatDateTime(safetyBackup.created_at)} in the history list.{' '}
                  <button type="button" onClick={() => onDownloadSafety(safetyBackup)} style={linkButtonStyle}>Download it</button>
                </p>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #eef2f7' }}>
          {stage === 'choose' && (
            <>
              <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 12, color: '#64748b' }}>
                {selected.size} table{selected.size === 1 ? '' : 's'} · {willWrite.toLocaleString()} records to write
              </span>
              <button type="button" onClick={onClose} style={ghostButtonStyle}>Cancel</button>
              <button type="button" onClick={runRestore} disabled={!canRestore} style={{ ...primaryButtonStyle, background: '#b45309', opacity: canRestore ? 1 : 0.45, cursor: canRestore ? 'pointer' : 'not-allowed' }}>
                <i className="bi bi-arrow-counterclockwise" /> Restore now
              </button>
            </>
          )}
          {(stage === 'done' || stage === 'error' || stage === 'loading') && (
            <button type="button" onClick={onClose} style={ghostButtonStyle}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadModal({ info, serviceReady, onClose, onImported }) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleImport() {
    setSaving(true);
    setErrorMessage('');
    try {
      const { backup } = await callBackupFunction({ action: 'import', payload: info.payload });
      onImported(backup);
    } catch (err) {
      setErrorMessage(err.message || 'Could not add this file.');
    } finally {
      setSaving(false);
    }
  }

  const entries = Object.entries(info.counts || {});
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div onClick={saving ? undefined : onClose} style={overlayStyle}>
      <div onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-title" style={{ ...modalStyle, width: 'min(600px, 100%)' }}>
        <div style={{ ...cardHeaderStyle, padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
            <span style={{ ...iconChipStyle, background: '#ede9fe', color: '#6d28d9' }}><i className="bi bi-file-earmark-zip" /></span>
            <div style={{ minWidth: 0 }}>
              <h2 id="upload-title" style={cardTitleStyle}>Backup file preview</h2>
              <p style={{ ...cardTextStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.fileName} · {formatBytes(info.size)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={iconButtonStyle}><i className="bi bi-x-lg" /></button>
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 14, maxHeight: '60vh', overflowY: 'auto' }}>
          {!info.ok ? (
            <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{info.error}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {[
                  ['Created', formatDateTime(info.createdAt)],
                  ['Made by', info.createdBy?.email || info.createdBy?.name || (info.legacy ? 'Unknown' : 'Automatic')],
                  ['Records', total.toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 4, overflowWrap: 'anywhere' }}>{value}</div>
                  </div>
                ))}
              </div>
              {info.note && <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Note: “{info.note}”</p>}
              <div style={{ border: '1px solid #eef2f7', borderRadius: 12 }}>
                {entries.map(([table, n], index) => (
                  <div key={table} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: index ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                    <span style={{ color: '#0f172a' }}>{TABLE_LABELS[table] || table}{BACKUP_ONLY_TABLES.includes(table) ? <span style={{ color: '#94a3b8' }}> · records only</span> : null}</span>
                    <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {info.legacy && (
                <div style={{ padding: 12, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13 }}>
                  This file was made by the old backup page. It can be viewed here but cannot be restored, because it does not keep the data in the database's own format.
                </div>
              )}
              {!info.legacy && !serviceReady && (
                <div style={{ padding: 12, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13 }}>
                  This file can be restored once the backup service is set up.
                </div>
              )}
              {errorMessage && <div style={{ padding: 12, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>{errorMessage}</div>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #eef2f7' }}>
          <button type="button" onClick={onClose} style={ghostButtonStyle} disabled={saving}>Close</button>
          {info.ok && !info.legacy && serviceReady && (
            <button type="button" onClick={handleImport} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
              <i className={saving ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-arrow-right-circle'} />
              {saving ? 'Adding...' : 'Add to history and review restore'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  success: { bg: '#ecfdf5', fg: '#047857' },
  warning: { bg: '#fffbeb', fg: '#b45309' },
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  muted: { bg: '#f1f5f9', fg: '#475569' },
};

function StatTile({ icon, label, value, hint, tone }) {
  const colors = TONES[tone] || TONES.info;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ ...iconChipStyle, background: colors.bg, color: colors.fg }}><i className={icon} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 12px 32px rgba(15,23,42,0.05)', overflow: 'hidden' };
const cardHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '18px 24px', borderBottom: '1px solid #eef2f7' };
const cardTitleStyle = { margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' };
const cardTextStyle = { margin: '3px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 };
const iconChipStyle = { width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 };
const pillStyle = { padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const fieldStyle = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.2)' };
const ghostButtonStyle = { padding: '11px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const secondaryButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const iconButtonStyle = { width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
const linkButtonStyle = { border: 'none', background: 'none', padding: 0, color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const emptyStyle = { padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400, display: 'grid', placeItems: 'center', padding: 16 };
const modalStyle = { background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 24px 80px rgba(15,23,42,0.25)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' };
const numCell = { padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' };
