import { createClient } from "npm:@supabase/supabase-js@2";

// The AI-written "First 72 Hours" pipeline, self-contained in this function so the
// deploy bundler can resolve everything. handover-access imports these helpers via
// a relative path; both functions are deployed from this same file.
//
// - Serves from first72_cache while no binder entry has changed since generated_at.
// - Otherwise calls the AI provider (Gemini flash-lite) and validates the output.
// - Counts one AI call per business per day in ai_usage (same daily limit as
//   structure-entry); over the limit or on any failure returns null so the caller
//   falls back to the plain list. The page must never error for a trusted person.

const AI_DAILY_LIMIT = 40;
const MAX_ITEMS = 8;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface First72Item {
  action: string;
  why: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

export interface BinderEntryLite {
  id?: string;
  section?: string;
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  priority?: number;
}

interface CacheRow {
  content: unknown;
  generated_at: string;
}

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateItem(raw: unknown): First72Item | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const action = asText(r.action, 200);
  if (!action) return null;
  return {
    action,
    why: asText(r.why, 300),
    contact_name: asText(r.contact_name, 120),
    contact_phone: asText(r.contact_phone, 60),
    contact_email: asText(r.contact_email, 200),
  };
}

export function extractItems(text: string): First72Item[] | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map(validateItem)
      .filter((i): i is First72Item => i !== null)
      .slice(0, MAX_ITEMS);
    return items;
  } catch {
    return null;
  }
}

function buildPrompt(entries: BinderEntryLite[]): string {
  const lines = entries.map((e) => {
    const parts = [`Section: ${e.section ?? "general"}`, `Title: ${e.title}`];
    if (e.body) parts.push(`Details: ${e.body}`);
    if (e.contact_name) parts.push(`Contact: ${e.contact_name}`);
    if (e.contact_phone) parts.push(`Phone: ${e.contact_phone}`);
    if (e.contact_email) parts.push(`Email: ${e.contact_email}`);
    return `- ${parts.join(" | ")}`;
  });
  return `A small business owner's binder entries:\n${lines.join("\n")}`;
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
          contents: [{ role: "user", parts: [{ text: buildPrompt(entries) }] }],
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
    if (!text) return null;
    return extractItems(text);
  } catch (err) {
    console.error("AI request threw:", err instanceof Error ? err.name : "unknown");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function countAiCall(
  admin: ReturnType<typeof createClient>,
  businessId: string
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await admin
    .from("ai_usage")
    .select("count")
    .eq("business_id", businessId)
    .eq("day", today)
    .maybeSingle();
  const used = typeof usageRow?.count === "number" ? usageRow.count : 0;
  if (used >= AI_DAILY_LIMIT) return false;
  const { error } = await admin.from("ai_usage").upsert(
    { business_id: businessId, day: today, count: used + 1 },
    { onConflict: "business_id,day" }
  );
  if (error) console.error("Usage update failed:", error.code);
  return true;
}

// Cache check, generation, cache write. Returns null when no valid cached or
// generated content exists (caller falls back to the plain list).
export async function getFirst72List(
  admin: ReturnType<typeof createClient>,
  businessId: string,
  entries: BinderEntryLite[],
  options: { forceRefresh?: boolean } = {}
): Promise<First72Item[] | null> {
  const { data: cached } = await admin
    .from("first72_cache")
    .select("content, generated_at")
    .eq("business_id", businessId)
    .maybeSingle();
  const cacheRow = cached as CacheRow | null;

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
    !options.forceRefresh &&
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

  const withinLimit = await countAiCall(admin, businessId);
  if (!withinLimit) return null;

  const generated = await generateFirst72(apiKey, entries);
  if (!generated || generated.length === 0) return null;

  await admin.from("first72_cache").upsert({
    business_id: businessId,
    content: generated,
    generated_at: new Date().toISOString(),
  });
  return generated;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Owner-side entry point: requires a signed-in owner, force-refreshes on demand.
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

    let body: { force?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const force = body.force === true;

    const { data: biz, error: bizError } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (bizError || !biz) {
      return json({ error: "Business not found" }, 404);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: entries, error: entriesError } = await admin
      .from("binder_entries")
      .select(
        "id, section, title, body, contact_name, contact_phone, contact_email, priority, updated_at"
      )
      .eq("business_id", biz.id)
      .order("priority", { ascending: false });
    if (entriesError) {
      return json({ error: "Could not read entries" }, 500);
    }

    const list = await getFirst72List(admin, biz.id, (entries ?? []) as BinderEntryLite[], {
      forceRefresh: force,
    });

    return json({ items: list ?? [], generated: list !== null });
  } catch (err) {
    console.error("generate-first-72 error:", err instanceof Error ? err.name : "unknown");
    return json({ error: "Unexpected error" }, 500);
  }
});
