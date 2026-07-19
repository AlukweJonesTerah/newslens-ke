import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasCronSecret: !!process.env.CRON_SECRET,
  });
}
