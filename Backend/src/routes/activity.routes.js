const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const svc         = require('../services/activityLog.service');

router.use(requireAuth);
router.use(requireRole('owner', 'developer'));

// GET /api/activity?limit=50
router.get('/', async (req, res, next) => {
  try {
    const requestedLimit = req.query.limit === 'all' ? 10000 : parseInt(req.query.limit, 10);
    const limit = req.user.role === 'developer'
      ? Math.min(requestedLimit || 500, 10000)
      : 20;
    res.json(await svc.getRecentLogs(limit));
  } catch (e) { next(e); }
});

// GET /api/activity/system?limit=200&level=error&event=server_error
router.get('/system', async (req, res, next) => {
  try {
    const requestedLimit = req.query.limit === 'all' ? 10000 : parseInt(req.query.limit, 10);
    const limit = req.user.role === 'developer'
      ? Math.min(requestedLimit || 500, 10000)
      : Math.min(requestedLimit || 100, 500);
    res.json(await svc.getSystemLogs({
      limit,
      level: req.query.level,
      event: req.query.event,
    }));
  } catch (e) { next(e); }
});

module.exports = router;
