import React from 'react';
import './Modal.css';

// Modal component
const Modal = ({
  isOpen = false,
  onClose,
  title,
  children,
  footer = null,
  size = 'md',
  closeButton = true,
  className = ''
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={handleBackdropClick} />
      <div className={`modal modal-${size} animate-scale-in ${className}`.trim()}>
        <div className="modal-header">
          {title && <h2 className="modal-title">{title}</h2>}
          {closeButton && (
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </>
  );
};

export default Modal;
