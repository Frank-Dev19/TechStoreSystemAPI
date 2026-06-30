# ============================================================================
# STAGE 1: Build
# ============================================================================
# Use Node.js 20 Alpine as the base image for compilation
# Alpine reduces image size significantly (~150MB vs ~900MB with standard Node)
FROM node:20-alpine AS build

# Set working directory for build stage
WORKDIR /app

# Copy only package files first to leverage Docker layer caching
# This layer won't be invalidated if only source code changes
# package-lock.json ensures reproducible builds across different environments
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
# npm ci (clean install) is preferred in Docker over npm install
# --prefer-offline: Uses cached packages when available
# --no-audit: Skips security audit in CI for faster builds
RUN npm ci --prefer-offline --no-audit

# Copy source code and build configuration files
# Placed after npm install to maximize layer caching
COPY . .

# Build the NestJS application
# Compiles TypeScript (src/) to JavaScript (dist/)
# Output is self-contained and production-ready
RUN npm run build

# ============================================================================
# STAGE 2: Runtime (Final Image)
# ============================================================================
# Use the same Alpine base for consistency and minimal final image size
FROM node:20-alpine AS runtime

# Add metadata labels for image documentation and tracking
LABEL maintainer="TechStore Team"
LABEL version="1.0"
LABEL description="TechStore System API - NestJS production application"

# Create a non-root user for enhanced security
# Running as root in containers is a security risk; non-root prevents privilege escalation
# addgroup: Creates the nodejs group (GID 1001)
# adduser: Creates the nodejs user (UID 1001) in the nodejs group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory for runtime
WORKDIR /app

# Set environment to production
# NODE_ENV=production optimizes Node.js startup and performance
# Disables development-only middleware and improves memory usage
ENV NODE_ENV=production

# Copy compiled application from build stage
# Only copies the dist/ folder (compiled code), not source or build tools
# Significantly reduces final image size
COPY --from=build /app/dist ./dist

# Copy package files for production dependency installation
COPY package*.json ./

# Install only production dependencies
# --omit=dev excludes devDependencies (smaller image)
# --prefer-offline uses cached packages when available
# --no-audit skips security audit for faster builds
RUN npm ci --omit=dev --prefer-offline --no-audit

# Clean npm cache to reduce image size (optional but recommended)
# Removes temporary files created during npm install
RUN npm cache clean --force

# Change ownership of all files to the non-root user
# Ensures the nodejs user has permissions to read/write application files
RUN chown -R nodejs:nodejs /app

# Switch to non-root user for security
# All subsequent commands and the running container will use this user
USER nodejs

# Expose the application port
# Port 3000 is where the NestJS application listens
# Note: EXPOSE doesn't actually publish the port; use -p flag when running
EXPOSE 3000

# Configure health check
# Monitors the application health every 10 seconds
# Allows Docker to detect if the container is unhealthy
# If health check fails 3 times, the container is marked unhealthy
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Start the NestJS application in production mode
# Uses exec form of CMD (preferred) to handle signals correctly
# Allows proper shutdown on SIGTERM (graceful termination)
CMD ["node", "dist/main.js"]
