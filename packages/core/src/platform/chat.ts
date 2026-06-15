import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { chatMessages, chats, user } from "@workspace/db/schema";
import type { Citation } from "../ai/citations.js";

async function userTenant(userId: string): Promise<string> {
  const [u] = await db.select({ tenantId: user.tenantId }).from(user).where(eq(user.id, userId));
  if (!u?.tenantId) throw new Error("User has no tenant");
  return u.tenantId;
}

type TurnContent = { text: string; toolCalls?: Array<{ tool: string; input: unknown }> };

/**
 * Append one user→assistant turn to a conversation (append-only). Creates the
 * chat when `chatId` is omitted (first turn), titling it from the message; on
 * later turns it appends with the next sequence number. Returns the chat id so
 * the caller threads subsequent turns into the same conversation.
 */
export async function persistChat(
  userId: string,
  turn: {
    message: string;
    finalText: string;
    toolCalls: Array<{ tool: string; input: unknown }>;
    citations?: Citation[];
  },
  chatId?: string,
  matterId?: string
): Promise<string> {
  let id = chatId;
  if (!id) {
    const [chat] = await db
      .insert(chats)
      .values({
        userId,
        tenantId: await userTenant(userId),
        matterId: matterId ?? null,
        title: turn.message.slice(0, 60),
      })
      .returning();
    id = chat!.id;
  }

  // Next sequence number after whatever's already in this chat.
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${chatMessages.seq}), 0)` })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, id));
  const base = Number(row?.max ?? 0);

  await db.insert(chatMessages).values([
    {
      chatId: id,
      seq: base + 1,
      actorType: "user",
      actorId: userId,
      role: "user",
      content: { text: turn.message },
    },
    {
      chatId: id,
      seq: base + 2,
      actorType: "agent",
      role: "assistant",
      content: { text: turn.finalText, toolCalls: turn.toolCalls },
      annotations: turn.citations?.length ? { citations: turn.citations } : null,
    },
  ]);
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, id));
  return id;
}

/**
 * List a user's conversations, most recently updated first. Scope splits global
 * chats from matter-scoped ones: pass a `matterId` for that matter's chats; omit
 * it for the global assistant (chats with no matter), so the two never bleed.
 */
export async function listChats(
  userId: string,
  matterId?: string
): Promise<Array<{ id: string; title: string | null; updatedAt: Date }>> {
  return db
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .where(
      and(
        eq(chats.userId, userId),
        matterId ? eq(chats.matterId, matterId) : isNull(chats.matterId)
      )
    )
    .orderBy(desc(chats.updatedAt))
    .limit(100);
}

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ tool: string; input: unknown }>;
  citations?: Citation[];
};

/** Load one conversation (ordered turns) — scoped to its owner. */
export async function getChat(
  userId: string,
  chatId: string
): Promise<{
  id: string;
  title: string | null;
  matterId: string | null;
  turns: ChatTurn[];
} | null> {
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  if (!chat) return null;

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(chatMessages.seq);

  const turns = rows.map((m) => {
    const content = m.content as TurnContent;
    const annotations = m.annotations as { citations?: Citation[] } | null;
    return {
      role: m.role,
      text: content.text,
      toolCalls: content.toolCalls,
      citations: annotations?.citations,
    };
  });
  return { id: chat.id, title: chat.title, matterId: chat.matterId, turns };
}
