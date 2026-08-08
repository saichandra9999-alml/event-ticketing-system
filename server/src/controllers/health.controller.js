const { sendSuccess } = require('../utils/responseHandler');

/**
 * Server Health Check Controller
 */
const getHealthStatus = (req, res) => {
  return sendSuccess(res, 'Event Ticketing System API is operational', {
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
};

module.exports = {
  getHealthStatus,
};
