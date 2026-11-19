
# 🚀 Backend Trial — Video Platform REST API & Architectural Guide

Welcome to the **`backend_trial`** project repository.

This project is a modular, production-grade RESTful API monolith modeled after a scalable video-sharing/content platform (comparable to the YouTube backend), built with **Node.js**, **Express 5**, **MongoDB (Mongoose)**, **JWT**, **Bcrypt**, **Multer**, and **Cloudinary**.

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=8000
MONGODB_URL=your_mongodb_connection_string
CORS_ORIGIN=*
ACCESS_TOKEN_SECRET=your_access_token_secret
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRY=10d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Run Development Server
```bash
npm run dev
```
The server will start at `http://localhost:8000`.
=======
🎬 Video Platform Backend API

A robust, scalable backend API for a video streaming platform, built with Node.js, Express, MongoDB, and modern authentication practices.
This project implements secure user authentication, channel profiles, subscriptions, watch history, and media handling, following real-world backend architecture patterns.

🚀 Features
🔐 Authentication & Authorization

User registration, login, and logout

JWT-based authentication with access & refresh tokens

Secure protected routes using authentication middleware

Change password functionality

Fetch current authenticated user

👤 User Account Management

Update user profile details

Upload and manage avatar and cover images

Fetch detailed user channel profile

View subscription status for channels

📺 Channel & Subscription System

Subscription model implementation

Check whether a user is subscribed to a channel

Retrieve channel profile with subscriber information

🕒 Watch History

Fetch authenticated user’s watch history

Includes video details along with video owner information

☁️ Media & Cloud Integration

Cloudinary integration for media uploads

Proper setup and configuration for production-ready file handling

🛠 Developer Experience

Clean project structure

API tested using Postman

Consistent formatting with Prettier

Modular controllers, routes, and middlewares

Bug fixes and stability improvements across iterations

🧱 Tech Stack

Backend: Node.js, Express.js

Database: MongoDB, Mongoose

Authentication: JWT (Access & Refresh Tokens)

Cloud Services: Cloudinary

Tools: Postman, Prettier

Architecture: MVC Pattern, RESTful APIs

📁 Project Structure
src/
│── controllers/
│   ├── auth.controller.js
│   ├── user.controller.js
│
│── models/
│   ├── user.model.js
│   ├── subscription.model.js
│
│── routes/
│   ├── auth.routes.js
│   ├── user.routes.js
│
│── middlewares/
│   ├── auth.middleware.js
│
│── utils/
│── config/
│── app.js
│── server.js

🔑 Authentication Flow

User logs in → receives Access Token + Refresh Token

Access token is used for protected routes

Refresh token issues new access tokens when expired

Logout invalidates refresh token securely

🧪 API Testing

All authentication and user routes tested using Postman

Verified flows:

Register

Login

Logout

Protected route access

Token refresh

Account updates

⚙️ Environment Variables

Create a .env file in the root directory:

PORT=5000
MONGODB_URI=your_mongodb_connection_string
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

🏁 Getting Started
1️⃣ Clone the repository
git clone https://github.com/Adityaghodki/your-repo-name.git
cd your-repo-name

2️⃣ Install dependencies
npm install

3️⃣ Run the server
npm run dev


Server will start on:

http://localhost:5000

📈 Development Timeline (Highlights)

Aug 2025: Initial backend setup, project structure

Sep 2025: MongoDB integration, auth controllers, Cloudinary setup

Oct 2025: Authentication middleware, subscriptions, watch history, refresh tokens

Nov 2025: Protected routes for account management and user data

📌 Future Enhancements

Video upload & streaming endpoints

Comment and like system

Playlist support

Role-based access control

API documentation with Swagger

🤝 Contributing

Contributions are welcome!
Feel free to fork the repository, create a feature branch, and submit a pull request.

📄 License

This project is licensed under the MIT License.

👨‍💻 Author

Aditya Ghodki
GitHub: https://github.com/Adityaghodki



---

## 📦 Day 4 — Azure Blob Storage (Direct Client Upload)

Day 4 adds a fully production-grade video upload architecture using Azure Blob Storage (with Azurite for local development). Videos are **never** passed through Express — the client uploads directly to Blob Storage using a short-lived SAS URL.

