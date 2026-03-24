const { query } = require('../../config/db');
const { resolveQuery, normalizeQuery } = require('../../services/queryResolver');
const { transcribeVoiceFile } = require('../../services/voiceTranscriptionService');
const { normalizeVoiceQuery } = require('../../services/voiceQueryNormalizer');
const { createError } = require('../../utils/errors');

async function tableExists(tableName) {
    const existsQuery = `
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists
    `;
    const result = await query(existsQuery, [tableName]);
    return Boolean(result.rows[0] && result.rows[0].exists);
}

async function tableHasColumn(tableName, columnName) {
    const columnQuery = `
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
        ) AS exists
    `;
    const result = await query(columnQuery, [tableName, columnName]);
    return Boolean(result.rows[0] && result.rows[0].exists);
}

function buildSearchTerms(rawQuery, resolved) {
    const normalizedQuery = normalizeQuery(rawQuery);
    const synonymTerms = Array.isArray(resolved.synonyms) ? resolved.synonyms : [];

    const normalizedSynonyms = synonymTerms
        .map((term) => normalizeQuery(term))
        .filter(Boolean);

    const fallbackTerms = resolved.source === 'none' && normalizedQuery
        ? [normalizedQuery]
        : [];

    const terms = Array.from(new Set([...normalizedSynonyms, ...fallbackTerms]));
    return terms;
}

async function runResolvedSearch({
    req,
    inputQuery,
    mode,
    transcript,
    normalizedQueryOverride
}) {
    const requestId = req.request_id || req.get('X-Request-Id');
    const userId = req.user ? req.user.user_id : null;
    const locationId = req.locationId;

    if (!locationId) {
        throw createError(400, 'LOCATION_MISSING', 'Location context is required');
    }

    const resolved = resolveQuery(inputQuery);
    const searchTerms = buildSearchTerms(inputQuery, resolved);
    const likePatterns = searchTerms.map((term) => `%${term}%`);

    if (likePatterns.length === 0) {
        return {
            transcript,
            normalized_query: normalizedQueryOverride,
            query: inputQuery,
            mode,
            resolved,
            products_grouped: [],
            matching_shops: [],
            matching_services: []
        };
    }

    const [
        hasProductAvailabilityColumn,
        hasProductStockColumn,
        hasShopsTable,
        hasServicesTable,
        hasServiceNameColumn,
        hasServiceLocationColumn,
        hasServiceActiveColumn
    ] = await Promise.all([
        tableHasColumn('products', 'is_available'),
        tableHasColumn('products', 'stock_quantity'),
        tableExists('shops'),
        tableExists('service_categories'),
        tableHasColumn('service_categories', 'name'),
        tableHasColumn('service_categories', 'location_id'),
        tableHasColumn('service_categories', 'is_active')
    ]);

    const availabilityFilter = hasProductAvailabilityColumn ? 'AND p.is_available = true' : '';
    const stockFilter = hasProductStockColumn ? 'AND p.stock_quantity > 0' : '';

    const productsSql = `
        SELECT
            p.id,
            p.name,
            p.price,
            p.stock_quantity,
            s.id AS shop_id,
            s.name AS shop_name,
            s.is_open AS shop_is_open
        FROM products p
        JOIN shops s ON s.id = p.shop_id
        WHERE p.location_id = $1
          AND s.location_id = $1
          AND p.deleted_at IS NULL
          AND s.deleted_at IS NULL
          ${stockFilter}
          ${availabilityFilter}
          AND p.name ILIKE ANY($2::text[])
        ORDER BY s.name ASC, p.name ASC
    `;

    const productsResult = await query(productsSql, [locationId, likePatterns]);

    const groupedMap = new Map();
    productsResult.rows.forEach((row) => {
        if (!groupedMap.has(row.shop_id)) {
            groupedMap.set(row.shop_id, {
                shop: {
                    id: row.shop_id,
                    name: row.shop_name,
                    is_open: typeof row.shop_is_open === 'boolean' ? row.shop_is_open : null
                },
                products: []
            });
        }

        groupedMap.get(row.shop_id).products.push({
            id: row.id,
            name: row.name,
            price: row.price,
            stock_quantity: row.stock_quantity
        });
    });

    const productsGrouped = Array.from(groupedMap.values());

    let matchingShops = [];
    if (hasShopsTable) {
        const shopsSql = `
            SELECT s.id, s.name, s.is_open
            FROM shops s
            WHERE s.location_id = $1
              AND s.deleted_at IS NULL
              AND s.name ILIKE ANY($2::text[])
            ORDER BY s.name ASC
        `;
        const shopsResult = await query(shopsSql, [locationId, likePatterns]);
        matchingShops = shopsResult.rows.map((shop) => ({
            id: shop.id,
            name: shop.name,
            is_open: typeof shop.is_open === 'boolean' ? shop.is_open : null
        }));
    }

    let matchingServices = [];
    if (hasServicesTable && hasServiceNameColumn && hasServiceLocationColumn) {
        const activeFilter = hasServiceActiveColumn ? 'AND sc.is_active = true' : '';
        const servicesSql = `
            SELECT sc.id, sc.name
            FROM service_categories sc
            WHERE sc.location_id = $1
              ${activeFilter}
              AND sc.name ILIKE ANY($2::text[])
            ORDER BY sc.name ASC
        `;

        try {
            const servicesResult = await query(servicesSql, [locationId, likePatterns]);
            matchingServices = servicesResult.rows;
        } catch (serviceError) {
            console.error(JSON.stringify({
                level: 'error',
                request_id: requestId,
                user_id: userId,
                reason: 'MOBILE_SEARCH_SERVICES_LOOKUP_FAILED'
            }));
            matchingServices = [];
        }
    }

    return {
        transcript,
        normalized_query: normalizedQueryOverride,
        query: inputQuery,
        mode,
        resolved,
        products_grouped: productsGrouped,
        matching_shops: matchingShops,
        matching_services: matchingServices
    };
}

