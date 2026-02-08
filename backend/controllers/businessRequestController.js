const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const createBusinessRequest = async (req, res, next) => {
  try {
    const { business_name, business_type, description, note } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    if (!business_name || business_name.trim().length < 2) {
      return next(createError(400, 'BUSINESS_REQUEST_NAME_INVALID', 'Business name is required'));
    }

    if (!business_type || business_type.trim().length < 2) {
      return next(createError(400, 'BUSINESS_REQUEST_TYPE_INVALID', 'Business type is required'));
    }

    const pendingCheckQuery = `
      SELECT id
      FROM business_requests
      WHERE user_id = $1
        AND location_id = $2
        AND status = 'PENDING'
      LIMIT 1
    `;
    const pendingCheck = await query(pendingCheckQuery, [user_id, locationId]);

    if (pendingCheck.rows.length > 0) {
      return next(createError(409, 'BUSINESS_REQUEST_EXISTS', 'A pending request already exists for this location'));
    }

    const insertQuery = `
      INSERT INTO business_requests (
        user_id,
        location_id,
        business_name,
        business_type,
        description,
        note,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *
    `;

    const { rows } = await query(insertQuery, [
      user_id,
      locationId,
      business_name.trim(),
      business_type.trim(),
      description ? description.trim() : null,
      note ? note.trim() : null,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create business request error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = {
  createBusinessRequest,
};
