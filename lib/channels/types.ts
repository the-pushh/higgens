export type ChannelName = "imessage" | "whatsapp";

export interface InboundMessage {
  channel: ChannelName;
  /** E.164 with leading "+", same format on every channel. */
  from: string;
  text: string;
  /** Provider message id, used for dedupe. */
  id: string;
  raw: unknown;
}

export type ParseResult =
  | InboundMessage[] // zero or more text messages
  | { verifyChallenge: string } // Meta GET handshake
  | null; // unauthorized

export interface Channel {
  name: ChannelName;
  parseInbound(req: Request): Promise<ParseResult>;
  send(to: string, text: string): Promise<void>;
  /**
   * Optional: mark the inbound message as read and show a typing bubble while
   * the concierge thinks. Best effort; failures are logged, never fatal.
   */
  acknowledge?(msg: InboundMessage): Promise<void>;
}
