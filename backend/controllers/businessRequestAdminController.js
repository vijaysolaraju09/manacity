const { pool } = require('../config/db');
const { createError } = require('../utils/errors');
const ROLES = require('../utils/roles');

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const getAdminId = (req) => req.user && (req.user.user_id || req.user.id);

const trimText = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const logAdminBusinessAccessRequest = (req, event, extras = {}) => {
  console.log(JSON.stringify({
    level: 'info',
    request_id: req.request_id,
    admin_id: getAdminId(req),
    event,
    ...extras,
  }));
};

const getBusinessRequests = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const locationId = req.locationId;
    const status = trimText(req.query.status);
    const params = [locationId];
    let statusFilter = '';

    if (status) {
      const normalizedStatus = status.toUpperCase();

      if (!VALID_STATUSES.includes(normalizedStatus)) {
        client.release();
        return next(createError(400, 'BUSINESS_REQUEST_INVALID_STATUS', 'Invalid business request status'));
      }

      params.push(normalizedStatus);
      statusFilter = 'AND bar.status = $2';
    }

    const fetchQuery = `
      SELECT
        bar.id,
        bar.user_id,
        bar.location_id,
        bar.business_name,
        bar.owner_name,
        bar.phone,
        bar.category,
        bar.address,
        bar.description,
        bar.status,
        bar.rejection_reason,
        bar.approved_by,
        bar.approved_at,
        bar.created_at,
        bar.updated_at,
        u.name AS requester_name,
        u.phone AS requester_phone,
        u.role AS requester_role
      FROM business_access_requests bar
      JOIN users u ON u.id = bar.user_id
      WHERE bar.location_id = $1
        ${statusFilter}
      ORDER BY bar.created_at DESC
    `;

    const { rows } = await client.query(fetchQuery, params);

    const requests = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      location_id: row.location_id,
      business_name: row.business_name,
      owner_name: row.owner_name,
      phone: row.phone,
      category: row.category,
      address: row.address,
      description: row.description,
      status: row.status,
      rejection_reason: row.rejection_reason,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      requester: {
        id: row.user_id,
        name: row.requester_name,
        phone: row.requester_phone,
        role: row.requester_role,
      },
    }));

    client.release();
    return res.json({ requests });
  } catch (err) {
    client.release();
    console.error(JSON.stringify({
      level: 'error',
      request_id: req.request_id,
      admin_id: getAdminId(req),
      reason: 'GET_BUSINESS_ACCESS_REQUESTS_FAILED',
      error_message: err && err.message,
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const approveBusinessRequest = async (req, res, next) => {
  const client = await pool.connect();
  const adminId = getAdminId(req);
  const { id } = req.params;

  try {
    const locationId = req.locationId;

    await client.query('BEGIN');

    const requestResult = await client.query(
      `
        SELECT
          bar.id,
          bar.user_id,
          bar.location_id,
          bar.business_name,
          bar.owner_name,
          bar.phone,
          bar.category,
          bar.address,
          bar.description,
          bar.status,
          u.name AS user_name,
          u.phone AS user_phone
        FROM business_access_requests bar
        JOIN users u ON u.id = bar.user_id
        WHERE bar.id = $1
          AND bar.location_id = $2
        FOR UPDATE OF bar
      `,
      [id, locationId],
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return next(createError(404, 'BUSINESS_REQUEST_NOT_FOUND', 'Business request not found'));
    }

    const businessRequest = requestResult.rows[0];

    if (businessRequest.status !== 'PENDING') {
      await client.query('ROLLBACK');
      client.release();
      return next(createError(409, 'BUSINESS_REQUEST_INVALID_STATUS', 'Business request is not pending'));
    }

    await client.query(
      `
        UPDATE business_access_requests
        SET status = 'APPROVED',
            approved_by = $1,
            approved_at = NOW(),
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = $2
      `,
      [adminId, businessRequest.id],
    );

    const userUpdateResult = await client.query(
      `
        UPDATE users
        SET role = $1,
            updated_at = NOW()
        WHERE id = $2
          AND location_id = $3
      `,
      [ROLES.BUSINESS, businessRequest.user_id, locationId],
    );

    if (userUpdateResult.rowCount !== 1) {
      throw new Error('Business request approval user role update failed');
    }

    const shopResult = await client.query(
      `
        SELECT id
        FROM shops
        WHERE owner_id = $1
          AND location_id = $2
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [businessRequest.user_id, locationId],
    );

    if (shopResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO shops (
            name,
            description,
            owner_id,
            location_id,
            approval_status,
            is_open,
            is_hidden,
            category,
            address,
            phone
          )
          VALUES ($1, $2, $3, $4, 'APPROVED', true, false, $5, $6, $7)
        `,
        [
          businessRequest.business_name,
          businessRequest.description,
          businessRequest.user_id,
          locationId,
          businessRequest.category,
          businessRequest.address,
          businessRequest.phone,
        ],
      );
    }

    await client.query('COMMIT');
    client.release();

    logAdminBusinessAccessRequest(req, 'BUSINESS_ACCESS_REQUEST_APPROVED', {
      business_request_id: businessRequest.id,
      user_id: businessRequest.user_id,
    });

    return res.json({ message: 'Business request approved' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error(JSON.stringify({
        level: 'error',
        request_id: req.request_id,
        admin_id: adminId,
        business_request_id: id,
        reason: 'APPROVE_BUSINESS_ACCESS_REQUEST_ROLLBACK_FAILED',
        error_message: rollbackErr && rollbackErr.message,
      }));
    }

    client.release();
    console.error(JSON.stringify({
      level: 'error',
      request_id: req.request_id,
      admin_id: adminId,
      business_request_id: id,
      reason: 'APPROVE_BUSINESS_ACCESS_REQUEST_FAILED',
      error_message: err && err.message,
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const rejectBusinessRequest = async (req, res, next) => {
  const client = await pool.connect();
  const adminId = getAdminId(req);
  const { id } = req.params;

  try {
    const locationId = req.locationId;
    const reason = trimText(req.body.reason);

    await client.query('BEGIN');

    const requestResult = await client.query(
      `
        SELECT id, status
        FROM business_access_requests
        WHERE id = $1
          AND location_id = $2
        FOR UPDATE
      `,
      [id, locationId],
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return next(createError(404, 'BUSINESS_REQUEST_NOT_FOUND', 'Business request not found'));
    }

    if (requestResult.rows[0].status !== 'PENDING') {
      await client.query('ROLLBACK');
      client.release();
      return next(createError(409, 'BUSINESS_REQUEST_INVALID_STATUS', 'Business request is not pending'));
    }

    await client.query(
      `
        UPDATE business_access_requests
        SET status = 'REJECTED',
            rejection_reason = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [reason, id],
    );

    await client.query('COMMIT');
    client.release();

    logAdminBusinessAccessRequest(req, 'BUSINESS_ACCESS_REQUEST_REJECTED', {
      business_request_id: id,
    });

    return res.json({ message: 'Business request rejected' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error(JSON.stringify({
        level: 'error',
        request_id: req.request_id,
        admin_id: adminId,
        business_request_id: id,
        reason: 'REJECT_BUSINESS_ACCESS_REQUEST_ROLLBACK_FAILED',
        error_message: rollbackErr && rollbackErr.message,
      }));
    }

    client.release();
    console.error(JSON.stringify({
      level: 'error',
      request_id: req.request_id,
      admin_id: adminId,
      business_request_id: id,
      reason: 'REJECT_BUSINESS_ACCESS_REQUEST_FAILED',
      error_message: err && err.message,
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = {
  getBusinessRequests,
  approveBusinessRequest,
  rejectBusinessRequest,
};
