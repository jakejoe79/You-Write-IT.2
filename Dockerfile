FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

COPY backend/ ./backend/
COPY prompts/ ./prompts/

# Create non-root user and data directory
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

USER nodejs

EXPOSE 3000

CMD ["node", "backend/server.js"]
