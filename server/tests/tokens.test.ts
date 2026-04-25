import { describe, it, expect, vi } from 'vitest';

// Must be set before tokens.ts is imported; vitest hoists static imports above
// process.env assignments, so we use vi.stubEnv + dynamic import instead.
vi.stubEnv('JWT_SECRET', 'test-secret-at-least-32-chars-long!!');

const { generateToken, verifyToken } = await import('../src/auth/tokens');

describe('tokens', () => {
  it('generates a verifiable token for a discord ID', () => {
    const token = generateToken('123456789');
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.discordId).toBe('123456789');
  });

  it('returns null for invalid token', () => {
    expect(verifyToken('not-a-token')).toBeNull();
  });

  it('returns null for tampered token', () => {
    const token = generateToken('123456789');
    expect(verifyToken(token + 'x')).toBeNull();
  });
});
