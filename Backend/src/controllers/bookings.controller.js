const bookingService = require('../services/booking.service');
const activity       = require('../services/activityLog.service');

async function getAll(req, res, next) {
  try {
    const bookings = await bookingService.getAllBookings();
    res.json(bookings);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const booking = await bookingService.getBookingById(req.params.id);
    res.json(booking);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const booking = await bookingService.createBooking(req.body, req.user.id);
    await activity.log(`Created room booking for ${booking.customer_name || booking.customerName || req.body.customerName}`, req.user);
    res.status(201).json(booking);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const booking = await bookingService.updateBooking(req.params.id, req.body, req.user.id);
    await activity.log(`Updated room booking for ${booking.customer_name || booking.customerName || req.body.customerName || req.params.id}`, req.user);
    res.json(booking);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const booking = await bookingService.getBookingById(req.params.id).catch(() => null);
    await bookingService.deleteBooking(req.params.id);
    await activity.log(`Deleted room booking${booking?.customer_name ? ` for ${booking.customer_name}` : ` ${req.params.id}`}`, req.user);
    res.json({ message: 'Booking deleted.' });
  } catch (err) { next(err); }
}

function attachmentName(req) {
  const fromHeader = req.get('x-file-name');
  return fromHeader ? decodeURIComponent(fromHeader) : 'quotation.pdf';
}

async function listAttachments(req, res, next) {
  try {
    const attachments = await bookingService.listBookingAttachments(req.params.id);
    res.json(attachments);
  } catch (err) { next(err); }
}

async function uploadAttachment(req, res, next) {
  try {
    const attachment = await bookingService.addBookingAttachment(req.params.id, {
      fileName: attachmentName(req),
      contentType: req.get('content-type'),
      data: req.body,
    }, req.user.id);
    await activity.log(`Attached quotation PDF ${attachment.file_name} to booking ${req.params.id}`, req.user);
    res.status(201).json(attachment);
  } catch (err) { next(err); }
}

async function downloadAttachment(req, res, next) {
  try {
    const attachment = await bookingService.getBookingAttachment(req.params.id, req.params.attachmentId);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    const safeName = String(attachment.file_name).replace(/"/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', attachment.file_size);
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.send(attachment.file_data);
  } catch (err) { next(err); }
}

async function removeAttachment(req, res, next) {
  try {
    const attachment = await bookingService.deleteBookingAttachment(req.params.id, req.params.attachmentId);
    await activity.log(`Removed quotation PDF ${attachment.file_name} from booking ${req.params.id}`, req.user);
    res.json({ message: 'Attachment deleted.' });
  } catch (err) { next(err); }
}

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  removeAttachment,
};
