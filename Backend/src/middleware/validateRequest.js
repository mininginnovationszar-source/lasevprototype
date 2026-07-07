// Validates that required fields exist and are not empty.
// Usage: validateRequest(['customerName', 'checkIn', 'checkOut'])

function validateRequest(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(
      (field) => req.body[field] === undefined || req.body[field] === ''
    );

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
}

module.exports = validateRequest;
