import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'auth-session';

export async function POST(request: NextRequest) {
  try {
    // Create JSON response
    const response = NextResponse.json({ success: true, redirectTo: '/login' });
    
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
