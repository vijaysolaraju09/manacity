/* eslint-disable no-console */
const { pool, query } = require('../config/db');
const { getMobileValidationQueries } = require('../controllers/mobile/mobileQueryBuilder');

async function run() {
  try {
    const validations = await getMobileValidationQueries();

    for (const validation of validations) {
      try {
        await query(`EXPLAIN ${validation.text}`, validation.values);
        console.log(`[PASS] ${validation.name}`);
      } catch (err) {
        console.error(`[FAIL] ${validation.name}`);
        console.error(`Query: ${validation.text}`);
        console.error(`Error: ${err.message}`);
        throw err;
      }
    }

    console.log('All mobile queries are compatible with the current schema.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Mobile query validation failed:', err.message);
  process.exit(1);
});
