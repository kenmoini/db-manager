# Database Manager

> This is a vibe-coded application - but it works?

A React-based application for deploying and managing database containers using Docker/Podman. This application provides an intuitive interface to deploy MariaDB and PostgreSQL databases via containers and manage their lifecycle.

## Features

- **Database Deployment**: Easy deployment of MariaDB and PostgreSQL databases
- **Container Management**: Start, stop, restart, and delete database containers
- **Real-time Monitoring**: View container logs, statistics, and status
- **Persistent Storage**: Configure persistent data storage for databases
- **Security**: Password generation and secure configuration management
- **Responsive UI**: Modern, responsive interface with real-time updates

## Prerequisites

- **Podman**: Make sure Podman is installed and running
- **Node.js**: Version 18+ recommended
- **Docker/Podman Socket**: The application connects to Podman via its socket API

### Setting up Podman Socket

Enable the Podman socket service:

```bash
# Enable and start the Podman socket for the current user
systemctl --user enable --now podman.socket

# Verify the socket is running
systemctl --user status podman.socket

# Check socket path (usually /run/user/$(id -u)/podman/podman.sock)
echo $XDG_RUNTIME_DIR/podman/podman.sock
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd db-mgr
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev:full
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

### Deploying a Database

1. Click on the "Deploy Database" tab
2. Select either MariaDB or PostgreSQL
3. Configure the database settings:
   - Database name and version
   - Port configuration
   - Root password (can be auto-generated)
   - Optional additional users and databases
   - Persistent storage settings
4. Click "Deploy Database"

### Managing Databases

1. Click on the "Manage Databases" tab
2. View all deployed database containers
3. Use the action buttons to:
   - Start/Stop containers
   - Restart containers
   - View detailed information
   - Delete containers

### Container Details

Click the "View" button on any container to see:
- **Overview**: Runtime information, network settings, and storage mounts
- **Logs**: Real-time container logs
- **Stats**: CPU, memory, and I/O statistics
- **Config**: Container configuration and labels

## Configuration

The application automatically detects the Podman socket at the default location. If you need to customize the socket path, modify the `PodmanService` constructor in `src/services/podman.ts`.

## Database Templates

The application supports:

### MariaDB
- Multiple versions (latest, 11.2, 11.1, 11.0, 10.11, 10.6)
- Default port: 3306
- Environment variables: ROOT_PASSWORD, DATABASE, USER, PASSWORD

### PostgreSQL
- Multiple versions (latest, 16, 15, 14, 13, 12)
- Default port: 5432
- Environment variables: POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_USER

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── DatabaseSelector.tsx    # Database type selection
│   ├── DeploymentForm.tsx      # Database configuration form
│   ├── ContainerList.tsx       # Container management interface
│   └── ContainerDetails.tsx    # Detailed container view
├── hooks/              # React Query hooks
│   └── usePodman.ts           # Podman API hooks
├── services/           # API services
│   └── podman.ts              # Podman socket communication
├── types/              # TypeScript type definitions
│   └── index.ts               # Application types
├── utils/              # Utility functions
│   └── databaseTemplates.ts   # Database configuration templates
└── App.tsx             # Main application component
```

### Available Scripts

- `npm run dev:full` - Start development server and proxies
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Security Considerations

- Passwords are generated securely with strong character sets
- Sensitive environment variables are handled properly
- Container labels are used to identify managed databases
- Input validation prevents malicious configurations

## Troubleshooting

### Common Issues

1. **Cannot connect to Podman socket**
   - Ensure Podman socket is running: `systemctl --user status podman.socket`
   - Check socket permissions and path

2. **Database container fails to start**
   - Check container logs in the application
   - Verify port availability
   - Ensure persistent storage paths are accessible

3. **Statistics not available**
   - Some container statistics may not be available depending on Podman version
   - Ensure container is running for real-time stats

## License

This project is licensed under the MIT License.