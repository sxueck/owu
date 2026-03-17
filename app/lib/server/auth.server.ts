import bcrypt from 'bcryptjs';
import { prisma } from './db.server';
import type { SessionData } from './session.server';

/**
 * Server-only authentication service.
 * Handles user verification and password management.
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  password: string; // hashed
}

/**
 * Verify user credentials for login
 */
export async function verifyUserCredentials(
  emailOrUsername: string,
  password: string
): Promise<Omit<AuthUser, 'password'> | null> {
  // Try to find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: emailOrUsername },
        { username: emailOrUsername },
      ],
    },
  });

  if (!user) {
    return null;
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

/**
 * Register a new user
 */
export async function registerUser(data: {
  email: string;
  username: string;
  password: string;
}): Promise<{ success: true; user: Omit<AuthUser, 'password'> } | { success: false; error: string }> {
  // Check if email already exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    return { success: false, error: 'Email already registered' };
  }

  // Check if username already exists
  const existingUsername = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (existingUsername) {
    return { success: false, error: 'Username already taken' };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      password: hashedPassword,
      role: 'user', // Default role
    },
  });

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  };
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<Omit<AuthUser, 'password'> | null> {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

/**
 * Convert AuthUser to SessionData
 */
export function toSessionData(user: Omit<AuthUser, 'password'>): SessionData {
  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

/**
 * Validate password strength
 * Returns null if valid, error message if invalid
 */
export function validatePassword(password: string): string | null {
  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  return null;
}

/**
 * Validate username
 */
export function validateUsername(username: string): string | null {
  if (username.length < 3) {
    return 'Username must be at least 3 characters';
  }
  if (username.length > 20) {
    return 'Username must be at most 20 characters';
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return 'Username can only contain letters, numbers, and underscores';
  }
  return null;
}
