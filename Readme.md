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

If you want, I can:

Shorten this for recruiter-focused repos

Add API endpoint documentation

Generate a Swagger/OpenAPI spec

Rewrite this as a portfolio project README

Just tell me what you want next 🚀
