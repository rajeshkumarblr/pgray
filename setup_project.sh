#!/bin/bash
set -e

# Create directories
mkdir -p backend/app
mkdir -p frontend/src/components

# Create backend files
touch backend/app/__init__.py
touch backend/app/main.py
touch backend/app/explain.py
touch backend/app/connection.py
touch backend/app/models.py
touch backend/Dockerfile
touch backend/requirements.txt

# Create frontend files
touch frontend/src/components/PlanNode.tsx
touch frontend/src/components/ConnectionModal.tsx
touch frontend/src/App.tsx
touch frontend/src/api.ts
touch frontend/Dockerfile
touch frontend/package.json

# Create root files
touch README.md

# Create docker-compose.yml with host.docker.internal configuration
cat > docker-compose.yml <<EOF
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    context: ./backend

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    # On Linux, this might be needed for Vite polling if strict file watching issues occur
    environment:
      - WATCHPACK_POLLING=true

EOF

echo "Project structure created successfully."
