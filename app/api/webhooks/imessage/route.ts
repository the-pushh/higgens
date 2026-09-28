import { getChannel } from "@/lib/channels";
import { handleInbound } from "@/lib/handleInbound";

export const maxDuration = 60;

export function POST(req: Request) {
  return handleInbound(req, getChannel("imessage"));
}
