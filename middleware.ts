import { NextRequest, NextResponse } from 'next/server';
import { authGuard } from './lib/auth/guard';

export async function middleware(request: NextRequest) {
  const result = await authGuard(request);

  // If user should be redirected, create redirect response
  if (result.shouldRedirect && result.redirectTo) {
    return NextResponse.redirect(new URL(result.redirectTo, request.url));
  }

  // Continue to the requested page
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
