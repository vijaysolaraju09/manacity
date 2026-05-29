const { query } = require('../config/db');
const { createError } = require('../utils/errors');
const ROLES = require('../utils/roles');

const getAuthenticatedUserId = (req) => req.user && (req.user.user_id || req.user.id);

const trimText = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const logBusinessAccessRequest = (req, event, extras = {}) => {
  console.log(JSON.stringify({
    level: 'info',
    request_id: req.request_id,
    user_id: getAuthenticatedUserId(req),
    event,
    ...extras,
  }));
};

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

const createMobileBusinessRequest = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req);
  const locationId = req.locationId;

  try {
    const payload = {
      business_name: trimText(req.body.business_name),
      owner_name: trimText(req.body.owner_name),
      phone: trimText(req.body.phone),
      category: trimText(req.body.category),
      address: trimText(req.body.address),
      description: trimText(req.body.description),
    };

    if (!payload.business_name) {
      return next(createError(400, 'BUSINESS_REQUEST_NAME_INVALID', 'Business name is required'));
    }

    if (!payload.owner_name) {
      return next(createError(400, 'BUSINESS_REQUEST_OWNER_NAME_INVALID', 'Owner name is required'));
    }

    if (!payload.phone) {
      return next(createError(400, 'BUSINESS_REQUEST_PHONE_INVALID', 'Phone is required'));
    }

    if (!payload.category) {
      return next(createError(400, 'BUSINESS_REQUEST_CATEGORY_INVALID', 'Category is required'));
    }

    if (!payload.address) {
      return next(createError(400, 'BUSINESS_REQUEST_ADDRESS_INVALID', 'Address is required'));
    }

    const userResult = await query(
      `
        SELECT id, role, location_id
        FROM users
        WHERE id = $1
          AND location_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [userId, locationId],
    );

    if (userResult.rowCount === 0) {
      return next(createError(401, 'AUTH_INVALID_TOKEN', 'Invalid token'));
    }

    if (userResult.rows[0].role === ROLES.BUSINESS) {
      return next(createError(409, 'BUSINESS_ALREADY_ACTIVE', 'Business account already active'));
    }

    const pendingResult = await query(
      `
        SELECT id
        FROM business_access_requests
        WHERE user_id = $1
          AND status = 'PENDING'
        LIMIT 1
      `,
      [userId],
    );

    if (pendingResult.rowCount > 0) {
      return next(createError(409, 'BUSINESS_REQUEST_ALREADY_EXISTS', 'You already have a pending business request'));
    }

    const insertResult = await query(
      `
        INSERT INTO business_access_requests (
          user_id,
          location_id,
          business_name,
          owner_name,
          phone,
          category,
          address,
          description,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
        RETURNING id
      `,
      [
        userId,
        locationId,
        payload.business_name,
        payload.owner_name,
        payload.phone,
        payload.category,
        payload.address,
        payload.description,
      ],
    );

    logBusinessAccessRequest(req, 'BUSINESS_ACCESS_REQUEST_CREATED', {
      business_request_id: insertResult.rows[0].id,
    });

    return res.status(201).json({ message: 'Business request submitted' });
  } catch (err) {
    if (err && err.code === '23505') {
      return next(createError(409, 'BUSINESS_REQUEST_ALREADY_EXISTS', 'You already have a pending business request'));
    }

    console.error(JSON.stringify({
      level: 'error',
      request_id: req.request_id,
      user_id: userId,
      reason: 'CREATE_BUSINESS_ACCESS_REQUEST_FAILED',
      error_message: err && err.message,
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const getMobileBusinessRequest = async (req, res, next) => {
  const userId = getAuthenticatedUserId(req);

  try {
    const { rows } = await query(
      `
        SELECT
          id,
          business_name,
          owner_name,
          phone,
          category,
          address,
          description,
          status,
          rejection_reason,
          approved_at,
          created_at
        FROM business_access_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.json({ request: null });
    }

    return res.json({ request: rows[0] });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      request_id: req.request_id,
      user_id: userId,
      reason: 'GET_BUSINESS_ACCESS_REQUEST_FAILED',
      error_message: err && err.message,
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = {
  createBusinessRequest,
  createMobileBusinessRequest,
  getMobileBusinessRequest,
};
