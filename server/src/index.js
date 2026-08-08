require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const { startLockCleanupTask } = require('./services/seat.service');

const PORT = process.env.PORT || 5000;

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSockets
initSocket(server);

// Start automatic 5-minute lock expiration cleanup task
startLockCleanupTask(10000);

// Start Server
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Event Ticketing Server running on port: ${PORT}`);
  console.log(`🔗 API Health URL: http://localhost:${PORT}/api/health`);
  console.log(`=================================================`);
});
