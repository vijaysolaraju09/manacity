const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * @swagger
 * /api/public/locations:
 *   get:
 *     summary: Get active locations
 *     description: Retrieve all active locations that can be shown before a user logs in.
 *     tags: [Public]
 *     security: []
 *     responses:
 *       200:
 *         description: List of active locations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "d290f1ee-6c54-4b01-90e6-d701748f0851"
 *                       name:
 *                         type: string
 *                         example: Rayachoty
 *                       pincode:
 *                         type: string
 *                         example: "516269"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *       500:
 *         description: Error fetching locations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/locations', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, pincode, is_active FROM locations WHERE is_active = true ORDER BY name ASC;'
    );

    res.json({
      status: 'ok',
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching public locations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Unable to fetch locations',
    });
  }
});

// Quick manual test (no auth required):
// curl https://api.manacity.app/api/public/locations

module.exports = router;
