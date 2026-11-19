import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_REQUESTS_PER_MINUTE = 30;

// --- First 72 Hours pipeline (kept in this file: the deployer bundles each
// function's folder in isolation, so cross-folder imports are not possible). ---

const AI_DAILY_LIMIT = 40;
const MAX_ITEMS = 8;

interface First72Item {
  action: string;
  why: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

interface BinderEntryLite {
  section?: string;
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  priority?: number;
}

function f72Text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateItem(raw: unknown): First72Item | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const action = f72Text(r.action, 200);
  if (!action) return null;
  return {
    action,
    why: f72Text(r.why, 300),
    contact_name: f72Text(r.contact_name, 120),
    contact_phone: f72Text(r.contact_phone, 60),
    contact_email: f72Text(r.contact_email, 200),
  };
}

const SYSTEM_INSTRUCTION =
  "You write the 'First 72 Hours' checklist for someone stepping into a small business owner's shoes. " +
  'Return ONLY a JSON array, no markdown, no extra text. At most 8 items, in the order they should be done. ' +
  'Each item is an object with exactly these keys: "action" (one short plain sentence starting with a verb), ' +
  '"why" (one short sentence), "contact_name", "contact_phone", "contact_email" (strings, empty when the entries do not name one). ' +
  "Order by: anything with a deadline in the next 3 days first, then payments, then customer promises, then suppliers. " +
  "Use ONLY facts present in the entries. Never invent names, numbers or dates. " +
  "If an entry mentions a password, card number or bank account number, ignore it and never include it. " +
  "If there is nothing usable, return [].";

