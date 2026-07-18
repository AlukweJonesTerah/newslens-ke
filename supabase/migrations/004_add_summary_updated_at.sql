-- Add a timestamp column to track when the story summary was last generated or updated
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz NULL;

-- Optionally: on new installations you may want to set a default of NULL explicitly
-- and backfill existing summaries with the current time if desired:
-- UPDATE stories SET summary_updated_at = NOW() WHERE neutral_summary IS NOT NULL;
