import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Every chart here plots one measure, so each uses a single hue — the bar
// length carries the value and the axis labels carry identity.
const BAR = '#2563eb';
const GRID = '#e2e8f0';
const AXIS = { fontSize: 11, fill: '#64748b' };
const tooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' };

const truncate = (value, length = 20) => (String(value).length > length ? `${String(value).slice(0, length - 1)}…` : value);

// Horizontal bars, one row per item. Grows with the data and scrolls inside
// its own box, so 100 participants stay as readable as 10.
export function RankedBars({ data, valueLabel, max, formatValue = (value) => value }) {
  const height = Math.max(160, data.length * 30 + 36);
  return (
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, max || 'auto']} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis type="category" dataKey="name" width={140} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(value) => truncate(value)} interval={0} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} formatter={(value) => [formatValue(value), valueLabel]} />
            <Bar dataKey="value" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ColumnBars({ data, valueLabel, height = 240, allowDecimals = false }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 48 : 24} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={allowDecimals} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} formatter={(value) => [value, valueLabel]} />
          <Bar dataKey="value" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
