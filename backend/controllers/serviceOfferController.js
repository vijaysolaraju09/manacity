const { query } = require('../config/db');

exports.createOffer = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { message } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // 1. Validate request exists and meets criteria
        // Criteria: Must be in location, Public, OPEN, Not Expired
        const requestQuery = `
            SELECT id, requester_id, status, expires_at
            FROM service_requests
            WHERE id = $1 
              AND location_id = $2
              AND is_public = true
        `;
        const requestRes = await query(requestQuery, [requestId, locationId]);

        if (requestRes.rows.length === 0) {
            return res.status(404).json({ error: 'Public service request not found' });
        }

        const request = requestRes.rows[0];

        // Check status and expiration
        if (request.status !== 'OPEN') {
            return res.status(409).json({ error: 'Request is not open' });
        }
        if (new Date(request.expires_at) <= new Date()) {
            return res.status(409).json({ error: 'Request has expired' });
        }

        // 2. Prevent requester from offering on own request
        if (request.requester_id === user_id) {
            return res.status(400).json({ error: 'You cannot make an offer on your own request' });
        }

        // 3. Ensure provider has NOT already offered for this request
        const existingOfferQuery = `
            SELECT 1 FROM service_offers
            WHERE request_id = $1 AND provider_user_id = $2
        `;
        const existingOfferRes = await query(existingOfferQuery, [requestId, user_id]);
        if (existingOfferRes.rows.length > 0) {
            return res.status(409).json({ error: "You already submitted an offer" });
        }

        // 4. Rate limit offers
        const rateLimitQuery = `
            SELECT COUNT(*)::int as count FROM service_offers
            WHERE provider_user_id = $1
              AND created_at > NOW() - INTERVAL '1 hour'
        `;
        const rateLimitRes = await query(rateLimitQuery, [user_id]);
        if (rateLimitRes.rows[0].count >= 5) {
            return res.status(429).json({ error: "Offer limit reached. Try later." });
        }

        // 5. Insert offer
        const insertQuery = `
            INSERT INTO service_offers (request_id, provider_user_id, message)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        
        const result = await query(insertQuery, [requestId, user_id, message]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        if (err.code === '23505') { // Unique violation (request_id, provider_user_id)
            return res.status(409).json({ error: 'You have already made an offer on this request' });
        }
        console.error('Error creating service offer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
