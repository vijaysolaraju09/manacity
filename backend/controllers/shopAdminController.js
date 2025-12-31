const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const getPendingShops = async (req, res, next) => {
  try {
    const locationId = req.locationId;

    const sql = `
      SELECT * FROM shops
      WHERE approval_status = 'PENDING'
        AND location_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    
    const { rows } = await query(sql, [locationId]);
    res.json(rows);
  } catch (err) {
    console.error('Get Pending Shops Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const approveShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const locationId = req.locationId;

    // 1. Validate existence and status within the admin's location
    const checkSql = `
      SELECT id, approval_status FROM shops
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [shopId, locationId]);

    if (checkRes.rows.length === 0) {
      return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found in this location'));
    }

    if (checkRes.rows[0].approval_status !== 'PENDING') {
      return next(createError(409, 'SHOP_STATUS_INVALID', 'Shop is not in PENDING status'));
    }

    // 2. Update status
    const updateSql = `
      UPDATE shops
      SET approval_status = 'APPROVED', updated_at = NOW()
      WHERE id = $1 AND location_id = $2
      RETURNING *
    `;
    const updateRes = await query(updateSql, [shopId, locationId]);

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Approve Shop Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const rejectShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const { reason } = req.body;
    const locationId = req.locationId;

    // 1. Input Validation
    if (!reason || reason.trim().length < 5) {
      return next(createError(400, 'SHOP_REJECTION_REASON_INVALID', 'Rejection reason is required (min 5 chars)'));
    }

    // 2. Validate existence and status within the admin's location
    const checkSql = `
      SELECT id, approval_status FROM shops
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [shopId, locationId]);

    if (checkRes.rows.length === 0) {
      return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found in this location'));
    }

    if (checkRes.rows[0].approval_status !== 'PENDING') {
      return next(createError(409, 'SHOP_STATUS_INVALID', 'Shop is not in PENDING status'));
    }

    // 3. Update status
    const updateSql = `
      UPDATE shops
      SET approval_status = 'REJECTED', updated_at = NOW()
      WHERE id = $1 AND location_id = $2
      RETURNING *
    `;
    const updateRes = await query(updateSql, [shopId, locationId]);

    // 4. Log reason
    console.log("SHOP REJECTED:", shopId, reason);

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Reject Shop Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getPendingShops, approveShop, rejectShop };
