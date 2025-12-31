const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const applyShop = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Validation
    if (!name || name.trim().length < 3) {
      return next(createError(400, 'SHOP_NAME_INVALID', 'Shop name is required and must be at least 3 characters.'));
    }

    // 2. Check for existing active shop for this user in this location
    const checkQuery = `
      SELECT 1 FROM shops
      WHERE owner_id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const checkRes = await query(checkQuery, [user_id, locationId]);

    if (checkRes.rows.length > 0) {
      return next(createError(409, 'SHOP_ALREADY_EXISTS', 'Shop already exists for this user in this location'));
    }

    // 3. Insert new shop
    const insertQuery = `
      INSERT INTO shops (name, description, owner_id, location_id, approval_status, is_open, is_hidden)
      VALUES ($1, $2, $3, $4, 'PENDING', true, false)
      RETURNING *
    `;
    const insertRes = await query(insertQuery, [name, description, user_id, locationId]);

    // 4. Response
    res.status(201).json(insertRes.rows[0]);

  } catch (err) {
    console.error('Apply Shop Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { applyShop };
