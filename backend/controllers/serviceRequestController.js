const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');
const { parseLimit, parseCursor, makeNextCursor } = require('../utils/pagination');

exports.createTypeARequest = async (req, res) => {
    try {
        const { category_id, request_text, title, description, note } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;
        const resolvedDescription = description || request_text;
        const resolvedRequestText = request_text || description;

        // 1. Validate inputs
        if (!category_id) {
            return res.status(400).json({ error: 'category_id is required' });
        }
        if (!resolvedDescription || resolvedDescription.trim().length < 5) {
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
                title, description, note,
                is_public, status, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'OPEN', NOW() + INTERVAL '24 hours')
            RETURNING *
        `;
        
        const result = await query(insertQuery, [
            locationId,
            user_id,
            category_id,
            resolvedRequestText,
            title || null,
            resolvedDescription,
            note || null
        ]);
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
            SELECT id, status, assigned_user_id, assigned_provider_user_id
            FROM service_requests
            WHERE id = $1 AND location_id = $2 AND requester_id = $3
        `;
        const requestRes = await query(requestQuery, [requestId, locationId, user_id]);

        if (requestRes.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found or access denied' });
        }

        const request = requestRes.rows[0];
        const assignedProviderId = request.assigned_provider_user_id || request.assigned_user_id;
        const isAssigned = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ACCEPTED'].includes(request.status);

        // Fetch offers
        const offersQuery = `
            SELECT so.id, so.request_id, so.provider_user_id, so.message, so.created_at, so.offer_status,
                   u.name as provider_name, u.phone as provider_phone
            FROM service_offers so
            JOIN users u ON so.provider_user_id = u.id
            WHERE so.request_id = $1
            ORDER BY so.created_at DESC
        `;
        const offersRes = await query(offersQuery, [requestId]);

        const offers = offersRes.rows.map(offer => {
            // Only show phone if this specific provider is the one assigned to the request
            const showPhone = isAssigned && (offer.provider_user_id === assignedProviderId);
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

        await query('BEGIN');

        const requestQuery = `
            SELECT id, requester_id, status, expires_at, is_public
            FROM service_requests
            WHERE id = $1 AND location_id = $2 AND requester_id = $3
            FOR UPDATE
        `;
        const requestRes = await query(requestQuery, [requestId, locationId, user_id]);

        if (requestRes.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requestRes.rows[0];
        if (!request.is_public) {
            await query('ROLLBACK');
            return res.status(409).json({ error: 'Request is not public' });
        }
        if (!['OPEN', 'OFFERED'].includes(request.status)) {
            await query('ROLLBACK');
            return res.status(409).json({ error: `Request is not open for offers (Status: ${request.status})` });
        }
        if (new Date(request.expires_at) <= new Date()) {
            await query('ROLLBACK');
            return res.status(409).json({ error: 'Request has expired' });
        }

        // 1. Get provider_user_id from offer
        const offerQuery = `
            SELECT id, provider_user_id, offer_status
            FROM service_offers
            WHERE id = $1 AND request_id = $2
            FOR UPDATE
        `;
        const offerRes = await query(offerQuery, [offerId, requestId]);

        if (offerRes.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Offer not found for this request' });
        }

        const offer = offerRes.rows[0];
        if (offer.offer_status && offer.offer_status !== 'PENDING') {
            await query('ROLLBACK');
            return res.status(409).json({ error: 'Offer is not pending' });
        }

        const providerUserId = offer.provider_user_id;

        // 2. Update offers
        await query(
            `UPDATE service_offers SET offer_status = 'ACCEPTED' WHERE id = $1`,
            [offerId]
        );
        await query(
            `UPDATE service_offers SET offer_status = 'REJECTED' WHERE request_id = $1 AND id <> $2 AND offer_status = 'PENDING'`,
            [requestId, offerId]
        );

        // 3. Update request assignment
        const updateQuery = `
            UPDATE service_requests
            SET assigned_provider_user_id = $1,
                assigned_user_id = $1,
                status = 'ASSIGNED',
                updated_at = NOW(),
                assigned_at = NOW()
            WHERE id = $2 AND location_id = $3 AND requester_id = $4
            RETURNING *
        `;
        const updateRes = await query(updateQuery, [providerUserId, requestId, locationId, user_id]);

        await query('COMMIT');
        res.json(updateRes.rows[0]);

    } catch (err) {
        await query('ROLLBACK');
        console.error('Error accepting offer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.rejectOffer = async (req, res) => {
    try {
        const { requestId, offerId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        await query('BEGIN');

        const requestQuery = `
            SELECT id, requester_id, status, is_public
            FROM service_requests
            WHERE id = $1 AND location_id = $2 AND requester_id = $3
            FOR UPDATE
        `;
        const requestRes = await query(requestQuery, [requestId, locationId, user_id]);

        if (requestRes.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Request not found' });
        }

        const offerQuery = `
            SELECT id, offer_status
            FROM service_offers
            WHERE id = $1 AND request_id = $2
            FOR UPDATE
        `;
        const offerRes = await query(offerQuery, [offerId, requestId]);

        if (offerRes.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Offer not found for this request' });
        }

        if (offerRes.rows[0].offer_status !== 'PENDING') {
            await query('ROLLBACK');
            return res.status(409).json({ error: 'Offer is not pending' });
        }

        const updateOffer = `
            UPDATE service_offers
            SET offer_status = 'REJECTED'
            WHERE id = $1
            RETURNING *
        `;
        const updateRes = await query(updateOffer, [offerId]);

        const request = requestRes.rows[0];
        if (request.is_public && request.status === 'OFFERED') {
            const pendingQuery = `
                SELECT COUNT(*)::int as count
                FROM service_offers
                WHERE request_id = $1 AND offer_status = 'PENDING'
            `;
            const pendingRes = await query(pendingQuery, [requestId]);
            if (pendingRes.rows[0].count === 0) {
                await query(
                    `UPDATE service_requests SET status = 'OPEN', updated_at = NOW() WHERE id = $1`,
                    [requestId]
                );
            }
        }

        await query('COMMIT');
        res.json(updateRes.rows[0]);
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error rejecting offer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.createTypeBRequest = async (req, res) => {
    try {
        const { request_text, visibility, title, description, note } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;
        const resolvedDescription = description || request_text;
        const resolvedRequestText = request_text || description;

        if (!resolvedDescription || resolvedDescription.trim().length < 5) {
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
                title, description, note,
                is_public, status, expires_at
            )
            VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, 'OPEN', NOW() + INTERVAL '24 hours')
            RETURNING *
        `;

        const result = await query(insertQuery, [
            locationId,
            user_id,
            resolvedRequestText,
            title || null,
            resolvedDescription,
            note || null,
            is_public
        ]);
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
                SELECT sr.id, sr.request_text, sr.title, sr.description, sr.note, sr.is_public, sr.status,
                       sr.expires_at, sr.assigned_provider_user_id, sr.created_at, u.name as requester_name
                FROM service_requests sr
                JOIN users u ON sr.requester_id = u.id
                WHERE sr.location_id = $1
                  AND sr.is_public = true
                  AND sr.status IN ('OPEN', 'OFFERED')
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
              AND status IN ('OPEN', 'OFFERED')
              AND expires_at > NOW()
        `;
        const countRes = await query(countQuery, [locationId]);
        const total = countRes.rows[0].total;

        const publicRequestsQuery = `
            SELECT sr.id, sr.request_text, sr.title, sr.description, sr.note, sr.is_public, sr.status,
                   sr.expires_at, sr.assigned_provider_user_id, sr.created_at, u.name as requester_name
            FROM service_requests sr
            JOIN users u ON sr.requester_id = u.id
            WHERE sr.location_id = $1
              AND sr.is_public = true
              AND sr.status IN ('OPEN', 'OFFERED')
              AND sr.expires_at > NOW()
            ORDER BY sr.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await query(publicRequestsQuery, [locationId, limit, offset]);
        
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

        const requestsQuery = `
            SELECT sr.*, sc.name as category_name
            FROM service_requests sr
            LEFT JOIN service_categories sc ON sr.category_id = sc.id
            WHERE sr.location_id = $1
              AND sr.requester_id = $2
            ORDER BY sr.created_at DESC
            LIMIT $3 OFFSET $4
        `;

        const result = await query(requestsQuery, [locationId, user_id, limit, offset]);
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
            SET status = 'IN_PROGRESS', updated_at = NOW() 
            WHERE id = $1 
              AND location_id = $2 
              AND status IN ('ASSIGNED', 'ACCEPTED') 
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
              AND status IN ('OPEN', 'OFFERED', 'ASSIGNED', 'IN_PROGRESS', 'ACCEPTED')
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
              AND status IN ('IN_PROGRESS', 'ACCEPTED') 
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
        if (!['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status)) {
            return res.status(409).json({ error: 'Contact details are only available for in-progress or completed requests' });
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
