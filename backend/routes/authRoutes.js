const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp, register, login } = require('../controllers/authController');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and User Management
 */

// OTP endpoints are deprecated in favor of Firebase Auth on client side.
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Registration is now handled by authFirebase.js (overrides this route).
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with Phone and Password
 *     description: >
 *       Standard login using phone number and password.
 *       Does NOT require Firebase token.
 *       Returns a Manacity JWT.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "1234567890"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
// SAFEGUARD: Login is password-only by design.
// OTP/Firebase is used ONLY for registration and password reset flows.
// Do NOT add Firebase middleware here.
router.post('/login', login);

module.exports = router;