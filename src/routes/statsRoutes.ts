import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";
import { catchAsync } from "../utils/helpers";
import { vendorStats, customerStats, adminStats } from "../controllers/statsController";

const router = Router();

router.get("/vendor", verifyJWT, verifyRole("vendor"), catchAsync(vendorStats));
router.get("/customer", verifyJWT, verifyRole("customer"), catchAsync(customerStats));
router.get("/admin", verifyJWT, verifyRole("admin"), catchAsync(adminStats));

export default router;