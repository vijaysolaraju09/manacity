const { query } = require('../config/db');

// Helper to handle Open/Close logic
const setShopOpenStatus = async (req, res, isOpen) => {
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
      return res.status(404).json({ error: 'Shop not found in this location' });
    }

    const shop = checkRes.rows[0];

    // 2. Validate Ownership
    if (shop.owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own this shop' });
    }

    // 3. Validate Approval Status
    if (shop.approval_status !== 'APPROVED') {
      return res.status(409).json({ error: 'Shop must be APPROVED to open/close' });
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Helper to handle Hide/Unhide logic
const setShopHiddenStatus = async (req, res, isHidden) => {
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
      return res.status(404).json({ error: 'Shop not found in this location' });
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const openShop = (req, res) => setShopOpenStatus(req, res, true);
const closeShop = (req, res) => setShopOpenStatus(req, res, false);
const hideShop = (req, res) => setShopHiddenStatus(req, res, true);
const unhideShop = (req, res) => setShopHiddenStatus(req, res, false);

module.exports = {
  openShop,
  closeShop,
  hideShop,
  unhideShop
};