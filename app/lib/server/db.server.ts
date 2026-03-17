import { PrismaClient } from '@prisma/client';

// Global type declaration for development hot reload
declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

// Prevent multiple instances during development hot reload
const prisma = globalThis.__db__ ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db__ = prisma;
}

export { prisma };
