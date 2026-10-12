
# 🚀 Backend Trial — Video Platform REST API & Architectural Guide

Welcome to the **`backend_trial`** project repository.

This project is a modular, production-grade RESTful API monolith modeled after a scalable video-sharing/content platform (comparable to the YouTube backend), built with **Node.js**, **Express 5**, **MongoDB (Mongoose)**, **JWT**, **Bcrypt**, **Multer**, and **Cloudinary**.

---

## 📖 Complete Project Forensic Analysis & Technical Interview Guide

A comprehensive, 28-part forensic analysis and interview defense guide has been generated and saved directly in the project root:

👉 **[PROJECT_ANALYSIS_AND_INTERVIEW_GUIDE.md](./PROJECT_ANALYSIS_AND_INTERVIEW_GUIDE.md)**

### What the Guide Covers:
1. **Part 1 — Complete Project Overview** (Pitch scripts, architectures, workflows)
2. **Part 2 — Project Structure & File Matrix** (Responsibility of every file and directory)
3. **Part 3 — Technology Stack Deep Dive** (Node.js, Express 5, Mongoose, JWT, Cloudinary, etc.)
4. **Part 4 — Database Forensic Analysis** (Schemas, collections, indexes, and aggregation pipelines)
5. **Part 5 — MongoDB $\rightarrow$ SQL Migration Design** (Full PostgreSQL schema, ER relationships, queries)
6. **Part 6 — Why MongoDB?** (Comparative analysis vs. PostgreSQL, MySQL, Redis)
7. **Part 7 — Complete Request Lifecycles** (Step-by-step traces with diagrams)
8. **Part 8 — API Forensic Analysis** (Complete endpoint catalog, parameters, responses)
9. **Part 9 — Authentication & Authorization** (Dual-token JWT lifecycle, bcrypt hashing, cookies)
10. **Part 10 — Backend Deep Dive** (Event loop, middleware chain, async handling)
11. **Part 11 — Frontend Integration Forensics** (API contracts and expected state)
12. **Part 12 — Error Handling & Robustness Audit** (Async wrappers, envelopes, edge cases)
13. **Part 13 — Forensic Security Audit** (Identified bugs, argument inversions, syntax traps)
14. **Part 14 — Performance Analysis** (Behavior at 10, 10K, and 1M concurrent users)
15. **Part 15 — Scalability & System Evolution** (Redis caching, BullMQ, horizontal scaling)
16. **Part 16 — Deployment & DevOps** (Environment variables, startup scripts)
17. **Part 17 — Git History & Hygiene** (Commit trace and repository structure)
18. **Part 18 — Architectural Design Decisions** (Trade-offs and architectural rationale)
19. **Part 19 — "Why Did You Use X?" Technical Q&A**
20. **Part 20 — Strict Interviewer Cross-Examination** (Levels 1 to 4)
21. **Part 21 — Questions Based on Actual Code** (Direct line-by-line questions)
22. **Part 22 — Database Interview Preparation** (ACID, referencing vs embedding)
23. **Part 23 — SQL Migration Interview Defense**
24. **Part 24 — Production System Design at 10M Users**
25. **Part 25 — What Was Implemented vs. What Was NOT**
26. **Part 26 — Resume Claim Verification Table**
27. **Part 27 — Final Quick Interview Cheat Sheet**
28. **Part 28 — Full Mock Interview Transcript**

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

