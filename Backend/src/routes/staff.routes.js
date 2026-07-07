const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validateRequest');
const svc         = require('../services/staffShift.service');
const activity    = require('../services/activityLog.service');

router.use(requireAuth);

// Staff management
router.get('/', async (req, res, next) => {
  try { res.json(await svc.getAllStaff()); } catch (e) { next(e); }
});

router.post('/', requireRole('owner', 'developer'), validate(['name', 'department']), async (req, res, next) => {
  try {
    const staff = await svc.createStaff(req.body);
    await activity.log(`Created staff member ${staff.name}`, req.user);
    res.status(201).json(staff);
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('owner', 'developer'), async (req, res, next) => {
  try {
    const staff = await svc.updateStaff(req.params.id, req.body);
    await activity.log(`${staff.status === 'inactive' ? 'Removed' : 'Updated'} staff member ${staff.name}`, req.user);
    res.json(staff);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('owner', 'developer'), async (req, res, next) => {
  try {
    const staff = await svc.deleteStaff(req.params.id);
    await activity.log(`Deleted staff member ${staff.name}`, req.user);
    res.json({ message: 'Staff member deleted.' });
  } catch (e) { next(e); }
});

// Shifts
router.get('/shifts', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.json(await svc.getShiftsForDate(date));
  } catch (e) { next(e); }
});

router.post('/shifts/clock-in', validate(['staffId']), async (req, res, next) => {
  try {
    const shift = await svc.clockIn(req.body.staffId, req.body.note, req.user.id);
    await activity.log(`Clocked in staff #${req.body.staffId}`, req.user);
    res.status(201).json(shift);
  } catch (e) { next(e); }
});

router.post('/shifts/clock-out', validate(['shiftId']), async (req, res, next) => {
  try {
    const shift = await svc.clockOut(req.body.shiftId, req.user.id);
    await activity.log(`Clocked out shift #${req.body.shiftId}`, req.user);
    res.json(shift);
  } catch (e) { next(e); }
});

module.exports = router;
