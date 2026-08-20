import React from 'react';
import Card from '../common/Card';
import { renderIcon } from '../common/Icon';
import './StatCard.css';

// StatCard component for displaying statistics
const StatCard = ({
  label,
  value,
  icon,
  trend = null,
  trendPositive = true,
  unit = '',
  color = 'cyan',
  onClick = null,
  className = ''
}) => {
  return (
    <Card
      className={`stat-card stat-card-${color} ${onClick ? 'stat-card-clickable' : ''} ${className}`.trim()}
      padding="lg"
      hover={!!onClick}
      onClick={onClick}
    >
      <div className="stat-card-header">
        {icon && <span className="stat-card-icon">{renderIcon(icon)}</span>}
        <div className="stat-card-label">{label}</div>
      </div>
      <div className="stat-card-value">
        {value}
        {unit && <span className="stat-card-unit">{unit}</span>}
      </div>
      {trend && (
        <div className={`stat-card-trend stat-card-trend-${trendPositive ? 'up' : 'down'}`}>
          <span className="stat-card-trend-icon">
            {trendPositive ? '↑' : '↓'}
          </span>
          {trend}
        </div>
      )}
    </Card>
  );
};

export default StatCard;
