import React, { forwardRef } from 'react';
import './Input.css';

// Input component with support for multiple types
const Input = forwardRef(
  (
    {
      type = 'text',
      placeholder = '',
      value = '',
      onChange,
      onBlur,
      onFocus,
      error = null,
      success = false,
      disabled = false,
      label = null,
      helperText = null,
      className = '',
      icon: Icon = null,
      required = false,
      ...props
    },
    ref
  ) => {
    const inputClass = `
      input
      ${Icon ? 'input-with-icon' : ''}
      ${error ? 'input-error' : ''}
      ${success ? 'input-success' : ''}
      ${disabled ? 'input-disabled' : ''}
      ${className}
    `.trim();

    return (
      <div className="input-group">
        {label && (
          <label className="input-label">
            {label}
            {required && <span className="input-required">*</span>}
          </label>
        )}
        <div className="input-wrapper">
          {Icon && <Icon className="input-icon" />}
          <input
            ref={ref}
            type={type}
            className={inputClass}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
            disabled={disabled}
            {...props}
          />
          {success && <span className="input-check">✓</span>}
        </div>
        {error && <span className="input-error-text">{error}</span>}
        {helperText && !error && <span className="input-helper-text">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
