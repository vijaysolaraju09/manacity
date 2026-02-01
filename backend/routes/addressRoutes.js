const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

router.get('/my', requireRole(ROLES.USER, ROLES.BUSINESS), addressController.getMyAddresses);
router.post('/', requireRole(ROLES.USER, ROLES.BUSINESS), addressController.createAddress);
router.patch('/:addressId', requireRole(ROLES.USER, ROLES.BUSINESS), addressController.updateAddress);
router.delete('/:addressId', requireRole(ROLES.USER, ROLES.BUSINESS), addressController.deleteAddress);

module.exports = router;
