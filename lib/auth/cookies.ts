import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { signJWT, verifyJWT, JWTPayload } from './jwt';

const COOKIE_NAME = 'auth-session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export async function setAuthCookie(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  const token = await signJWT(payload);
  
  // Set cookie in server action context
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  
  return token;
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthCookie(): Promise<string | null> {
  const cookieStore = cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

export async function verifyAuthCookie(): Promise<JWTPayload | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  
  return await verifyJWT(token);
}

// For middleware usage
export function getAuthCookieFromRequest(request: NextRequest): string | null {
  return request.cookies.get(COOKIE_NAME)?.value || null;
}

export async function verifyAuthCookieFromRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = getAuthCookieFromRequest(request);
  if (!token) return null;
  
  return await verifyJWT(token);
}

export function createAuthResponse(token: string, redirectTo?: string): NextResponse {
  const response = redirectTo 
    ? NextResponse.redirect(new URL(redirectTo, process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
    : NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}

export function createLogoutResponse(redirectTo?: string): NextResponse {
  const response = redirectTo 
    ? NextResponse.redirect(new URL(redirectTo, process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
    : NextResponse.json({ success: true });

  response.cookies.delete(COOKIE_NAME);
  return response;
}
