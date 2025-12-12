#!/bin/bash

# 1. Install Client Deps & Build
echo "Installing Client Dependencies..."
cd client
npm install
echo "Building Client..."
npm run build
cd ..

# 2. Install Server Deps
echo "Installing Server Dependencies..."
cd server
npm install

# 3. Start Server
echo "Starting Server..."
node src/server.js
