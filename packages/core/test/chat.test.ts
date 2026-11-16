import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { chatMessages, chats, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getChat, persistChat } from "../src/platform/chat.js";
import { resolveChatJurisdiction, toolsFor } from "@workspace/registry";

const userId = `test-user-${randomUUID()}`;
let tenantId: string;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Chat Test Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Chat User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
});

afterAll(async () => {
  await db.delete(chats).where(eq(chats.userId, userId)); // cascades chat_messages
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("persistChat", () => {
  test("persists AU state context through follow-up and reload despite a US account default", async () => {
    const id = await persistChat(
      userId,
      { message: "Review the fictional NSW matter", finalText: "Draft briefing", toolCalls: [] },
      undefined,
      undefined,
      "AU-NSW"
    );
    const reloaded = await getChat(userId, id);
    expect(reloaded?.jurisdiction).toBe("AU-NSW");
    const jurisdiction = resolveChatJurisdiction({
      conversation: reloaded?.jurisdiction,
      user: "US",
    });
    expect(jurisdiction).toBe("AU-NSW");
    expect(toolsFor(jurisdiction).some((tool) => tool.name === "search_case_law")).toBe(false);
    await persistChat(
      userId,
      { message: "Draft the update", finalText: "Draft update", toolCalls: [] },
      id
    );
    expect((await getChat(userId, id))?.jurisdiction).toBe("AU-NSW");
    await persistChat(
      userId,
      {
        message: "Now consider Victoria explicitly",
        finalText: "Victorian context",
        toolCalls: [],
      },
      id,
      undefined,
      "AU-VIC"
    );
    expect((await getChat(userId, id))?.jurisdiction).toBe("AU-VIC");
  });

  test("does not append to a conversation owned by another account", async () => {
    const id = await persistChat(userId, {
      message: "Private fixture",
      finalText: "Private answer",
      toolCalls: [],
    });
    await expect(
      persistChat(
        `not-the-owner-${randomUUID()}`,
        { message: "Injected", finalText: "Injected", toolCalls: [] },
        id
      )
    ).rejects.toThrow("Conversation not found");
    expect((await getChat(userId, id))?.turns).toHaveLength(2);
  });

  test("serialises concurrent follow-ups in the same conversation", async () => {
    const id = await persistChat(userId, { message: "Start", finalText: "Ready", toolCalls: [] });
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        persistChat(
          userId,
          { message: `Follow-up ${index}`, finalText: "Answer", toolCalls: [] },
          id
        )
      )
    );
    const detail = await getChat(userId, id);
    expect(detail?.turns).toHaveLength(12);
  });
  test("writes a turn atomically: user + assistant messages at seq 1,2", async () => {
    const id = await persistChat(userId, {
      message: "hello",
      finalText: "hi there",
      toolCalls: [],
    });
    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, id))
      .orderBy(chatMessages.seq);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("user");
    expect(msgs[0]!.seq).toBe(1);
    expect(msgs[1]!.role).toBe("assistant");
    expect(msgs[1]!.seq).toBe(2);
  });

  test("appends to an existing chat with monotonic seq", async () => {
    const id = await persistChat(userId, { message: "first", finalText: "a", toolCalls: [] });
    await persistChat(userId, { message: "second", finalText: "b", toolCalls: [] }, id);
    const seqs = await db
      .select({ seq: chatMessages.seq })
      .from(chatMessages)
      .where(eq(chatMessages.chatId, id))
      .orderBy(chatMessages.seq);
    expect(seqs.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
  });

  // Stress: fire more concurrent turns than the pool's `max` (20). If the pool
  // exhausted or deadlocked, these would reject ("too many clients") or hang;
  // instead postgres.js queues the overflow, so all must resolve. Each is a new
  // chat, so there are no seq collisions to mask a pool problem.
  test("handles concurrent turns beyond pool max without exhaustion", async () => {
    const N = 30; // > max (20) → forces the pool to queue
    const ids = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        persistChat(userId, { message: `q${i}`, finalText: `a${i}`, toolCalls: [] })
      )
    );
    expect(new Set(ids).size).toBe(N); // every call created a distinct chat
    const perChat = await Promise.all(
      ids.map((id) => db.select().from(chatMessages).where(eq(chatMessages.chatId, id)))
    );
    expect(perChat.every((m) => m.length === 2)).toBe(true);
  });
});
