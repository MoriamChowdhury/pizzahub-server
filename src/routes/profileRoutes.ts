import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { catchAsync } from "../utils/helpers";
import { getProfile, updateProfile } from "../controllers/profileController";

const router = Router();

router.get("/", verifyJWT, catchAsync(getProfile));
router.patch("/", verifyJWT, catchAsync(updateProfile));

export default router;