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

  if (!phone_number) {
    return res.status(400).json({ error: 'Firebase token missing phone number' });
  }

  try {
    // Check if user exists using the verified phone number from Firebase
    const userResult = await query('SELECT * FROM users WHERE phone = $1', [phone_number]);
    let user = userResult.rows[0];

    if (!user) {
      // Create new user if not exists
      // Defaulting role to USER. location_id is optional but recommended if required by DB constraints.
      const { location_id } = req.body;
      
      const insertResult = await query(
        'INSERT INTO users (phone, role, location_id) VALUES ($1, $2, $3) RETURNING *',
        [phone_number, 'USER', location_id || null]
      );
      user = insertResult.rows[0];
    }

    // Generate Manacity JWT
    const token = generateToken(user);

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