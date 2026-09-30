require('dotenv').config();
const db = require('./backend/config/db');

async function verifyIndex() {
  // Wait briefly so initDatabase() has time to run
  await new Promise(r => setTimeout(r, 3000));
  try {
    const res = await db.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'duties'
      ORDER BY indexname;
    `);
    console.log('\n=== Indexes on duties table ===');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

verifyIndex();
