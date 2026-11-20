import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";

const authUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const JWKS = createRemoteJWKSet(new URL(`${authUrl}/api/auth/jwks`));

export async function verifyJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: token missing" });
  }

  const token = header.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: authUrl });
    const userId = String(payload.id || payload.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: invalid token" });
    }

    // Role ar blocked status shobsomoy DB theke nao, token theke na
    const filters: object[] = [{ id: userId }];
    if (ObjectId.isValid(userId)) filters.push({ _id: new ObjectId(userId) });

    const user = await getDB().collection("user").findOne({ $or: filters });
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: user not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked" });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role || "customer",
      isBlocked: !!user.isBlocked,
    };
    next();
  } catch (err: any) {
    const expired = err?.code === "ERR_JWT_EXPIRED";
    return res.status(401).json({
      message: expired ? "Unauthorized: token expired" : "Unauthorized: invalid token",
    });
  }
}