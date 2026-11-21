import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";
import { catchAsync } from "../utils/helpers";
import {
  getUsers, getUserDetails, setBlocked,
  getAllMenuItems, setItemStatus, getTransactions,
} from "../controllers/adminController";

const router = Router();

// Shob route e admin lagbe
router.use(verifyJWT, verifyRole("admin"));

router.get("/users", catchAsync(getUsers));
router.get("/users/:id", catchAsync(getUserDetails));
router.patch("/users/:id/block", catchAsync(setBlocked));

router.get("/menu-items", catchAsync(getAllMenuItems));
router.patch("/menu-items/:id/status", catchAsync(setItemStatus));

router.get("/transactions", catchAsync(getTransactions));

export default router;