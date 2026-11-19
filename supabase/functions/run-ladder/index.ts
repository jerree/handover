import { createClient } from "npm:@supabase/supabase-js@2";

// Step 7A+7B: the safety ladder.
//
// Two modes:
// - Scheduled: header X-Cron-Secret must equal the CRON_SECRET secret -> 401 otherwise.
//   Processes up to 200 businesses per run and stamps ladder_runs (heartbeat).
// - Manual: owner's Authorization bearer token -> processes only their own business
//   (used by the "Run check now" test button on /safety). Does not stamp the heartbeat.
//
// Stages:
// 1. Reminders: "Are you okay?" on every verified + enabled channel, with a fresh
//    confirm_tokens row (kind 'checkin', 14-day expiry, hashed) per send. Idempotent
//    via conditional updates on reminders_sent.
// 2. Handover: when all reminders are sent and the final wait expires, status flips
//    to 'handover_triggered' exactly once (conditional update), a handover_events row
//    is inserted, the trusted person is emailed their link, and the owner gets a
//    notice on every verified channel (logged as step 'handover'). The handover is
//    opened by the status change even if emails fail; the trusted email is retried on
//    later runs up to 5 attempts (notified_at set on success). Owner notices are
//    never retried.
//
// Message bodies, tokens and keys are never logged.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BUSINESSES = 200;
const MAX_NOTIFY_ATTEMPTS = 5;

interface SettingsRow {
  business_id: string;
  quiet_days: number;
  reminder_count: number;
  reminder_gap_hours: number;
  final_wait_hours: number;
  status: string;
  last_activity_at: string | null;
  paused_until: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
}

interface ChannelRow {
  type: string;
  address: string;
}

interface ContactRow {
  name: string;
  email: string | null;
  access_token: string;
}

interface BusinessRow {
  owner_name: string | null;
}

interface HandoverEventRow {
  id: string;
  notified_at: string | null;
  notify_attempts: number;
  notify_error: string | null;
}

interface StepResult {
  action:
    | "sent"
    | "none"
    | "failed"
    | "handover_opened"
    | "handover_notify_retried"
    | "handover_notify_failed";
  reminderNumber?: number;
  error?: string;
}

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

function makeRawToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(36))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function reminderStepLabel(reminderNumber: number): string {
  if (reminderNumber <= 1) return "reminder_1";
  if (reminderNumber === 2) return "reminder_2";
  return "reminder_3";
}

