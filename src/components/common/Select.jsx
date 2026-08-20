import React from 'react';
import './Select.css';

const Select = ({ 
  name, 
  value, 
  onChange, 
  options = [], 
  placeholder = 'Select option',
  disabled = false,
  error = false,
  helperText = ''
}) => {
  return (
    <div className="select-wrapper">
      <select
        className={`select ${error ? 'error' : ''}`}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && helperText && <span className="error-text">{helperText}</span>}
    </div>
  );
};

export default Select;
