const { pool } = require('../config/db');

exports.getPendingRegistrations = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT er.id, er.registered_at, er.status,
                   u.name as user_name, u.phone as user_phone,
                   e.title as event_title, e.event_date, e.capacity
            FROM event_registrations er
            JOIN users u ON er.user_id = u.id
            JOIN events e ON er.event_id = e.id
            WHERE er.location_id = $1 AND er.status = 'PENDING'
            ORDER BY er.registered_at ASC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching pending registrations:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.approveRegistration = async (req, res) => {
    const client = await pool.connect();
    try {
        const { registrationId } = req.params;
        const locationId = req.locationId;

        await client.query('BEGIN');

        // 1. Fetch registration & lock row
        const regQuery = `
            SELECT er.id, er.event_id, er.status
            FROM event_registrations er
            WHERE er.id = $1 AND er.location_id = $2
            FOR UPDATE
        `;
        const regRes = await client.query(regQuery, [registrationId, locationId]);

        if (regRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Registration not found in this location' });
        }

        const registration = regRes.rows[0];

        if (registration.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Registration is already ${registration.status}` });
        }

        // 2. Fetch event capacity
        const eventQuery = `SELECT capacity FROM events WHERE id = $1`;
        const eventRes = await client.query(eventQuery, [registration.event_id]);
        const capacity = eventRes.rows[0].capacity;

        // 3. Count APPROVED registrations
        const countQuery = `
            SELECT COUNT(*)::int as count 
            FROM event_registrations 
            WHERE event_id = $1 AND status = 'APPROVED'
        `;
        const countRes = await client.query(countQuery, [registration.event_id]);
        const approvedCount = countRes.rows[0].count;

        // 4. Check Capacity
        if (approvedCount >= capacity) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Event is fully booked' });
        }

        // 5. Update registration
        const updateQuery = `
            UPDATE event_registrations
            SET status = 'APPROVED', approved_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const updateRes = await client.query(updateQuery, [registrationId]);

        await client.query('COMMIT');
        res.json(updateRes.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error approving registration:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

exports.rejectRegistration = async (req, res) => {
    try {
        const { registrationId } = req.params;
        const { admin_note } = req.body;
        const locationId = req.locationId;

        const query = `
            UPDATE event_registrations
            SET status = 'REJECTED', admin_note = $1
            WHERE id = $2 AND location_id = $3 AND status = 'PENDING'
            RETURNING *
        `;

        const result = await pool.query(query, [admin_note, registrationId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found or not PENDING' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error rejecting registration:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};