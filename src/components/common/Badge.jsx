import React from 'react';
import './Badge.css';

// Badge component for status indicators
const Badge = ({ children, variant = 'default', size = 'md', className = '', ...props }) => {
  const badgeClass = `badge badge-${variant} badge-${size} ${className}`.trim();
  return (
    <span className={badgeClass} {...props}>
      {children}
    </span>
  );
};

// Status badge for specific statuses
export const StatusBadge = ({ status, className = '' }) => {
  const statusVariants = {
    active: 'success',
    completed: 'success',
    upcoming: 'info',
    pending: 'warning',
    cancelled: 'danger',
    'in-progress': 'warning',
    draft: 'default',
    archived: 'secondary'
  };

  const variant = statusVariants[status] || 'default';

  return (
    <Badge variant={variant} className={className}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </Badge>
  );
};

export default Badge;
