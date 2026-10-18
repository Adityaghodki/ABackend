import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { ApiResponse } from "./utils/ApiResponse.js";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

//routes
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/videos", videoRouter);

// centralized error handler
app.use((err, req, res, next) => {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(", ") || "field";
    return res
      .status(409)
      .json(new ApiResponse(409, null, `Duplicate value for ${field}`));
  }

  const statusCode = err.statusCode || 500;
  return res
    .status(statusCode)
    .json(new ApiResponse(statusCode, null, err.message || "Something went wrong"));
});

export { app };
