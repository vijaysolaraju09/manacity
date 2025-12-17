require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { pool, query } = require('../config/db');

const towns = [
  { name: 'Rayachoty', pincode: '516269' },
  { name: 'Rajampeta', pincode: '516115' },
];

async function main() {
  try {
    console.log("SEED ENV CHECK", {
      PGHOST: process.env.PGHOST,
      PGUSER: process.env.PGUSER,
      PGPASSWORD_TYPE: typeof process.env.PGPASSWORD,
      PGDATABASE: process.env.PGDATABASE
    });

    console.log('Starting database seed for locations...');

    for (const town of towns) {
      const insertQuery = `
        INSERT INTO locations (name, pincode)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
        RETURNING id, name
      `;
      
      const res = await query(insertQuery, [town.name, town.pincode]);

      if (res.rows.length > 0) {
        console.log(`Inserted: ${res.rows[0].name}`);
      } else {
        console.log(`Skipped: ${town.name} (already exists)`);
      }
    }

    console.log('\n--- Current Locations List ---');
    const allLocations = await query('SELECT id, name FROM locations ORDER BY name ASC');
    
    allLocations.rows.forEach((row) => {
      console.log(`${row.name} => ${row.id}`);
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    await pool.end();
    process.exit(1);
  }
}

main();