const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool, query } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/password');

const LOCATION_NAME = 'Rayachoti';

const USER_DEFINITIONS = [
  {
    key: 'SUPER_ADMIN',
    name: 'Rayachoti Super Admin',
    phone: '+919999000001',
    password: 'Admin@123',
    role: 'SUPER_ADMIN',
  },
  {
    key: 'LOCAL_ADMIN',
    name: 'Rayachoti Local Admin',
    phone: '+919999000002',
    password: 'Admin@123',
    role: 'LOCAL_ADMIN',
  },
  {
    key: 'BUSINESS_1',
    name: 'Business User 1',
    phone: '+919999000003',
    password: 'Business@123',
    role: 'BUSINESS',
  },
  {
    key: 'BUSINESS_2',
    name: 'Business User 2',
    phone: '+919999000004',
    password: 'Business@123',
    role: 'BUSINESS',
  },
  {
    key: 'USER_1',
    name: 'Normal User 1',
    phone: '+919999000005',
    password: 'User@123',
    role: 'USER',
  },
  {
    key: 'USER_2',
    name: 'Normal User 2',
    phone: '+919999000006',
    password: 'User@123',
    role: 'USER',
  },
];

const SHOP_DEFINITIONS = [
  {
    name: 'Fresh Mart Rayachoti',
    description: 'Daily groceries and essentials',
    delivery_fee: 30,
    ownerPhone: '+919999000003',
    products: [
      { name: 'Rice (1kg)', description: 'Staple white rice', price: 75 },
      { name: 'Wheat Flour (1kg)', description: 'Whole wheat atta', price: 55 },
      { name: 'Tomatoes (1kg)', description: 'Fresh tomatoes', price: 40 },
      { name: 'Potatoes (1kg)', description: 'Cleaned potatoes', price: 35 },
      { name: 'Cooking Oil (1L)', description: 'Refined sunflower oil', price: 170 },
      { name: 'Sugar (1kg)', description: 'Fine sugar for daily use', price: 50 },
    ],
  },
  {
    name: 'Rayachoti Veg Corner',
    description: 'Fresh vegetables and fruits',
    delivery_fee: 20,
    ownerPhone: '+919999000004',
    products: [
      { name: 'Carrots (1kg)', description: 'Crunchy carrots', price: 45 },
      { name: 'Bananas (1 dozen)', description: 'Sweet ripe bananas', price: 60 },
      { name: 'Onions (1kg)', description: 'Red onions', price: 30 },
      { name: 'Green Chilies (250g)', description: 'Fresh green chilies', price: 25 },
      { name: 'Spinach (1 bunch)', description: 'Leafy spinach', price: 20 },
      { name: 'Apples (1kg)', description: 'Kashmir apples', price: 160 },
    ],
  },
];

const SERVICE_CATEGORIES = [
  { name: 'Electrician', description: 'Electrical wiring, repairs, and installations' },
  { name: 'Plumber', description: 'Plumbing fixes, leaks, and installations' },
  { name: 'House Cleaning', description: 'Home deep cleaning and maintenance' },
];

const EVENTS = [
  {
    title: 'Educational',
    description: 'Community workshop on digital literacy and safety.',
    event_type: 'EDUCATIONAL',
    venue: 'Rayachoti Community Hall',
    capacity: 150,
    daysFromNow: 10,
  },
  {
    title: 'Festival',
    description: 'Local festival celebration with food stalls and music.',
    event_type: 'FESTIVAL',
    venue: 'Rayachoti Main Grounds',
    capacity: 300,
    daysFromNow: 20,
  },
];

const CONTEST = {
  title: 'Rayachoti New Year Contest',
  description: 'Celebrate the new year with community highlights and prizes.',
  duration: { startOffsetDays: -1, endOffsetDays: 7 },
};

const LOCAL_NEWS = [
  {
    title: 'Rayachoti Sanitation Drive',
    body: 'Municipality launches a week-long sanitation drive across all wards.',
  },
  {
    title: 'Community Health Camp',
    body: 'Free medical check-up camp organized for residents with specialist doctors.',
  },
];

