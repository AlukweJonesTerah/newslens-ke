import { supabase } from '@/lib/supabase';
import Link from 'next/link';

type CoverageCategory =
  | 'government_focused'
  | 'opposition_focused'
  | 'public_focused'
  | 'business_focused'
  | 'international_focused'
  | null;

interface Story {
  id: string;
  title: string;
  neutral_summary: string | null;
  coverage_category: CoverageCategory;
  summary_updated_at: string | null;
  updated_at: string;
}

function getCategoryColor(category: CoverageCategory) {
  switch (category) {
    case 'government_focused':
      return '#c85a54';
    case 'opposition_focused':
      return '#6b9080';
    case 'public_focused':
      return '#e7c15b';
    case 'business_focused':
      return '#7a87c5';
    case 'international_focused':
      return '#a87ca0';
    default:
      return '#6b7280';
  }
}

async function getSource(sourceId: string) {
  const { data, error } = await supabase.from('sources').select('id,name').eq('id', sourceId).single();
  if (error) throw new Error(error.message);
  return data;
}

async function getRecentStoriesForSource(sourceId: string) {
  const { data, error } = await supabase
    .from('story_articles')
    .select('story_id,stories(id,title,neutral_summary,coverage_category,summary_updated_at,updated_at),articles(source_id)')
    .eq('articles.source_id', sourceId)
    .limit(50);

  if (error) throw new Error(error.message);

  const uniqueStories = new Map();
  for (const row of data || []) {
    if (!uniqueStories.has(row.story_id)) {
      uniqueStories.set(row.story_id, row.stories);
    }
  }
  
  // Sort stories in JS by updated_at descending
  return Array.from(uniqueStories.values()).sort((a, b) => {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }) as Story[];
}

export default async function SourceDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  const source = await getSource(sourceId);
  const stories = await getRecentStoriesForSource(sourceId);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-16">
      <Link href="/sources" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-accent mb-6 transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to sources
      </Link>
      <header className="mb-10">
        <h1 className="text-3xl font-serif font-medium">{source.name}</h1>
        <p className="mt-2 text-gray-600">Recent stories that include this outlet.</p>
      </header>

      <div className="space-y-5">
        {stories.map((story) => {
          const categoryColor = getCategoryColor(story.coverage_category);
          return (
            <article key={story.id} className="relative bg-white border border-card-border rounded-xl p-6 transition-all hover:shadow-sm">
              <div 
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: categoryColor }}
              />
              <Link href={`/stories/${story.id}`} className="block">
                <h2 className="text-xl font-serif font-medium mb-3 hover:text-accent">
                  {story.title}
                </h2>
              </Link>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-4">
                {story.neutral_summary || 'No neutral summary available.'}
              </p>
              <p className="text-xs text-gray-400">Updated {new Date(story.updated_at).toLocaleDateString()}</p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
