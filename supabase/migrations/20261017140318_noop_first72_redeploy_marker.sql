/*
# Redeploy marker for generate-first-72

No schema change. generate-first-72 is deployed as a single-file function; this
migration only records that the server-side "First 72 Hours" pipeline (cache,
AI generation, usage limit, plain-list fallback) went live. Safe to ignore.
*/

SELECT 1;