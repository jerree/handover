import { createClient } from "npm:@supabase/supabase-js@2";

// Owner-triggered test emails only: nothing is sent automatically in this step.
// - 'verify'  -> "Confirm your email for Handover" with a 24h confirm link.
// - 'reminder_test' -> "Are you okay? (test reminder)" with a 7-day check-in link.
// Reads RESEND_API_KEY and APP_BASE_URL from Supabase secrets. The recipient is
// always the address stored in notification_channels — never a request body value.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SENDS_PER_HOUR = 5;

interface ConfirmKind {
  kind: "verify_email" | "checkin";
  ttlHours: number;
  subject: string;
  bodyHtml: (link: string) => string;
}

function buildMessage(purpose: "verify" | "reminder_test"): ConfirmKind {
  if (purpose === "verify") {
    return {
      kind: "verify_email",
      ttlHours: 24,
      subject: "Confirm your email for Handover",
      bodyHtml: (link) => `
        <p>Hello,</p>
        <p>Please confirm this email address so Handover can reach you here if you ever stop signing in.</p>
        <p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#c2540a;color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;border-radius:12px;">Confirm this email</a></p>
        <p>This link works for 24 hours. If you did not ask for this, you can ignore it.</p>
        <p style="color:#6b7280;font-size:14px;">This is a test message — nothing is scheduled yet.</p>`,
    };
  }
  return {
    kind: "checkin",
    ttlHours: 24 * 7,
    subject: "Are you okay? (test reminder)",
    bodyHtml: (link) => `
      <p>Hello,</p>
      <p>We haven't seen you on Handover for a few days. Are you okay?</p>
      <p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#c2540a;color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;border-radius:12px;">I'm okay</a></p>
      <p>This link works for 7 days.</p>
      <p style="color:#b45309;font-size:16px;font-weight:bold;">This is a test.</p>`,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    let body: { channel?: unknown; purpose?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const channel = body.channel === "telegram" ? "telegram" : "email";
    const purpose = body.purpose === "reminder_test" ? "reminder_test" : "verify";

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

    const { data: hits } = await admin.rpc("record_rate_hit", { p_key: `sendmsg:${biz.id}` });
    if (typeof hits === "number" && hits > SENDS_PER_HOUR) {
      return json({
        error: "You've sent several messages in the last hour. Please try again later.",
      });
    }

    const { data: channelRow } = await admin
      .from("notification_channels")
      .select("address, verified")
      .eq("business_id", biz.id)
      .eq("type", channel)
      .maybeSingle();
    if (channel === "telegram") {
      if (purpose !== "reminder_test") {
        return json({ error: "Telegram does not need email confirmation." });
      }
      if (!channelRow || !channelRow.verified) {
        return json({ error: "Connect Telegram first on the Safety page." });
      }
      // Test reminder via Telegram: 7-day checkin token, one inline button.
      const rawToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(36))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 7 * 60 * 60 * 1000).toISOString();

      const { error: tokenError } = await admin.from("confirm_tokens").insert({
        business_id: biz.id,
        token_hash: tokenHash,
        kind: "checkin",
        channel: "telegram",
        expires_at: expiresAt,
      });
      if (tokenError) {
        console.error("Token insert failed");
        return json({ error: "Could not create the link. Please try again." }, 500);
      }

      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (!botToken) {
        return json({ error: "Telegram is not configured yet. Please try again later." }, 500);
      }

      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelRow.address,
          text: "Are you okay? (test reminder). We haven't seen you on Handover for a few days.",
          reply_markup: {
            inline_keyboard: [[{ text: "I'm okay", callback_data: `ok:${rawToken}` }]],
          },
        }),
      });
      if (!tgResponse.ok) {
        console.error("Telegram send failed with status", tgResponse.status);
        return json({ error: "The Telegram message could not be sent. Please try again later." }, 502);
      }
      return json({ sent: true });
    }

    if (!channelRow || typeof channelRow.address !== "string" || !channelRow.address.includes("@")) {
      return json({ error: "Save your email on the Safety page first." });
    }

    if (purpose === "reminder_test" && !channelRow.verified) {
      return json({ error: "Please confirm your email first — reminders only go to a confirmed address." });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const baseUrl = Deno.env.get("APP_BASE_URL")?.replace(/\/+$/, "");
    if (!apiKey || !baseUrl) {
      return json({ error: "Missing RESEND_API_KEY or APP_BASE_URL secret" }, 500);
    }

    // Token: 48 url-safe chars from the platform CSPRNG. Only the hash is stored.
    const rawToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(36))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const tokenHash = await sha256Hex(rawToken);
    const message = buildMessage(purpose);
    const expiresAt = new Date(Date.now() + message.ttlHours * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await admin.from("confirm_tokens").insert({
      business_id: biz.id,
      token_hash: tokenHash,
      kind: message.kind,
      channel: "email",
      expires_at: expiresAt,
    });
    if (tokenError) {
      console.error("Token insert failed");
      return json({ error: "Could not create the link. Please try again." }, 500);
    }

    const link = `${baseUrl}/c/${rawToken}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Handover <onboarding@resend.dev>",
        to: [channelRow.address],
        subject: message.subject,
        html: message.bodyHtml(link),
      }),
    });

    if (!resendResponse.ok) {
      const status = resendResponse.status;
      console.error("Email send failed with status", status);
      if (status === 403 || status === 422) {
        return json({
          error:
            "Resend only delivers to your own account email until a domain is verified. Sign up at resend.com with this address, then try again.",
        });
      }
      return json({ error: "The email could not be sent. Please try again later." }, 502);
    }

    return json({ sent: true });
  } catch (err) {
    console.error("send-test-message error:", err instanceof Error ? err.name : "unknown");
    return json({ error: "Unexpected error" }, 500);
  }
});
