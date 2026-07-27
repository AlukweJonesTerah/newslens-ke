-- Add source_type column to distinguish news sources from fact-check sources
-- Add fact_check_verdict to articles for storing PesaCheck's published verdict

-- Create source_type enum
CREATE TYPE source_type AS ENUM ('news', 'fact_check');

-- Add source_type column to sources table (default 'news' for existing sources)
ALTER TABLE sources
ADD COLUMN source_type source_type NOT NULL DEFAULT 'news';

-- Add fact_check_verdict to articles table for storing the verdict from fact-checking orgs
ALTER TABLE articles
ADD COLUMN fact_check_verdict TEXT DEFAULT NULL;

-- Add index for filtering by source_type
CREATE INDEX sources_source_type_idx ON sources(source_type);

-- Update all existing sources to be 'news' type (explicit, even though default)
UPDATE sources SET source_type = 'news' WHERE source_type IS NULL;

COMMENT ON COLUMN sources.source_type IS 'Distinguishes news sources from fact-check sources (e.g., PesaCheck)';
COMMENT ON COLUMN articles.fact_check_verdict IS 'For fact-check articles: the verdict/rating (e.g., "FAKE", "MISLEADING", "TRUE") as published by the fact-checking org';
