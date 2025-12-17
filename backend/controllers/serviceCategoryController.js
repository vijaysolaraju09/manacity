const pool = require('../config/db');

exports.createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const locationId = req.locationId;

        if (!name || name.length < 3) {
            return res.status(400).json({ error: 'Name must be at least 3 characters long' });
        }

        const query = `
            INSERT INTO service_categories (location_id, name, description)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        
        const result = await pool.query(query, [locationId, name, description]);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'Category name already exists in this location' });
        }
        console.error('Error creating service category:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const locationId = req.locationId;
        
        const query = `
            SELECT * FROM service_categories 
            WHERE location_id = $1 
            ORDER BY created_at ASC
        `;
        
        const result = await pool.query(query, [locationId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching service categories:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.toggleCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { is_active } = req.body;
        const locationId = req.locationId;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active must be a boolean' });
        }

        const query = `UPDATE service_categories SET is_active = $1 WHERE id = $2 AND location_id = $3 RETURNING *`;
        const result = await pool.query(query, [is_active, categoryId, locationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found or access denied' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error toggling service category:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};