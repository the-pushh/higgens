// Lazy env access: nothing is read at import/build time, so `next build`
// and partial deployments (e.g. WhatsApp only) don't fail on missing keys.

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const opt = (name: string, fallback = ""): string => process.env[name] ?? fallback;

export const env = {
  openrouter: () => ({
    apiKey: req("OPENROUTER_API_KEY"),
    model: opt("OPENROUTER_MODEL", "z-ai/glm-5.3-flash"),
    siteUrl: opt("OPENROUTER_SITE_URL", "https://higgens.app"),
    appName: opt("OPENROUTER_APP_NAME", "Higgens"),
  }),
  whatsapp: () => ({
    phoneNumberId: req("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: req("WHATSAPP_ACCESS_TOKEN"),
    verifyToken: req("WHATSAPP_VERIFY_TOKEN"),
    appSecret: req("WHATSAPP_APP_SECRET"),
    apiVersion: opt("WHATSAPP_API_VERSION", "v25.0"),
  }),
  imessage: () => ({
    webhookSecret: req("IMESSAGE_WEBHOOK_SECRET"),
  }),
  sendblue: () => ({
    apiUrl: opt("SENDBLUE_API_URL", "https://api.sendblue.com/api/send-message"),
    keyId: req("SENDBLUE_API_KEY_ID"),
    secretKey: req("SENDBLUE_API_SECRET_KEY"),
    fromNumber: opt("SENDBLUE_FROM_NUMBER"),
  }),
  supabase: () => ({
    url: req("SUPABASE_URL"),
    serviceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
  }),
  dev: () => ({
    chatToken: opt("DEV_CHAT_TOKEN"),
  }),
};
