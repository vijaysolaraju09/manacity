const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool, query } = require('../config/db');
const { hashPassword } = require('../utils/password');

const LOCATION = {
  id: '8e46b124-e6e8-4afd-b884-ba52f121fc4e',
  name: 'Rayachoty',
  pincode: '516269',
};

const OWNER = {
  id: '8a8817de-66d6-4f94-9033-ec0859197e88',
  name: 'Demo Shop Owner',
  phone: '+919900000010',
  password: 'DemoPass!123',
};

const SHOPS = [
  {
    id: '65f4fa99-7822-49cd-9ce6-0901e3dfbf7a',
    name: 'Demo Grocery Store',
    description: 'Staples, fresh produce, and daily essentials for quick mobile testing.',
    category: 'Groceries',
    image_url: 'https://placehold.co/600x400?text=Demo+Grocery',
    address: 'Rayachoty Town Center',
    phone: '+919900000011',
    delivery_fee: 0,
    delivery_enabled: true,
    pickup_enabled: true,
    is_open: true,
  },
  {
    id: 'f3f86eba-b69b-4947-b4de-7e7dbc36f0c4',
    name: 'Demo Electronics',
    description: 'Mobile accessories and basic electronics showcased for UI work.',
    category: 'Electronics',
    image_url: 'https://placehold.co/600x400?text=Demo+Electronics',
    address: 'Rayachoty Market Road',
    phone: '+919900000012',
    delivery_fee: 25,
    delivery_enabled: true,
    pickup_enabled: true,
    is_open: true,
  },
];

const REQUIRED_SHOP_COLUMNS = [
  'id',
  'name',
  'owner_id',
  'location_id',
  'approval_status',
  'is_open',
  'is_hidden',
];

async function getShopColumns() {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'shops'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

async function ensureLocation() {
  const byId = await query('SELECT id FROM locations WHERE id = $1', [LOCATION.id]);
  if (byId.rowCount > 0) {
    return LOCATION.id;
  }

  const byName = await query('SELECT id FROM locations WHERE name = $1', [LOCATION.name]);
  if (byName.rowCount > 0 && byName.rows[0].id !== LOCATION.id) {
    throw new Error(
      `Location "${LOCATION.name}" exists with id ${byName.rows[0].id}, expected ${LOCATION.id}`,
    );
  }

  await query(
    `
      INSERT INTO locations (id, name, pincode, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (id) DO NOTHING
    `,
    [LOCATION.id, LOCATION.name, LOCATION.pincode],
  );

  return LOCATION.id;
}

async function ensureOwner(locationId) {
  const existing = await query('SELECT id, location_id FROM users WHERE phone = $1', [OWNER.phone]);
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    if (row.location_id && row.location_id !== locationId) {
      throw new Error(
        `Owner phone ${OWNER.phone} belongs to location ${row.location_id}, expected ${locationId}`,
      );
    }
    return row.id;
  }

  const passwordHash = await hashPassword(OWNER.password);
  const insertSql = `
    INSERT INTO users (id, name, phone, password_hash, role, location_id, approval_status, is_active)
    VALUES ($1, $2, $3, $4, 'BUSINESS', $5, 'APPROVED', true)
    RETURNING id
  `;

  const { rows } = await query(insertSql, [
    OWNER.id,
    OWNER.name,
    OWNER.phone,
    passwordHash,
    locationId,
  ]);

  return rows[0].id;
}

function ensureRequiredColumns(availableColumns) {
  const missing = REQUIRED_SHOP_COLUMNS.filter((column) => !availableColumns.has(column));
  if (missing.length > 0) {
    throw new Error(`Missing required shop columns: ${missing.join(', ')}`);
  }
}

async function upsertShop(shop, ownerId, locationId, availableColumns) {
  const columns = [];
  const values = [];
  const placeholders = [];
  let idx = 1;

  const push = (column, value) => {
    columns.push(column);
    values.push(value);
    placeholders.push(`$${idx}`);
    idx += 1;
  };

  const pushIfAvailable = (column, value) => {
    if (availableColumns.has(column)) {
      push(column, value);
    }
  };

  push('id', shop.id);
  push('name', shop.name);
  push('owner_id', ownerId);
  push('location_id', locationId);
  push('approval_status', 'APPROVED');
  push('is_open', shop.is_open !== undefined ? shop.is_open : true);
  push('is_hidden', false);

  pushIfAvailable('description', shop.description || null);
  pushIfAvailable('category', shop.category || null);
  pushIfAvailable('image_url', shop.image_url || null);
  pushIfAvailable('address', shop.address || null);
  pushIfAvailable('phone', shop.phone || OWNER.phone);
  pushIfAvailable('delivery_fee', shop.delivery_fee !== undefined ? shop.delivery_fee : 0);
  pushIfAvailable('delivery_enabled', shop.delivery_enabled !== undefined ? shop.delivery_enabled : true);
  pushIfAvailable('pickup_enabled', shop.pickup_enabled !== undefined ? shop.pickup_enabled : true);

  const updateAssignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`);

  if (availableColumns.has('updated_at')) {
    updateAssignments.push('updated_at = NOW()');
  }

  const sql = `
    INSERT INTO shops (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (id) DO UPDATE SET
      ${updateAssignments.join(', ')}
  `;

  await query(sql, values);
}

async function rollback() {
  await query(
    'DELETE FROM shops WHERE id = ANY($1::uuid[])',
    [SHOPS.map((shop) => shop.id)],
  );
  await query('DELETE FROM users WHERE phone = $1', [OWNER.phone]);
}

async function main() {
  const rollbackMode = process.argv.includes('--rollback');

  try {
    if (rollbackMode) {
      await rollback();
      console.log('Rollback complete');
      return;
    }

    const locationId = await ensureLocation();
    const ownerId = await ensureOwner(locationId);
    const availableColumns = await getShopColumns();
    ensureRequiredColumns(availableColumns);

    for (const shop of SHOPS) {
      await upsertShop(shop, ownerId, locationId, availableColumns);
      console.log(`Upserted shop: ${shop.name}`);
    }

    console.log('Mobile shop seed complete');
  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    await pool.end();
  }
}

main();
