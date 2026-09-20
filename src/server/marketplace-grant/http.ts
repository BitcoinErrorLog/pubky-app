import { NextResponse } from 'next/server';
import { mapBffError } from './bff';

export function noStoreJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, private');
  return response;
}

export function grantError(error: unknown): NextResponse {
  const mapped = mapBffError(error);
  return noStoreJson({ error: mapped.code }, mapped.status);
}

export const grantCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: true,
  path: '/',
};
