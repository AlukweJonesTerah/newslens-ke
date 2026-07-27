-- Add PesaCheck as a fact-check source
-- PesaCheck is Africa's first independent fact-checking initiative

INSERT INTO public.sources (name, rss_url, site_url, source_type)
VALUES (
  'PesaCheck',
  'https://pesacheck.org/rss/',
  'https://pesacheck.org',
  'fact_check'
)
ON CONFLICT (rss_url) DO NOTHING;

COMMENT ON TABLE sources IS 'Kenyan news outlets and fact-checking organizations with verified RSS feeds';
