const { Server } = require('socket.io');

let io = null;

/**
 * Initialize Socket.IO connection
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io]: Client connected -> ID: ${socket.id}`);

    // Ping / Pong health check event
    socket.on('ping_server', (data) => {
      console.log(`[Socket.io]: Ping received from ${socket.id}`, data);
      socket.emit('pong_client', {
        message: 'Socket server is active and connected',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io]: Client disconnected -> ID: ${socket.id}, Reason: ${reason}`);
    });
  });

  return io;
};

/**
 * Get Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO,
};
