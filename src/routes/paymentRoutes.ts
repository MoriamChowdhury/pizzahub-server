import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";
import { catchAsync } from "../utils/helpers";
import {
  createCheckoutSession,
  getSubscriptionStatus,
  cancelSubscription,
} from "../controllers/paymentController";

const router = Router();

router.use(verifyJWT, verifyRole("vendor"));

router.post("/checkout-session", catchAsync(createCheckoutSession));
router.get("/status", catchAsync(getSubscriptionStatus));
router.post("/cancel-subscription", catchAsync(cancelSubscription));

export default router;