import { db } from "@workspace/db/client";
import { chatMessages, chats } from "@workspace/db/schema";

/** Persist a single-turn conversation (append-only). Returns the chat id. */
export async function persistChat(
  userId: string,
  turn: { message: string; finalText: string; toolCalls: Array<{ tool: string; input: unknown }> }
): Promise<string> {
  const [chat] = await db
    .insert(chats)
    .values({ userId, title: turn.message.slice(0, 60) })
    .returning();
  await db.insert(chatMessages).values([
    {
      chatId: chat!.id,
      seq: 1,
      actorType: "user",
      actorId: userId,
      role: "user",
      content: { text: turn.message },
    },
    {
      chatId: chat!.id,
      seq: 2,
      actorType: "agent",
      role: "assistant",
      content: { text: turn.finalText, toolCalls: turn.toolCalls },
    },
  ]);
  return chat!.id;
}
