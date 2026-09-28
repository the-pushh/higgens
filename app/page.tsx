const prefill = process.env.NEXT_PUBLIC_PREFILL_TEXT ?? "Hi Higgens";
const encoded = encodeURIComponent(prefill);

// Numbers copied from provider dashboards often carry invisible marks (e.g. U+200E).
const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");
const e164 = (v: string | undefined) => (digits(v) ? "+" + digits(v) : "");

// iMessage: Apple's de facto format is sms:+E164&body=...  A full link can override it
// (NEXT_PUBLIC_IMESSAGE_LINK) if the relay provider hands out its own.
const imessageHref =
  process.env.NEXT_PUBLIC_IMESSAGE_LINK ||
  `sms:${e164(process.env.NEXT_PUBLIC_IMESSAGE_NUMBER)}&body=${encoded}`;

const whatsappHref = `https://wa.me/${digits(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)}?text=${encoded}`;

export default function Home() {
  return (
    <main>
      <h1>Higgens</h1>
      <p>Your concierge, in your messages.</p>
      <hr />
      <ul>
        <li>
          <a href={imessageHref}>Add Higgens on iMessage</a>
        </li>
        <li>
          <a href={whatsappHref}>Add Higgens on WhatsApp</a>
        </li>
      </ul>
      <hr />
      <p>
        <small>Text Higgens anything. He&apos;ll take it from there.</small>
      </p>
    </main>
  );
}
