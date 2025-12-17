const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');
const { parseLimit, parseCursor, makeNextCursor } = require('../utils/pagination');

exports.createTypeARequest = async (req, res) => {
    try {
        const { category_id, request_text } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // 1. Validate inputs
        if (!category_id) {
            return res.status(400).json({ error: 'category_id is required' });
        }
        if (!request_text || request_text.trim().length < 5) {
            return res.status(400).json({ error: 'request_text must be at least 5 characters long' });
        }

        // Cooldown check
        const cooldownQuery = `
            SELECT 1 FROM service_requests
            WHERE requester_id = $1
              AND location_id = $2
              AND created_at > NOW() - INTERVAL '10 minutes'
              AND status NOT IN ('CANCELLED', 'EXPIRED')
            LIMIT 1
        `;
        const cooldownRes = await query(cooldownQuery, [user_id, locationId]);
        if (cooldownRes.rows.length > 0) {
            return res.status(429).json({ error: "Please wait before creating another service request" });
        }

        // 2. Verify category exists, belongs to location, and is active
        const categoryQuery = `
            SELECT id, is_active 
            FROM service_categories 
            WHERE id = $1 AND location_id = $2
        `;
        const categoryRes = await query(categoryQuery, [category_id, locationId]);

        if (categoryRes.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found in this location' });
        }

        const category = categoryRes.rows[0];

        if (!category.is_active) {
            return res.status(409).json({ error: 'Category is inactive' });
        }

        // 3. Insert request
        const insertQuery = `
            INSERT INTO service_requests (
                location_id, requester_id, category_id, request_text,
                is_public, status, expires_at
            )
            VALUES ($1, $2, $3, $4, false, 'OPEN', NOW() + INTERVAL '24 hours')
            RETURNING *
        `;
        
        const result = await query(insertQuery, [locationId, user_id, category_id, request_text]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error creating Type A service request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getOffersForMyRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // Verify ownership
        const requestQuery = `
            SELECT id, status, assigned_user_id
            FROM service_requests
            WHERE id = $1 AND location_id = $2 AND requester_id = $3
        `;
        const requestRes = await query(requestQuery, [requestId, locationId, user_id]);

        if (requestRes.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found or access denied' });
        }

        const request = requestRes.rows[0];
        const isAssigned = request.status === 'ASSIGNED' || request.status === 'COMPLETED';

        // Fetch offers
        const offersQuery = `
            SELECT so.id, so.request_id, so.provider_user_id, so.message, so.created_at,
                   u.name as provider_name, u.phone as provider_phone
            FROM service_offers so
            JOIN users u ON so.provider_user_id = u.id
            WHERE so.request_id = $1
            ORDER BY so.created_at DESC
        `;
        const offersRes = await query(offersQuery, [requestId]);

        const offers = offersRes.rows.map(offer => {
            // Only show phone if this specific provider is the one assigned to the request
            const showPhone = isAssigned && (offer.provider_user_id === request.assigned_user_id);
            return {
                ...offer,
                provider_phone: showPhone ? offer.provider_phone : null
            };
        });

        res.json(offers);

    } catch (err) {
        console.error('Error fetching offers:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.acceptOffer = async (req, res) => {
    try {
        const { requestId, offerId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // 1. Get provider_user_id from offer
        const offerQuery = `SELECT provider_user_id FROM service_offers WHERE id = $1 AND request_id = $2`;
        const offerRes = await query(offerQuery, [offerId, requestId]);

        if (offerRes.rows.length === 0) {
            return res.status(404).json({ error: 'Offer not found for this request' });
        }
        const providerUserId = offerRes.rows[0].provider_user_id;

        // 2. Atomic Update
        const updateQuery = `
            UPDATE service_requests
            SET assigned_user_id = $1, status = 'ACCEPTED', updated_at = NOW()
            WHERE id = $2 
              AND location_id = $3 
              AND requester_id = $4 
              AND status = 'OPEN'
              AND is_public = true
              AND expires_at > NOW()
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [providerUserId, requestId, locationId, user_id]);

        if (updateRes.rows.length === 0) {
            // Error handling: determine why it failed
            const check = await query('SELECT id, requester_id, status, expires_at, is_public FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
            
            const r = check.rows[0];
            if (r.requester_id !== user_id) return res.status(403).json({ error: 'You do not own this request' });
            if (r.status !== 'OPEN') return res.status(409).json({ error: `Request is not OPEN (Status: ${r.status})` });
            if (!r.is_public) return res.status(409).json({ error: 'Request is not public' });
            if (new Date(r.expires_at) <= new Date()) return res.status(409).json({ error: 'Request has expired' });
            return res.status(409).json({ error: 'Unable to accept offer' });
        }

        res.json(updateRes.rows[0]);

    } catch (err) {
        console.error('Error accepting offer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.createTypeBRequest = async (req, res) => {
    try {
        const { request_text, visibility } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        if (!request_text || request_text.trim().length < 5) {
            return res.status(400).json({ error: 'request_text must be at least 5 characters long' });
        }
        
        let is_public = false;
        if (visibility === 'PUBLIC') is_public = true;
        else if (visibility === 'PRIVATE') is_public = false;
        else if (typeof req.body.is_public === 'boolean') is_public = req.body.is_public; // Fallback
        else {
            return res.status(400).json({ error: 'visibility must be PUBLIC or PRIVATE' });
        }

        // Cooldown check
        const cooldownQuery = `
            SELECT 1 FROM service_requests
            WHERE requester_id = $1
              AND location_id = $2
              AND created_at > NOW() - INTERVAL '10 minutes'
              AND status NOT IN ('CANCELLED', 'EXPIRED')
            LIMIT 1
        `;
        const cooldownRes = await query(cooldownQuery, [user_id, locationId]);
        if (cooldownRes.rows.length > 0) {
            return res.status(429).json({ error: "Please wait before creating another service request" });
        }

        const insertQuery = `
            INSERT INTO service_requests (
                location_id, requester_id, category_id, request_text,
                is_public, status, expires_at
            )
            VALUES ($1, $2, NULL, $3, $4, 'OPEN', NOW() + INTERVAL '24 hours')
            RETURNING *
        `;

        const result = await query(insertQuery, [locationId, user_id, request_text, is_public]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error creating Type B service request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getPublicRequests = async (req, res) => {
    try {
        const locationId = req.locationId;
        const cursorParam = req.query.cursor;

        // Cursor Pagination Path
        if (cursorParam) {
            const limit = parseLimit(req.query.limit);
            const cursor = parseCursor(cursorParam);
            if (!cursor) return res.status(400).json({ error: 'Invalid cursor format' });

            const sql = `
                SELECT sr.id, sr.request_text, sr.created_at, sr.expires_at, u.name as requester_name
                FROM service_requests sr
                JOIN users u ON sr.requester_id = u.id
                WHERE sr.location_id = $1
                  AND sr.is_public = true
                  AND sr.status = 'OPEN'
                  AND sr.expires_at > NOW()
                  AND (sr.created_at, sr.id) < ($2::timestamptz, $3::uuid)
                ORDER BY sr.created_at DESC, sr.id DESC
                LIMIT $4
            `;
            const result = await query(sql, [locationId, cursor.created_at, cursor.id, limit]);
            return res.json({ data: result.rows, nextCursor: makeNextCursor(result.rows, limit) });
        }

        // Offset Pagination Path (Legacy/Default)
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;

        // Count total
        const countQuery = `
            SELECT COUNT(*)::int as total
            FROM service_requests
            WHERE location_id = $1
              AND is_public = true
              AND status = 'OPEN'
              AND expires_at > NOW()
        `;
        const countRes = await query(countQuery, [locationId]);
        const total = countRes.rows[0].total;

        const query = `
            SELECT sr.id, sr.request_text, sr.created_at, sr.expires_at, u.name as requester_name
            FROM service_requests sr
            JOIN users u ON sr.requester_id = u.id
            WHERE sr.location_id = $1
              AND sr.is_public = true
              AND sr.status = 'OPEN'
              AND sr.expires_at > NOW()
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
        console.error('Error fetching public requests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getMyRequests = async (req, res) => {
    try {
        const { user_id } = req.user;
        const locationId = req.locationId;
        const cursorParam = req.query.cursor;

        // Cursor Pagination Path
        if (cursorParam) {
            const limit = parseLimit(req.query.limit);
            const cursor = parseCursor(cursorParam);
            if (!cursor) return res.status(400).json({ error: 'Invalid cursor format' });

            const sql = `
                SELECT sr.*, sc.name as category_name
                FROM service_requests sr
                LEFT JOIN service_categories sc ON sr.category_id = sc.id
                WHERE sr.location_id = $1
                  AND sr.requester_id = $2
                  AND (sr.created_at, sr.id) < ($3::timestamptz, $4::uuid)
                ORDER BY sr.created_at DESC, sr.id DESC
                LIMIT $5
            `;
            const result = await query(sql, [locationId, user_id, cursor.created_at, cursor.id, limit]);
            return res.json({ data: result.rows, nextCursor: makeNextCursor(result.rows, limit) });
        }

        // Offset Pagination Path (Legacy/Default)
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = (page - 1) * limit;

        // Count total
        const countQuery = `
            SELECT COUNT(*)::int as total
            FROM service_requests
            WHERE location_id = $1 AND requester_id = $2
        `;
        const countRes = await query(countQuery, [locationId, user_id]);
        const total = countRes.rows[0].total;

        const query = `
            SELECT sr.*, sc.name as category_name
            FROM service_requests sr
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            WHERE sr.location_id = $1
              AND sr.requester_id = $2
            ORDER BY sr.created_at DESC
            LIMIT $3 OFFSET $4
        `;

        const result = await query(query, [locationId, user_id, limit, offset]);
        res.json({
            data: result.rows,
            pagination: {
                page, limit, total, hasMore: (offset + result.rows.length) < total
            }
        });
    } catch (err) {
        console.error('Error fetching my requests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.acceptService = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        const updateQuery = `
            UPDATE service_requests 
            SET status = 'ACCEPTED', updated_at = NOW() 
            WHERE id = $1 
              AND location_id = $2 
              AND status = 'ASSIGNED' 
              AND assigned_user_id = $3
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [requestId, locationId, user_id]);

        if (updateRes.rows.length === 0) {
            const check = await query('SELECT id, status, assigned_user_id FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
            if (check.rows[0].assigned_user_id !== user_id) return res.status(403).json({ error: 'You are not the assigned provider' });
            return res.status(409).json({ error: `Request is not ASSIGNED (Status: ${check.rows[0].status})` });
        }
        res.json(updateRes.rows[0]);

        // Send Notification to Requester
        try {
            const requesterQuery = `
                SELECT u.phone, u.id as user_id 
                FROM service_requests sr 
                JOIN users u ON sr.requester_id = u.id 
                WHERE sr.id = $1`;
            const requesterRes = await query(requesterQuery, [requestId]);
            if (requesterRes.rows.length > 0) {
                await sendNotification({ userId: requesterRes.rows[0].user_id, locationId, phone: requesterRes.rows[0].phone, type: 'SERVICE_ACCEPTED', message: 'Manacity: Your service request has been accepted. Provider will contact you soon.' });
            }
        } catch (notifyErr) {
            console.error('Error sending acceptance notification:', notifyErr);
        }
    } catch (err) {
        console.error('Error accepting service:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.cancelRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        const updateQuery = `
            UPDATE service_requests 
            SET status = 'CANCELLED_BY_USER', updated_at = NOW(), closed_at = NOW() 
            WHERE id = $1 
              AND location_id = $2 
              AND requester_id = $3 
              AND status IN ('OPEN', 'ASSIGNED')
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [requestId, locationId, user_id]);

        if (updateRes.rows.length === 0) {
            const check = await query('SELECT id, status, requester_id FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
            if (check.rows[0].requester_id !== user_id) return res.status(403).json({ error: 'You do not own this request' });
            return res.status(409).json({ error: `Cannot cancel request in status ${check.rows[0].status}` });
        }
        res.json(updateRes.rows[0]);
    } catch (err) {
        console.error('Error cancelling request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.completeService = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        const updateQuery = `
            UPDATE service_requests 
            SET status = 'COMPLETED', closed_at = NOW(), updated_at = NOW() 
            WHERE id = $1 
              AND location_id = $2 
              AND status = 'ACCEPTED' 
              AND assigned_user_id = $3
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [requestId, locationId, user_id]);

        if (updateRes.rows.length === 0) {
            const check = await query('SELECT id, status, assigned_user_id FROM service_requests WHERE id = $1 AND location_id = $2', [requestId, locationId]);
            if (check.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
            if (check.rows[0].assigned_user_id !== user_id) return res.status(403).json({ error: 'You are not the assigned provider' });
            return res.status(409).json({ error: `Request is not ACCEPTED (Status: ${check.rows[0].status})` });
        }
        res.json(updateRes.rows[0]);

        // Send Notification to Requester
        try {
            const requesterQuery = `
                SELECT u.phone, u.id as user_id 
                FROM service_requests sr 
                JOIN users u ON sr.requester_id = u.id 
                WHERE sr.id = $1`;
            const requesterRes = await query(requesterQuery, [requestId]);
            if (requesterRes.rows.length > 0) {
                await sendNotification({ userId: requesterRes.rows[0].user_id, locationId, phone: requesterRes.rows[0].phone, type: 'SERVICE_COMPLETED', message: 'Manacity: Your service request is completed. Thank you for using Manacity.' });
            }
        } catch (notifyErr) {
            console.error('Error sending completion notification:', notifyErr);
        }
    } catch (err) {
        console.error('Error completing service:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getServiceContactCard = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // 1. Fetch request
        const requestQuery = `
            SELECT id, requester_id, assigned_user_id, status
            FROM service_requests
            WHERE id = $1 AND location_id = $2
        `;
        const requestRes = await query(requestQuery, [requestId, locationId]);

        if (requestRes.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requestRes.rows[0];

        // 2. Check status
        if (!['ACCEPTED', 'COMPLETED'].includes(request.status)) {
            return res.status(409).json({ error: 'Contact details are only available for ACCEPTED or COMPLETED requests' });
        }

        // 3. Check authorization and determine role
        let viewerRole = '';
        let viewedUserId = '';

        if (request.requester_id === user_id) {
            viewerRole = 'REQUESTER';
            viewedUserId = request.assigned_user_id;
        } else if (request.assigned_user_id === user_id) {
            viewerRole = 'PROVIDER';
            viewedUserId = request.requester_id;
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        // 4. Fetch user details
        const usersQuery = `SELECT id, name, phone FROM users WHERE id IN ($1, $2)`;
        const usersRes = await query(usersQuery, [request.requester_id, request.assigned_user_id]);
        
        const requester = usersRes.rows.find(u => u.id === request.requester_id);
        const provider = usersRes.rows.find(u => u.id === request.assigned_user_id);

        // 5. Insert Audit Log
        const auditQuery = `
            INSERT INTO service_contact_audit (request_id, location_id, viewer_user_id, viewed_user_id, viewer_role)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await query(auditQuery, [requestId, locationId, user_id, viewedUserId, viewerRole]);

        // 6. Return response
        res.json({
            request_id: request.id,
            status: request.status,
            requester: requester ? { id: requester.id, name: requester.name, phone: requester.phone } : null,
            provider: provider ? { id: provider.id, name: provider.name, phone: provider.phone } : null
        });

    } catch (err) {
        console.error('Error fetching contact card:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};