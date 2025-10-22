import { NextRequest, NextResponse } from 'next/server';
import { validateCredentials } from '../../../lib/auth/guard';
import { signJWT } from '../../../lib/auth/jwt';

const COOKIE_NAME = 'auth-session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Gebruikersnaam en wachtwoord zijn verplicht' },
        { status: 400 }
      );
    }

    // Validate credentials
    if (!validateCredentials(username, password)) {
      return NextResponse.json(
        { error: 'Onjuiste gebruikersnaam of wachtwoord' },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = await signJWT({ sub: username });
    
    // Create JSON response
    const response = NextResponse.json({ success: true, redirectTo: '/' });
    
    // Set the authentication cookie
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Er is een fout opgetreden tijdens het inloggen' },
      { status: 500 }
    );
  }
}
