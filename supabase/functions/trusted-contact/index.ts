import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// 32 random bytes -> 43-char url-safe string. Never generated in the browser.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const action = typeof body.action === "string" ? body.action : "";

    const { data: biz, error: bizError } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (bizError || !biz) {
      return json({ error: "Business not found" }, 404);
    }
    const businessId: string = biz.id;

    if (action === "save") {
      const ownerName = asText(body.owner_name, 120);
      const name = asText(body.name, 120);
      const email = asText(body.email, 200);
      const relationship = asText(body.relationship, 120);
      if (!name) {
        return json({ error: "Trusted person's name is required" }, 400);
      }

      const { error: ownerError } = await supabase
        .from("businesses")
        .update({ owner_name: ownerName })
        .eq("id", businessId);
      if (ownerError) {
        return json({ error: "Could not save your name" }, 500);
      }

      const { data: existing } = await supabase
        .from("trusted_contacts")
        .select("id, access_token")
        .eq("business_id", businessId)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from("trusted_contacts")
          .update({ name, email, relationship })
          .eq("id", existing.id);
        if (updateError) {
          return json({ error: "Could not save the trusted person" }, 500);
        }
        return json({ access_token: existing.access_token, created: false });
      }

      const access_token = generateToken();
      const { error: insertError } = await supabase.from("trusted_contacts").insert({
        business_id: businessId,
        name,
        email,
        relationship,
        access_token,
      });
      if (insertError) {
        return json({ error: "Could not save the trusted person" }, 500);
      }
      return json({ access_token, created: true });
    }

    if (action === "rotate") {
      const { data: existing } = await supabase
        .from("trusted_contacts")
        .select("id")
        .eq("business_id", businessId)
        .maybeSingle();
      if (!existing) {
        return json({ error: "Save a trusted person first" }, 400);
      }

      const access_token = generateToken();
      const { error: updateError } = await supabase
        .from("trusted_contacts")
        .update({ access_token })
        .eq("id", existing.id);
      if (updateError) {
        return json({ error: "Could not create a new link" }, 500);
      }
      return json({ access_token });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("trusted-contact error:", err instanceof Error ? err.name : "unknown");
    return json({ error: "Unexpected error" }, 500);
  }
});
