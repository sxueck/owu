export function reconcileOptimisticMessageId<T extends { id: string }>(
  messages: T[],
  optimisticId: string | null,
  persistedId: string | undefined,
): T[] {
  if (!optimisticId || !persistedId || optimisticId === persistedId) {
    return messages;
  }

  const persistedExists = messages.some((message) => message.id === persistedId);

  return messages.flatMap((message) => {
    if (message.id !== optimisticId) {
      return [message];
    }

    if (persistedExists) {
      return [];
    }

    return [{ ...message, id: persistedId }];
  });
}
