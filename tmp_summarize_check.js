require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const targetTitles = [
  'NTSA sounds alarm over uncollected logbooks as deadline nears',
  "Speaker Wetang'ula Faces Possible Jail Term After Fresh Contempt Case",
  'Why World Bank has delayed Sh78bn emergency loan to Kenya',
];

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials in env');
  return createClient(url, key);
}

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY in env');
  return new GoogleGenAI({ apiKey });
}

async function main() {
  const supabase = getSupabaseClient();
  const genAI = getGenAIClient();

  for (const targetTitle of targetTitles) {
    const { data: storyRows, error: storyErr } = await supabase
      .from('stories')
      .select('id,title')
      .ilike('title', `%${targetTitle}%`)
      .limit(1);
    if (storyErr) throw storyErr;
    const story = storyRows?.[0];
    if (!story) {
      console.log(`NO STORY FOUND FOR: ${targetTitle}`);
      continue;
    }

    const { data: articleRows, error: arErr } = await supabase
      .from('story_articles')
      .select('article:articles(id,title,raw_text,source_id)')
      .eq('story_id', story.id);
    if (arErr) throw arErr;
    const inputs = articleRows.map((r) => {
      const art = r.article;
      return { title: art.title || '', text: (art.raw_text || '').slice(0, 2000), source_id: art.source_id };
    });

    const prompt = `Produce a JSON object with keys: neutral_summary (short neutral summary), per_source (map source name -> what that outlet emphasized), highlights (array of 1-3 short bullets). Input articles:\n${JSON.stringify(inputs, null, 2)}`;

    console.log('='.repeat(80));
    console.log(`STORY: ${story.title}`);
    console.log(`ID: ${story.id}`);
    console.log('ARTICLE COUNT:', inputs.length);
    console.log('PROMPT START');
    console.log(prompt);
    console.log('PROMPT END');

    const model = process.env.SUMMARIZER_MODEL || 'gemini-3.5-flash';
    let rawText = '';
    let parsed = null;
    let parseError = null;
    try {
      const response = await genAI.models.generateContent({ model, contents: prompt, maxOutputTokens: 800 });
      rawText = (response?.text || response?.output?.[0]?.content || '').trim();
      console.log('RAW MODEL OUTPUT START');
      console.log(rawText);
      console.log('RAW MODEL OUTPUT END');
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        parseError = e.message;
      }
    } catch (err) {
      console.log('GENERATION ERROR', err.message || err);
    }

    console.log('PARSE SUCCESS:', parsed !== null);
    console.log('PARSE ERROR:', parseError || 'none');
    if (parsed) {
      console.log('NEUTRAL SUMMARY:', parsed.neutral_summary || '');
      console.log('PER_SOURCE:', JSON.stringify(parsed.per_source || {}, null, 2));
      console.log('HIGHLIGHTS:', JSON.stringify(parsed.highlights || [], null, 2));
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
