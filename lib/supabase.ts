import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Server-only client using the service-role key. Never import from client components. */
export function supabase(): SupabaseClient {
  if (!client) {
    const { url, serviceRoleKey } = env.supabase();
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
