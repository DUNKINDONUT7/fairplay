import { useEffect, useRef, useState } from 'react';
import CertificateRenderer, {
  UPLOADED_FIELD_DEFS,
  UPLOADED_TEMPLATE_WIDTH,
  getSigners,
  getUploadedField,
  isUploadedFieldAvailable,
  uploadedTemplateHeight,
} from './CertificateRenderer';

const TEXT_COLORS = [
  { value: '#073047', label: 'Navy' },
  { value: '#111827', label: 'Black' },
  { value: '#7c2d12', label: 'Brown' },
  { value: '#b8860b', label: 'Gold' },
  { value: '#ffffff', label: 'White' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Shows the uploaded template exactly as a certificate will come out, with a
// box for each detail that the organizer drags onto the spot the design left
// for it. No scan can know those spots for every design, so the organizer has
// the last word. Positions are kept in percent, so they hold at any size.
export default function NamePlacementEditor({ template, sampleCertificate, onChange }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [scale, setScale] = useState(0);
  const [selectedKey, setSelectedKey] = useState('name');
  // A box follows the pointer from local state and is only saved on
  // release — saving re-stores the whole template image each time.
  const [draft, setDraft] = useState(null);

  const stageHeight = uploadedTemplateHeight(template.customTemplateAspect);
  const fieldFor = (key) => (draft && draft.key === key ? draft.field : getUploadedField(template, key));
  const shownDefs = UPLOADED_FIELD_DEFS.filter((definition) => fieldFor(definition.key).enabled && isUploadedFieldAvailable(template, definition.key));
  const selected = shownDefs.find((definition) => definition.key === selectedKey) || shownDefs[0];
  const selectedField = fieldFor(selected.key);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => setScale(element.clientWidth / UPLOADED_TEMPLATE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startDrag = (key, mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedKey(key);
    dragRef.current = { key, mode, x: event.clientX, y: event.clientY, field: fieldFor(key) };
  };

  const handleDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || !scale) return;
    const dx = ((event.clientX - drag.x) / scale / UPLOADED_TEMPLATE_WIDTH) * 100;
    const dy = ((event.clientY - drag.y) / scale / stageHeight) * 100;
    setDraft({
      key: drag.key,
      field: drag.mode === 'move'
        ? {
            ...drag.field,
            left: clamp(drag.field.left + dx, 0, 100 - drag.field.width),
            top: clamp(drag.field.top + dy, 0, 100 - drag.field.height),
          }
        : {
            ...drag.field,
            width: clamp(drag.field.width + dx, 8, 100 - drag.field.left),
            height: clamp(drag.field.height + dy, 2.5, 100 - drag.field.top),
          },
    });
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (draft) onChange(draft.key, draft.field);
    setDraft(null);
  };

  const previewTemplate = draft
    ? { ...template, customTemplateFields: { ...(template.customTemplateFields || {}), [draft.key]: { ...draft.field, manual: true } } }
    : template;

  return (
    <div>
      <div ref={wrapRef} style={{ width: '100%', height: stageHeight * scale, position: 'relative', overflow: 'clip', borderRadius: 10, border: '1px solid #dbeafe', background: '#f8fafc' }}>
        {scale > 0 && (
          <div style={{ width: UPLOADED_TEMPLATE_WIDTH, height: stageHeight, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
            <CertificateRenderer certificate={sampleCertificate} template={previewTemplate} />
            {shownDefs.map((definition) => {
              const field = fieldFor(definition.key);
              const active = definition.key === selected.key;
              return (
                <div
                  key={definition.key}
                  role="group"
                  aria-label={`${definition.label} position`}
                  title={definition.label}
                  onPointerDown={startDrag(definition.key, 'move')}
                  onPointerMove={handleDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{
                    position: 'absolute',
                    left: `${field.left}%`,
                    top: `${field.top}%`,
                    width: `${field.width}%`,
                    height: `${field.height}%`,
                    boxSizing: 'border-box',
                    border: `${(active ? 2 : 1) / scale}px dashed ${active ? '#2563eb' : '#94a3b8'}`,
                    background: active ? 'rgba(37,99,235,0.08)' : 'transparent',
                    cursor: 'move',
                    touchAction: 'none',
                    // Above the text itself, which the renderer lifts off the template.
                    zIndex: active ? 6 : 5,
                  }}
                >
                  {/* Only the selected box is labelled, so the tags never hide the text of a neighbour. */}
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: '100%',
                        padding: `${1 / scale}px ${5 / scale}px`,
                        fontSize: 10 / scale,
                        fontWeight: 800,
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap',
                        color: '#ffffff',
                        background: '#2563eb',
                        borderRadius: `${4 / scale}px ${4 / scale}px 0 0`,
                        pointerEvents: 'none',
                      }}
                    >
                      {definition.label}
                    </span>
                  )}
                  {active && (
                    <div
                      aria-label={`Resize ${definition.label.toLowerCase()} box`}
                      onPointerDown={startDrag(definition.key, 'resize')}
                      style={{
                        position: 'absolute',
                        right: -8 / scale,
                        bottom: -8 / scale,
                        width: 16 / scale,
                        height: 16 / scale,
                        borderRadius: '50%',
                        background: '#2563eb',
                        border: `${2 / scale}px solid #ffffff`,
                        cursor: 'nwse-resize',
                        touchAction: 'none',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Drag each box onto the blank space your design left for it. Click a box to select it, then drag the dot at its corner to make it bigger or smaller — the text always shrinks to fit inside.
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
          What to add on top of your design
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {UPLOADED_FIELD_DEFS.map((definition) => {
            const field = getUploadedField(template, definition.key);
            const available = isUploadedFieldAvailable(template, definition.key);
            // A signer who has not been added yet is not offered at all; a
            // signature that is merely not uploaded yet stays visible as a hint.
            if (!available && !definition.image) return null;
            if (!available && definition.signer > 0 && !getSigners(template)[definition.signer]) return null;
            const missingSignature = !available;
            const locked = definition.key === 'name' || missingSignature;
            return (
              <label
                key={definition.key}
                title={missingSignature ? 'Upload a signature below first' : locked ? 'The name is always added' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: locked ? 'default' : 'pointer', color: field.enabled ? '#1d4ed8' : '#475569', background: field.enabled ? '#eff6ff' : '#f8fafc', border: `1px solid ${field.enabled ? '#bfdbfe' : '#e2e8f0'}` }}
              >
                <input
                  type="checkbox"
                  checked={field.enabled && !missingSignature}
                  disabled={locked}
                  onChange={() => {
                    onChange(definition.key, { ...field, enabled: !field.enabled });
                    if (!field.enabled) setSelectedKey(definition.key);
                  }}
                />
                {definition.label}
              </label>
            );
          })}
        </div>
        <div style={{ color: '#64748b', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          Tick only what your design does not already show. The wording comes from the Signer, Organization, Title and Message boxes below.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <span style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {selected.image ? selected.label : `${selected.label} color`}
        </span>
        {!selected.image && TEXT_COLORS.map((color) => {
          const active = (selectedField.color || TEXT_COLORS[0].value).toLowerCase() === color.value;
          return (
            <button
              key={color.value}
              type="button"
              title={color.label}
              aria-label={`${color.label} text`}
              aria-pressed={active}
              onClick={() => onChange(selected.key, { ...selectedField, color: color.value })}
              style={{ width: 24, height: 24, borderRadius: '50%', background: color.value, border: active ? '3px solid #2563eb' : '1px solid #94a3b8', cursor: 'pointer', padding: 0 }}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onChange(selected.key, { ...selectedField, left: (100 - selectedField.width) / 2 })}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
        >
          <i className="bi bi-align-center" style={{ marginRight: 6 }} />
          Center left-to-right
        </button>
      </div>
    </div>
  );
}