### Key Features
- `StorageService` class with runtime provider switching (`STORAGE_PROVIDER=azurite|azure`)
- **User Delegation SAS** for real Azure (HTTPS-only, scoped, 15-min TTL)
- **Shared Key SAS** for local Azurite (HTTP+HTTPS, same code path)
- Video model extended with: `blobKey`, `status`, `hlsKey`, `thumbnailKey`, `failureReason`, `fileSize`, `mimeType`
- Status state machine: `uploading → processing → processed | failed`
- Completion endpoint validates blob existence and actual size in storage

### Upload Flow

```
Client → POST /api/v1/videos/upload/request → API validates + returns SAS URL
Client → PUT <SAS URL> (video bytes go directly to blob storage, not through API)
Client → POST /api/v1/videos/upload/complete → API verifies blob + enqueues processing
```

### New Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/videos/upload/request` | Get SAS upload URL for direct blob upload |
| `POST` | `/api/v1/videos/upload/complete` | Verify upload + enqueue processing |
| `GET` | `/api/v1/videos/:videoId` | Get video by ID with status |

### New Environment Variables

```env
STORAGE_PROVIDER=azurite          # or: azure
AZURE_STORAGE_ACCOUNT_NAME=...    # your Azure storage account name
AZURE_STORAGE_CONTAINER_NAME=videos
AZURITE_PORT=10000                # local dev port
SAS_EXPIRY_MINUTES=15
MAX_VIDEO_UPLOAD_SIZE_BYTES=524288000   # 500 MB default
```

### Running Azurite Locally (without Docker)

```bash
# Install azurite (already in devDependencies)
# Run: azurite-blob --skipApiVersionCheck --loose --blobPort 10000
npx azurite-blob --skipApiVersionCheck --loose --blobPort 10000
```

---

## ⚙️ Day 5 — BullMQ Video Processing Worker

Day 5 adds an independent video processing worker that picks up jobs from a Redis-backed BullMQ queue and runs the full FFmpeg pipeline.

### Processing Workflow

```
Worker receives job → Download blob (streaming) → ffprobe validate
  → Generate thumbnail (JPG, 640px) → Generate HLS (master.m3u8 + segments)
  → Upload derivatives to Blob Storage → Verify → Update MongoDB (processed)
  → Cleanup temp files
```

### Key Features
- Reuses existing ioredis config (no duplicate Redis setup)
- Deterministic `jobId = video-<videoId>` prevents duplicate processing
- 3 retries with exponential backoff: 5s → 10s → 20s
- Streaming download/upload — videos never fully loaded in memory
- Isolated temp directory per job (`os.tmpdir()/backend_video_worker/job-<id>/`)
- Temp files always cleaned in `finally` block (success and failure)
- FFmpeg/ffprobe resolved from npm packages (works on Windows + Docker)

### Starting the Worker

```bash
# Start worker standalone (requires Redis running)
node src/workers/video.worker.js

# Or via npm script
npm run worker

# With Docker Compose
docker compose up worker
```

### Docker Commands

```bash
docker compose up -d           # Start API + Worker + Azurite
docker compose logs -f worker  # Watch worker logs
docker compose down            # Stop all services
```

### Test Commands

```bash
# Run Day 4 storage tests (requires network for MongoDB Atlas)
node --test tests/day4_storage.test.js

# Run Day 5 worker tests (requires network for MongoDB Atlas)
node --test tests/day5_processing.test.js

# Run both
node --test tests/day4_storage.test.js tests/day5_processing.test.js
```

### Test Results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| Day 4 — Storage & Direct Upload | 8 | ✅ 8 | 0 |
| Day 5 — Video Processing Worker | 8 | ✅ 8 | 0 |

> **Note:** Tests run against Azurite (local) and MongoDB Atlas. Redis-dependent BullMQ queue integration requires a running Redis instance (`docker run -d -p 6379:6379 redis:7-alpine`).

---

## 📄 Documentation

- [`DAY4_DAY5_IMPLEMENTATION_REPORT.md`](./DAY4_DAY5_IMPLEMENTATION_REPORT.md) — Full technical report with architecture diagrams, API docs, security considerations
- [`IMPLEMENTATION_CHECKPOINT.md`](./IMPLEMENTATION_CHECKPOINT.md) — Implementation status and key decisions
