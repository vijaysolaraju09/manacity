const { pool } = require('../config/db');

exports.getAvailableEvents = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT e.id, e.title, e.description, e.event_type, e.event_date, e.venue, e.capacity,
                   (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'APPROVED') as approved_registrations_count
            FROM events e
            WHERE e.location_id = $1
              AND e.deleted_at IS NULL
              AND e.is_active = true
              AND e.event_date >= NOW()
            ORDER BY e.event_date ASC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching available events:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.registerForEvent = async (req, res) => {
    const client = await pool.connect();
    try {
        const { eventId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        await client.query('BEGIN');

        // 1. Verify event exists and is valid
        const eventQuery = `
            SELECT id, capacity 
            FROM events 
            WHERE id = $1 
              AND location_id = $2 
              AND deleted_at IS NULL 
              AND is_active = true
            FOR UPDATE
        `;
        const eventRes = await client.query(eventQuery, [eventId, locationId]);

        if (eventRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Event not found or unavailable' });
        }

        const event = eventRes.rows[0];

        // 2. Count APPROVED registrations
        const countQuery = `
            SELECT COUNT(*)::int as count 
            FROM event_registrations 
            WHERE event_id = $1 AND status = 'APPROVED'
        `;
        const countRes = await client.query(countQuery, [eventId]);
        const approvedCount = countRes.rows[0].count;

        // 3. Check Capacity
        if (approvedCount >= event.capacity) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Event is fully booked' });
        }

        // 4. Insert Registration
        const insertQuery = `
            INSERT INTO event_registrations (event_id, location_id, user_id, status)
            VALUES ($1, $2, $3, 'PENDING')
            RETURNING *
        `;
        const insertRes = await client.query(insertQuery, [eventId, locationId, user_id]);

        await client.query('COMMIT');
        res.status(201).json(insertRes.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'You are already registered for this event' });
        }
        console.error('Error registering for event:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

exports.getMyEventRegistrations = async (req, res) => {
    try {
        const { user_id } = req.user;
        const locationId = req.locationId;

        const query = `
            SELECT er.id, er.status, er.registered_at, er.admin_note,
                   e.title, e.event_date, e.venue, e.event_type
            FROM event_registrations er
            JOIN events e ON er.event_id = e.id
            WHERE er.user_id = $1 AND er.location_id = $2
            ORDER BY er.registered_at DESC
        `;

        const result = await pool.query(query, [user_id, locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching my registrations:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};