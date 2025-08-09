# Database Manager

> A modern, web-based application for deploying and managing database containers using Docker/Podman.

A React-based application built with PatternFly components that provides an intuitive interface to deploy MariaDB and PostgreSQL databases via containers and manage their complete lifecycle. Features real-time monitoring, filesystem browsing, and comprehensive container management capabilities.

## ✨ Features

### 🚀 Database Deployment
- **Multi-Database Support**: Deploy MariaDB and PostgreSQL databases with ease
- **Version Management**: Support for multiple database versions with both multi-arch and UBI-specific container tags
- **Smart Configuration**: Intelligent defaults with customizable settings
- **Persistent Storage**: Configure persistent data storage with host filesystem browsing
- **Directory Management**: Create directories directly from the web interface

### 🐳 Container Management
- **Lifecycle Control**: Start, stop, restart, and delete database containers
- **Real-time Monitoring**: Live container logs, statistics, and status updates
- **Container Details**: Comprehensive views including configuration, environment, and runtime information
- **Managed Container Detection**: Automatically identifies and manages database containers created by the application

### 🔐 Security & Configuration
- **Secure Password Generation**: Built-in strong password generation with customizable complexity
- **Environment Variable Management**: Secure handling of sensitive configuration data
- **Input Validation**: Comprehensive validation for database names, ports, and configurations
- **Host Filesystem Security**: Safe directory browsing with traversal attack prevention

### 🎨 Modern User Interface
- **PatternFly Design System**: Professional, responsive interface built with Red Hat's PatternFly
- **Real-time Updates**: Live data updates using React Query
- **Interactive Components**: Intuitive forms, modals, and navigation
- **Visual Feedback**: Loading states, error handling, and success notifications

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript for type safety
- **UI Library**: PatternFly React components for consistent design
- **State Management**: React Query for server state management
- **Build Tool**: Vite for fast development and optimized builds

### Backend Proxy Server (Node.js + Express)
- **API Proxy**: Express.js server that communicates with Docker/Podman socket
- **Filesystem API**: Safe host filesystem browsing and directory creation
- **CORS Enabled**: Configured for development workflow
- **Socket Communication**: Direct Unix socket communication with container runtime

### Container Runtime Support
- **Docker**: Full Docker Engine compatibility
- **Podman**: Native Podman libpod API support
- **Auto-Detection**: Automatically detects available container runtime

## 📋 Prerequisites

- **Container Runtime**: Docker Engine or Podman installed and running
- **Node.js**: Version 18 or higher recommended
- **Container Socket**: Docker daemon or Podman socket service enabled

### Setting up Container Runtime

#### For Podman (Recommended)
```bash
# Enable and start the Podman socket for the current user
systemctl --user enable --now podman.socket

# Verify the socket is running
systemctl --user status podman.socket

# Check socket path
echo $XDG_RUNTIME_DIR/podman/podman.sock
```

#### For Docker
```bash
# Start Docker service (Linux)
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker is running
docker version

# Check socket path
ls -la /var/run/docker.sock
```

## 🚀 Quick Start

1. **Clone the repository**:
```bash
git clone <repository-url>
cd db-mgr
```

2. **Install dependencies**:
```bash
npm install
```

3. **Start the development environment**:
```bash
npm run dev:full
```
This starts both the proxy server (port 3001) and the React development server (port 5173).

4. **Open the application**:
Navigate to `http://localhost:5173` in your web browser.

## 🐳 Container Deployment

### Building the Container

The application includes a multi-stage Containerfile optimized for production deployment:

```bash
# Build the container image
npm run container:build

# Or manually with podman/docker
podman build -f Containerfile -t db-mgr:latest .
```

### Running the Container

#### With Docker Socket
```bash
# Using npm script
npm run container:run

# Or manually
podman run -d \
  --name db-mgr \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:z \
  db-mgr:latest
```

#### With Podman Socket
```bash
# Using npm script
npm run container:run:podman

# Or manually
podman run -d \
  --name db-mgr \
  -p 8080:8080 \
  -v $XDG_RUNTIME_DIR/podman/podman.sock:/var/run/podman.sock:z \
  db-mgr:latest
```

### Container Configuration

The container exposes port 8080 and serves both the API and the React frontend. Environment variables:

- **`PORT`**: Server port (default: 8080)
- **`HOST`**: Bind address (default: 0.0.0.0)
- **`NODE_ENV`**: Environment mode (production/development)
- **`CORS_ORIGIN`**: Allowed CORS origins (comma-separated)
- **`DOCKER_SOCKET`**: Override Docker socket path
- **`PODMAN_SOCKET`**: Override Podman socket path

### Container Features

- **Multi-stage Build**: Optimized for minimal image size
- **Non-root User**: Runs as user 1001 for security
- **Health Checks**: Built-in health monitoring
- **Static File Serving**: Serves React app in production
- **UBI8 Base**: Red Hat Universal Base Image for security

## 📖 Usage Guide

### Deploying a Database

1. **Select Database Type**: Choose from MariaDB or PostgreSQL on the "Deploy Database" page
2. **Configure Settings**:
   - **Basic Configuration**: Database name, version, and port
   - **Authentication**: Root password and optional additional users
   - **Storage**: Enable persistent storage and select host directory path
3. **Deploy**: Click "Deploy Database" to create and start the container

### Managing Containers

