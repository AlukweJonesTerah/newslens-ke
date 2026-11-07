import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Created lazily on first use, not at import time, so `next build` can load
// page modules without Supabase secrets. Missing vars still throw, at request time.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing server-side Supabase environment variables');
  }

  client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
