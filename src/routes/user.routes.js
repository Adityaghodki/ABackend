import { Router } from "express";
import { registerUser} from "../controllers/user.controllers.js";
import {upload} from "../middlewares/multer.middleware.js";
import { loginUser, logoutUser, refreshAccessToken } from "../controllers/user.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {changeCurrentPassword, getCurrentUser, updateAccountDetails, updateAvatar,updateCoverImage,getUserChannelProfile,getWatchHistory} from "../controllers/user.controllers.js";
const router = Router();
router.route("/register").post(
    upload.fields([
        { name: 'avatar',
            maxCount: 1
        },
        { name: 'coverImage',
            maxCount: 1
        }
    ]
    ),
    registerUser
);

router.route("/login").post(loginUser);
// secure routes 
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-Token").post(refreshAccessToken);

// protected routes
router.route("/change-password").post(verifyJWT,changeCurrentPassword);
router.route("/current-user").get(verifyJWT,getCurrentUser);

router.route("/update-account").put(verifyJWT,updateAccountDetails);
router.route("/update-avatar").put(verifyJWT,upload.single('avatar'),updateAvatar);
router.route("/update-cover-image").put(verifyJWT,upload.single('coverImage'),updateCoverImage);

router.route("/c/:username").get(verifyJWT,getUserChannelProfile);
router.route("/watch-history").get(verifyJWT,getWatchHistory);


export default router;