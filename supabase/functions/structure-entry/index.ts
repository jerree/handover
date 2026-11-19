import { createClient } from "npm:@supabase/supabase-js@2";

const AI_DAILY_LIMIT = 40;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EntryInput {
  title?: unknown;
  body?: unknown;
  contact_name?: unknown;
  contact_phone?: unknown;
  contact_email?: unknown;
  priority?: unknown;
}

interface Entry {
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  priority: number;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 10000) : "";
}

function validateEntry(raw: EntryInput): Entry | null {
  const title = asText(raw.title);
  if (!title) return null;
  let priority = typeof raw.priority === "number" ? Math.round(raw.priority) : 0;
  if (!Number.isFinite(priority)) priority = 0;
  priority = Math.min(5, Math.max(1, priority));
  return {
    title,
    body: asText(raw.body),
    contact_name: asText(raw.contact_name),
    contact_phone: asText(raw.contact_phone),
    contact_email: asText(raw.contact_email),
    priority,
  };
}

function extractJsonArray(text: string): EntryInput[] | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed as EntryInput[];
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("AI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI key not configured", fallback: true }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    let body: { section?: unknown; question?: unknown; raw_text?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VALID_SECTIONS = new Set([
      "first_72",
      "people",
      "money",
      "routines",
      "locations",
      "promises",
      "templates",
    ]);
    const section = typeof body.section === "string" && VALID_SECTIONS.has(body.section) ? body.section : null;
    const question = asText(body.question);
    const rawText = asText(body.raw_text);
    if (!section || !question || !rawText) {
      return new Response(JSON.stringify({ error: "Missing or invalid fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Business must belong to the caller
    const { data: biz, error: bizError } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (bizError || !biz) {
      return new Response(JSON.stringify({ error: "Business not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const businessId: string = biz.id;

    // Daily AI usage limit (10 per business per day)
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabase
      .from("ai_usage")
      .select("count")
      .eq("business_id", businessId)
      .eq("day", today)
      .maybeSingle();
    const used = usageRow?.count ?? 0;
    if (used >= AI_DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: "Daily AI limit reached", fallback: true }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemInstruction =
      "You tidy a small business owner's spoken or typed answer into short, clear binder entries. " +
      "Return ONLY a JSON array, no markdown, no extra text. Each item must be an object with exactly these keys: " +
      '"title" (short, under 80 characters), "body" (one to three clear sentences), ' +
      '"contact_name", "contact_phone", "contact_email" (strings, empty when not present), ' +
      'and "priority" (integer 1 to 5, 5 = most urgent). ' +
      "Preserve every fact. If the text contains a password, card number, bank account number or government ID number, " +
      "remove it and instead write a note saying where that information is kept. " +
      "If the answer is empty or contains nothing usable, return an empty array [].";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let aiText: string | null = null;
    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [
              {
                role: "user",
                parts: [{ text: `Question: ${question}\n\nOwner's answer: ${rawText}` }],
              },
            ],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
          }),
        }
      );

      if (aiResponse.ok) {
        const aiJson = await aiResponse.json();
        const parts = aiJson?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          aiText = parts
            .map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : ""))
            .join("");
        }
      } else {
        // Read status only; never log response bodies (may contain echo of owner text)
        console.error("AI request failed with status", aiResponse.status);
      }
    } catch (aiError) {
      console.error("AI request threw:", aiError instanceof Error ? aiError.name : "unknown");
    } finally {
      clearTimeout(timeout);
    }

    let entries: Entry[] | null = null;
    if (aiText) {
      const parsed = extractJsonArray(aiText);
      if (parsed) {
        const cleaned = parsed.map(validateEntry).filter((e): e is Entry => e !== null);
        entries = cleaned.length > 0 ? cleaned : [];
      }
    }

    if (entries === null) {
      return new Response(JSON.stringify({ error: "AI unavailable or invalid output", fallback: true }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: usageError } = await supabase.from("ai_usage").upsert(
      { business_id: businessId, day: today, count: used + 1 },
      { onConflict: "business_id,day" }
    );
    if (usageError) {
      console.error("Usage update failed:", usageError.code);
    }

    return new Response(JSON.stringify({ entries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("structure-entry error:", err instanceof Error ? err.name : "unknown");
    return new Response(JSON.stringify({ error: "Unexpected error", fallback: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