async function getLocation() {
  const { rows } = await query(
    `SELECT id, name, is_active FROM locations WHERE LOWER(name) = LOWER($1)`,
    [LOCATION_NAME],
  );

  if (rows.length === 0) {
    throw new Error(`Location "${LOCATION_NAME}" not found. Please create it before running the seed.`);
  }

  const location = rows[0];

  if (location.is_active === false) {
    await query('UPDATE locations SET is_active = true WHERE id = $1', [location.id]);
    console.log(`Re-activated location ${location.name}`);
  }

  return location;
}

async function ensureUser(definition, locationId) {
  const existing = await query(
    `SELECT id, role, location_id, approval_status, is_active, password_hash, name
     FROM users WHERE phone = $1`,
    [definition.phone],
  );

  if (existing.rowCount > 0) {
    const user = existing.rows[0];
    const updates = [];
    const params = [];
    let idx = 1;

    const passwordMatches = await comparePassword(definition.password, user.password_hash).catch(() => false);
    if (!passwordMatches) {
      const newHash = await hashPassword(definition.password);
      updates.push(`password_hash = $${idx}`);
      params.push(newHash);
      idx += 1;
    }

    if (user.role !== definition.role) {
      updates.push(`role = $${idx}`);
      params.push(definition.role);
      idx += 1;
    }

    if (user.location_id !== locationId) {
      updates.push(`location_id = $${idx}`);
      params.push(locationId);
      idx += 1;
    }

    if (user.approval_status !== 'APPROVED') {
      updates.push(`approval_status = 'APPROVED'`);
    }

    if (user.is_active !== true) {
      updates.push(`is_active = true`);
    }

    if (definition.name && user.name !== definition.name) {
      updates.push(`name = $${idx}`);
      params.push(definition.name);
      idx += 1;
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(user.id);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`;
      const res = await query(sql, params);
      console.log(`Updated user ${definition.phone} (${definition.role})`);
      return res.rows[0].id;
    }

    console.log(`User ${definition.phone} (${definition.role}) already present`);
    return user.id;
  }

  const passwordHash = await hashPassword(definition.password);
  const insertSql = `
    INSERT INTO users (name, phone, password_hash, role, location_id, approval_status, is_active)
    VALUES ($1, $2, $3, $4, $5, 'APPROVED', true)
    RETURNING id
  `;

  const { rows } = await query(insertSql, [
    definition.name,
    definition.phone,
    passwordHash,
    definition.role,
    locationId,
  ]);

  console.log(`Inserted user ${definition.phone} (${definition.role})`);
  return rows[0].id;
}

async function ensureShop(shopDefinition, ownerId, locationId) {
  const existing = await query(
    `SELECT id, location_id, approval_status, is_open, is_hidden, delivery_fee, description
     FROM shops WHERE owner_id = $1 AND LOWER(name) = LOWER($2)`,
    [ownerId, shopDefinition.name],
  );

  if (existing.rowCount > 0) {
    const shop = existing.rows[0];
    const updates = [];
    const params = [];
    let idx = 1;

    if (shop.location_id !== locationId) {
      updates.push(`location_id = $${idx}`);
      params.push(locationId);
      idx += 1;
    }

    if (shop.approval_status !== 'APPROVED') {
      updates.push(`approval_status = 'APPROVED'`);
    }

    if (shop.is_open !== true) {
      updates.push(`is_open = true`);
    }

    if (shop.is_hidden !== false) {
      updates.push(`is_hidden = false`);
    }

    if (Number(shop.delivery_fee) !== Number(shopDefinition.delivery_fee)) {
      updates.push(`delivery_fee = $${idx}`);
      params.push(shopDefinition.delivery_fee);
      idx += 1;
    }

    if (shop.description !== shopDefinition.description) {
      updates.push(`description = $${idx}`);
      params.push(shopDefinition.description);
      idx += 1;
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(shop.id);
      const sql = `UPDATE shops SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`;
      const res = await query(sql, params);
      console.log(`Updated shop ${shopDefinition.name}`);
      return res.rows[0].id;
    }

    console.log(`Shop ${shopDefinition.name} already present`);
    return shop.id;
  }

  const insertSql = `
    INSERT INTO shops (name, description, owner_id, location_id, approval_status, is_open, is_hidden, delivery_fee)
    VALUES ($1, $2, $3, $4, 'APPROVED', true, false, $5)
    RETURNING id
  `;

  const { rows } = await query(insertSql, [
    shopDefinition.name,
    shopDefinition.description,
    ownerId,
    locationId,
    shopDefinition.delivery_fee,
  ]);

  console.log(`Inserted shop ${shopDefinition.name}`);
  return rows[0].id;
}

async function ensureProduct(product, shopId, locationId) {
  const existing = await query(
    `SELECT id, price, is_available, location_id, deleted_at, description
     FROM products WHERE shop_id = $1 AND LOWER(name) = LOWER($2)` ,
    [shopId, product.name],
  );

  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    const updates = [];
    const params = [];
    let idx = 1;

    if (Number(row.price) !== Number(product.price)) {
      updates.push(`price = $${idx}`);
      params.push(product.price);
      idx += 1;
    }

    if (row.is_available !== true) {
      updates.push('is_available = true');
    }

    if (row.location_id !== locationId) {
      updates.push(`location_id = $${idx}`);
      params.push(locationId);
      idx += 1;
    }

    if (row.deleted_at !== null) {
      updates.push('deleted_at = NULL');
    }

    if (row.description !== product.description) {
      updates.push(`description = $${idx}`);
      params.push(product.description);
      idx += 1;
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(row.id);
      const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`;
      const res = await query(sql, params);
      console.log(`Updated product ${product.name}`);
      return res.rows[0].id;
    }

    console.log(`Product ${product.name} already present`);
    return row.id;
  }

  const insertSql = `
    INSERT INTO products (shop_id, location_id, name, description, price, is_available, deleted_at)
    VALUES ($1, $2, $3, $4, $5, true, NULL)
    RETURNING id
  `;

  const { rows } = await query(insertSql, [
    shopId,
    locationId,
    product.name,
    product.description,
    product.price,
  ]);

  console.log(`Inserted product ${product.name}`);
  return rows[0].id;
}

