# Single Dockerfile for both Frontend and Backend
FROM node:20-alpine

# Install build dependencies for bcrypt and other native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better caching
COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

# 1. Install dependencies for both (better caching)
RUN cd frontend && npm install
RUN cd server && npm install

# 2. Copy the rest of the source code
COPY . .

# 3. Build the Frontend (requires source code)
RUN cd frontend && npm run build

# Install a simple web server to serve the frontend build
RUN npm install -g serve

# Default ports
EXPOSE 9000
EXPOSE 80

# The default command (can be overridden in docker-compose)
CMD ["node", "server/src/index.js"]
