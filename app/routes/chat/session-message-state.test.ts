import test from "node:test";
import assert from "node:assert/strict";

import { reconcileOptimisticMessageId } from "./session-message-state";

test("reconcileOptimisticMessageId replaces optimistic ids with persisted ids", () => {
  const messages = [
    { id: "temp-1", role: "user", content: "hello" },
    { id: "assistant-1", role: "assistant", content: "hi" },
  ];

  assert.deepEqual(
    reconcileOptimisticMessageId(messages, "temp-1", "user-1"),
    [
      { id: "user-1", role: "user", content: "hello" },
      { id: "assistant-1", role: "assistant", content: "hi" },
    ],
  );
});

test("reconcileOptimisticMessageId drops the optimistic duplicate when persisted id already exists", () => {
  const messages = [
    { id: "temp-1", role: "user", content: "hello" },
    { id: "user-1", role: "user", content: "hello" },
  ];

  assert.deepEqual(
    reconcileOptimisticMessageId(messages, "temp-1", "user-1"),
    [{ id: "user-1", role: "user", content: "hello" }],
  );
});
