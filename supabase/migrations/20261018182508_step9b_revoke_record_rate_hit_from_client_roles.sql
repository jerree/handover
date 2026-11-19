-- record_rate_hit is only called by edge functions using the service role.
-- Postgres grants EXECUTE to PUBLIC by default, which made it callable by
-- anonymous web visitors as a free write endpoint. Revoke it.
REVOKE EXECUTE ON FUNCTION public.record_rate_hit(text) FROM anon, authenticated, public;
