const { pool } = require('../config/db');

exports.askQuestion = async (req, res) => {
    try {
        const { question } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        if (!question || question.trim().length < 10) {
            return res.status(400).json({ error: 'Question must be at least 10 characters long' });
        }

        const query = `
            INSERT INTO enquire_questions (location_id, asked_by, question, status)
            VALUES ($1, $2, $3, 'OPEN')
            RETURNING *
        `;
        
        const result = await pool.query(query, [locationId, user_id, question]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error asking question:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getEnquireFeed = async (req, res) => {
    try {
        const locationId = req.locationId;

        // Public feed: No user details (privacy), just the Q&A content
        const query = `
            SELECT id, question, status, admin_answer, asked_at, answered_at
            FROM enquire_questions
            WHERE location_id = $1
              AND deleted_at IS NULL
            ORDER BY asked_at DESC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching enquire feed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getMyQuestions = async (req, res) => {
    try {
        const { user_id } = req.user;
        const locationId = req.locationId;

        const query = `
            SELECT * FROM enquire_questions
            WHERE location_id = $1 AND asked_by = $2
            ORDER BY asked_at DESC
        `;

        const result = await pool.query(query, [locationId, user_id]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching my questions:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};