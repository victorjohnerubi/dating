# Vibe app setup

## Local development

1. Install Node.js 18 or later.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env` and fill in any optional AI settings.
4. Run `npm start` and open `http://localhost:3000`.

Without `MONGODB_URI`, profiles and conversations are stored in ignored local JSON files under `data/`. Passwords are hashed with bcrypt before storage. Keep this mode local; it is not a shared or deploy-persistent database.

Signed-in members can use the Members page to browse profiles and start one-to-one conversations. Direct messages are saved per pair of accounts and the open conversation refreshes every four seconds; this is polling, not instant socket delivery.

## Production

Configure these environment variables in the hosting provider:

- `NODE_ENV=production`
- `MONGODB_URI` with a private MongoDB connection string
- `SESSION_SECRET` with a unique, long random secret
- `OPENAI_API_KEY` if AI replies are needed

Production startup intentionally fails without `MONGODB_URI` and `SESSION_SECRET`. Use HTTPS so the session cookie is sent securely. Do not commit `.env`, credentials, or database dumps.

The sign-up flow requires an email and a password of at least 12 characters. Password recovery is not implemented; add an email delivery provider and verified reset-token flow before relying on this for real users.
