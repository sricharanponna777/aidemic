-- ============================================================================
-- Per-user daily rate limiting for /api/ai/* routes.
--
-- One row per (user, day) tracks how many AI requests that user has made.
-- increment_ai_usage() atomically increments the counter only if it is still
-- under the caller-supplied limit, so concurrent requests can't both slip
-- through at the boundary. Each route passes its own limit (some AI routes
-- are far more expensive than others -- see src/lib/ai/rateLimit.ts).
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_request_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE ai_request_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own AI usage" ON ai_request_counters;
CREATE POLICY "Users can view their own AI usage"
  ON ai_request_counters FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policy: rows are only ever written via increment_ai_usage(),
-- which runs as SECURITY DEFINER.

CREATE OR REPLACE FUNCTION increment_ai_usage(p_daily_limit integer)
RETURNS TABLE(allowed boolean, current_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO ai_request_counters (user_id, usage_date, request_count)
  VALUES (auth.uid(), CURRENT_DATE, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  UPDATE ai_request_counters
  SET request_count = request_count + 1
  WHERE user_id = auth.uid()
    AND usage_date = CURRENT_DATE
    AND request_count < p_daily_limit
  RETURNING request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT request_count INTO v_count
    FROM ai_request_counters
    WHERE user_id = auth.uid() AND usage_date = CURRENT_DATE;

    RETURN QUERY SELECT false, v_count;
  ELSE
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_ai_usage(integer) TO authenticated;
