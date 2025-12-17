const { query } = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const locationId = req.locationId;
        const { status } = req.query;

        let sql = `
            SELECT * FROM notifications
            WHERE location_id = $1
        `;
        const params = [locationId];

        if (status) {
            sql += ` AND status = $2`;
            params.push(status);
        }

        sql += ` ORDER BY created_at DESC LIMIT 100`;

        const result = await query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};