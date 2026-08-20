export default function PaginationControls({ page, totalPages, limit, totalItems, onPageChange, onLimitChange }) {
  const safeTotalPages = Math.max(totalPages, 1);
  const start = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, totalItems);

  return (
    <div style={wrapperStyle}>
      <div style={{ color: '#64748b', fontSize: 13 }}>
        Showing {start}-{end} of {totalItems}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select value={limit} onChange={(event) => onLimitChange(Number(event.target.value))} style={selectStyle}>
          {[10, 25, 50, 100].map((value) => (
            <option key={value} value={value}>{value} / page</option>
          ))}
        </select>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={buttonStyle(page <= 1)}>Previous</button>
        <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 800 }}>Page {page} of {safeTotalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= safeTotalPages} style={buttonStyle(page >= safeTotalPages)}>Next</button>
      </div>
    </div>
  );
}

const wrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  paddingTop: 16,
  marginTop: 16,
  borderTop: '1px solid #e2e8f0',
};

const selectStyle = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #dbeafe',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
};

const buttonStyle = (disabled) => ({
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #bfdbfe',
  background: disabled ? '#f8fafc' : '#eff6ff',
  color: disabled ? '#94a3b8' : '#1d4ed8',
  fontWeight: 800,
  fontSize: 13,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
