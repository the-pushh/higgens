import type { ModelMessage } from "ai";
import { supabase } from "@/lib/supabase";
import type { ChannelName, InboundMessage } from "@/lib/channels/types";

const HISTORY_LIMIT = 20;

/**
 * Store an inbound message. Returns false when the provider message id was
 * already recorded (webhook retry), so the caller can skip replying twice.
 */
export async function recordInbound(msg: InboundMessage): Promise<boolean> {
  const { error, data } = await supabase()
    .from("messages")
    .upsert(
      {
        channel: msg.channel,
        user_id: msg.from,
        role: "user",
        content: msg.text,
        provider_message_id: msg.id,
      },
      { onConflict: "channel,provider_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`recordInbound: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function recordOutbound(channel: ChannelName, userId: string, content: string): Promise<void> {
  const { error } = await supabase()
    .from("messages")
    .insert({ channel, user_id: userId, role: "assistant", content });
  if (error) throw new Error(`recordOutbound: ${error.message}`);
}

/** Last N turns for this user on this channel, oldest first. */
export async function getHistory(
  channel: ChannelName,
  userId: string,
  limit = HISTORY_LIMIT,
): Promise<ModelMessage[]> {
  const { data, error } = await supabase()
    .from("messages")
    .select("role, content")
    .eq("channel", channel)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getHistory: ${error.message}`);
  return (data ?? [])
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string }));
}
