import React from 'react';
import './Button.css';

// Button component with multiple variants
const Button = ({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  fullWidth = false,
  icon: Icon = null,
  ...props
}) => {
  const buttonClass = `
    btn 
    btn-${variant} 
    btn-${size} 
    ${fullWidth ? 'btn-full-width' : ''}
    ${disabled ? 'btn-disabled' : ''}
    ${loading ? 'btn-loading' : ''}
    ${className}
  `.trim();

  return (
    <button
      type={type}
      className={buttonClass}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="btn-spinner"></span>}
      {Icon && <Icon className="btn-icon" />}
      {children}
    </button>
  );
};

export default Button;