exports.search = async (req, res, next) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const mode = typeof req.query.mode === 'string' && req.query.mode
            ? req.query.mode
            : 'products';

        const responsePayload = await runResolvedSearch({
            req,
            inputQuery: q,
            mode,
            transcript: undefined,
            normalizedQueryOverride: undefined
        });

        return res.status(200).json(responsePayload);
    } catch (error) {
        console.error(JSON.stringify({
            level: 'error',
            request_id: req.request_id || req.get('X-Request-Id'),
            user_id: req.user ? req.user.user_id : null,
            reason: 'MOBILE_SEARCH_FAILED'
        }));
        return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.voiceSearch = async (req, res, next) => {
    try {
        const transcript = await transcribeVoiceFile(req.file);
        const normalizedQuery = normalizeVoiceQuery(transcript);
        const mode = 'products';

        console.info(JSON.stringify({
            level: 'info',
            request_id: req.request_id || req.get('X-Request-Id'),
            user_id: req.user ? req.user.user_id : null,
            transcript_length: transcript.length,
            normalized_query: normalizedQuery,
            reason: 'MOBILE_VOICE_SEARCH_TRANSCRIBED'
        }));

        const responsePayload = await runResolvedSearch({
            req,
            inputQuery: normalizedQuery,
            mode,
            transcript,
            normalizedQueryOverride: normalizedQuery
        });

        return res.status(200).json(responsePayload);
    } catch (error) {
        if (error && error.code && [
            'VOICE_AUDIO_REQUIRED',
            'VOICE_AUDIO_INVALID',
            'VOICE_TRANSCRIPTION_FAILED',
            'LOCATION_MISSING'
        ].includes(error.code)) {
            return next(error);
        }

        console.error(JSON.stringify({
            level: 'error',
            request_id: req.request_id || req.get('X-Request-Id'),
            user_id: req.user ? req.user.user_id : null,
            reason: 'MOBILE_VOICE_SEARCH_FAILED'
        }));

        return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

module.exports.runResolvedSearch = runResolvedSearch;
