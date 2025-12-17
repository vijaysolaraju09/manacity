const { query } = require('../config/db');

const addProduct = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { name, description, price } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Input Validation
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Product name is required (min 2 chars)' });
    }
    if (price === undefined || price < 0) {
      return res.status(400).json({ error: 'Valid price is required (>= 0)' });
    }

    // 2. Shop Validation
    // We fetch by ID and Location first to distinguish between 404 (Not Found) and 403 (Not Owner)
    const shopQuery = `
      SELECT id, owner_id, approval_status, is_hidden
      FROM shops
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const shopRes = await query(shopQuery, [shopId, locationId]);

    if (shopRes.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found in this location' });
    }

    const shop = shopRes.rows[0];

    // Check Ownership
    if (shop.owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own this shop' });
    }

    // Check Status
    if (shop.approval_status !== 'APPROVED') {
      return res.status(409).json({ error: 'Shop is not approved' });
    }
    if (shop.is_hidden) {
      return res.status(409).json({ error: 'Shop is hidden' });
    }

    // 3. Insert Product
    const insertQuery = `
      INSERT INTO products (shop_id, location_id, name, description, price, is_available)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `;
    const insertRes = await query(insertQuery, [shopId, locationId, name, description, price]);

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Add Product Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description, price, is_available } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Validate Input (if provided)
    if (name !== undefined && name.trim().length < 2) {
      return res.status(400).json({ error: 'Product name must be at least 2 characters' });
    }
    if (price !== undefined && price < 0) {
      return res.status(400).json({ error: 'Price must be >= 0' });
    }

    // 2. Validate Existence & Ownership via Shop
    const checkSql = `
      SELECT p.id, s.owner_id
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      WHERE p.id = $1 AND p.location_id = $2 AND p.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [productId, locationId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in this location' });
    }

    if (checkRes.rows[0].owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own this product' });
    }

    // 3. Build Dynamic Update Query
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (price !== undefined) { fields.push(`price = $${idx++}`); values.push(price); }
    if (is_available !== undefined) { fields.push(`is_available = $${idx++}`); values.push(is_available); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(productId);
    values.push(locationId);

    const updateSql = `
      UPDATE products
      SET ${fields.join(', ')}
      WHERE id = $${idx++} AND location_id = $${idx++}
      RETURNING *
    `;

    const updateRes = await query(updateSql, values);
    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Update Product Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Validate Existence & Ownership via Shop
    const checkSql = `
      SELECT p.id, s.owner_id
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      WHERE p.id = $1 AND p.location_id = $2 AND p.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [productId, locationId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in this location' });
    }

    if (checkRes.rows[0].owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own this product' });
    }

    // 2. Soft Delete
    const deleteSql = `
      UPDATE products
      SET deleted_at = NOW()
      WHERE id = $1 AND location_id = $2
    `;
    await query(deleteSql, [productId, locationId]);

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete Product Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { addProduct, updateProduct, deleteProduct };