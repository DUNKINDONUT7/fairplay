// Utility functions for form validation

// Email validation
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation (at least 6 characters)
export const isValidPassword = (password) => {
  return password && password.length >= 6;
};

// Strong password (at least 8 chars, 1 uppercase, 1 number)
export const isStrongPassword = (password) => {
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return strongRegex.test(password);
};

// Required field validation
export const isRequired = (value) => {
  return value !== null && value !== undefined && value !== '';
};

// Minimum length validation
export const minLength = (value, min) => {
  if (!value) return true;
  return value.length >= min;
};

// Maximum length validation
export const maxLength = (value, max) => {
  if (!value) return true;
  return value.length <= max;
};

// Number validation
export const isNumber = (value) => {
  return !isNaN(value) && value !== '';
};

// Phone number validation (basic)
export const isValidPhoneNumber = (phone) => {
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

// URL validation
export const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

// Validate username (alphanumeric and underscore only)
export const isValidUsername = (username) => {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

// Validate form field
export const validateField = (name, value, rules = {}) => {
  let error = '';

  if (rules.required && !isRequired(value)) {
    error = `${name} is required`;
  } else if (rules.email && value && !isValidEmail(value)) {
    error = `${name} must be a valid email`;
  } else if (rules.password && value && !isValidPassword(value)) {
    error = `${name} must be at least 6 characters`;
  } else if (rules.minLength && value && !minLength(value, rules.minLength)) {
    error = `${name} must be at least ${rules.minLength} characters`;
  } else if (rules.maxLength && value && !maxLength(value, rules.maxLength)) {
    error = `${name} must be at most ${rules.maxLength} characters`;
  } else if (rules.number && value && !isNumber(value)) {
    error = `${name} must be a number`;
  } else if (rules.url && value && !isValidURL(value)) {
    error = `${name} must be a valid URL`;
  } else if (rules.phone && value && !isValidPhoneNumber(value)) {
    error = `${name} must be a valid phone number`;
  } else if (rules.username && value && !isValidUsername(value)) {
    error = `${name} must be 3-20 alphanumeric characters`;
  }

  return error;
};

// Validate entire form
export const validateForm = (formData, validationRules) => {
  const errors = {};
  let isValid = true;

  Object.keys(validationRules).forEach((fieldName) => {
    const error = validateField(fieldName, formData[fieldName], validationRules[fieldName]);
    if (error) {
      errors[fieldName] = error;
      isValid = false;
    }
  });

  return { errors, isValid };
};
