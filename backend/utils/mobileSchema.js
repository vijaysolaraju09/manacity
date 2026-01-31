const { query } = require('../config/db');

// Cache table columns to avoid repeated information_schema lookups at runtime.
const tableColumnCache = new Map();

const TABLE_FALLBACKS = {
  shops: {
    address: 'NULL::text',
    phone: 'NULL::text',
    image_url: 'NULL::text',
    category: 'NULL::text',
    delivery_enabled: 'false::boolean',
    pickup_enabled: 'false::boolean',
    delivery_fee: '0::numeric',
    location_id: 'NULL::uuid',
    owner_id: 'NULL::uuid',
  },
  products: {
    image_url: 'NULL::text',
    category_id: 'NULL::uuid',
    stock_quantity: '0::int',
    location_id: 'NULL::uuid',
    shop_id: 'NULL::uuid',
  },
  contests: {
    image_url: 'NULL::text',
  },
  service_categories: {
    icon_url: 'NULL::text',
  },
  services: {
    image_url: 'NULL::text',
    category: 'NULL::text',
  },
  local_news: {
    image_url: 'NULL::text',
    published_at: 'NULL::timestamptz',
  },
};

const DEFAULT_FALLBACK = 'NULL::text';

/**
 * Fetches and caches the column names for a given table using information_schema.
 * @param {string} tableName
 * @returns {Promise<Set<string>>}
 */
async function getTableColumns(tableName) {
  if (tableColumnCache.has(tableName)) {
    return tableColumnCache.get(tableName);
  }

  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
  `;

  const { rows } = await query(sql, [tableName]);
  const columnSet = new Set(rows.map((row) => row.column_name));
  tableColumnCache.set(tableName, columnSet);
  return columnSet;
}

/**
 * Builds a SELECT fragment that safely replaces missing columns with fallbacks.
 * @param {string} tableName
 * @param {Array<string|{name: string, alias?: string, fallback?: string}>} columns
 * @param {{ alias?: string }} options
 * @returns {Promise<string>}
 */
async function buildSafeSelect(tableName, columns, { alias } = {}) {
  const availableColumns = await getTableColumns(tableName);
  const tableFallbacks = TABLE_FALLBACKS[tableName] || {};

  const fragments = columns.map((col) => {
    const definition = typeof col === 'string' ? { name: col } : col;
    const columnName = definition.name;
    const outputAlias = definition.alias || columnName;
    const fallback =
      definition.fallback ||
      tableFallbacks[columnName] ||
      DEFAULT_FALLBACK;

    if (availableColumns.has(columnName)) {
      const prefix = alias ? `${alias}.` : '';
      const aliasFragment = outputAlias !== columnName ? ` AS ${outputAlias}` : '';
      return `${prefix}${columnName}${aliasFragment}`;
    }

    return `${fallback} AS ${outputAlias}`;
  });

  return fragments.join(', ');
}

/**
 * Clears the cached column list. Primarily useful for tests or diagnostics.
 */
function clearTableColumnCache() {
  tableColumnCache.clear();
}

module.exports = {
  buildSafeSelect,
  clearTableColumnCache,
  getTableColumns,
  TABLE_FALLBACKS,
};
