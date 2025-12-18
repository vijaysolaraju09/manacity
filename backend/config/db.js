const { Pool } = require('pg');
require('dotenv').config();

let poolConfig;

// 1. Ensure DATABASE_URL is preferred
if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // 2. Ensure ssl: { rejectUnauthorized: false } is applied when DATABASE_URL is used
    ssl: {
      rejectUnauthorized: false,
    },
  };
} else {
  // 3. Keep fallback PGHOST/PGUSER logic intact
  poolConfig = {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
  };
}

const pool = new Pool(poolConfig);

// Export query method to be used throughout the app
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // Exporting pool in case direct access is needed (e.g., for shutdown)
};
