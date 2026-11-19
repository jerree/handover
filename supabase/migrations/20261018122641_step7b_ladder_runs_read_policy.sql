/*
# Step 7B follow-up: allow owners to read the schedule heartbeat

1. Plain-English summary
   The /safety page shows "Last scheduled run". The `ladder_runs` table was
   created fully closed; signed-in owners now get read-only access to the
   singleton row. Writes remain edge-functions-only.

2. Security
- SELECT policy on `ladder_runs` for authenticated users (any signed-in user
  can read the single heartbeat timestamp; it contains no per-business data).
- No INSERT/UPDATE/DELETE policies: clients can never write it.
*/

DROP POLICY IF EXISTS "authenticated_read_ladder_runs" ON public.ladder_runs;

CREATE POLICY "authenticated_read_ladder_runs"
ON public.ladder_runs FOR SELECT
TO authenticated
USING (true);
