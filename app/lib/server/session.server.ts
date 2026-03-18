import type { Session } from 'react-router';

/**
 * Server-only session management.
 * Uses React Router's session storage for cookie-based sessions.
 */

// Session data interface
export interface SessionData {
  userId: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
}

// Session flash data (for one-time messages)
export interface SessionFlashData {
  error?: string;
  success?: string;
}

/**
 * Create a new session with user data
 */
export function createUserSession(session: Session, user: SessionData): Session {
  session.set('userId', user.userId);
  session.set('email', user.email);
  session.set('username', user.username);
  session.set('role', user.role);
  return session;
}

/**
 * Get current user from session
 * Returns null if not logged in
 */
export function getCurrentUser(session: Session): SessionData | null {
  const userId = session.get('userId');
  if (!userId) return null;
  
  return {
    userId,
    email: session.get('email'),
    username: session.get('username'),
    role: session.get('role'),
  };
}

/**
 * Require authenticated user, redirect to login if not authenticated
 */
export function requireUser(session: Session, redirectTo: string = '/login'): SessionData {
  const user = getCurrentUser(session);
  if (!user) {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: redirectTo,
      },
    });
  }
  return user;
}

/**
 * Require admin role, redirect if not admin
 */
export function requireAdmin(session: Session, redirectTo: string = '/chat'): SessionData {
  const user = requireUser(session);
  if (user.role !== 'admin') {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: redirectTo,
      },
    });
  }
  return user;
}

/**
 * Destroy session (logout)
 */
export function destroySession(session: Session): Session {
  session.unset('userId');
  session.unset('email');
  session.unset('username');
  session.unset('role');
  return session;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(session: Session): boolean {
  return !!session.get('userId');
}

/**
 * Check if user is admin
 */
export function isAdmin(session: Session): boolean {
  const role = session.get('role');
  return role === 'admin';
}
