const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const getBusinessRequests = async (req, res, next) => {
  try {
    const locationId = req.locationId;

    const fetchQuery = `
      SELECT br.*, u.name AS user_name, u.phone AS user_phone
      FROM business_requests br
      JOIN users u ON br.user_id = u.id
      WHERE br.location_id = $1
      ORDER BY br.created_at DESC
    `;

    const { rows } = await query(fetchQuery, [locationId]);
    res.json(rows);
  } catch (err) {
    console.error('Get business requests error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const approveBusinessRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const locationId = req.locationId;

    const checkQuery = `
      SELECT id, status
      FROM business_requests
      WHERE id = $1
        AND location_id = $2
    `;
    const checkResult = await query(checkQuery, [id, locationId]);

    if (checkResult.rows.length === 0) {
      return next(createError(404, 'BUSINESS_REQUEST_NOT_FOUND', 'Business request not found'));
    }

    if (checkResult.rows[0].status !== 'PENDING') {
      return next(createError(409, 'BUSINESS_REQUEST_STATUS_INVALID', 'Business request is not pending'));
    }

    const updateQuery = `
      UPDATE business_requests
      SET status = 'APPROVED'
      WHERE id = $1 AND location_id = $2
      RETURNING *
    `;
    const { rows } = await query(updateQuery, [id, locationId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Approve business request error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const rejectBusinessRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const locationId = req.locationId;

    const checkQuery = `
      SELECT id, status
      FROM business_requests
      WHERE id = $1
        AND location_id = $2
    `;
    const checkResult = await query(checkQuery, [id, locationId]);

    if (checkResult.rows.length === 0) {
      return next(createError(404, 'BUSINESS_REQUEST_NOT_FOUND', 'Business request not found'));
    }

    if (checkResult.rows[0].status !== 'PENDING') {
      return next(createError(409, 'BUSINESS_REQUEST_STATUS_INVALID', 'Business request is not pending'));
    }

    const updateQuery = `
      UPDATE business_requests
      SET status = 'REJECTED'
      WHERE id = $1 AND location_id = $2
      RETURNING *
    `;
    const { rows } = await query(updateQuery, [id, locationId]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Reject business request error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = {
  getBusinessRequests,
  approveBusinessRequest,
  rejectBusinessRequest,
};