async function ensureServiceCategories(locationId) {
  for (const category of SERVICE_CATEGORIES) {
    const sql = `
      INSERT INTO service_categories (location_id, name, description, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (location_id, name) DO UPDATE
        SET description = EXCLUDED.description,
            is_active = true
    `;

    await query(sql, [locationId, category.name, category.description]);
    console.log(`Ensured service category ${category.name}`);
  }
}

function daysFromNow(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now;
}

async function ensureEvents(locationId, creatorId) {
  for (const event of EVENTS) {
    const targetDate = daysFromNow(event.daysFromNow);
    const existing = await query(
      `SELECT id FROM events WHERE location_id = $1 AND LOWER(title) = LOWER($2)` ,
      [locationId, event.title],
    );

    if (existing.rowCount > 0) {
      const sql = `
        UPDATE events
        SET description = $1,
            event_type = $2,
            event_date = $3,
            venue = $4,
            capacity = $5,
            created_by = $6,
            is_active = true,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = $7
        RETURNING id
      `;

      await query(sql, [
        event.description,
        event.event_type,
        targetDate,
        event.venue,
        event.capacity,
        creatorId,
        existing.rows[0].id,
      ]);

      console.log(`Updated event ${event.title}`);
    } else {
      const sql = `
        INSERT INTO events (location_id, title, description, event_type, event_date, venue, capacity, created_by, is_active, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NULL)
        RETURNING id
      `;

      await query(sql, [
        locationId,
        event.title,
        event.description,
        event.event_type,
        targetDate,
        event.venue,
        event.capacity,
        creatorId,
      ]);

      console.log(`Inserted event ${event.title}`);
    }
  }
}

async function ensureContest(locationId, creatorId) {
  const startsAt = daysFromNow(CONTEST.duration.startOffsetDays);
  const endsAt = daysFromNow(CONTEST.duration.endOffsetDays);

  const existing = await query(
    `SELECT id FROM contests WHERE location_id = $1 AND LOWER(title) = LOWER($2)` ,
    [locationId, CONTEST.title],
  );

  if (existing.rowCount > 0) {
    const sql = `
      UPDATE contests
      SET description = $1,
          starts_at = $2,
          ends_at = $3,
          created_by = $4,
          is_active = true,
          deleted_at = NULL,
          updated_at = NOW()
      WHERE id = $5
    `;

    await query(sql, [
      CONTEST.description,
      startsAt,
      endsAt,
      creatorId,
      existing.rows[0].id,
    ]);

    console.log(`Updated contest ${CONTEST.title}`);
  } else {
    const sql = `
      INSERT INTO contests (location_id, title, description, starts_at, ends_at, created_by, is_active, deleted_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NULL)
      RETURNING id
    `;

    await query(sql, [
      locationId,
      CONTEST.title,
      CONTEST.description,
      startsAt,
      endsAt,
      creatorId,
    ]);

    console.log(`Inserted contest ${CONTEST.title}`);
  }
}

