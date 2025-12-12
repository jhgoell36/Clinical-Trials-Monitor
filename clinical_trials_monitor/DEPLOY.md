# Deployment Guide

This guide describes how to deploy the Clinical Trials Monitor to an "always on" server (like a VPS, DigitalOcean Droplet, AWS EC2, etc.).

## Prerequisites

- **Node.js**: v18 or higher
- **NPM**: Included with Node.js
- **Git**: To clone the repository

## 1. Preparation

### Build the Frontend
The server is configured to serve the frontend static files directly. You must build these files first.

```bash
cd client
npm install
npm run build
```

This creates a `dist` folder in the `client` directory containing the optimized application.

### Configure the Server
Navigate to the server directory and set up your environment variables.

```bash
cd ../server
npm install
cp .env.example .env
```

Edit `.env` with your production settings:

- `NODE_ENV=production` **(Important)**
- `CLIENT_URL=http://your-domain.com` (Your actual domain or IP)
- `SMTP_...` (Your email provider details)

## 2. Running "Always On"

To keep the application running even if you close the terminal or the server restarts, use a process manager like `pm2`.

### Install PM2
```bash
npm install -g pm2
```

### Start the Application
From the `server` directory:

```bash
pm2 start src/server.js --name "clinical-trials-monitor"
```

### Save Process List
To ensure it restarts on reboot:

```bash
pm2 save
pm2 startup
# Run the command displayed by the previous step to freeze the process list
```

## 3. Maintenance

- **View Logs**: `pm2 logs clinical-trials-monitor`
- **Restart**: `pm2 restart clinical-trials-monitor`
- **Stop**: `pm2 stop clinical-trials-monitor`

## Troubleshooting

- **White Screen?**: Ensure you ran `npm run build` in the client folder and `NODE_ENV` is set to `production`.
- **CORS Errors?**: Check that `CLIENT_URL` in `.env` matches the URL you are accessing the site from.
