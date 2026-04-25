import jwt from 'jsonwebtoken';

const secret = process.env['JWT_SECRET'];
if (!secret) throw new Error('JWT_SECRET environment variable is required');

interface TokenPayload {
  discordId: string;
}

export function generateToken(discordId: string): string {
  return jwt.sign({ discordId }, secret!, { expiresIn: '10y' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, secret!) as TokenPayload;
  } catch {
    return null;
  }
}
