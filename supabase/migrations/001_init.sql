-- NewsLens KE: initial schema for RSS ingestion and story clustering
-- Requires: Supabase Postgres with pgvector extension

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Sources (RSS feeds)
-- ---------------------------------------------------------------------------

create table public.sources (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  rss_url    text        not null unique,
  site_url   text        not null,
  created_at timestamptz not null default now()
);

comment on table public.sources is 'Kenyan news outlets with verified RSS feeds';

-- ---------------------------------------------------------------------------
-- Articles (raw items from RSS, deduplicated by URL)
-- ---------------------------------------------------------------------------

create table public.articles (
  id           uuid        primary key default gen_random_uuid(),
  source_id    uuid        not null references public.sources (id) on delete cascade,
  title        text        not null,
  url          text        not null unique,
  raw_text     text,
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  embedding    vector(768)
);

create index articles_url_idx
  on public.articles (url);

create index articles_published_at_idx
  on public.articles (published_at desc nulls last);

create index articles_source_id_idx
  on public.articles (source_id);

comment on table public.articles is 'Individual news articles fetched from RSS feeds';

-- ---------------------------------------------------------------------------
-- Stories (clustered coverage of the same event across outlets)
-- ---------------------------------------------------------------------------

create table public.stories (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  neutral_summary text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index stories_updated_at_idx
  on public.stories (updated_at desc);

comment on table public.stories is 'Cross-outlet story clusters with neutral summaries';

-- ---------------------------------------------------------------------------
-- Story ↔ Article join table
-- ---------------------------------------------------------------------------

create table public.story_articles (
  story_id   uuid not null references public.stories (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  primary key (story_id, article_id)
);

create index story_articles_article_id_idx
  on public.story_articles (article_id);

comment on table public.story_articles is 'Links clustered articles to their parent story';

-- ---------------------------------------------------------------------------
-- Claims (extracted factual claims from individual articles)
-- ---------------------------------------------------------------------------

create table public.claims (
  id         uuid        primary key default gen_random_uuid(),
  article_id uuid        not null references public.articles (id) on delete cascade,
  claim_text text        not null,
  embedding  vector(768)
);

create index claims_article_id_idx
  on public.claims (article_id);

comment on table public.claims is 'Atomic factual claims extracted from article text';

-- ---------------------------------------------------------------------------
-- Claim matches (cross-article / cross-story claim alignment)
-- ---------------------------------------------------------------------------

create table public.claim_matches (
  id               uuid primary key default gen_random_uuid(),
  claim_id         uuid not null references public.claims (id) on delete cascade,
  story_id         uuid not null references public.stories (id) on delete cascade,
  matched_group_id uuid not null
);

create index claim_matches_claim_id_idx
  on public.claim_matches (claim_id);

create index claim_matches_story_id_idx
  on public.claim_matches (story_id);

create index claim_matches_group_id_idx
  on public.claim_matches (matched_group_id);

comment on table public.claim_matches is 'Groups semantically matched claims within a story cluster';
comment on column public.claim_matches.matched_group_id is 'Shared ID for claims that express the same fact across articles';

-- ---------------------------------------------------------------------------
-- Seed verified RSS sources (from scripts/test-feeds.js run)
-- ---------------------------------------------------------------------------

insert into public.sources (name, rss_url, site_url) values
  (
    'Nation Africa',
    'https://nation.africa/kenya/rss.xml',
    'https://nation.africa'
  ),
  (
    'The Standard',
    'https://www.standardmedia.co.ke/rss/headlines.php',
    'https://www.standardmedia.co.ke'
  ),
  (
    'Kenyans.co.ke',
    'https://www.kenyans.co.ke/feeds/news',
    'https://www.kenyans.co.ke'
  ),
  (
    'Business Daily Africa',
    'https://www.businessdailyafrica.com/bd/rss.xml',
    'https://www.businessdailyafrica.com'
  ),
  (
    'Tuko',
    'https://www.tuko.co.ke/rss/all.rss',
    'https://www.tuko.co.ke'
  ),
  (
    'People Daily',
    'https://peopledaily.digital/feed',
    'https://peopledaily.digital'
  );
