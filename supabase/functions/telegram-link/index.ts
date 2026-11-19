import { createClient } from "npm:@supabase/supabase-js@2";

// Owner-only: creates a single-use Telegram link code (8 chars, 15 min TTL)
// and returns it with the bot deep link. Only the SHA-256 hash is stored.
// Rate limited: 5 codes per business per hour.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CODES_PER_HOUR = 5;
const CODE_TTL_MINUTES = 15;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 lookalikes

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "");
    if (!botUsername) {
      return json({ error: "Telegram is not configured yet. Please try again later." }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: biz, error: bizError } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (bizError || !biz) {
      return json({ error: "Business not found" }, 404);
    }

    const { data: hits } = await admin.rpc("record_rate_hit", { p_key: `tglink:${biz.id}` });
    if (typeof hits === "number" && hits > CODES_PER_HOUR) {
      return json({ error: "Too many codes requested. Please try again in an hour." });
    }

    const rawCode = generateCode();
    const codeHash = await sha256Hex(rawCode);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("telegram_link_codes").insert({
      business_id: biz.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insertError) {
      console.error("Link code insert failed");
      return json({ error: "Could not create the code. Please try again." }, 500);
    }

    return json({
      code: rawCode,
      deepLink: `https://t.me/${botUsername}?start=${rawCode}`,
      expiresAt,
    });
  } catch (err) {
    console.error("telegram-link error:", err instanceof Error ? err.name : "unknown");
    return json({ error: "Unexpected error" }, 500);
  }
});
