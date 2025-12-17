const { pool } = require('../config/db');

exports.getLeaderboard = async (req, res) => {
    try {
        const { contestId } = req.params;
        const locationId = req.locationId;

        const query = `
            SELECT 
                ce.id as entry_id, 
                ce.image_url, 
                u.name as participant_name,
                COUNT(cv.id)::int as vote_count
            FROM contest_entries ce
            JOIN users u ON ce.participant_id = u.id
            LEFT JOIN contest_votes cv ON ce.id = cv.entry_id
            WHERE ce.contest_id = $1 
              AND ce.location_id = $2
              AND ce.approval_status = 'APPROVED'
            GROUP BY ce.id, u.name
            ORDER BY vote_count DESC, ce.created_at ASC
        `;

        const result = await pool.query(query, [contestId, locationId]);

        // Add rank to the response
        const leaderboard = result.rows.map((entry, index) => ({
            rank: index + 1,
            ...entry
        }));

        res.json(leaderboard);
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};