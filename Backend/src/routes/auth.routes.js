const router         = require('express').Router();
const authController = require('../controllers/auth.controller');
const requireAuth    = require('../middleware/requireAuth');
const validate       = require('../middleware/validateRequest');

// POST /api/auth/login
router.post('/login', validate(['name', 'password']), authController.login);

// GET /api/auth/me  — returns logged-in user from token
router.get('/me', requireAuth, authController.me);

router.post('/switch-user', requireAuth, validate(['userId']), authController.switchUser);

module.exports = router;
