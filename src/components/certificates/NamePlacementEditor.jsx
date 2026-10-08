import { useEffect, useRef, useState } from 'react';
import CertificateRenderer, {
  UPLOADED_TEMPLATE_WIDTH,
  getUploadedNameField,
  uploadedTemplateHeight,
} from './CertificateRenderer';

const NAME_COLORS = [
  { value: '#073047', label: 'Navy' },
  { value: '#111827', label: 'Black' },
  { value: '#7c2d12', label: 'Brown' },
  { value: '#b8860b', label: 'Gold' },
  { value: '#ffffff', label: 'White' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Shows the uploaded template exactly as a certificate will come out, with a
// box the organizer drags onto the spot the template left for the name.
// No scan can know that spot for every design, so the organizer has the last
// word. Positions are kept in percent, so they hold at any size.
export default function NamePlacementEditor({ template, sampleName, onChange }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [scale, setScale] = useState(0);
  // The box follows the pointer from local state and is only saved on
  // release — saving re-stores the whole template image each time.
  const [draft, setDraft] = useState(null);

  const stageHeight = uploadedTemplateHeight(template.customTemplateAspect);
  const saved = getUploadedNameField(template);
  const field = draft || saved;

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => setScale(element.clientWidth / UPLOADED_TEMPLATE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startDrag = (mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, x: event.clientX, y: event.clientY, field };
  };

  const handleDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || !scale) return;
    const dx = ((event.clientX - drag.x) / scale / UPLOADED_TEMPLATE_WIDTH) * 100;
    const dy = ((event.clientY - drag.y) / scale / stageHeight) * 100;
    setDraft(drag.mode === 'move'
      ? {
          ...drag.field,
          left: clamp(drag.field.left + dx, 0, 100 - drag.field.width),
          top: clamp(drag.field.top + dy, 0, 100 - drag.field.height),
        }
      : {
          ...drag.field,
          width: clamp(drag.field.width + dx, 12, 100 - drag.field.left),
          height: clamp(drag.field.height + dy, 3, 100 - drag.field.top),
        });
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (draft) onChange(draft);
    setDraft(null);
  };

  const previewTemplate = {
    ...template,
    customTemplateFields: { ...(template.customTemplateFields || {}), name: { ...field, manual: true } },
  };

  return (
    <div>
      <div ref={wrapRef} style={{ width: '100%', height: stageHeight * scale, position: 'relative', overflow: 'clip', borderRadius: 10, border: '1px solid #dbeafe', background: '#f8fafc' }}>
        {scale > 0 && (
          <div style={{ width: UPLOADED_TEMPLATE_WIDTH, height: stageHeight, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
            <CertificateRenderer certificate={{ recipientName: sampleName, category: 'participant' }} template={previewTemplate} />
            <div
              role="group"
              aria-label="Name position"
              onPointerDown={startDrag('move')}
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
                border: `${2 / scale}px dashed #2563eb`,
                background: 'rgba(37,99,235,0.08)',
                cursor: 'move',
                touchAction: 'none',
                // Above the name itself, which the renderer lifts off the template.
                zIndex: 5,
              }}
            >
              <div
                aria-label="Resize name box"
                onPointerDown={startDrag('resize')}
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
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <span style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>Name color</span>
        {NAME_COLORS.map((color) => {
          const active = (saved.color || NAME_COLORS[0].value).toLowerCase() === color.value;
          return (
            <button
              key={color.value}
              type="button"
              title={color.label}
              aria-label={`${color.label} name`}
              aria-pressed={active}
              onClick={() => onChange({ ...saved, color: color.value })}
              style={{ width: 24, height: 24, borderRadius: '50%', background: color.value, border: active ? '3px solid #2563eb' : '1px solid #94a3b8', cursor: 'pointer', padding: 0 }}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ ...saved, left: (100 - saved.width) / 2 })}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
        >
          <i className="bi bi-align-center" style={{ marginRight: 6 }} />
          Center left-to-right
        </button>
      </div>
      <div style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Drag the blue box onto the blank space your design left for the name. Drag the dot at its corner to make it bigger or smaller — the name always shrinks to fit inside it.
      </div>
    </div>
  );
}