async function ensureLocalNews(locationId, creatorId) {
  for (const news of LOCAL_NEWS) {
    const existing = await query(
      `SELECT id FROM local_news WHERE location_id = $1 AND LOWER(title) = LOWER($2)` ,
      [locationId, news.title],
    );

    if (existing.rowCount > 0) {
      const sql = `
        UPDATE local_news
        SET body = $1,
            created_by = $2,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = $3
      `;

      await query(sql, [news.body, creatorId, existing.rows[0].id]);
      console.log(`Updated local news ${news.title}`);
    } else {
      const sql = `
        INSERT INTO local_news (location_id, title, body, created_by, deleted_at)
        VALUES ($1, $2, $3, $4, NULL)
      `;

      await query(sql, [locationId, news.title, news.body, creatorId]);
      console.log(`Inserted local news ${news.title}`);
    }
  }
}

function printSummary(users, shops) {
  console.log('\n### SEEDED CREDENTIALS');
  const findUser = (key) => users.find((u) => u.definition.key === key);

  const superAdmin = findUser('SUPER_ADMIN');
  const localAdmin = findUser('LOCAL_ADMIN');
  const businessUsers = users.filter((u) => u.definition.role === 'BUSINESS');
  const normalUsers = users.filter((u) => u.definition.role === 'USER');

  console.log('SUPER_ADMIN:');
  console.log(`- phone: ${superAdmin.definition.phone}`);
  console.log(`- password: ${superAdmin.definition.password}`);
  console.log('\nLOCAL_ADMIN:');
  console.log(`- phone: ${localAdmin.definition.phone}`);
  console.log(`- password: ${localAdmin.definition.password}`);

  console.log('\nBUSINESS USERS:');
  businessUsers.forEach((u) => {
    console.log(`- ${u.definition.phone} / ${u.definition.password}`);
  });

  console.log('\nNORMAL USERS:');
  normalUsers.forEach((u) => {
    console.log(`- ${u.definition.phone} / ${u.definition.password}`);
  });

  console.log('\nSHOPS:');
  shops.forEach((shop) => {
    console.log(`- ${shop.id} | ${shop.definition.name} | owner ${shop.ownerPhone}`);
  });
}

async function main() {
  try {
    console.log('Starting full development data seed...');

    const location = await getLocation();
    console.log(`Using location ${location.name} (${location.id})`);

    const seededUsers = [];
    for (const userDef of USER_DEFINITIONS) {
      const id = await ensureUser(userDef, location.id);
      seededUsers.push({ definition: userDef, id });
    }

    const userByPhone = new Map(seededUsers.map((u) => [u.definition.phone, u]));

    const seededShops = [];
    for (const shopDef of SHOP_DEFINITIONS) {
      const owner = userByPhone.get(shopDef.ownerPhone);
      if (!owner) {
        throw new Error(`Owner with phone ${shopDef.ownerPhone} not found among seeded users.`);
      }

      const shopId = await ensureShop(shopDef, owner.id, location.id);
      seededShops.push({ id: shopId, definition: shopDef, ownerPhone: shopDef.ownerPhone });

      for (const product of shopDef.products) {
        await ensureProduct(product, shopId, location.id);
      }
    }

    const localAdmin = seededUsers.find((u) => u.definition.key === 'LOCAL_ADMIN');
    if (!localAdmin) {
      throw new Error('Local admin not seeded. Cannot proceed with admin-owned data.');
    }

    await ensureServiceCategories(location.id);
    await ensureEvents(location.id, localAdmin.id);
    await ensureContest(location.id, localAdmin.id);
    await ensureLocalNews(location.id, localAdmin.id);

    printSummary(seededUsers, seededShops);
    console.log('\nSeed completed successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