async function generateFirst72(
  apiKey: string,
  entries: BinderEntryLite[]
): Promise<First72Item[] | null> {
  const lines = entries.map((e) => {
    const parts = [`Section: ${e.section ?? "general"}`, `Title: ${e.title}`];
    if (e.body) parts.push(`Details: ${e.body}`);
    if (e.contact_name) parts.push(`Contact: ${e.contact_name}`);
    if (e.contact_phone) parts.push(`Phone: ${e.contact_phone}`);
    if (e.contact_email) parts.push(`Email: ${e.contact_email}`);
    return `- ${parts.join(" | ")}`;
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            { role: "user", parts: [{ text: `A small business owner's binder entries:\n${lines.join("\n")}` }] },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      }
    );
    if (!aiResponse.ok) {
      console.error("AI request failed with status", aiResponse.status);
      return null;
    }
    const aiJson = await aiResponse.json();
    const parts = aiJson?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
    const trimmed = text.trim();
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (!trimmed || start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
      if (!Array.isArray(parsed)) return null;
      return parsed
        .map(validateItem)
        .filter((i): i is First72Item => i !== null)
        .slice(0, MAX_ITEMS);
    } catch {
      return null;
    }
  } catch (err) {
    console.error("AI request threw:", err instanceof Error ? err.name : "unknown");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Cache check, generation, cache write. Returns null when no valid cached or
// generated content exists (caller falls back to the plain list).
async function getFirst72List(
  admin: ReturnType<typeof createClient>,
  businessId: string,
  entries: BinderEntryLite[]
): Promise<First72Item[] | null> {
  const { data: cached } = await admin
    .from("first72_cache")
    .select("content, generated_at")
    .eq("business_id", businessId)
    .maybeSingle();
  const cacheRow = cached as { content: unknown; generated_at: string } | null;

  const { data: newest } = await admin
    .from("binder_entries")
    .select("updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newestEntryAt =
    newest && typeof (newest as { updated_at?: unknown }).updated_at === "string"
      ? (newest as { updated_at: string }).updated_at
      : null;

  const cacheValid =
    cacheRow !== null &&
    Array.isArray(cacheRow.content) &&
    (newestEntryAt === null ||
      (!!cacheRow.generated_at && new Date(cacheRow.generated_at) >= new Date(newestEntryAt)));

  if (cacheValid && cacheRow && Array.isArray(cacheRow.content)) {
    const items = cacheRow.content.map(validateItem).filter((i): i is First72Item => i !== null);
    if (items.length > 0) return items;
  }

  if (entries.length === 0) return null;
  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await admin
    .from("ai_usage")
    .select("count")
    .eq("business_id", businessId)
    .eq("day", today)
    .maybeSingle();
  const used = typeof usageRow?.count === "number" ? usageRow.count : 0;
  if (used >= AI_DAILY_LIMIT) return null;
  const { error: usageError } = await admin.from("ai_usage").upsert(
    { business_id: businessId, day: today, count: used + 1 },
    { onConflict: "business_id,day" }
  );
  if (usageError) console.error("Usage update failed:", usageError.code);

  const generated = await generateFirst72(apiKey, entries);
  if (!generated || generated.length === 0) return null;

  await admin.from("first72_cache").upsert({
    business_id: businessId,
    content: generated,
    generated_at: new Date().toISOString(),
  });
  return generated;
}

// --- End First 72 Hours pipeline ---

// One identical response for every failure so nobody can tell why a request failed.
function notAvailable(): Response {
  return new Response(JSON.stringify({ error: "Not available" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The plain fallback list (step 4A): first_72 entries first, then the rest by
// priority, capped at 8. Built from the same entries the trusted person sees.
function plainList(
  entries: BinderEntryLite[] & { id?: string }[]
): First72Item[] {
  const first72 = entries.filter((e) => e.section === "first_72");
  const rest = entries.filter((e) => e.section !== "first_72");
  return [...first72, ...rest].slice(0, 8).map((e) => ({
    action: e.title,
    why: e.body,
    contact_name: e.contact_name,
    contact_phone: e.contact_phone,
    contact_email: e.contact_email,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return notAvailable();
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return notAvailable();
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 200) {
      return notAvailable();
    }

    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 100);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: hits } = await admin.rpc("record_rate_hit", { p_key: `handover:${ip}` });
    if (typeof hits === "number" && hits > MAX_REQUESTS_PER_MINUTE) {
      return notAvailable();
    }

    const { data: contact } = await admin
      .from("trusted_contacts")
      .select("id, business_id, name")
      .eq("access_token", token)
      .maybeSingle();
    if (!contact) {
      return notAvailable();
    }

    const { data: biz } = await admin
      .from("businesses")
      .select("id, name, owner_name")
      .eq("id", contact.business_id)
      .maybeSingle();
    if (!biz) {
      return notAvailable();
    }

    const { data: settings } = await admin
      .from("safety_settings")
      .select("status")
      .eq("business_id", biz.id)
      .maybeSingle();
    if (!settings || settings.status !== "handover_triggered") {
      return json({ state: "locked" });
    }

    const { data: entries, error: entriesError } = await admin
      .from("binder_entries")
      .select("id, section, title, body, contact_name, contact_phone, contact_email, priority, updated_at")
      .eq("business_id", biz.id)
      .order("priority", { ascending: false });
    if (entriesError) {
      return notAvailable();
    }
    const rows = entries ?? [];

    const { data: latestEvent } = await admin
      .from("handover_events")
      .select("id, accessed_at")
      .eq("business_id", biz.id)
      .order("triggered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestEvent && !latestEvent.accessed_at) {
      await admin
        .from("handover_events")
        .update({ accessed_at: new Date().toISOString() })
        .eq("id", latestEvent.id);
    }

    // AI-written list; falls back to the plain list on any failure. Never errors here.
    let first72Items: First72Item[] = plainList(rows);
    try {
      const aiList = await getFirst72List(admin, biz.id, rows);
      if (aiList && aiList.length > 0) {
        first72Items = aiList;
      }
    } catch {
      // keep plain list
    }

    const publicRows = rows.map((row) => {
      const { updated_at, ...rest } = row;
      void updated_at;
      return rest;
    });

    return json({
      state: "open",
      business_name: biz.name,
      owner_name: biz.owner_name,
      trusted_name: contact.name,
      entries: publicRows,
      first72: first72Items,
    });
  } catch (err) {
    console.error("handover-access error:", err instanceof Error ? err.name : "unknown");
    return notAvailable();
  }
});
