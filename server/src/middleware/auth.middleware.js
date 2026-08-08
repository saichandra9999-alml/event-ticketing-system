const prisma = require('../config/db');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/responseHandler');

/**
 * Protect routes by verifying JWT Bearer Token
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    // Check for Authorization header format: Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendError(res, 'No authentication token provided, authorization denied', 401);
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return sendError(res, 'Invalid or expired token', 401);
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return sendError(res, 'User associated with token no longer exists', 401);
    }

    // Attach user payload to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  protect,
};
