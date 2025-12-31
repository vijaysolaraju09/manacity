const { query } = require('../config/db');
const { createError } = require('../utils/errors');

// Helper to handle Open/Close logic
const setShopOpenStatus = async (req, res, next, isOpen) => {
  try {
    const { shopId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Fetch shop details to validate ownership and status
    const checkSql = `
      SELECT id, owner_id, approval_status 
      FROM shops 
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [shopId, locationId]);

    if (checkRes.rows.length === 0) {
      return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found in this location'));
    }

    const shop = checkRes.rows[0];

    // 2. Validate Ownership
    if (shop.owner_id !== user_id) {
      return next(createError(403, 'SHOP_OWNERSHIP_REQUIRED', 'You do not own this shop'));
    }

    // 3. Validate Approval Status
    if (shop.approval_status !== 'APPROVED') {
      return next(createError(409, 'SHOP_NOT_APPROVED', 'Shop must be APPROVED to open/close'));
    }

    // 4. Update Status
    const updateSql = `
      UPDATE shops 
      SET is_open = $3, updated_at = NOW() 
      WHERE id = $1 AND location_id = $2 
      RETURNING *
    `;
    const updateRes = await query(updateSql, [shopId, locationId, isOpen]);

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error(`Set Shop Open Status (${isOpen}) Error:`, err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

// Helper to handle Hide/Unhide logic
const setShopHiddenStatus = async (req, res, next, isHidden) => {
  try {
    const { shopId } = req.params;
    const locationId = req.locationId;

    // 1. Validate existence in location
    const checkSql = `
      SELECT id FROM shops 
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [shopId, locationId]);

    if (checkRes.rows.length === 0) {
      return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found in this location'));
    }

    // 2. Update Visibility
    const updateSql = `
      UPDATE shops 
      SET is_hidden = $3, updated_at = NOW() 
      WHERE id = $1 AND location_id = $2 
      RETURNING *
    `;
    const updateRes = await query(updateSql, [shopId, locationId, isHidden]);

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error(`Set Shop Hidden Status (${isHidden}) Error:`, err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const openShop = (req, res, next) => setShopOpenStatus(req, res, next, true);
const closeShop = (req, res, next) => setShopOpenStatus(req, res, next, false);
const hideShop = (req, res, next) => setShopHiddenStatus(req, res, next, true);
const unhideShop = (req, res, next) => setShopHiddenStatus(req, res, next, false);

module.exports = {
  openShop,
  closeShop,
  hideShop,
  unhideShop
};
