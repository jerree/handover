import { createClient } from "npm:@supabase/supabase-js@2";

// Public one-tap confirm endpoint (no login). Consumes a confirm token:
// - 'verify_email' -> mark channel verified, log a 'confirm_link' activity event.
// - 'checkin'      -> log activity, reset safety_settings to active (unless the
//   handover is already open), stamp escalation_log.responded_at.
// Always returns 200 with a gentle `state`; unknown and expired tokens are
// indistinguishable. Rate limited per IP.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_REQUESTS_PER_MINUTE = 30;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ state: "expired" });
    }

    let body: { token?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 200) {
      return json({ state: "expired" });
    }

    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 100);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: hits } = await admin.rpc("record_rate_hit", { p_key: `confirm:${ip}` });
    if (typeof hits === "number" && hits > MAX_REQUESTS_PER_MINUTE) {
      return json({ state: "expired" });
    }

    const tokenHash = await sha256Hex(token);

    const { data: row } = await admin
      .from("confirm_tokens")
      .select("id, business_id, kind, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!row || row.used_at !== null || new Date(row.expires_at) < new Date()) {
      return json({ state: "expired" });
    }

    // Single-use: claim the token first so a double tap cannot consume it twice.
    const { data: claimed, error: claimError } = await admin
      .from("confirm_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id)
      .filter("used_at", "is", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      return json({ state: "already_used" });
    }

    await admin.from("activity_events").insert({
      business_id: row.business_id,
      kind: "confirm_link",
    });

    if (row.kind === "verify_email") {
      await admin
        .from("notification_channels")
        .update({ verified: true })
        .eq("business_id", row.business_id)
        .eq("type", "email");
      return json({ state: "verified" });
    }

    // kind === 'checkin'
    const { data: settings } = await admin
      .from("safety_settings")
      .select("status")
      .eq("business_id", row.business_id)
      .maybeSingle();

    if (settings?.status === "handover_triggered") {
      return json({ state: "handover_open" });
    }

    const now = new Date().toISOString();
    const { data: updated } = await admin
      .from("safety_settings")
      .update({ status: "active", reminders_sent: 0, last_activity_at: now })
      .eq("business_id", row.business_id)
      .in("status", ["reminding", "active"])
      .select("quiet_days")
      .maybeSingle();

    await admin
      .from("escalation_log")
      .update({ responded_at: now })
      .eq("business_id", row.business_id)
      .like("step", "reminder%")
      .is("responded_at", null);

    const quietDays =
      updated && typeof (updated as { quiet_days?: unknown }).quiet_days === "number"
        ? (updated as { quiet_days: number }).quiet_days
        : null;
    return json({ state: "checked_in", quiet_days: quietDays });
  } catch (err) {
    console.error("confirm-checkin error:", err instanceof Error ? err.name : "unknown");
    return json({ state: "expired" });
  }
});
