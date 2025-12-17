const express = require('express');
const router = express.Router();
const serviceCategoryController = require('../controllers/serviceCategoryController');
const requireRole = require('../middlewares/roleMiddleware');

// Apply role check for all routes in this router
router.use(requireRole('LOCAL_ADMIN'));

router.post('/', serviceCategoryController.createCategory);
router.get('/', serviceCategoryController.getCategories);
router.patch('/:categoryId/status', serviceCategoryController.toggleCategory);

module.exports = router;