const { sendError } = require('../utils/responseHandler');

/**
 * Middleware to restrict access based on user roles
 * @param  {...string} allowedRoles - Roles allowed to perform the action (e.g., 'ORGANIZER', 'ADMIN')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'User authentication required', 401);
    }

    const userRole = (req.user.role || 'USER').toUpperCase();
    const normalizedAllowedRoles = allowedRoles.map((r) => r.toUpperCase());

    if (!normalizedAllowedRoles.includes(userRole) && userRole !== 'ADMIN') {
      return sendError(res, 'Access denied. You do not have permission to perform this action', 403);
    }

    next();
  };
};

module.exports = {
  authorize,
};
