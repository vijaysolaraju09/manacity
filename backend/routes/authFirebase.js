const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { generateToken } = require('../utils/jwt');
const verifyFirebaseToken = require('../middlewares/firebaseAuth');
const bcrypt = require('bcrypt');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication using Firebase (Registration & Reset)
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (Firebase Protected)
 *     description: >
 *       Registers a new user using a verified Firebase ID token.
 *       The phone number is extracted securely from the Firebase token.
 *       Requires `Authorization: Bearer <firebase_id_token>`.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location_id:
 *                 type: integer
 *                 description: Optional location ID for the user context.
 *     responses:
 *       200:
 *         description: User registered successfully. Returns Manacity JWT.
 *       400:
 *         description: Missing token or phone number
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', verifyFirebaseToken, async (req, res) => {
  const { phone_number } = req.firebaseUser;
  const { location_id } = req.body || {};

  if (!phone_number) {
    return res.status(400).json({ error: 'Firebase token missing phone number' });
  }

  try {
    if (!location_id) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    // Validate location is active
    const locationResult = await query(
      'SELECT id FROM locations WHERE id = $1 AND is_active = true',
      [location_id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive location' });
    }

    // Check if user exists using the verified phone number from Firebase
    const userResult = await query('SELECT id FROM users WHERE phone = $1', [phone_number]);
    const existingUser = userResult.rows[0];

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(phone_number, salt);

    const insertResult = await query(
      `INSERT INTO users (phone, password_hash, role, location_id, approval_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone, role, location_id, name`,
      [phone_number, hashedPassword, 'USER', location_id, 'APPROVED']
    );
    const user = insertResult.rows[0];

    // Generate Manacity JWT
    const token = generateToken({
      user_id: user.id,
      role: user.role,
      location_id: user.location_id,
    });

    // Return response structure consistent with previous flow
    res.json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password (Firebase Protected)
 *     description: >
 *       Resets the user's password using a verified Firebase ID token.
 *       The phone number is extracted securely from the Firebase token.
 *       Requires `Authorization: Bearer <firebase_id_token>`.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "newPassword123"
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Missing password or user not found
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/reset-password', verifyFirebaseToken, async (req, res) => {
  const { phone_number } = req.firebaseUser;
  const { password } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'Firebase token missing phone number' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    // Check if user exists
    const userResult = await query('SELECT * FROM users WHERE phone = $1', [phone_number]);
    const user = userResult.rows[0];

    if (!user) {
      // Generic error to prevent user enumeration
      return res.status(400).json({ error: 'Unable to process request' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await query('UPDATE users SET password = $1 WHERE phone = $2', [hashedPassword, phone_number]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
