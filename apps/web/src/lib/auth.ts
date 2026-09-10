import type { LoginResponse } from '@qqe/shared';

export interface Session {
  token: string;
  merchant: LoginResponse['merchant'];
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error('Invalid credentials');
  }
  const body = (await res.json()) as LoginResponse;
  return { token: body.accessToken, merchant: body.merchant };
}