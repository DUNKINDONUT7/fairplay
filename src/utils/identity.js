function normalizeIdentityValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function hashToSafeInteger(input) {
  const text = normalizeIdentityValue(input);
  if (!text) return null;

  let hash = 17n;
  for (const char of text) {
    hash = (hash * 31n + BigInt(char.charCodeAt(0))) % 9007199254740000n;
  }

  return Number(hash || 1n);
}

export function getBusinessActorId(actor) {
  if (actor === null || actor === undefined) return null;

  if (typeof actor === 'object') {
    if (actor.businessId !== null && actor.businessId !== undefined) {
      return getBusinessActorId(actor.businessId);
    }

    if (actor.id !== null && actor.id !== undefined) {
      const directId = getBusinessActorId(actor.id);
      if (directId !== null) {
        return directId;
      }
    }

    if (actor.authProfileId) {
      const authProfileId = getBusinessActorId(actor.authProfileId);
      if (authProfileId !== null) {
        return authProfileId;
      }
    }

    if (actor.email) {
      return hashToSafeInteger(actor.email);
    }

    return null;
  }

  if (typeof actor === 'number' && Number.isFinite(actor)) {
    return actor;
  }

  const normalized = normalizeIdentityValue(actor);
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return hashToSafeInteger(normalized);
}

export function getActorIdentityKeys(actor) {
  if (actor === null || actor === undefined) {
    return [];
  }

  if (typeof actor !== 'object') {
    const raw = normalizeIdentityValue(actor);
    const businessId = getBusinessActorId(actor);
    return [...new Set([raw, businessId !== null ? String(businessId) : ''].filter(Boolean))];
  }

  const rawId = normalizeIdentityValue(actor.id);
  const authProfileId = normalizeIdentityValue(actor.authProfileId);
  const email = normalizeIdentityValue(actor.email).toLowerCase();
  const businessId = getBusinessActorId(actor);

  return [...new Set([
    rawId,
    authProfileId,
    email,
    businessId !== null ? String(businessId) : '',
  ].filter(Boolean))];
}

export function matchesActorIdentity(candidate, actor) {
  const candidateValue = normalizeIdentityValue(candidate).toLowerCase();
  if (!candidateValue) return false;

  return getActorIdentityKeys(actor).some((key) => key.toLowerCase() === candidateValue);
}
