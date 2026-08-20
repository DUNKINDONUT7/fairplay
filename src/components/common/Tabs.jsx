import React, { useState } from 'react';
import { renderIcon } from './Icon';
import './Tabs.css';

// Tabs component
const Tabs = ({ tabs = [], defaultActive = 0, onChange = null, className = '' }) => {
  const [activeTab, setActiveTab] = useState(defaultActive);

  const handleTabChange = (index) => {
    setActiveTab(index);
    if (onChange) {
      onChange(index, tabs[index]);
    }
  };

  return (
    <div className={`tabs ${className}`.trim()}>
      <div className="tabs-header">
        {tabs.map((tab, index) => (
          <button
            key={index}
            className={`tabs-button ${activeTab === index ? 'tabs-button-active' : ''}`}
            onClick={() => handleTabChange(index)}
          >
            {tab.icon && <span className="tabs-icon">{renderIcon(tab.icon)}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tabs-content">
        {tabs[activeTab] && tabs[activeTab].content}
      </div>
    </div>
  );
};

export default Tabs;
