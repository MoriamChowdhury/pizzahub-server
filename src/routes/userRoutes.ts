import { Router } from "express";
import { verifyJWT } from "../middleware/verifyJWT";
import { verifyRole } from "../middleware/verifyRole";

const router = Router();

// Je kono logged-in user
router.get("/me", verifyJWT, (req, res) => {
  res.json({ user: req.user });
});

// Shudhu admin (test)
router.get("/admin-check", verifyJWT, verifyRole("admin"), (_req, res) => {
  res.json({ message: "Hello admin" });
});

export default router;