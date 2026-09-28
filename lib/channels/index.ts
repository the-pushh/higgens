import type { Channel, ChannelName } from "@/lib/channels/types";
import { whatsapp } from "@/lib/channels/whatsapp";
import { sendblue } from "@/lib/channels/sendblue";

export function getChannel(name: ChannelName): Channel {
  switch (name) {
    case "whatsapp":
      return whatsapp;
    case "imessage":
      return sendblue; // the only iMessage relay wired up for now
  }
}
