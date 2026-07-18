import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

async function getSources() {
  const { data, error } = await supabase.from('sources').select('id,name');
  if (error) throw new Error(error.message);
  return data || [];
}

export default async function SourcesPage() {
  const sources = await getSources();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <header className="mb-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-accent mb-6 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Home
        </Link>
        <h1 className="text-3xl font-serif font-medium">Sources</h1>
        <p className="mt-2 text-gray-600">Browse outlets and their recent coverage.</p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <Link
            key={source.id}
            href={`/sources/${source.id}`}
            className="relative bg-white border border-card-border rounded-xl p-6 text-left transition-all hover:border-accent hover:shadow-sm"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-accent"></div>
            <div className="flex items-center gap-3 mb-3">
              <Building2 className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-serif font-medium">{source.name}</h2>
            </div>
            <p className="text-sm text-gray-600">View this outlet's recent stories and coverage.</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
