import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { FREE_PLAN_LIMIT, isPremiumActive } from "../utils/helpers";

// field onujayi group kore count: { pending: 2, approved: 5 }
async function groupCount(collection: string, field: string, match: object = {}) {
  const rows = await getDB()
    .collection(collection)
    .aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count as number]));
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export async function vendorStats(req: Request, res: Response) {
  const vendorId = new ObjectId(req.user!.id);

  const [itemsByStatus, ordersByStatus, vendor] = await Promise.all([
    groupCount("menuItems", "status", { vendorId }),
    groupCount("orders", "status", { vendorId }),
    getDB().collection("user").findOne({ _id: vendorId }),
  ]);

  const premium = isPremiumActive(vendor);

  res.json({
    totalItems: sum(itemsByStatus),
    activeItems: itemsByStatus.approved || 0,
    pendingOrders: ordersByStatus.pending || 0,
    acceptedOrders: ordersByStatus.accepted || 0,
    plan: premium ? "premium" : "free",
    planLimit: premium ? null : FREE_PLAN_LIMIT,
    subscriptionExpiresAt: vendor?.subscriptionExpiresAt || null,
    itemsByStatus,
    ordersByStatus,
  });
}

export async function customerStats(req: Request, res: Response) {
  const customerId = new ObjectId(req.user!.id);
  const ordersByStatus = await groupCount("orders", "status", { customerId });

  res.json({
    totalOrders: sum(ordersByStatus),
    pendingOrders: ordersByStatus.pending || 0,
    acceptedOrders: ordersByStatus.accepted || 0,
    rejectedOrders: ordersByStatus.rejected || 0,
    ordersByStatus,
  });
}

export async function adminStats(_req: Request, res: Response) {
  const db = getDB();

  const [usersByRole, menuByStatus, ordersByStatus, totalTransactions] = await Promise.all([
    groupCount("user", "role"),
    groupCount("menuItems", "status"),
    groupCount("orders", "status"),
    db.collection("transactions").countDocuments(),
  ]);

  res.json({
    totalUsers: sum(usersByRole),
    totalVendors: usersByRole.vendor || 0,
    totalCustomers: usersByRole.customer || 0,
    totalMenuItems: sum(menuByStatus),
    pendingMenuItems: menuByStatus.pending || 0,
    totalTransactions,
    usersByRole,
    menuByStatus,
    ordersByStatus,
  });
}