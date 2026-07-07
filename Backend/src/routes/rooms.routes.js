const router     = require('express').Router();
const ctrl       = require('../controllers/rooms.controller');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate   = require('../middleware/validateRequest');

// All room routes require login
router.use(requireAuth);

router.get('/',     ctrl.getAll);
router.get('/:id',  ctrl.getOne);

// Only owner/developer can add, edit, or delete rooms
router.post('/',    requireRole('owner', 'developer'), validate(['number', 'type', 'price', 'capacity']), ctrl.create);
router.put('/:id',  requireRole('owner', 'developer'), ctrl.update);
router.delete('/:id', requireRole('owner', 'developer'), ctrl.remove);

module.exports = router;
