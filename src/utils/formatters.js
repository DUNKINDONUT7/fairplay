// Utility functions for formatting data

// Format date to readable format
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
};

// Format date and time
export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return d.toLocaleDateString('en-US', options);
};

// Format time only
export const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const options = { hour: '2-digit', minute: '2-digit' };
  return d.toLocaleTimeString('en-US', options);
};

// Format number with commas
export const formatNumber = (num) => {
  if (typeof num !== 'number') return num;
  return num.toLocaleString('en-US');
};

// Format currency
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amount);
};

// Format percentage
export const formatPercentage = (value, decimals = 1) => {
  if (typeof value !== 'number') return value;
  return `${(value * 100).toFixed(decimals)}%`;
};

// Truncate string
export const truncateString = (str, maxLength = 50) => {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
};

// Capitalize first letter
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Convert string to title case
export const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Format rank with ordinal suffix
export const formatRank = (num) => {
  if (typeof num !== 'number') return num;
  const j = num % 10;
  const k = num % 100;
  let suffix = 'th';
  
  if (j === 1 && k !== 11) suffix = 'st';
  if (j === 2 && k !== 12) suffix = 'nd';
  if (j === 3 && k !== 13) suffix = 'rd';
  
  return `${num}${suffix}`;
};

// Get relative time (e.g., "2 hours ago")
export const getRelativeTime = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  const now = new Date();
  const seconds = Math.floor((now - d) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [name, value] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / value);
    if (interval >= 1) {
      return interval === 1 ? `${interval} ${name} ago` : `${interval} ${name}s ago`;
    }
  }

  return 'Just now';
};
