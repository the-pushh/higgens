// Prints the X-Hub-Signature-256 header value for a payload file.
//   node --env-file=.env.local scripts/sign-whatsapp.mjs scripts/samples/whatsapp-text.json
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const file = process.argv[2];
const secret = process.env.WHATSAPP_APP_SECRET;
if (!file || !secret) {
  console.error("usage: WHATSAPP_APP_SECRET=... node scripts/sign-whatsapp.mjs <payload.json>");
  process.exit(1);
}
const body = readFileSync(file);
console.log("sha256=" + createHmac("sha256", secret).update(body).digest("hex"));
