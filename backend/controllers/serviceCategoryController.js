const pool = require('../config/db');
const { createError } = require('../utils/errors');

exports.createCategory = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const locationId = req.locationId;

        if (!name || name.length < 3) {
            return next(createError(400, 'SERVICE_CATEGORY_NAME_INVALID', 'Name must be at least 3 characters long'));
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
            return next(createError(409, 'SERVICE_CATEGORY_DUPLICATE', 'Category name already exists in this location'));
        }
        console.error('Error creating service category:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.getCategories = async (req, res, next) => {
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
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.toggleCategory = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        const { is_active } = req.body;
        const locationId = req.locationId;

        if (typeof is_active !== 'boolean') {
            return next(createError(400, 'SERVICE_CATEGORY_STATUS_INVALID', 'is_active must be a boolean'));
        }

        const query = `UPDATE service_categories SET is_active = $1 WHERE id = $2 AND location_id = $3 RETURNING *`;
        const result = await pool.query(query, [is_active, categoryId, locationId]);

        if (result.rows.length === 0) {
            return next(createError(404, 'SERVICE_CATEGORY_NOT_FOUND', 'Category not found or access denied'));
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error toggling service category:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};
