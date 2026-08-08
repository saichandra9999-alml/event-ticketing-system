# Node.js 20 Alpine Base Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies
RUN npm ci --only=production

# Generate Prisma Client
RUN npx prisma generate

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 5000

# Environment variables default to production
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["node", "src/index.js"]
