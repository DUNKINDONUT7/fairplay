import React from 'react';
import { renderIcon } from './Icon';
import './EmptyState.css';

// EmptyState component for empty lists/tables
const EmptyState = ({
  icon = 'clipboard',
  title = 'No data found',
  description = 'Try adjusting your search or filters',
  action = null,
  className = ''
}) => {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="empty-state-icon">{renderIcon(icon)}</div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
};

export default EmptyState;
