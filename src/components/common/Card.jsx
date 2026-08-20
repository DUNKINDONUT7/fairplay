import React from 'react';
import './Card.css';

// Card component - base container
const Card = ({
  children,
  className = '',
  padding = 'md',
  hover = true,
  border = true,
  shadow = 'md',
  ...props
}) => {
  const cardClass = `
    card
    card-p-${padding}
    card-shadow-${shadow}
    ${border ? 'card-border' : ''}
    ${hover ? 'card-hover' : ''}
    ${className}
  `.trim();

  return (
    <div className={cardClass} {...props}>
      {children}
    </div>
  );
};

export default Card;
