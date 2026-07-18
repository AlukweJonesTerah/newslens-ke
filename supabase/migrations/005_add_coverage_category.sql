-- Track which coverage angle dominates a story cluster (for the coverage meter)
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS coverage_category text NULL;

COMMENT ON COLUMN stories.coverage_category IS
  'Dominant coverage angle: government_focused, opposition_focused, public_focused, business_focused, or international_focused';
