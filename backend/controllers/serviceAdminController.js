const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');
const { parseLimit, parseCursor, makeNextCursor } = require('../utils/pagination');

exports.getOpenTypeARequests = async (req, res) => {
    try {
        const locationId = req.locationId;
        const cursorParam = req.query.cursor;

        if (cursorParam) {
            const limit = parseLimit(req.query.limit);
            const cursor = parseCursor(cursorParam);
            if (!cursor) return res.status(400).json({ error: 'Invalid cursor format' });

            const sql = `
                SELECT 
                    sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at,
                    u.name as requester_name, u.phone as requester_phone,
                    sc.name as category_name
                FROM service_requests sr
                JOIN users u ON sr.requester_id = u.id
                JOIN service_categories sc ON sr.category_id = sc.id
                WHERE sr.location_id = $1
                  AND sr.category_id IS NOT NULL
                  AND sr.status = 'OPEN'
                  AND sr.expires_at > NOW()
                  AND (sr.created_at, sr.id) < ($2::timestamptz, $3::uuid)
                ORDER BY sr.created_at DESC, sr.id DESC
                LIMIT $4
            `;
            const result = await query(sql, [locationId, cursor.created_at, cursor.id, limit]);
            return res.json({ data: result.rows, nextCursor: makeNextCursor(result.rows, limit) });
        }

        // Legacy behavior (Array response)
        const sql = `
            SELECT 
                sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at,
                u.name as requester_name, u.phone as requester_phone,
                sc.name as category_name
            FROM service_requests sr
            JOIN users u ON sr.requester_id = u.id
            JOIN service_categories sc ON sr.category_id = sc.id
            WHERE sr.location_id = $1
              AND sr.category_id IS NOT NULL
              AND sr.status = 'OPEN'
              AND sr.expires_at > NOW()
            ORDER BY sr.created_at ASC
        `;

        const result = await query(sql, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching open Type A requests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.assignProvider = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { provider_user_id, note } = req.body;
        const locationId = req.locationId;
        const adminId = req.user.user_id;

        // 1. Validate provider_user_id exists
        if (!provider_user_id) {
            return res.status(400).json({ error: 'provider_user_id is required' });
        }

        const providerCheck = await query('SELECT id FROM users WHERE id = $1', [provider_user_id]);
        if (providerCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Provider user not found' });
        }

        // 2. Check assignment limit
        const limitQuery = `
            SELECT COUNT(*)::int as count FROM service_assignment_history
            WHERE request_id = $1 AND location_id = $2
        `;
        const limitRes = await query(limitQuery, [requestId, locationId]);
        if (limitRes.rows[0].count >= 3) {
            return res.status(409).json({ error: "Assignment limit reached for this request" });
        }

        // 3. Fetch current state for audit (before update)
        const currentQuery = `
            SELECT assigned_user_id, status 
            FROM service_requests 
            WHERE id = $1 AND location_id = $2
        `;
        const currentRes = await query(currentQuery, [requestId, locationId]);
        
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Service request not found' });
        }
        
        const oldProviderId = currentRes.rows[0].assigned_user_id;

        // 4. Atomic Update
        const updateQuery = `
            UPDATE service_requests
            SET assigned_user_id = $1, status = 'ASSIGNED', updated_at = NOW(), assigned_at = NOW()
            WHERE id = $2 AND location_id = $3 AND status IN ('OPEN', 'ASSIGNED')
            RETURNING *
        `;

        const result = await query(updateQuery, [provider_user_id, requestId, locationId]);
        
        if (result.rows.length === 0) {
            const check = await query('SELECT id, status, expires_at FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Service request not found' });
            if (new Date(check.rows[0].expires_at) <= new Date()) return res.status(409).json({ error: 'Request has expired' });
            return res.status(409).json({ error: `Invalid state transition. Current status: ${check.rows[0].status}` });
        }

        // 5. Insert Audit Log
        const auditQuery = `
            INSERT INTO service_assignment_history 
            (request_id, location_id, assigned_by_admin_id, old_provider_user_id, new_provider_user_id, note)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await query(auditQuery, [requestId, locationId, adminId, oldProviderId, provider_user_id, note || null]);

        res.json(result.rows[0]);

        // Send Notification to Provider
        try {
            const providerQuery = `SELECT phone FROM users WHERE id = $1`;
            const providerRes = await query(providerQuery, [provider_user_id]);
            if (providerRes.rows.length > 0) {
                await sendNotification({ userId: provider_user_id, locationId, phone: providerRes.rows[0].phone, type: 'SERVICE_ASSIGNED', message: 'Manacity: You have been assigned a service request. Please open the app.' });
            }
        } catch (notifyErr) {
            console.error('Error sending assignment notification:', notifyErr);
        }

    } catch (err) {
        console.error('Error assigning provider:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Reassign uses the same logic as assignProvider
exports.reassignProvider = exports.assignProvider;

exports.getAssignmentHistory = async (req, res) => {
    try {
        const { requestId } = req.params;
        const locationId = req.locationId;

        const queryStr = `
            SELECT 
                sah.id, sah.created_at, sah.note,
                admin.name as admin_name,
                old_p.name as old_provider_name,
                new_p.name as new_provider_name
            FROM service_assignment_history sah
            JOIN users admin ON sah.assigned_by_admin_id = admin.id
            LEFT JOIN users old_p ON sah.old_provider_user_id = old_p.id
            JOIN users new_p ON sah.new_provider_user_id = new_p.id
            WHERE sah.request_id = $1 AND sah.location_id = $2
            ORDER BY sah.created_at DESC
        `;

        const result = await query(queryStr, [requestId, locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching assignment history:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getAllRequests = async (req, res) => {
    try {
        const locationId = req.locationId;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;

        // Count total
        const countQuery = `
            SELECT COUNT(*)::int as total
            FROM service_requests
            WHERE location_id = $1
        `;
        const countRes = await query(countQuery, [locationId]);
        const total = countRes.rows[0].total;

        const query = `
            SELECT 
                sr.id, sr.request_text, sr.status, sr.created_at, sr.expires_at, sr.is_public,
                u.name as requester_name, u.phone as requester_phone,
                sc.name as category_name,
                p.name as provider_name
            FROM service_requests sr
            JOIN users u ON sr.requester_id = u.id
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            LEFT JOIN users p ON sr.assigned_user_id = p.id
            WHERE sr.location_id = $1
            ORDER BY sr.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await query(query, [locationId, limit, offset]);

        res.json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                hasMore: (offset + result.rows.length) < total
            }
        });

    } catch (err) {
        console.error('Error fetching all requests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.adminCancelRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const locationId = req.locationId;

        const updateQuery = `
            UPDATE service_requests 
            SET status = 'CANCELLED_BY_ADMIN', updated_at = NOW(), closed_at = NOW() 
            WHERE id = $1 AND location_id = $2 AND status IN ('OPEN', 'ASSIGNED', 'ACCEPTED')
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [requestId, locationId]);

        if (updateRes.rows.length === 0) {
            const check = await query('SELECT id, status FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
            return res.status(409).json({ error: `Cannot cancel request in status ${check.rows[0].status}` });
        }
        res.json(updateRes.rows[0]);
    } catch (err) {
        console.error('Error cancelling request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getServiceDashboard = async (req, res) => {
    try {
        const locationId = req.locationId;
        const { status, type, assigned, overdue, page = 1, limit = 20 } = req.query;

        const offset = (page - 1) * limit;
        const params = [locationId];
        let paramIdx = 2;

        let whereClause = `WHERE sr.location_id = $1`;

        if (status) {
            whereClause += ` AND sr.status = $${paramIdx++}`;
            params.push(status);
        }

        if (type === 'TYPE_A') {
            whereClause += ` AND sr.category_id IS NOT NULL`;
        } else if (type === 'TYPE_B') {
            whereClause += ` AND sr.category_id IS NULL`;
        }

        if (assigned === 'true') {
            whereClause += ` AND sr.assigned_user_id IS NOT NULL`;
        } else if (assigned === 'false') {
            whereClause += ` AND sr.assigned_user_id IS NULL`;
        }

        if (overdue === 'true') {
            whereClause += ` AND sr.expires_at < NOW() AND sr.status NOT IN ('COMPLETED', 'CANCELLED', 'CANCELLED_BY_USER', 'CANCELLED_BY_ADMIN')`;
        }

        // 1. Count Total
        const countQuery = `
            SELECT COUNT(*)::int as total
            FROM service_requests sr
            ${whereClause}
        `;
        const countRes = await query(countQuery, params);
        const total = countRes.rows[0].total;

        // 2. Fetch Data
        const dataQuery = `
            SELECT
                sr.id,
                CASE WHEN sr.category_id IS NOT NULL THEN 'TYPE_A' ELSE 'TYPE_B' END as type,
                sr.status,
                sr.created_at,
                sr.expires_at,
                sc.name as category_name,
                u.name as requester_name,
                u.phone as requester_phone,
                p.name as provider_name,
                p.phone as provider_phone,
                COUNT(so.id)::int as offers_count,
                (sr.expires_at < NOW() AND sr.status NOT IN ('COMPLETED', 'CANCELLED', 'CANCELLED_BY_USER', 'CANCELLED_BY_ADMIN')) as is_overdue
            FROM service_requests sr
            JOIN users u ON sr.requester_id = u.id
            LEFT JOIN users p ON sr.assigned_user_id = p.id
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            LEFT JOIN service_offers so ON sr.id = so.request_id
            ${whereClause}
            GROUP BY sr.id, u.id, p.id, sc.id
            ORDER BY sr.created_at DESC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `;

        const result = await query(dataQuery, [...params, limit, offset]);

        res.json({
            data: result.rows,
            meta: { page: parseInt(page), limit: parseInt(limit), total }
        });
    } catch (err) {
        console.error('Error fetching service dashboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};