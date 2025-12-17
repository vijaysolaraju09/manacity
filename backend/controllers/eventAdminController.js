const pool = require('../config/db');

exports.createEvent = async (req, res) => {
    try {
        const { title, description, event_type, event_date, venue, capacity } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // Validate inputs
        if (!title || title.length < 5) {
            return res.status(400).json({ error: 'Title must be at least 5 characters' });
        }
        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }
        const allowedTypes = ['EDUCATIONAL', 'SPORTS', 'FESTIVAL', 'ESPORTS'];
        if (!allowedTypes.includes(event_type)) {
            return res.status(400).json({ error: 'Invalid event_type' });
        }
        if (!event_date) {
            return res.status(400).json({ error: 'Event date is required' });
        }
        if (!venue) {
            return res.status(400).json({ error: 'Venue is required' });
        }
        if (!capacity || capacity <= 0) {
            return res.status(400).json({ error: 'Capacity must be greater than 0' });
        }

        const query = `
            INSERT INTO events (location_id, title, description, event_type, event_date, venue, capacity, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const result = await pool.query(query, [locationId, title, description, event_type, event_date, venue, capacity, user_id]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getEvents = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT * FROM events
            WHERE location_id = $1 AND deleted_at IS NULL
            ORDER BY event_date ASC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const locationId = req.locationId;
        const updates = req.body;

        const allowedFields = ['title', 'description', 'event_type', 'event_date', 'venue', 'capacity', 'is_active'];
        const fieldsToUpdate = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fieldsToUpdate.push(`${field} = $${idx}`);
                values.push(updates[field]);
                idx++;
            }
        }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        fieldsToUpdate.push(`updated_at = NOW()`);
        values.push(eventId);
        values.push(locationId);

        const query = `
            UPDATE events
            SET ${fieldsToUpdate.join(', ')}
            WHERE id = $${idx} AND location_id = $${idx + 1} AND deleted_at IS NULL
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const locationId = req.locationId;

        const query = `
            UPDATE events
            SET deleted_at = NOW()
            WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
            RETURNING id
        `;

        const result = await pool.query(query, [eventId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ message: 'Event deleted successfully' });

    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};