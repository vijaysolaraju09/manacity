const express = require('express');
const router = express.Router();
const localNewsAdminController = require('../controllers/localNewsAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.post('/', localNewsAdminController.createNews);
router.get('/', localNewsAdminController.listNewsAdmin);
router.put('/:newsId', localNewsAdminController.updateNews);
router.delete('/:newsId', localNewsAdminController.deleteNews);

module.exports = router;