// The date shown in the message: now + remaining reminders x gap + final wait.
function handoverCutoffAt(settings: SettingsRow): Date {
  const remaining = Math.max(0, settings.reminder_count - settings.reminders_sent);
  const hours =
    remaining * settings.reminder_gap_hours + settings.final_wait_hours;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function fmtCutoff(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function emailHtml(daysQuiet: number, trustedName: string, cutoff: string, link: string): string {
  return `
    <p>Hello,</p>
    <p>We haven't seen you on Handover for ${daysQuiet} days. Are you okay?</p>
    <p>If we don't hear from you by ${cutoff}, ${trustedName} will be given access to
    your business binder.</p>
    <p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#c2540a;color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;border-radius:12px;">I'm okay</a></p>
    <p>This link works for 14 days.</p>`;
}

function trustedEmailHtml(ownerName: string, link: string): string {
  return `
    <p>Hello,</p>
    <p>${ownerName} asked Handover to open their business binder for you because they
    haven't responded to several check-ins. Use the link below. This is a practical
    guide, not legal advice.</p>
    <p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#c2540a;color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;border-radius:12px;">Open the binder</a></p>`;
}

interface LadderContext {
  admin: ReturnType<typeof createClient>;
  baseUrl: string;
  botToken: string;
}

async function sendEmail(
  ctx: LadderContext,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey || !ctx.baseUrl) {
    return { success: false, error: "email not configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Handover <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    console.error("email send failed with status", response.status);
    return { success: false, error: "email send failed" };
  }
  return { success: true };
}

async function sendTelegram(
  ctx: LadderContext,
  chatId: string,
  text: string,
  okToken?: string
): Promise<{ success: boolean; error?: string }> {
  if (!ctx.botToken) return { success: false, error: "telegram not configured" };
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (okToken) {
    body.reply_markup = {
      inline_keyboard: [[{ text: "I'm okay", callback_data: `ok:${okToken}` }]],
    };
  }
  const response = await fetch(`https://api.telegram.org/bot${ctx.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("telegram send failed with status", response.status);
    return { success: false, error: "telegram send failed" };
  }
  return { success: true };
}

async function sendChannel(
  ctx: LadderContext,
  businessId: string,
  channel: ChannelRow,
  reminderNumber: number,
  totalCount: number,
  daysQuiet: number,
  trustedName: string,
  cutoff: Date
): Promise<{ success: boolean; error?: string }> {
  const rawToken = makeRawToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenError } = await ctx.admin.from("confirm_tokens").insert({
    business_id: businessId,
    token_hash: tokenHash,
    kind: "checkin",
    channel: channel.type,
    expires_at: expiresAt,
  });
  if (tokenError) {
    console.error("token insert failed");
    return { success: false, error: "could not create check-in link" };
  }

  const cutoffLabel = fmtCutoff(cutoff);

  if (channel.type === "telegram") {
    return sendTelegram(
      ctx,
      channel.address,
      `We haven't seen you on Handover for ${daysQuiet} days. Are you okay? If we don't hear from you by ${cutoffLabel}, ${trustedName} will be given access to your business binder. (Reminder ${reminderNumber} of ${totalCount})`,
      rawToken
    );
  }

  const link = `${ctx.baseUrl}/c/${rawToken}`;
  return sendEmail(
    ctx,
    channel.address,
    `Are you okay? (reminder ${reminderNumber} of ${totalCount})`,
    emailHtml(daysQuiet, trustedName, cutoffLabel, link)
  );
}

// Returns the next ladder state if a reminder should be sent, or what the next
// step would be if it is not due yet / handover is due.
interface DueDecision {
  due: boolean;
  reminderNumber: number;
  daysQuiet: number;
  handoverDue: boolean;
}

function noStep(): DueDecision {
  return { due: false, reminderNumber: 0, daysQuiet: 0, handoverDue: false };
}

function decideStep(settings: SettingsRow, now: number): DueDecision {
  const quietMs = settings.quiet_days * 24 * 60 * 60 * 1000;
  const gapMs = settings.reminder_gap_hours * 60 * 60 * 1000;
  const finalMs = settings.final_wait_hours * 60 * 60 * 1000;

  if (
    settings.paused_until &&
    new Date(settings.paused_until).getTime() > now
  ) {
    return noStep();
  }

  if (settings.status === "active") {
    const lastAct = settings.last_activity_at
      ? new Date(settings.last_activity_at).getTime()
      : 0;
    const pausedEnd = settings.paused_until
      ? new Date(settings.paused_until).getTime()
      : 0;
    // After a pause ends, the owner gets a full quiet period: the effective
    // last activity is the later of the two times.
    const base = Math.max(lastAct, pausedEnd);
    if (base === 0) return noStep();
    if (now >= base + quietMs) {
      return { ...noStep(), due: true, reminderNumber: 1, daysQuiet: Math.floor((now - base) / 86400000) };
    }
    return noStep();
  }

  if (settings.status === "reminding") {
    if (settings.reminders_sent < settings.reminder_count) {
      const last = settings.last_reminder_at ? new Date(settings.last_reminder_at).getTime() : 0;
      if (last !== 0 && now >= last + gapMs) {
        return {
          ...noStep(),
          due: true,
          reminderNumber: settings.reminders_sent + 1,
          daysQuiet: Math.floor((now - new Date(settings.last_activity_at ?? now).getTime()) / 86400000),
        };
      }
      return noStep();
    }
    const last = settings.last_reminder_at ? new Date(settings.last_reminder_at).getTime() : 0;
    if (last !== 0 && now >= last + finalMs) {
      return { ...noStep(), handoverDue: true };
    }
    return noStep();
  }

  return noStep();
}

// Sends (or retries) the trusted person's email for the newest ladder-triggered
// handover event. Returns whether the email is now delivered.
async function ensureTrustedNotified(
  ctx: LadderContext,
  businessId: string,
  contact: ContactRow,
  ownerName: string
): Promise<boolean> {
  const { admin } = ctx;
  const { data: event } = await admin
    .from("handover_events")
    .select("id, notified_at, notify_attempts, notify_error")
    .eq("business_id", businessId)
    .eq("trigger_type", "ladder")
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = event as HandoverEventRow | null;
  if (!row) return false;
  if (row.notified_at) return true;
  if (row.notify_attempts >= MAX_NOTIFY_ATTEMPTS) return false;
  if (!contact.email || !ctx.baseUrl) {
    await admin
      .from("handover_events")
      .update({
        notify_attempts: row.notify_attempts + 1,
        notify_error: !contact.email ? "trusted person has no email" : "app url missing",
      })
      .eq("id", row.id);
    return false;
  }

  const link = `${ctx.baseUrl}/handover/${contact.access_token}`;
  let result: { success: boolean; error?: string };
  try {
    result = await sendEmail(
      ctx,
      contact.email,
      `${ownerName} set this up so you'd know what to do`,
      trustedEmailHtml(ownerName, link)
    );
  } catch {
    result = { success: false, error: "unexpected send error" };
  }

  await admin
    .from("handover_events")
    .update({
      notified_at: result.success ? new Date().toISOString() : null,
      notify_attempts: row.notify_attempts + 1,
      notify_error: result.success ? null : (result.error ?? "email send failed"),
    })
    .eq("id", row.id);
  return result.success;
}

// Sends the owner a notice on every verified channel and logs step 'handover'.
async function notifyOwnerHandover(
  ctx: LadderContext,
  businessId: string,
  channels: ChannelRow[],
  trustedName: string
): Promise<void> {
  const { admin } = ctx;
  const text = `Your business binder was opened for ${trustedName} because you didn't respond. Log in to Handover if you're okay.`;
  for (const channel of channels) {
    let result: { success: boolean; error?: string };
    try {
      result =
        channel.type === "telegram"
          ? await sendTelegram(ctx, channel.address, text)
          : await sendEmail(ctx, channel.address, "Your business binder was opened", `<p>${text}</p>`);
    } catch {
      result = { success: false, error: "unexpected send error" };
    }
    await admin.from("escalation_log").insert({
      business_id: businessId,
      step: "handover",
      channel: channel.type,
      sent_at: new Date().toISOString(),
      success: result.success,
      error: result.error ?? null,
    });
  }
}

async function processBusiness(ctx: LadderContext, settings: SettingsRow): Promise<StepResult> {
  const { admin } = ctx;
  const now = Date.now();

  const { data: contact } = await admin
    .from("trusted_contacts")
    .select("name, email, access_token")
    .eq("business_id", settings.business_id)
    .maybeSingle();
  if (!contact) return { action: "none" };

  const { data: channels } = await admin
    .from("notification_channels")
    .select("type, address")
    .eq("business_id", settings.business_id)
    .eq("verified", true)
    .eq("enabled", true);
  const sendable = (channels ?? []) as ChannelRow[];

  const decision = decideStep(settings, now);

  // Handover already open: only the trusted person's email may be retried here;
  // owner notices are never retried.
  if (settings.status === "handover_triggered") {
    const delivered = await ensureTrustedNotified(
      ctx,
      settings.business_id,
      contact as ContactRow,
      // owner name fetched separately to keep this path cheap
      (await admin.from("businesses").select("owner_name").eq("id", settings.business_id).maybeSingle())
        .data?.owner_name ?? "The owner"
    );
    return delivered
      ? { action: "none" }
      : { action: "handover_notify_failed", error: "trusted email not delivered yet" };
  }

  if (sendable.length === 0) return { action: "none" };

  if (decision.handoverDue) {
    // Open the handover exactly once.
    const { data: claimed, error: claimError } = await admin
      .from("safety_settings")
      .update({ status: "handover_triggered" })
      .eq("business_id", settings.business_id)
      .eq("status", "reminding")
      .eq("reminders_sent", settings.reminder_count)
      .select("business_id")
      .maybeSingle();
    if (claimError) {
      console.error("handover claim failed");
      return { action: "failed", error: "state update failed" };
    }
    if (!claimed) return { action: "none" };

    await admin.from("handover_events").insert({
      business_id: settings.business_id,
      trigger_type: "ladder",
      triggered_at: new Date().toISOString(),
    });

    const { data: biz } = await admin
      .from("businesses")
      .select("owner_name")
      .eq("id", settings.business_id)
      .maybeSingle();
    const ownerName = (biz as BusinessRow | null)?.owner_name ?? "The owner";

    await ensureTrustedNotified(ctx, settings.business_id, contact as ContactRow, ownerName);
    await notifyOwnerHandover(ctx, settings.business_id, sendable, contact.name);

    return { action: "handover_opened" };
  }

  if (!decision.due) return { action: "none" };

  const reminderNumber = decision.reminderNumber;
  const totalCount = settings.reminder_count;
  const cutoff = handoverCutoffAt(settings);
  const trustedName = contact.name;

  let anySuccess = false;
  for (const channel of sendable) {
    let result: { success: boolean; error?: string };
    try {
      result = await sendChannel(
        ctx,
        settings.business_id,
        channel,
        reminderNumber,
        totalCount,
        decision.daysQuiet,
        trustedName,
        cutoff
      );
    } catch {
      result = { success: false, error: "unexpected send error" };
    }

    await admin.from("escalation_log").insert({
      business_id: settings.business_id,
      step: reminderStepLabel(reminderNumber),
      channel: channel.type,
      sent_at: new Date().toISOString(),
      success: result.success,
      error: result.error ?? null,
    });

    if (result.success) anySuccess = true;
  }

  if (!anySuccess) {
    // Change nothing so the next run retries.
    return { action: "failed", error: "all channels failed" };
  }

  // Idempotent claim: only advance if reminders_sent still equals the expected
  // value, so two overlapping runs can never double-send the same reminder.
  const expected = settings.status === "active" ? 0 : reminderNumber - 1;
  const { data: updated, error: updError } = await admin
    .from("safety_settings")
    .update({
      status: "reminding",
      reminders_sent: reminderNumber,
      last_reminder_at: new Date().toISOString(),
    })
    .eq("business_id", settings.business_id)
    .eq("reminders_sent", expected)
    .select("business_id")
    .maybeSingle();

  if (updError) {
    console.error("settings update failed");
    return { action: "failed", error: "state update failed" };
  }
  if (!updated) {
    // Another run already advanced the ladder; the sends above were duplicates
    // but the ladder state is consistent.
    return { action: "none" };
  }

  return { action: "sent", reminderNumber };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const cronSecret = Deno.env.get("CRON_SECRET");
    const cronHeader = req.headers.get("X-Cron-Secret");
    const authHeader = req.headers.get("Authorization") ?? "";

    let mode: "scheduled" | "manual" | null = null;
    let userId = "";
    if (cronSecret && cronHeader && cronHeader === cronSecret) {
      mode = "scheduled";
    } else if (authHeader) {
      // Owner's own JWT -> manual mode.
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return json({ error: "Not authenticated" }, 401);
      }
      mode = "manual";
      userId = userData.user.id;
    } else {
      return json({ error: "Not authorized" }, 401);
    }

    const baseUrl = Deno.env.get("APP_BASE_URL")?.replace(/\/+$/, "") ?? "";
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const ctx: LadderContext = { admin, baseUrl, botToken };

    if (mode === "manual") {
      const { data: biz, error: bizError } = await admin
        .from("businesses")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      if (bizError || !biz) {
        return json({ error: "Business not found" }, 404);
      }
      const { data: settings } = await admin
        .from("safety_settings")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();
      if (!settings) {
        return json({ error: "Settings not found" }, 404);
      }
      const result = await processBusiness(ctx, settings as SettingsRow);
      return json({ results: [result] });
    }

    // Scheduled mode: up to 200 businesses. 'handover_triggered' is included so
    // the trusted person's email can be retried on later runs.
    const { data: rows, error: rowsError } = await admin
      .from("safety_settings")
      .select("*")
      .in("status", ["active", "reminding", "handover_triggered"])
      .limit(MAX_BUSINESSES);
    if (rowsError) {
      console.error("settings query failed");
      return json({ error: "Could not load businesses" }, 500);
    }

    const results: StepResult[] = [];
    for (const row of (rows ?? []) as SettingsRow[]) {
      results.push(await processBusiness(ctx, row));
    }

    await admin
      .from("ladder_runs")
      .upsert({ id: 1, last_run_at: new Date().toISOString(), last_mode: "scheduled" });

    return json({ results });
  } catch (err) {
    console.error("run-ladder error:", err instanceof Error ? err.name : "unknown");
    return json({ error: "Unexpected error" }, 500);
  }
});
