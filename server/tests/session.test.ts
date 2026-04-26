import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Must be set before session.ts is imported; vitest hoists static imports above
// process.env assignments, so we use vi.stubEnv + dynamic import instead.
// DATABASE_URL is required by db/client.ts at module load time.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');
vi.stubEnv('SESSION_SECRET', 'test-secret-at-least-32-chars-long!!');

// Dynamic import because requireAuth depends on session module
const { requireAuth } = await import('../src/middleware/session');

describe('requireAuth', () => {
  it('redirects unauthenticated requests to Discord OAuth', () => {
    const req = { session: {} } as unknown as Request;
    const res = { redirect: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/auth/discord?dashboard=1');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for authenticated requests', () => {
    const req = { session: { userId: 42 } } as unknown as Request;
    const res = { redirect: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
