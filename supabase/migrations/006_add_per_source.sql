
-- Add per_source column to stories table for detailed per-source coverage notes
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS per_source JSONB DEFAULT NULL;
