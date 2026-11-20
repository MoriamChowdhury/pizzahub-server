import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";
import { catchAsync } from "../utils/helpers";
import {
  createOrder, getMyOrders, cancelOrder,
  getVendorOrders, updateOrderStatus, getOrder,
} from "../controllers/orderController";

const router = Router();

// Customer
router.post("/", verifyJWT, verifyRole("customer"), catchAsync(createOrder));
router.get("/mine", verifyJWT, verifyRole("customer"), catchAsync(getMyOrders));
router.patch("/:id/cancel", verifyJWT, verifyRole("customer"), catchAsync(cancelOrder));

// Vendor
router.get("/vendor", verifyJWT, verifyRole("vendor"), catchAsync(getVendorOrders));
router.patch("/:id/status", verifyJWT, verifyRole("vendor"), catchAsync(updateOrderStatus));

// Order details (customer / vendor / admin, ownership controller e check hoy)
router.get("/:id", verifyJWT, catchAsync(getOrder));

export default router;