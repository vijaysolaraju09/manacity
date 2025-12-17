const { pool } = require('../config/db');

exports.getOpenQuestions = async (req, res) => {
    try {
        const locationId = req.locationId;

        const query = `
            SELECT eq.*, u.name as asker_name, u.phone as asker_phone
            FROM enquire_questions eq
            JOIN users u ON eq.asked_by = u.id
            WHERE eq.location_id = $1
              AND eq.status = 'OPEN'
              AND eq.deleted_at IS NULL
            ORDER BY eq.asked_at ASC
        `;

        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching open questions:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.answerQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const { admin_answer } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        if (!admin_answer || admin_answer.trim().length < 5) {
            return res.status(400).json({ error: 'Answer must be at least 5 characters long' });
        }

        const query = `
            UPDATE enquire_questions
            SET admin_answer = $1,
                answered_by = $2,
                status = 'ANSWERED',
                answered_at = NOW()
            WHERE id = $3
              AND location_id = $4
              AND status = 'OPEN'
            RETURNING *
        `;

        const result = await pool.query(query, [admin_answer, user_id, questionId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found, already answered, or not in this location' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error answering question:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const locationId = req.locationId;

        const query = `
            UPDATE enquire_questions
            SET deleted_at = NOW()
            WHERE id = $1
              AND location_id = $2
              AND deleted_at IS NULL
            RETURNING id
        `;

        const result = await pool.query(query, [questionId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        res.json({ message: 'Question deleted successfully' });

    } catch (err) {
        console.error('Error deleting question:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};