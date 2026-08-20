import React from 'react';
import './LoadingSpinner.css';

// Loading Spinner component
const LoadingSpinner = ({
  size = 'md',
  variant = 'primary',
  text = 'Loading...',
  fullScreen = false,
  className = ''
}) => {
  if (fullScreen) {
    return (
      <div className={`loading-fullscreen ${className}`.trim()}>
        <div className={`spinner spinner-${size} spinner-${variant}`} />
        {text && <p className="loading-text">{text}</p>}
      </div>
    );
  }

  return (
    <div className={`spinner-container ${className}`.trim()}>
      <div className={`spinner spinner-${size} spinner-${variant}`} />
      {text && <p className="loading-text">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
