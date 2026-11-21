import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db";

// Shudhu ei field gulo allowed. role, isBlocked, subscription* kokhono na
const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  image: z.string().url("Invalid image URL").optional().or(z.literal("")),
  businessName: z.string().trim().max(100).optional(),
});

export async function getProfile(req: Request, res: Response) {
  const user = await getDB().collection("user").findOne(
    { _id: new ObjectId(req.user!.id) },
    { projection: { name: 1, email: 1, image: 1, role: 1, businessName: 1, subscriptionPlan: 1, subscriptionExpiresAt: 1 } }
  );
  res.json({ user });
}

export async function updateProfile(req: Request, res: Response) {
  // Client role/plan pathaleo reject
  const forbidden = ["role", "isBlocked", "subscriptionPlan", "subscriptionExpiresAt", "email"];
  if (forbidden.some((k) => k in (req.body || {}))) {
    return res.status(403).json({ message: "You cannot change these fields" });
  }

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const { name, image, businessName } = parsed.data;
  const set: Record<string, any> = { name, updatedAt: new Date() };
  if (image !== undefined) set.image = image || null;
  if (req.user!.role === "vendor" && businessName !== undefined) set.businessName = businessName;

  await getDB().collection("user").updateOne({ _id: new ObjectId(req.user!.id) }, { $set: set });
  res.json({ message: "Profile updated successfully" });
}