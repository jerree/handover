import { createClient } from "npm:@supabase/supabase-js@2";

// Public Telegram webhook (verify_jwt off). Every request must carry
// X-Telegram-Bot-Api-Secret-Token matching TELEGRAM_WEBHOOK_SECRET.
// Handles exactly two things:
// - "/start <code>"  -> validates a link code, stores the chat id as a verified
//   'telegram' notification channel, replies "Connected!".
// - callback_query "ok:<token>" -> same as confirm-checkin for a checkin:
//   activity 'telegram_confirm', status active, reminders_sent 0, escalation
//   responded_at, token consumed; edits the message to "Thanks, you're all set."
// Everything else is ignored. No message text or user data is stored.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const HANDLED_PER_MINUTE = 60;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendTelegramMessage(chatId: string | number, text: string, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}

async function answerCallback(callbackQueryId: string, token: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => {});
}

async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  token: string
) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!secret || !botToken) {
      return ok();
    }

    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
      return new Response("Forbidden", { status: 403 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: hits } = await admin.rpc("record_rate_hit", { p_key: "tgwebhook:global" });
    if (typeof hits === "number" && hits > HANDLED_PER_MINUTE) {
      return ok();
    }

    const update = (await req.json()) as {
      message?: { chat?: { id?: string | number }; text?: string };
      callback_query?: {
        id?: string;
        data?: string;
        message?: { chat?: { id?: string | number }; message_id?: number };
      };
    };

    // --- callback_query: "ok:<token>" check-in confirm -------------------
    if (update.callback_query?.data && update.callback_query.message?.chat?.id) {
      const cb = update.callback_query;
      if (cb.id) void answerCallback(cb.id, botToken);

      if (!cb.data.startsWith("ok:")) return ok();
      const rawToken = cb.data.slice(3).trim();
      if (!rawToken || rawToken.length > 200) return ok();

      const chatId = String(cb.message.chat.id);
      const tokenHash = await sha256Hex(rawToken);

      const { data: row } = await admin
        .from("confirm_tokens")
        .select("id, business_id, kind, expires_at, used_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!row || row.kind !== "checkin") return ok();

      const { data: channel } = await admin
        .from("notification_channels")
        .select("address, verified")
        .eq("business_id", row.business_id)
        .eq("type", "telegram")
        .maybeSingle();
      if (!channel || !channel.verified || String(channel.address) !== chatId) return ok();

      const alreadyUsed = row.used_at !== null || new Date(row.expires_at) < new Date();
      if (alreadyUsed) {
        void editTelegramMessage(chatId, cb.message.message_id!, "Already confirmed.", botToken);
        return ok();
      }

      const { data: claimed, error: claimError } = await admin
        .from("confirm_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .filter("used_at", "is", null)
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) {
        void editTelegramMessage(chatId, cb.message.message_id!, "Already confirmed.", botToken);
        return ok();
      }

      await admin.from("activity_events").insert({
        business_id: row.business_id,
        kind: "telegram_confirm",
      });

      const { data: settings } = await admin
        .from("safety_settings")
        .select("status")
        .eq("business_id", row.business_id)
        .maybeSingle();

      if (settings?.status !== "handover_triggered") {
        const now = new Date().toISOString();
        await admin
          .from("safety_settings")
          .update({ status: "active", reminders_sent: 0, last_activity_at: now })
          .eq("business_id", row.business_id)
          .in("status", ["reminding", "active"]);

        await admin
          .from("escalation_log")
          .update({ responded_at: now })
          .eq("business_id", row.business_id)
          .like("step", "reminder%")
          .is("responded_at", null);
      }

      void editTelegramMessage(chatId, cb.message.message_id!, "Thanks, you're all set.", botToken);
      return ok();
    }

    // --- message: "/start <code>" linking --------------------------------
    const msgText = update.message?.text?.trim();
    const chatId = update.message?.chat?.id;
    if (!msgText || !chatId || !msgText.startsWith("/start")) return ok();

    const parts = msgText.split(/\s+/);
    const rawCode = parts[1] ?? "";

    if (!rawCode) {
      void sendTelegramMessage(chatId, "Please use the Connect Telegram button inside Handover.", botToken);
      return ok();
    }

    // Single-use claim: only the first /start wins. Expired or already-used
    // codes fail the claim and get the same gentle reply.
    const { data: claimedCode, error: claimError } = await admin
      .from("telegram_link_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", await sha256Hex(rawCode))
      .filter("used_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .select("business_id")
      .maybeSingle();
    if (claimError || !claimedCode) {
      void sendTelegramMessage(chatId, "Please use the Connect Telegram button inside Handover.", botToken);
      return ok();
    }

    const businessId = claimedCode.business_id;

    const { data: biz } = await admin
      .from("businesses")
      .select("name")
      .eq("id", businessId)
      .maybeSingle();

    await admin.from("notification_channels").upsert(
      {
        business_id: businessId,
        type: "telegram",
        address: String(chatId),
        verified: true,
        enabled: true,
      },
      { onConflict: "business_id,type" }
    );

    void sendTelegramMessage(
      chatId,
      `Connected! You'll get safety reminders for ${biz?.name ?? "your business"} here.`,
      botToken
    );
    return ok();
  } catch (err) {
    console.error("telegram-webhook error:", err instanceof Error ? err.name : "unknown");
    return ok();
  }
});
