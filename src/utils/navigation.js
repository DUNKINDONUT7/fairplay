export const APPROVAL_ROLES = ['admin', 'institute-coordinator', 'sports-head', 'osds'];

export function roleHomePath(role) {
  if (APPROVAL_ROLES.includes(role) && role !== 'admin') {
    return '/approvals';
  }

  return {
    admin: '/admin',
    organizer: '/organizer',
    judge: '/judge',
    participant: '/participant',
  }[role] || '/';
}

export function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')) {
    return '';
  }

  return returnTo;
}

export function buildReturnToPath(location) {
  if (!location?.pathname) {
    return '';
  }

  const search = location.search || '';
  const hash = location.hash || '';
  return `${location.pathname}${search}${hash}`;
}

export function buildAuthModalPath(mode = 'login', returnTo = '') {
  const params = new URLSearchParams();
  params.set('modal', mode === 'register' ? 'register' : 'login');

  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (safeReturnTo) {
    params.set('returnTo', safeReturnTo);
  }

  return `/?${params.toString()}`;
}

export function getPostAuthPath(user, returnTo = '') {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (safeReturnTo) {
    return safeReturnTo;
  }

  return roleHomePath(user?.role);
}
