-- NewsLens KE: add SQL functions for clustering
-- ---------------------------------------------------------------------------
-- Function to get articles within a date window
-- ---------------------------------------------------------------------------

create or replace function public.get_articles_for_clustering(
  p_window_start timestamptz
) returns table (
  id uuid,
  title text,
  published_at timestamptz,
  source_name text,
  embedding vector(768)
)
language sql
stable
as $$
  select
    a.id,
    a.title,
    a.published_at,
    s.name as source_name,
    a.embedding
  from articles a
  join sources s on a.source_id = s.id
  where
    a.embedding is not null
    and a.published_at >= p_window_start
  order by a.published_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Function to compute pairwise cosine similarities between a list of article IDs
-- ---------------------------------------------------------------------------

create or replace function public.get_pairwise_similarities(
  p_article_ids uuid[]
) returns table (
  id1 uuid,
  id2 uuid,
  cosine_similarity float
)
language sql
stable
as $$
  select
    a1.id as id1,
    a2.id as id2,
    1 - (a1.embedding <=> a2.embedding) as cosine_similarity
  from articles a1
  join articles a2 on a1.id < a2.id
  where
    a1.id = any(p_article_ids)
    and a2.id = any(p_article_ids);
$$;
