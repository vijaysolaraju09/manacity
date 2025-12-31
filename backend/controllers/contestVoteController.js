const { pool } = require('../config/db');
const { createError } = require('../utils/errors');

exports.getContestEntries = async (req, res, next) => {
    try {
        const { contestId } = req.params;
        const locationId = req.locationId;

        const query = `
            SELECT 
                ce.id as entry_id, 
                ce.image_url, 
                COUNT(cv.id)::int as vote_count
            FROM contest_entries ce
            LEFT JOIN contest_votes cv ON ce.id = cv.entry_id
            WHERE ce.contest_id = $1 
              AND ce.location_id = $2
              AND ce.approval_status = 'APPROVED'
            GROUP BY ce.id
            ORDER BY vote_count DESC, ce.created_at ASC
        `;

        const result = await pool.query(query, [contestId, locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching contest entries:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.voteEntry = async (req, res, next) => {
    try {
        const { entryId } = req.params;
        const { user_id } = req.user;
        const locationId = req.locationId;

        // 1. Validate Entry
        const entryQuery = `
            SELECT id, contest_id, participant_id, approval_status 
            FROM contest_entries 
            WHERE id = $1 AND location_id = $2
        `;
        const entryRes = await pool.query(entryQuery, [entryId, locationId]);

        if (entryRes.rows.length === 0) {
            return next(createError(404, 'CONTEST_ENTRY_NOT_FOUND', 'Entry not found'));
        }

        const entry = entryRes.rows[0];

        if (entry.approval_status !== 'APPROVED') {
            return next(createError(400, 'CONTEST_ENTRY_NOT_APPROVED', 'Entry is not approved'));
        }

        if (entry.participant_id === user_id) {
            return next(createError(403, 'CONTEST_VOTE_FORBIDDEN_SELF', 'You cannot vote for your own entry'));
        }

        // 2. Insert Vote
        const insertQuery = `
            INSERT INTO contest_votes (contest_id, entry_id, user_id, location_id)
            VALUES ($1, $2, $3, $4)
        `;
        await pool.query(insertQuery, [entry.contest_id, entryId, user_id, locationId]);

        res.json({ message: 'Vote recorded successfully' });

    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return next(createError(409, 'CONTEST_VOTE_DUPLICATE', 'You have already voted for this entry'));
        }
        console.error('Error voting for entry:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};
