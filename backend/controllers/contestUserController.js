const { pool } = require('../config/db');
const { uploadImage } = require('../utils/s3Uploader');

exports.getActiveContests = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT id, title, description, starts_at, ends_at, created_at
            FROM contests
            WHERE location_id = $1
              AND is_active = true
              AND deleted_at IS NULL
              AND NOW() BETWEEN starts_at AND ends_at
            ORDER BY ends_at ASC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching active contests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.submitEntry = async (req, res) => {
    try {
        const { contestId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;
        const file = req.file;

        // 1. Validate File presence
        if (!file) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        // 2. Validate Contest (Active, In Location, Ongoing)
        const contestQuery = `
            SELECT id 
            FROM contests 
            WHERE id = $1 
              AND location_id = $2 
              AND is_active = true 
              AND deleted_at IS NULL
              AND NOW() BETWEEN starts_at AND ends_at
        `;
        const contestRes = await pool.query(contestQuery, [contestId, locationId]);

        if (contestRes.rows.length === 0) {
            return res.status(404).json({ error: 'Contest not found or not active' });
        }

        // 3. Check for existing entry
        const entryCheckQuery = `
            SELECT id FROM contest_entries 
            WHERE contest_id = $1 AND participant_id = $2
        `;
        const entryCheckRes = await pool.query(entryCheckQuery, [contestId, user_id]);

        if (entryCheckRes.rows.length > 0) {
            return res.status(409).json({ error: 'You have already submitted an entry for this contest' });
        }

        // 4. Upload Image to S3
        let imageUrl;
        try {
            imageUrl = await uploadImage(file.buffer, file.mimetype, 'contest-entries');
        } catch (uploadErr) {
            return res.status(400).json({ error: uploadErr.message });
        }

        // 5. Insert Entry
        const insertQuery = `
            INSERT INTO contest_entries (contest_id, location_id, participant_id, image_url, approval_status)
            VALUES ($1, $2, $3, $4, 'PENDING')
            RETURNING *
        `;
        const insertRes = await pool.query(insertQuery, [contestId, locationId, user_id, imageUrl]);

        res.status(201).json(insertRes.rows[0]);

    } catch (err) {
        console.error('Error submitting contest entry:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.myEntries = async (req, res) => {
    try {
        const { user_id } = req.user;
        const locationId = req.locationId;

        const query = `
            SELECT ce.id, ce.image_url, ce.approval_status, ce.created_at,
                   c.title as contest_title, c.ends_at as contest_ends_at
            FROM contest_entries ce
            JOIN contests c ON ce.contest_id = c.id
            WHERE ce.participant_id = $1 AND ce.location_id = $2
            ORDER BY ce.created_at DESC
        `;

        const result = await pool.query(query, [user_id, locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching my entries:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
