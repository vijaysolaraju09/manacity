const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');

exports.createContest = async (req, res) => {
    try {
        const { title, description, starts_at, ends_at } = req.body;
        const { user_id } = req.user;
        const locationId = req.locationId;

        if (!title || title.length < 5) {
            return res.status(400).json({ error: 'Title must be at least 5 characters' });
        }
        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }
        if (!starts_at || !ends_at) {
            return res.status(400).json({ error: 'Start and end dates are required' });
        }

        const start = new Date(starts_at);
        const end = new Date(ends_at);
        const now = new Date();

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        if (start >= end) {
            return res.status(400).json({ error: 'starts_at must be before ends_at' });
        }

        if (end <= now) {
            return res.status(400).json({ error: 'ends_at must be in the future' });
        }

        const sql = `
            INSERT INTO contests (location_id, title, description, starts_at, ends_at, created_by, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING *
        `;

        const result = await query(sql, [locationId, title, description, starts_at, ends_at, user_id]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Error creating contest:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getContestsAdmin = async (req, res) => {
    try {
        const locationId = req.locationId;

        const sql = `
            SELECT * FROM contests
            WHERE location_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
        `;

        const result = await query(sql, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching contests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateContest = async (req, res) => {
    try {
        const { contestId } = req.params;
        const locationId = req.locationId;
        const updates = req.body;

        // Fetch current contest to validate dates if only one is updated
        const currentQuery = `SELECT starts_at, ends_at FROM contests WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL`;
        const currentRes = await query(currentQuery, [contestId, locationId]);

        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const current = currentRes.rows[0];
        
        // Date validation logic
        let newStart = updates.starts_at ? new Date(updates.starts_at) : new Date(current.starts_at);
        let newEnd = updates.ends_at ? new Date(updates.ends_at) : new Date(current.ends_at);

        if (updates.starts_at && isNaN(newStart.getTime())) return res.status(400).json({ error: 'Invalid starts_at' });
        if (updates.ends_at && isNaN(newEnd.getTime())) return res.status(400).json({ error: 'Invalid ends_at' });

        if (updates.starts_at || updates.ends_at) {
             if (newStart >= newEnd) {
                return res.status(400).json({ error: 'starts_at must be before ends_at' });
            }
        }

        // Prepare updates
        const allowedFields = ['title', 'description', 'starts_at', 'ends_at', 'is_active'];
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
        values.push(contestId);
        values.push(locationId);

        const sql = `
            UPDATE contests
            SET ${fieldsToUpdate.join(', ')}
            WHERE id = $${idx} AND location_id = $${idx + 1} AND deleted_at IS NULL
            RETURNING *
        `;

        const result = await query(sql, values);

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error updating contest:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteContest = async (req, res) => {
    try {
        const { contestId } = req.params;
        const locationId = req.locationId;

        const sql = `
            UPDATE contests
            SET deleted_at = NOW()
            WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
            RETURNING id
        `;

        const result = await query(sql, [contestId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        res.json({ message: 'Contest deleted successfully' });

    } catch (err) {
        console.error('Error deleting contest:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getPendingEntries = async (req, res) => {
    try {
        const locationId = req.locationId;

        const sql = `
            SELECT ce.*, c.title as contest_title
            FROM contest_entries ce
            JOIN contests c ON ce.contest_id = c.id
            WHERE ce.location_id = $1 AND ce.approval_status = 'PENDING'
            ORDER BY ce.created_at ASC
        `;

        const result = await query(sql, [locationId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching pending entries:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.approveEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const locationId = req.locationId;

        const sql = `
            UPDATE contest_entries
            SET approval_status = 'APPROVED', approved_at = NOW()
            WHERE id = $1 AND location_id = $2 AND approval_status = 'PENDING'
            RETURNING *
        `;

        const result = await query(sql, [entryId, locationId]);

        if (result.rows.length === 0) {
            const check = await query('SELECT id, approval_status FROM contest_entries WHERE id = $1 AND location_id = $2', [entryId, locationId]);
            if (check.rows.length === 0) {
                return res.status(404).json({ error: 'Entry not found' });
            }
            if (check.rows[0].approval_status !== 'PENDING') {
                return res.status(409).json({ error: `Entry is already ${check.rows[0].approval_status}` });
            }
        }

        res.json(result.rows[0]);

        // Send Notification to Participant
        try {
            const participantQuery = `
                SELECT u.phone, u.id as user_id 
                FROM contest_entries ce 
                JOIN users u ON ce.participant_id = u.id 
                WHERE ce.id = $1`;
            const participantRes = await query(participantQuery, [entryId]);
            if (participantRes.rows.length > 0) {
                await sendNotification({ userId: participantRes.rows[0].user_id, locationId, phone: participantRes.rows[0].phone, type: 'CONTEST_ENTRY_APPROVED', message: 'Manacity: Your contest entry has been approved. Best of luck!' });
            }
        } catch (notifyErr) {
            console.error('Error sending contest entry approval notification:', notifyErr);
        }
    } catch (err) {
        console.error('Error approving entry:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.rejectEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const locationId = req.locationId;

        // Note: rejected_at column does not exist in schema, so we only update status
        const sql = `
            UPDATE contest_entries
            SET approval_status = 'REJECTED'
            WHERE id = $1 AND location_id = $2 AND approval_status = 'PENDING'
            RETURNING *
        `;

        const result = await query(sql, [entryId, locationId]);

        if (result.rows.length === 0) {
            const check = await query('SELECT id, approval_status FROM contest_entries WHERE id = $1 AND location_id = $2', [entryId, locationId]);
            if (check.rows.length === 0) {
                return res.status(404).json({ error: 'Entry not found' });
            }
            if (check.rows[0].approval_status !== 'PENDING') {
                return res.status(409).json({ error: `Entry is already ${check.rows[0].approval_status}` });
            }
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error rejecting entry:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
