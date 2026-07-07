// Use AFTER requireAuth.
// Example: requireRole('owner', 'developer')
// This matches exactly how your frontend auth.js already defines roles.

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
}

module.exports = requireRole;
