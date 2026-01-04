const { buildSafeSelect } = require('../../utils/mobileSchema');

const UUID_ZERO = '00000000-0000-0000-0000-000000000000';

const SHOP_DETAIL_COLUMNS = [
  'id',
  'name',
  'description',
  'address',
  'phone',
  'image_url',
  'category',
  'is_open',
  'delivery_fee',
  'delivery_enabled',
  'pickup_enabled',
  'approval_status',
  'is_hidden',
  'location_id',
  'owner_id',
];

const SHOP_HOME_COLUMNS = [
  'id',
  'name',
  'description',
  'is_open',
  'created_at',
  { name: 'category', fallback: 'NULL::text' },
  { name: 'image_url', fallback: 'NULL::text' },
];

const PRODUCT_LISTING_COLUMNS = [
  'id',
  'name',
  'description',
  'price',
  'image_url',
  'is_available',
  'category_id',
];

const PRODUCT_DETAIL_COLUMNS = [
  'id',
  'shop_id',
  'name',
  'description',
  'price',
  'image_url',
  'is_available',
  'category_id',
];

const CART_PRODUCT_COLUMNS = [
  'id',
  'name',
  'price',
  'is_available',
  'shop_id',
  { name: 'location_id', alias: 'product_location_id', fallback: 'NULL::uuid' },
];

const CART_SHOP_COLUMNS = [
  { name: 'name', alias: 'shop_name' },
  { name: 'location_id' },
  { name: 'approval_status' },
  { name: 'is_hidden' },
  { name: 'is_open' },
  { name: 'delivery_fee' },
];

const CONTEST_COLUMNS = [
  'id',
  'title',
  'starts_at',
  'ends_at',
];

const EVENT_COLUMNS = [
  { name: 'id' },
  { name: 'title' },
  { name: 'event_date', alias: 'starts_at' },
  { name: 'venue', alias: 'location_name' },
];

const SERVICE_CATEGORY_COLUMNS = [
  'id',
  'name',
  'description',
  'is_active',
  'created_at',
  'icon_url',
];

const LOCAL_NEWS_COLUMNS = [
  'id',
  'title',
  'body',
  { name: 'created_at', alias: 'published_at' },
];

const SHOP_APPROVAL_COLUMNS = [
  { name: 'id' },
  { name: 'approval_status' },
  { name: 'is_hidden' },
];

async function buildShopDetailQueries() {
  const shopSelect = await buildSafeSelect('shops', SHOP_DETAIL_COLUMNS, { alias: 's' });
  const productSelect = await buildSafeSelect('products', PRODUCT_LISTING_COLUMNS, { alias: 'p' });

  return {
    shopQuery: `
      SELECT ${shopSelect}
      FROM shops s
      WHERE s.id = $1 AND s.location_id = $2
    `,
    productsQuery: `
      SELECT ${productSelect}
      FROM products p
      WHERE p.shop_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.name ASC
    `,
  };
}

async function buildHomeQueries() {
  const shopsSelect = await buildSafeSelect('shops', SHOP_HOME_COLUMNS, { alias: 's' });
  const contestsSelect = await buildSafeSelect('contests', CONTEST_COLUMNS, { alias: 'c' });
  const eventsSelect = await buildSafeSelect('events', EVENT_COLUMNS, { alias: 'e' });
  const servicesSelect = await buildSafeSelect('service_categories', SERVICE_CATEGORY_COLUMNS, { alias: 'sc' });
  const newsSelect = await buildSafeSelect('local_news', LOCAL_NEWS_COLUMNS, { alias: 'ln' });

  return {
    shopsQuery: `
      SELECT ${shopsSelect}
      FROM shops s
      WHERE s.location_id = $1
        AND s.approval_status = 'APPROVED'
        AND s.is_hidden = false
      ORDER BY s.is_open DESC, s.created_at DESC
      LIMIT 10
    `,
    contestsQuery: `
      SELECT ${contestsSelect}
      FROM contests c
      WHERE c.location_id = $1
        AND c.is_active = true
        AND c.deleted_at IS NULL
        AND c.starts_at <= NOW()
        AND c.ends_at >= NOW()
      LIMIT 3
    `,
    eventsQuery: `
      SELECT ${eventsSelect}
      FROM events e
      WHERE e.location_id = $1
        AND e.deleted_at IS NULL
        AND e.event_date >= NOW()
      ORDER BY e.event_date ASC
      LIMIT 3
    `,
    servicesQuery: `
      SELECT ${servicesSelect}
      FROM service_categories sc
      WHERE sc.location_id = $1
        AND sc.is_active = true
      ORDER BY sc.name ASC
    `,
    newsQuery: `
      SELECT ${newsSelect}
      FROM local_news ln
      WHERE ln.location_id = $1
        AND ln.deleted_at IS NULL
      ORDER BY ln.created_at DESC
      LIMIT 5
    `,
  };
}

