const singleToken = (value) => {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.includes(',') || /\s/.test(token)) return null;
  return token;
};

export function parseBearerToken(value) {
  if (typeof value !== 'string' || value.includes(',')) return null;
  const match = /^Bearer ([^\s,]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export const parseAppCheckToken = (value) => singleToken(value);
