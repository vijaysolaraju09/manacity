process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = require('pg');

// Load environment variables safely if not already loaded
// This ensures db.js works even if not called from the main entrypoint
if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  require('dotenv').config();
}

// Configuration: Prefer DATABASE_URL, otherwise use individual vars
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
 }
  : {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

const pool = new Pool(poolConfig);

// Robust error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // process.exit(-1); // Optional: exit process on critical DB failure
});

/**
 * Execute a query using the connection pool.
 * @param {string} text - The SQL query text.
 * @param {Array} params - The query parameters.
 * @returns {Promise} - The query result.
 */
const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
