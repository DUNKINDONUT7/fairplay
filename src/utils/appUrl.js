export function getAppBaseUrl() {
  const configured = (import.meta.env.VITE_SITE_URL || import.meta.env.VITE_APP_URL || '').replace(/\/$/, '');

  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
}

export function buildAppUrl(path = '') {
  const base = getAppBaseUrl();
  const normalizedPath = String(path || '').trim();

  if (!base) {
    return normalizedPath;
  }

  if (!normalizedPath) {
    return base;
  }

  const nextPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${base}${nextPath}`;
}
