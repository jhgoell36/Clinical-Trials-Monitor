# Deploying to Replit

This guide describes how to deploy the Clinical Trials Monitor to [Replit](https://replit.com).

## 1. Import Project
1.  Go to Replit and click **"Create Repl"**.
2.  Choose **"Import from GitHub"**.
3.  Paste your repository URL.
4.  The language should automatically be detected as **Node.js** (or use the provided `replit.nix` automatically).

## 2. Configuration (`.env`)
Replit manages environment variables using "Secrets".

1.  In your new Repl, look for the **"Secrets"** tool (padlock icon) in the sidebar.
2.  Add the following secrets (keys and values):

| Key | Value (Example) |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | `https://your-repl-name.your-username.repl.co` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_USER` | `your-email@gmail.com` |
| `SMTP_PASS` | `your-app-password` |
| `FEEDBACK_EMAIL` | `destination@example.com` |

> **Note**: For `CLIENT_URL`, you can find the detailed URL in the "Webview" tab after you run the project once.

## 3. Run
Click the big green **"Run"** button at the top.

The `.replit` configuration will automatically:
1.  Install dependencies.
2.  Build the frontend.
3.  Start the server.

## 4. Keep it "Always On"
(Requires a Replit Core/Paid plan)

1.  Click the project title/menu.
2.  Enable **"Always On"**.
3.  This ensures your background scheduler (clinical trial monitor) keeps running 24/7.
