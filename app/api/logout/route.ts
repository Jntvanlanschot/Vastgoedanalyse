import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'auth-session';

export async function POST(request: NextRequest) {
  try {
    // Create response with redirect to login page
    const response = NextResponse.redirect(new URL('/login', request.url));
    
    // Clear the authentication cookie
    response.cookies.delete(COOKIE_NAME);
    
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Er is een fout opgetreden tijdens het uitloggen' },
      { status: 500 }
    );
  }
}
