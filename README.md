# Vibe app setup

## Local development

1. Install Node.js 18 or later.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env`. Add a valid `OPENAI_API_KEY` to enable AI-generated replies.
4. Run `npm start` and open `http://localhost:3000`.

Without `MONGODB_URI`, profiles and conversations are stored in ignored local JSON files under `data/`. Passwords are hashed with bcrypt before storage. Keep this mode local; it is not a shared or deploy-persistent database.

Signed-in members can use the Members page to browse profiles and start one-to-one conversations. Direct messages are saved per pair of accounts and the open conversation refreshes every four seconds; this is polling, not instant socket delivery.

The AI Matches page generates 768,000 fictional character profiles from combinations of names, cities, interests, and personality traits. It loads 24 at a time, filters them using the account's match preferences, and stores only the selected character and chat history rather than a giant static profile file.

Match cards and the AI chat identify these profiles as fictional AI characters, not real members. Member-to-member conversations include block and report controls. Blocking hides the pair from discovery and inbox and prevents further messaging; users can unblock from the Members page. Reports are saved in `data/safety-actions.json` locally or MongoDB in production. Open `/moderation.html` and enter `MODERATOR_TOKEN` to review and resolve reports. In production, use a long random token stored only in the host's environment settings.

The Members page includes a JSON data export and permanent account deletion. Deletion requires the current password and removes that account's profile, chats, direct conversations, blocks, and reports it submitted. Reports filed by other users about the deleted account are retained for safety records and shown to moderators as a deleted member.

## Production

Configure these environment variables in the hosting provider:

- `NODE_ENV=production`
- `MONGODB_URI` with a private MongoDB connection string
- `SESSION_SECRET` with a unique, long random secret
- `MODERATOR_TOKEN` with a separate long random secret for report review
- `OPENAI_API_KEY` if AI replies are needed

Production startup intentionally fails without `MONGODB_URI`, `SESSION_SECRET`, and `MODERATOR_TOKEN`. Use HTTPS so session cookies are sent securely. Do not commit `.env`, credentials, or database dumps.

The chat waits at least four seconds before displaying each generated reply. Without a valid `OPENAI_API_KEY`, the chat reports that AI replies are unavailable rather than showing scripted replies. The sign-up flow requires an email and a password of at least 12 characters. Password recovery is not implemented; add an email delivery provider and verified reset-token flow before relying on this for real users.
# Real-Time Event & Media API Backend

A production-ready Node.js backend infrastructure featuring JSON Web Token (JWT) secure authentication, automatic media processing workflows with Cloudinary cloud object storage, and real-time room-isolated communication environments via WebSockets.

## 🛠️ Built With
- **Runtime Environment:** Node.js
- **Web Framework:** Express.js
- **Database Architecture:** MongoDB via Mongoose ODM
- **Real-Time Communication:** Socket.io
- **Media Middleware:** Multer & Multer-Storage-Cloudinary
- **Security Tools:** JSON Web Tokens (JWT) & BcryptJS

## 🚀 Getting Started

### Prerequisites
- Node.js installed locally
- A MongoDB cluster instance string
- A Cloudinary merchant account credentials

### Installation
1. Clone the repository and navigate to the directory:
   ```bash
   cd project-root
   ```
2. Install project dependencies:
   ```bash
   npm install
   npm install cors # required for production CORS setup
   ```
3. Establish a `.env` environment layout configuration in the root project space:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/dbname
   JWT_SECRET=your_robust_jwt_cryptographic_secret
   CLOUDINARY_CLOUD_NAME=your_cloud_identity_name
   CLOUDINARY_API_KEY=your_cloudinary_public_key
   CLOUDINARY_API_SECRET=your_cloudinary_private_secret
   ALLOWED_ORIGINS=http://localhost:3000,https://yourfrontend.com
   ```
4. Fire up the local application server instance:
   ```bash
   node server.js
   ```

## 🔒 WebSocket Authentication Handshake
Clients connecting to the socket server must explicitly supply a token string during instantiation.

```javascript
const socket = io("http://localhost:5000", {
  auth: { token: "YOUR_JWT_BEARER_STRING" }
});
```

### Event Listeners & Channels
- **`join_room`** (Emit): Joins a targeted room space channel. Expects a string (`roomName`).
- **`send_room_message`** (Emit): Sends a payload package directed to an active room. Expects `{ room, username, message }`.
- **`receive_message`** (Listen): Fired by the server whenever a text payload is received within the user's active room channel.