async function buildShopProductsQuery() {
  const productsSelect = await buildSafeSelect('products', PRODUCT_LISTING_COLUMNS, { alias: 'p' });
  return `
    SELECT ${productsSelect}
    FROM products p
    WHERE p.shop_id = $1 AND p.deleted_at IS NULL
    ORDER BY p.name ASC
  `;
}

async function buildProductDetailQuery() {
  const productsSelect = await buildSafeSelect('products', PRODUCT_DETAIL_COLUMNS, { alias: 'p' });
  const shopsSelect = await buildSafeSelect('shops', [{ name: 'name', alias: 'shop_name' }, { name: 'is_open', alias: 'shop_is_open' }], { alias: 's' });

  return `
    SELECT ${productsSelect}, ${shopsSelect}
    FROM products p
    JOIN shops s ON p.shop_id = s.id
    WHERE p.id = $1
      AND s.location_id = $2
      AND p.deleted_at IS NULL
      AND s.approval_status = 'APPROVED'
      AND s.is_hidden = false
  `;
}

async function buildCartValidationQuery() {
  const productsSelect = await buildSafeSelect('products', CART_PRODUCT_COLUMNS, { alias: 'p' });
  const shopsSelect = await buildSafeSelect('shops', CART_SHOP_COLUMNS, { alias: 's' });

  return `
    SELECT ${productsSelect}, ${shopsSelect}
    FROM products p
    JOIN shops s ON p.shop_id = s.id
    WHERE p.id = ANY($1::uuid[])
      AND p.deleted_at IS NULL
  `;
}

async function buildShopApprovalQuery() {
  const shopApprovalSelect = await buildSafeSelect('shops', SHOP_APPROVAL_COLUMNS, { alias: 's' });

  return `
    SELECT ${shopApprovalSelect}
    FROM shops s
    WHERE s.id = $1 AND s.location_id = $2
  `;
}

async function getMobileValidationQueries() {
  const { shopQuery, productsQuery } = await buildShopDetailQueries();
  const homeQueries = await buildHomeQueries();
  const shopProductsQuery = await buildShopProductsQuery();
  const productDetailQuery = await buildProductDetailQuery();
  const cartValidationQuery = await buildCartValidationQuery();
  const shopApprovalQuery = await buildShopApprovalQuery();

  return [
    { name: 'mobile.shop.details.shop', text: `${shopQuery} LIMIT 0`, values: [UUID_ZERO, UUID_ZERO] },
    { name: 'mobile.shop.details.products', text: `${productsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.home.shops', text: `${homeQueries.shopsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.home.contests', text: `${homeQueries.contestsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.home.events', text: `${homeQueries.eventsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.home.services', text: `${homeQueries.servicesQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.home.news', text: `${homeQueries.newsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.products.byShop', text: `${shopProductsQuery} LIMIT 0`, values: [UUID_ZERO] },
    { name: 'mobile.products.details', text: `${productDetailQuery} LIMIT 0`, values: [UUID_ZERO, UUID_ZERO] },
    { name: 'mobile.cart.validation', text: `${cartValidationQuery} LIMIT 0`, values: [[UUID_ZERO]] },
    { name: 'mobile.shop.approval', text: `${shopApprovalQuery} LIMIT 0`, values: [UUID_ZERO, UUID_ZERO] },
  ];
}

module.exports = {
  buildCartValidationQuery,
  buildHomeQueries,
  buildProductDetailQuery,
  buildShopApprovalQuery,
  buildShopDetailQueries,
  buildShopProductsQuery,
  CART_SHOP_COLUMNS,
  CART_PRODUCT_COLUMNS,
  PRODUCT_DETAIL_COLUMNS,
  PRODUCT_LISTING_COLUMNS,
  SHOP_DETAIL_COLUMNS,
  SHOP_HOME_COLUMNS,
  getMobileValidationQueries,
};
