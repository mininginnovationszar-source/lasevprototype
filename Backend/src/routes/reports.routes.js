const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const svc         = require('../services/report.service');

router.use(requireAuth);
router.use(requireRole('owner', 'developer'));

// GET /api/reports/revenue?month=5&year=2026
router.get('/revenue', async (req, res, next) => {
  try {
    const now   = new Date();
    const month = req.query.month || now.getMonth() + 1;
    const year  = req.query.year  || now.getFullYear();
    res.json(await svc.getRevenueSummary(month, year));
  } catch (e) { next(e); }
});

// GET /api/reports/occupancy
router.get('/occupancy', async (req, res, next) => {
  try { res.json(await svc.getOccupancyReport()); } catch (e) { next(e); }
});

module.exports = router;
