import { Router } from "express";
import { registerUser} from "../controllers/user.controllers.js";
import {upload} from "../middlewares/multer.middleware.js";
import { loginUser, logoutUser, refreshAccessToken } from "../controllers/user.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {changeCurrentPassword, getCurrentUser, updateAccountDetails, updateAvatar,updateCoverImage,getUserChannelProfile,getWatchHistory} from "../controllers/user.controllers.js";
import { validate } from "../middlewares/validate.js";
import { registerSchema, loginSchema, updateUserSchema } from "../validators/user.validators.js";
import { rateLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

const loginLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "login",
  failClosed: true,
});

const registerLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "register",
  failClosed: true,
});

const refreshLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "refresh",
  failClosed: true,
});

const uploadLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "upload",
  failClosed: true,
});

router.route("/register").post(
    registerLimiter,
    upload.fields([
        { name: 'avatar',
            maxCount: 1
        },
        { name: 'coverImage',
            maxCount: 1
        }
    ]
    ),
    validate(registerSchema),
    registerUser
);

router.route("/login").post(loginLimiter, validate(loginSchema), loginUser);
// secure routes 
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-Token").post(refreshLimiter, refreshAccessToken);

// protected routes
router.route("/change-password").post(verifyJWT,changeCurrentPassword);
router.route("/current-user").get(verifyJWT,getCurrentUser);

router.route("/update-account").put(verifyJWT,validate(updateUserSchema),updateAccountDetails);
router.route("/update-avatar").put(verifyJWT, uploadLimiter, upload.single('avatar'),updateAvatar);
router.route("/update-cover-image").put(verifyJWT, uploadLimiter, upload.single('coverImage'),updateCoverImage);

router.route("/c/:username").get(verifyJWT,getUserChannelProfile);
router.route("/watch-history").get(verifyJWT,getWatchHistory);


export default router;