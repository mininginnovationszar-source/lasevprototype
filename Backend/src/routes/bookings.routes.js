const express     = require('express');
const router      = express.Router();
const ctrl        = require('../controllers/bookings.controller');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validateRequest');

router.use(requireAuth);

router.get('/',     ctrl.getAll);
router.get('/:id/attachments', ctrl.listAttachments);
router.post('/:id/attachments', express.raw({ type: 'application/pdf', limit: '10mb' }), ctrl.uploadAttachment);
router.get('/:id/attachments/:attachmentId', ctrl.downloadAttachment);
router.delete('/:id/attachments/:attachmentId', requireRole('owner', 'developer'), ctrl.removeAttachment);
router.get('/:id',  ctrl.getOne);
router.post('/',    validate(['customerName', 'contact', 'roomId', 'checkIn', 'checkOut', 'payment']), ctrl.create);
router.put('/:id',  ctrl.update);

// Only owner/developer can delete a booking
router.delete('/:id', requireRole('owner', 'developer'), ctrl.remove);

module.exports = router;
