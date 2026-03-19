import { prisma } from './db.server';

export type MemorySource = 'manual' | 'ai_summary';

export interface UserMemory {
  id: string;
  userId: string;
  content: string;
  source: MemorySource;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemoryInput {
  content: string;
  source?: MemorySource;
}

export interface UpdateMemoryInput {
  content: string;
}

/**
 * Map Prisma memory record to UserMemory interface.
 */
function mapToUserMemory(memory: {
  id: string;
  userId: string;
  content: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}): UserMemory {
  return {
    id: memory.id,
    userId: memory.userId,
    content: memory.content,
    source: (memory.source as MemorySource) ?? 'manual',
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

/**
 * Get all memories for a user, ordered by creation date (newest first).
 */
export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  const memories = await prisma.userMemory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return memories.map(mapToUserMemory);
}

/**
 * Get a single memory by ID, verifying ownership.
 * Returns null if not found or not owned by the user.
 */
export async function getMemoryById(
  memoryId: string,
  userId: string
): Promise<UserMemory | null> {
  const memory = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId },
  });

  if (!memory) {
    return null;
  }

  return mapToUserMemory(memory);
}

/**
 * Create a new memory for a user.
 * Defaults to 'manual' source if not specified.
 */
export async function createUserMemory(
  userId: string,
  input: CreateMemoryInput
): Promise<UserMemory> {
  const memory = await prisma.userMemory.create({
    data: {
      userId,
      content: input.content.trim(),
      source: input.source ?? 'manual',
    },
  });

  return mapToUserMemory(memory);
}

/**
 * Update an existing memory, verifying ownership.
 * Returns the updated memory or null if not found/not owned.
 */
export async function updateUserMemory(
  memoryId: string,
  userId: string,
  input: UpdateMemoryInput
): Promise<UserMemory | null> {
  const content = input.content.trim();

  return prisma.$transaction(async (tx) => {
    const updatedCount = await tx.$executeRaw`
      UPDATE user_memories
      SET content = ${content}, updated_at = NOW()
      WHERE id = ${memoryId} AND user_id = ${userId}
    `;

    if (updatedCount === 0) {
      return null;
    }

    const memory = await tx.userMemory.findFirst({
      where: { id: memoryId, userId },
    });

    return memory ? mapToUserMemory(memory) : null;
  });
}

/**
 * Delete a memory, verifying ownership.
 * Returns true if deleted, false if not found/not owned.
 */
export async function deleteUserMemory(
  memoryId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.userMemory.deleteMany({
    where: { id: memoryId, userId },
  });

  return result.count > 0;
}

/**
 * Get multiple memories by IDs, verifying they belong to the user.
 * Returns only the memories that exist and are owned by the user.
 */
export async function getMemoriesByIds(
  memoryIds: string[],
  userId: string
): Promise<UserMemory[]> {
  if (memoryIds.length === 0) {
    return [];
  }

  const memories = await prisma.userMemory.findMany({
    where: {
      id: { in: memoryIds },
      userId,
    },
  });

  return memories.map(mapToUserMemory);
}
