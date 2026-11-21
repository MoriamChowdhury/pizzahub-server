import { Request, Response } from "express";
import { getDB } from "../config/db";
import { escapeRegex, toObjectId } from "../utils/helpers";

/* ---------- USERS ---------- */

// GET /api/admin/users?search=&role=
export async function getUsers(req: Request, res: Response) {
  const { search, role } = req.query as Record<string, string | undefined>;
  const match: any = {};

  if (role && ["customer", "vendor", "admin"].includes(role)) match.role = role;
  if (search?.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    match.$or = [{ name: rx }, { email: rx }];
  }

  const users = await getDB()
    .collection("user")
    .find(match, {
      projection: {
        name: 1, email: 1, image: 1, role: 1, isBlocked: 1,
        businessName: 1, subscriptionPlan: 1, subscriptionExpiresAt: 1, createdAt: 1,
      },
    })
    .sort({ createdAt: -1 })
    .toArray();

  res.json({ users });
}

export async function getUserDetails(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid user ID" });

  const db = getDB();
  const user = await db.collection("user").findOne(
    { _id },
    { projection: { name: 1, email: 1, image: 1, role: 1, isBlocked: 1, businessName: 1, subscriptionPlan: 1, subscriptionExpiresAt: 1, createdAt: 1 } }
  );
  if (!user) return res.status(404).json({ message: "User not found" });

  const [menuItems, orders] = await Promise.all([
    db.collection("menuItems").countDocuments({ vendorId: _id }),
    db.collection("orders").countDocuments({ $or: [{ customerId: _id }, { vendorId: _id }] }),
  ]);

  res.json({ user, menuItems, orders });
}

export async function setBlocked(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid user ID" });

  const blocked = req.body?.blocked;
  if (typeof blocked !== "boolean") {
    return res.status(400).json({ message: "blocked must be true or false" });
  }

  if (String(_id) === req.user!.id) {
    return res.status(400).json({ message: "You cannot block yourself" });
  }

  const target = await getDB().collection("user").findOne({ _id });
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target.role === "admin") {
    return res.status(403).json({ message: "Admin accounts cannot be blocked" });
  }

  await getDB().collection("user").updateOne({ _id }, { $set: { isBlocked: blocked } });
  res.json({ message: blocked ? "User blocked" : "User unblocked" });
}

/* ---------- MENU ITEMS ---------- */

// GET /api/admin/menu-items?search=&status=&category=
export async function getAllMenuItems(req: Request, res: Response) {
  const { search, status, category } = req.query as Record<string, string | undefined>;
  const match: any = {};
  if (status && ["pending", "approved", "rejected", "inactive"].includes(status)) match.status = status;
  if (category) match.category = category;
  if (search?.trim()) match.itemName = { $regex: escapeRegex(search.trim()), $options: "i" };

  const items = await getDB()
    .collection("menuItems")
    .aggregate([
      { $match: match },
      { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
      { $unwind: "$vendor" },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          itemName: 1, category: 1, description: 1, price: 1, location: 1,
          images: 1, status: 1, createdAt: 1,
          "vendor._id": 1, "vendor.name": 1, "vendor.businessName": 1, "vendor.email": 1,
        },
      },
    ])
    .toArray();

  res.json({ items });
}

// Admin status: pending / approved / rejected / inactive
export async function setItemStatus(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid item ID" });

  const status = req.body?.status;
  if (!["pending", "approved", "rejected", "inactive"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const result = await getDB().collection("menuItems").updateOne({ _id }, { $set: { status } });
  if (!result.matchedCount) return res.status(404).json({ message: "Menu item not found" });

  res.json({ message: `Item marked as ${status}` });
}

/* ---------- TRANSACTIONS (read-only) ---------- */

export async function getTransactions(_req: Request, res: Response) {
  const transactions = await getDB()
    .collection("transactions")
    .aggregate([
      { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          plan: 1, amount: 1, currency: 1, status: 1, createdAt: 1, stripeSessionId: 1,
          "vendor._id": 1, "vendor.name": 1, "vendor.businessName": 1, "vendor.email": 1,
        },
      },
    ])
    .toArray();

  res.json({ transactions });
}