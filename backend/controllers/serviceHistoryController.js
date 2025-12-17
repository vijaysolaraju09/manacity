const { pool } = require('../config/db');
const { query } = require('../config/db'); // Use query instead of pool
const { parseLimit, parseCursor, makeNextCursor } = require('../utils/pagination');

exports.getMyServiceHistory = async (req, res) => {
    try {
        const { user_id } = req.user;
        const locationId = req.locationId;
        const cursorParam = req.query.cursor;

        if (cursorParam) {
            const limit = parseLimit(req.query.limit);
            const cursor = parseCursor(cursorParam);
            if (!cursor) return res.status(400).json({ error: 'Invalid cursor format' });

            const sql = `
                SELECT
                    sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at, sr.is_public, sr.category_id,
                    sc.name as category_name,
                    p.name as provider_name,
                    CASE WHEN sr.status IN ('ASSIGNED', 'COMPLETED') THEN p.phone ELSE NULL END as provider_phone,
                    (SELECT COUNT(*)::int FROM service_offers so WHERE so.request_id = sr.id) as offers_count
                FROM service_requests sr
                LEFT JOIN service_categories sc ON sr.category_id = sc.id
                LEFT JOIN users p ON sr.assigned_user_id = p.id
                WHERE sr.location_id = $1 AND sr.requester_id = $2
                  AND (sr.created_at, sr.id) < ($3::timestamptz, $4::uuid)
                ORDER BY sr.created_at DESC, sr.id DESC
                LIMIT $5
            `;
            const result = await query(sql, [locationId, user_id, cursor.created_at, cursor.id, limit]);
            return res.json({ data: result.rows, nextCursor: makeNextCursor(result.rows, limit) });
        }

        // Legacy behavior
        const sql = `
            SELECT
                sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at, sr.is_public, sr.category_id,
                sc.name as category_name,
                p.name as provider_name,
                CASE
                    WHEN sr.status IN ('ASSIGNED', 'COMPLETED') THEN p.phone
                    ELSE NULL
                END as provider_phone,
                (SELECT COUNT(*)::int FROM service_offers so WHERE so.request_id = sr.id) as offers_count
            FROM service_requests sr
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            LEFT JOIN users p ON sr.assigned_user_id = p.id
            WHERE sr.location_id = $1 AND sr.requester_id = $2
            ORDER BY sr.created_at DESC
        `;

        const result = await query(sql, [locationId, user_id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching my service history:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getAdminServiceHistory = async (req, res) => {
    try {
        const locationId = req.locationId;
        const { status, type } = req.query;
        const cursorParam = req.query.cursor;
        const limit = parseLimit(req.query.limit);

        let sql = `
            SELECT
                sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at, sr.is_public, sr.category_id,
                r.name as requester_name, r.phone as requester_phone,
                p.name as provider_name, p.phone as provider_phone,
                sc.name as category_name
            FROM service_requests sr
            JOIN users r ON sr.requester_id = r.id
            LEFT JOIN users p ON sr.assigned_user_id = p.id
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            WHERE sr.location_id = $1
        `;

        const params = [locationId];
        let paramIdx = 2;

        if (status) {
            sql += ` AND sr.status = $${paramIdx++}`;
            params.push(status);
        }

        if (type === 'TYPE_A') {
            sql += ` AND sr.category_id IS NOT NULL`;
        } else if (type === 'TYPE_B') {
            sql += ` AND sr.category_id IS NULL`;
        }

        if (cursorParam) {
            const cursor = parseCursor(cursorParam);
            if (!cursor) return res.status(400).json({ error: 'Invalid cursor format' });
            
            sql += ` AND (sr.created_at, sr.id) < ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
            params.push(cursor.created_at, cursor.id);
            paramIdx += 2;
            
            sql += ` ORDER BY sr.created_at DESC, sr.id DESC LIMIT $${paramIdx}`;
            params.push(limit);

            const result = await query(sql, params);
            return res.json({ data: result.rows, nextCursor: makeNextCursor(result.rows, limit) });
        }

        // Legacy behavior (no cursor)
        sql += ` ORDER BY sr.created_at DESC`;
        const result = await query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching admin service history:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};