import { NextRequest } from 'next/server';
import { verifyAuthCookieFromRequest, JWTPayload } from './cookies';

export interface AuthGuardResult {
  isAuthenticated: boolean;
  payload: JWTPayload | null;
  shouldRedirect: boolean;
  redirectTo: string | null;
}

export async function authGuard(request: NextRequest): Promise<AuthGuardResult> {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/api/login',
    '/api/logout',
    '/nearest-buurten-nl',
    '/api/address',
    '/api/run-scraper',
    '/api/streets-overpass',
  ];
  
  // Check if current path is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith('/_next/') || pathname.startsWith('/public/')
  );
  
  // If it's a public route, no authentication needed
  if (isPublicRoute) {
    return {
      isAuthenticated: false,
      payload: null,
      shouldRedirect: false,
      redirectTo: null,
    };
  }
  
  // Verify authentication for protected routes
  const payload = await verifyAuthCookieFromRequest(request);
  
  if (!payload) {
    // Not authenticated, redirect to login
    return {
      isAuthenticated: false,
      payload: null,
      shouldRedirect: true,
      redirectTo: '/login',
    };
  }
  
  // Check if user is trying to access login page while authenticated
  if (pathname === '/login') {
    return {
      isAuthenticated: true,
      payload,
      shouldRedirect: true,
      redirectTo: '/landing',
    };
  }
  
  // Authenticated and accessing protected route
  return {
    isAuthenticated: true,
    payload,
    shouldRedirect: false,
    redirectTo: null,
  };
}

export function validateCredentials(username: string, password: string): boolean {
  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;
  
  if (!validUsername || !validPassword) {
    console.error('AUTH_USERNAME or AUTH_PASSWORD not set in environment variables');
    return false;
  }
  
  return username === validUsername && password === validPassword;
}
