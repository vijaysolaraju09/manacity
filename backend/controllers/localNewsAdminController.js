const { pool } = require('../config/db');

exports.createNews = async (req, res) => {
    try {
        const { title, body } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        if (!title || title.trim().length === 0) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (!body || body.trim().length === 0) {
            return res.status(400).json({ error: 'Body is required' });
        }

        const query = `
            INSERT INTO local_news (location_id, title, body, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await pool.query(query, [locationId, title, body, user_id]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error creating news:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateNews = async (req, res) => {
    try {
        const { newsId } = req.params;
        const { title, body } = req.body;
        const locationId = req.locationId;

        if (!title && !body) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (title) {
            fields.push(`title = $${idx++}`);
            values.push(title);
        }
        if (body) {
            fields.push(`body = $${idx++}`);
            values.push(body);
        }

        fields.push(`updated_at = NOW()`);
        values.push(newsId);
        values.push(locationId);

        const query = `
            UPDATE local_news
            SET ${fields.join(', ')}
            WHERE id = $${idx++} AND location_id = $${idx++} AND deleted_at IS NULL
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'News item not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error updating news:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteNews = async (req, res) => {
    try {
        const { newsId } = req.params;
        const locationId = req.locationId;

        const query = `
            UPDATE local_news
            SET deleted_at = NOW()
            WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
            RETURNING id
        `;
        const result = await pool.query(query, [newsId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'News item not found' });
        }

        res.json({ message: 'News deleted successfully' });

    } catch (err) {
        console.error('Error deleting news:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.listNewsAdmin = async (req, res) => {
    try {
        const locationId = req.locationId;
        const { includeDeleted } = req.query;

        let query = `
            SELECT * FROM local_news
            WHERE location_id = $1
        `;

        if (includeDeleted !== 'true') {
            query += ` AND deleted_at IS NULL`;
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error listing admin news:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};