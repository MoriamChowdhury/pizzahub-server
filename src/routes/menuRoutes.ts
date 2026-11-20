import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";
import { catchAsync } from "../utils/helpers";
import {
  getFeatured, getLocations, getMenuItems, getMenuItem, getMyItems,
  createMenuItem, updateMenuItem, toggleAvailability, deleteMenuItem,
} from "../controllers/menuController";

const router = Router();

// Public (specific route gulo /:id er age thakte hobe)
router.get("/featured", catchAsync(getFeatured));
router.get("/locations", catchAsync(getLocations));
router.get("/", catchAsync(getMenuItems));

// Vendor
router.get("/vendor/mine", verifyJWT, verifyRole("vendor"), catchAsync(getMyItems));
router.post("/", verifyJWT, verifyRole("vendor"), catchAsync(createMenuItem));
router.patch("/:id/availability", verifyJWT, verifyRole("vendor"), catchAsync(toggleAvailability));
router.patch("/:id", verifyJWT, verifyRole("vendor"), catchAsync(updateMenuItem));
router.delete("/:id", verifyJWT, verifyRole("vendor", "admin"), catchAsync(deleteMenuItem));

// Private: logged-in jekono user
router.get("/:id", verifyJWT, catchAsync(getMenuItem));

export default router;