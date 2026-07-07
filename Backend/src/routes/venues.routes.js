const router      = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validateRequest');
const svc         = require('../services/venueBooking.service');
const activity    = require('../services/activityLog.service');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try { res.json(await svc.getAllVenueBookings()); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await svc.getVenueBookingById(req.params.id)); } catch (e) { next(e); }
});

router.post('/',
  validate(['clientName', 'contact', 'venueType', 'eventType', 'eventDate', 'eventTime', 'guests', 'amount', 'payment']),
  async (req, res, next) => {
    try {
      const booking = await svc.createVenueBooking(req.body, req.user.id);
      await activity.log(`Created venue booking for ${booking.client_name || req.body.clientName}`, req.user);
      res.status(201).json(booking);
    } catch (e) { next(e); }
  }
);

router.put('/:id', async (req, res, next) => {
  try {
    const booking = await svc.updateVenueBooking(req.params.id, req.body);
    await activity.log(`Updated venue booking for ${booking.client_name || req.body.clientName || req.params.id}`, req.user);
    res.json(booking);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('owner', 'developer'), async (req, res, next) => {
  try {
    const booking = await svc.getVenueBookingById(req.params.id).catch(() => null);
    await svc.deleteVenueBooking(req.params.id);
    await activity.log(`Deleted venue booking${booking?.client_name ? ` for ${booking.client_name}` : ` ${req.params.id}`}`, req.user);
    res.json({ message: 'Venue booking deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
