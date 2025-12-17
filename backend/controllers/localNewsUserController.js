const { pool } = require('../config/db');

exports.getNewsFeed = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT id, title, body, created_at, updated_at
            FROM local_news
            WHERE location_id = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching news feed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};