1. **View All Containers**: Access "Manage Containers" tab to see all containers
2. **Managed Databases**: View only database containers created by this application
3. **Container Actions**:
   - ▶️ Start/Stop containers
   - 🔄 Restart containers
   - 📊 View detailed information and statistics
   - 🗑️ Delete containers and their data

### Container Details

Click "View" on any container to access:
- **Overview**: Runtime information, network settings, storage mounts
- **Logs**: Real-time container logs with filtering
- **Stats**: CPU, memory, network, and I/O statistics
- **Config**: Complete container configuration and environment variables

### Filesystem Browser

When configuring persistent storage:
- **Browse Directories**: Navigate host filesystem directories
- **Create Directories**: Create new directories directly from the interface
- **Path Selection**: Select appropriate storage locations for database data

## 🛠️ Configuration

### Database Templates

#### MariaDB
- **Versions**: latest, 11.2, 11.1, 11.0, 10.11, 10.6
- **Default Port**: 3306
- **Image Repository**: `quay.io/mariadb-foundation/mariadb-devel`
- **Multi-arch Support**: Standard container tags
- **UBI Support**: Red Hat UBI-based images for x86_64

#### PostgreSQL
- **Versions**: latest, 16, 15, 14, 13, 12
- **Default Port**: 5432
- **Image Repository**: `quay.io/postgresql/postgresql`
- **Multi-arch Support**: Standard container tags
- **UBI Support**: Red Hat UBI-based images for x86_64

### Environment Variables

The application supports all standard environment variables for each database type:

**MariaDB**:
- `MYSQL_ROOT_PASSWORD` (required)
- `MYSQL_DATABASE` (optional)
- `MYSQL_USER` (optional)
- `MYSQL_PASSWORD` (optional)

**PostgreSQL**:
- `POSTGRES_PASSWORD` (required)
- `POSTGRES_DB` (optional)
- `POSTGRES_USER` (optional)

## 📁 Project Structure

```
db-mgr/
├── src/
│   ├── components/              # React components
│   │   ├── DatabaseSelector.tsx    # Database type selection interface
│   │   ├── DeploymentForm.tsx      # Database deployment configuration
│   │   ├── ContainerList.tsx       # Container management interface
│   │   ├── ContainerDetails.tsx    # Detailed container information
│   │   ├── ManagedDatabases.tsx    # Managed database containers view
│   │   └── DirectoryBrowser.tsx    # Filesystem browsing modal
│   ├── hooks/                   # React Query hooks
│   │   └── usePodman.ts            # Container runtime API hooks
│   ├── services/                # API services
│   │   └── podman.ts               # Container runtime communication
│   ├── types/                   # TypeScript definitions
│   │   └── index.ts                # Application type definitions
│   ├── utils/                   # Utility functions
│   │   └── databaseTemplates.ts    # Database configuration templates
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # Application entry point
├── proxy-server.js              # Express.js proxy server
├── package.json                 # Project dependencies and scripts
└── README.md                    # This file
```

## 🔧 Available Scripts

### Development
- **`npm run dev:full`** - Start complete development environment (proxy + frontend)
- **`npm run dev`** - Start only the React development server
- **`npm run proxy`** - Start only the proxy server
- **`npm run preview`** - Preview production build locally

### Production
- **`npm run build`** - Build application for production
- **`npm run start`** - Start production server
- **`npm run lint`** - Run ESLint code analysis

### Container Operations
- **`npm run container:build`** - Build container image
- **`npm run container:run`** - Run container with Docker socket
- **`npm run container:run:podman`** - Run container with Podman socket

## 🔒 Security Considerations

- **Password Security**: Strong password generation with configurable character sets
- **Input Validation**: Comprehensive validation prevents malicious configurations
- **Filesystem Safety**: Directory traversal attack prevention in filesystem operations
- **Container Isolation**: Proper container security and resource management
- **Environment Variables**: Secure handling of sensitive configuration data
- **Network Security**: Containers deployed with appropriate network configurations

## 🐛 Troubleshooting

### Common Issues

#### Cannot connect to container socket
```bash
# For Podman - check socket status
systemctl --user status podman.socket

# For Docker - check service status
sudo systemctl status docker

# Verify socket permissions
ls -la /var/run/docker.sock
# or
ls -la $XDG_RUNTIME_DIR/podman/podman.sock
```

#### Database container fails to start
1. Check container logs in the application interface
2. Verify port availability: `netstat -tlnp | grep :3306`
3. Ensure persistent storage paths exist and are writable
4. Check container image availability

#### Statistics not available
- Some statistics may not be available on older Podman versions
- Ensure container is running for real-time metrics
- Check container runtime permissions

#### Proxy server connection issues
1. Verify proxy server is running on port 3001
2. Check CORS configuration for your domain
3. Ensure firewall allows connections to port 3001

### Development Issues

#### Hot reload not working
```bash
# Restart the full development environment
npm run dev:full
```

#### Port conflicts
- Frontend (Vite): Default port 5173
- Proxy server: Default port 3001
- Modify ports in `package.json` scripts if needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [PatternFly](https://www.patternfly.org/) design system
- Powered by [React](https://reactjs.org/) and [TypeScript](https://www.typescriptlang.org/)
- Container management via [Docker](https://www.docker.com/) and [Podman](https://podman.io/)
- State management with [React Query](https://tanstack.com/query)