# Multi-stage Containerfile for Database Manager
# Uses Red Hat UBI8 Node.js 22 base image for optimal security and performance

# =============================================================================
# Build Stage - Install dependencies and build the application
# =============================================================================
FROM registry.access.redhat.com/ubi8/nodejs-22:1-1754586089 AS builder

# Set metadata labels
LABEL name="db-mgr-builder" \
      version="1.0.0" \
      description="Database Manager - Build Stage" \
      maintainer="Database Manager Team"

# Switch to root for package installations
USER root

# Install system dependencies needed for build
RUN dnf update -y && \
    dnf install -y \
      git \
      python3 \
      make \
      gcc \
      gcc-c++ && \
    dnf clean all

# Switch back to default user
USER 1001

# Set working directory
WORKDIR /opt/app-root/src

# Copy package files for dependency installation
# This is done first to leverage Docker layer caching
COPY --chown=1001:0 package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --include=dev --no-audit --no-fund

# Copy source code
COPY --chown=1001:0 . .

# Build the React application
RUN npm run build

# Remove devDependencies to reduce size in this stage
RUN npm prune --production

# =============================================================================
# Runtime Stage - Minimal production image
# =============================================================================
FROM registry.access.redhat.com/ubi8/nodejs-22:1-1754586089 AS runtime

# Set metadata labels
LABEL name="db-mgr" \
      version="1.0.0" \
      description="Database Manager - Production Runtime" \
      maintainer="Database Manager Team" \
      summary="A modern web application for managing database containers" \
      io.k8s.description="React-based database container management interface" \
      io.k8s.display-name="Database Manager" \
      io.openshift.tags="database,containers,react,nodejs,management"

# Switch to root for system configuration
USER root

# Install runtime system dependencies
RUN dnf update -y && \
    dnf install -y \
      # Required for container socket communication
      socat \
      # Process management utilities
      procps-ng && \
    dnf clean all && \
    # Remove unnecessary files to reduce image size
    rm -rf /var/cache/dnf/* \
           /tmp/* \
           /var/tmp/*

# Create application directory with proper permissions
RUN mkdir -p /opt/app-root/src && \
    chown -R 1001:0 /opt/app-root/src && \
    chmod -R g+rw /opt/app-root/src

# Switch to non-root user for security
USER 1001

# Set working directory
WORKDIR /opt/app-root/src

# Copy production dependencies from builder stage
COPY --from=builder --chown=1001:0 /opt/app-root/src/node_modules ./node_modules

# Copy built application artifacts
COPY --from=builder --chown=1001:0 /opt/app-root/src/dist ./dist

# Copy server files
COPY --chown=1001:0 proxy-server.js ./
COPY --chown=1001:0 package*.json ./

# Create a simple startup script
RUN echo '#!/bin/bash' > start.sh && \
    echo 'set -e' >> start.sh && \
    echo 'echo "🚀 Starting Database Manager..."' >> start.sh && \
    echo 'echo "📋 Environment:"' >> start.sh && \
    echo 'echo "  - Node.js: $(node --version)"' >> start.sh && \
    echo 'echo "  - NPM: $(npm --version)"' >> start.sh && \
    echo 'echo "  - User: $(whoami)"' >> start.sh && \
    echo 'echo "  - Working Directory: $(pwd)"' >> start.sh && \
    echo 'echo "🔌 Looking for container sockets..."' >> start.sh && \
    echo 'node proxy-server.js' >> start.sh && \
    chmod +x start.sh

# Set environment variables for production
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    # Container socket paths (will be auto-detected)
    DOCKER_SOCKET="" \
    PODMAN_SOCKET="" \
    # Security settings
    NODE_OPTIONS="--max-old-space-size=512"

# Expose the application port
EXPOSE 8080

# Health check to ensure the service is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use startup script as entrypoint
CMD ["./start.sh"]

# =============================================================================
# Build Information
# =============================================================================
# To build this image:
#   podman build -f Containerfile -t db-mgr:latest .
#
# To run the container:
#   podman run -d \
#     --name db-mgr \
#     -p 8080:8080 \
#     -v /var/run/docker.sock:/var/run/docker.sock:z \
#     db-mgr:latest
#
# For Podman socket:
#   podman run -d \
#     --name db-mgr \
#     -p 8080:8080 \
#     -v $XDG_RUNTIME_DIR/podman/podman.sock:/var/run/podman.sock:z \
#     db-mgr:latest
# =============================================================================