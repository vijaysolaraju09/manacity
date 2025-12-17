const express = require('express');
const router = express.Router();
const multer = require('multer');
const contestUserController = require('../controllers/contestUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Configure Multer for memory storage (to pass buffer to S3)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

router.get('/active', contestUserController.getActiveContests);
router.post('/:contestId/entry', upload.single('photo'), contestUserController.submitEntry);
router.get('/my/entries', contestUserController.myEntries);

module.exports = router;
