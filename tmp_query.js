require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const q = `
    SELECT a.id, a.title, a.published_at, s.name AS source_name, sa.story_id
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN story_articles sa ON sa.article_id = a.id
    WHERE lower(a.title) LIKE '%chuka%'
       OR lower(a.title) LIKE '%eldoret%'
       OR lower(a.title) LIKE '%course%'
       OR lower(a.title) LIKE '%courses%'
    ORDER BY a.published_at DESC
    LIMIT 50;
  `;
  const { rows } = await pool.query(q);
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
