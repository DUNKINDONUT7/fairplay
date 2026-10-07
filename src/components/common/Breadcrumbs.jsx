import { Link } from 'react-router-dom';

// "Events › Mutya ng Baliwag 2026 › Ranking" — where you are, and one click
// back to anywhere above it. The last item is the current page.
// The Back button goes to the page directly above this one, so it lands on the
// same place every time no matter how the user got here.
export default function Breadcrumbs({ items = [] }) {
  const parent = items.slice(0, -1).reverse().find((item) => item.to);

  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      {parent && (
        <Link
          to={parent.to}
          aria-label={`Back to ${parent.label}`}
          title={`Back to ${parent.label}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontSize: 13, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}
        >
          <i className="bi bi-arrow-left" aria-hidden="true" />
          Back
        </Link>
      )}
      <ol style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, listStyle: 'none', margin: 0, padding: 0, fontSize: 13, minWidth: 0 }}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {index > 0 && <i className="bi bi-chevron-right" aria-hidden="true" style={{ fontSize: 10, color: '#94a3b8' }} />}
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} style={{ color: last ? '#0f172a' : '#64748b', fontWeight: last ? 700 : 500, overflowWrap: 'anywhere' }}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', overflowWrap: 'anywhere' }}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
