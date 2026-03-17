/**
 * Server-only environment variables.
 * These are NEVER exposed to the browser.
 * 
 * IMPORTANT: Always import this module only in server contexts:
 * - Route loaders and actions
 * - Server-side utility functions
 * - Prisma seed scripts
 * 
 * Never import in:
 * - React components
 * - Client-side hooks
 * - Browser entry points
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),
  
  // Session
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
  
  // Application
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  APP_PORT: parseInt(process.env.APP_PORT ?? '3000', 10),
  APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
} as const;

/**
 * Server-only OpenAI configuration.
 * These should be read from SystemConfig table in database,
 * not from environment variables, to allow runtime configuration via admin panel.
 * 
 * Use `getSystemConfig()` from config.ts instead.
 */
