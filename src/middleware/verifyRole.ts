import { Request, Response, NextFunction } from "express";

type Role = "customer" | "vendor" | "admin";

export const verifyRole =
  (...allowed: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permission" });
    }
    next();
  };