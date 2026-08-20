// General helper functions

// Combine class names conditionally
export const cn = (...classes) => {
  return classes
    .filter(Boolean)
    .map((c) => {
      if (typeof c === 'string') return c;
      if (typeof c === 'object') {
        return Object.keys(c)
          .filter((key) => c[key])
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .trim();
};

// Deep clone object
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Merge objects
export const mergeObjects = (obj1, obj2) => {
  return { ...obj1, ...obj2 };
};

// Get value from nested object
export const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
};

// Set value in nested object
export const setNestedValue = (obj, path, value) => {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return obj;
};

// Generate random ID
export const generateId = (prefix = '') => {
  return prefix + Math.random().toString(36).substr(2, 9);
};

// Sort array by key
export const sortBy = (array, key, ascending = true) => {
  return [...array].sort((a, b) => {
    if (a[key] < b[key]) return ascending ? -1 : 1;
    if (a[key] > b[key]) return ascending ? 1 : -1;
    return 0;
  });
};

// Filter array by multiple conditions
export const filterBy = (array, conditions) => {
  return array.filter((item) =>
    Object.keys(conditions).every((key) => item[key] === conditions[key])
  );
};

// Group array by key
export const groupBy = (array, key) => {
  return array.reduce((groups, item) => {
    const groupKey = item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
};

// Unique array by key
export const uniqueBy = (array, key) => {
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

// Wait/delay function
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle function
export const throttle = (func, limit) => {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Check if object is empty
export const isEmpty = (obj) => {
  return Object.keys(obj).length === 0;
};

// Check if value exists in array
export const includes = (array, value) => {
  return array.includes(value);
};

// Find item in array
export const findItem = (array, predicate) => {
  return array.find(predicate);
};

// Map and filter in one step
export const mapFilter = (array, predicate, mapper) => {
  return array.filter(predicate).map(mapper);
};

// Get random item from array
export const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Shuffle array
export const shuffleArray = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
