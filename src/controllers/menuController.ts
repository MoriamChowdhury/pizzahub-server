import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { menuItemSchema } from "../validators/menuValidator";
import {
  FREE_PLAN_LIMIT,
  escapeRegex,
  isPremiumActive,
  toObjectId,
} from "../utils/helpers";

const items = () => getDB().collection("menuItems");

const vendorLookup = [
  { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
  { $unwind: "$vendor" },
];

const vendorFields = {
  "vendor._id": 1,
  "vendor.name": 1,
  "vendor.businessName": 1,
  "vendor.image": 1,
  "vendor.subscriptionPlan": 1,
};

// Free vendor ar active limit check
async function canAddActive(vendorId: ObjectId): Promise<boolean> {
  const vendor = await getDB().collection("user").findOne({ _id: vendorId });
  if (isPremiumActive(vendor)) return true;
  const count = await items().countDocuments({
    vendorId,
    status: { $in: ["pending", "approved"] },
  });
  return count < FREE_PLAN_LIMIT;
}

const LIMIT_MSG = `Free plan allows max ${FREE_PLAN_LIMIT} active items. Upgrade to Premium for unlimited items.`;

/* ---------- PUBLIC ---------- */

export async function getFeatured(_req: Request, res: Response) {
  const data = await items()
    .aggregate([
      { $match: { status: "approved" } },
      ...vendorLookup,
      { $match: { "vendor.isBlocked": { $ne: true } } },
      {
        $addFields: {
          isPremium: { $cond: [{ $eq: ["$vendor.subscriptionPlan", "premium"] }, 1, 0] },
        },
      },
      { $sort: { isPremium: -1, createdAt: -1 } },
      { $limit: 6 },
      {
        $project: {
          itemName: 1, category: 1, price: 1, location: 1, images: 1,
          "vendor.name": 1, "vendor.businessName": 1, "vendor.subscriptionPlan": 1,
        },
      },
    ])
    .toArray();
  res.json({ items: data });
}

export async function getLocations(_req: Request, res: Response) {
  const locations = await items().distinct("location", { status: "approved" });
  res.json({ locations: locations.sort() });
}

// Search + filter + sort + pagination
// GET /api/menu?search=&category=&location=&sort=price_asc|price_desc|newest&page=1&limit=9
export async function getMenuItems(req: Request, res: Response) {
  const { search, category, location } = req.query as Record<string, string | undefined>;
  const sort = String(req.query.sort || "newest");
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(String(req.query.limit)) || 9));

  const match: any = { status: "approved" };
  if (category) match.category = category;
  if (location) match.location = { $regex: `^${escapeRegex(location)}$`, $options: "i" };

  const afterLookup: any = { "vendor.isBlocked": { $ne: true } };
  if (search?.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    afterLookup.$or = [
      { itemName: rx },
      { description: rx },
      { category: rx },
      { location: rx },
      { "vendor.businessName": rx },
      { "vendor.name": rx },
    ];
  }

  const sortStage: Record<string, 1 | -1> =
    sort === "price_asc" ? { price: 1, _id: 1 }
    : sort === "price_desc" ? { price: -1, _id: 1 }
    : { createdAt: -1, _id: 1 };

  const [result] = await items()
    .aggregate([
      { $match: match },
      ...vendorLookup,
      { $match: afterLookup },
      { $sort: sortStage },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                itemName: 1, category: 1, price: 1, location: 1, images: 1,
                "vendor.name": 1, "vendor.businessName": 1, "vendor.subscriptionPlan": 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ])
    .toArray();

  const total = result.total[0]?.count || 0;
  res.json({ items: result.data, total, page, pages: Math.ceil(total / limit) });
}

/* ---------- PRIVATE ---------- */

// Item details (login lagbe)
export async function getMenuItem(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid item ID" });

  const [item] = await items()
    .aggregate([
      { $match: { _id } },
      ...vendorLookup,
      { $project: { ...vendorFields, itemName: 1, category: 1, description: 1, price: 1, location: 1, images: 1, status: 1, vendorId: 1, createdAt: 1 } },
    ])
    .toArray();

  if (!item) return res.status(404).json({ message: "Menu item not found" });

  const user = req.user!;
  const isOwner = String(item.vendorId) === user.id;
  // Approved chhara onno item shudhu owner ar admin dekhte pabe
  if (item.status !== "approved" && !isOwner && user.role !== "admin") {
    return res.status(404).json({ message: "Menu item not found" });
  }
  res.json({ item });
}

/* ---------- VENDOR ---------- */

export async function getMyItems(req: Request, res: Response) {
  const vendorId = new ObjectId(req.user!.id);
  const data = await items().find({ vendorId }).sort({ createdAt: -1 }).toArray();
  res.json({ items: data });
}

export async function createMenuItem(req: Request, res: Response) {
  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const vendorId = new ObjectId(req.user!.id);
  if (!(await canAddActive(vendorId))) {
    return res.status(403).json({ message: LIMIT_MSG });
  }

  const doc = { ...parsed.data, vendorId, status: "pending", createdAt: new Date() };
  const result = await items().insertOne(doc);
  res.status(201).json({ message: "Item submitted for admin approval", id: result.insertedId });
}

export async function updateMenuItem(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid item ID" });

  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const item = await items().findOne({ _id });
  if (!item) return res.status(404).json({ message: "Menu item not found" });

  const vendorId = new ObjectId(req.user!.id);
  if (!item.vendorId.equals(vendorId)) {
    return res.status(403).json({ message: "You can only edit your own items" });
  }

  // Rejected/inactive item abar pending hole active count barbe
  if (!["pending", "approved"].includes(item.status) && !(await canAddActive(vendorId))) {
    return res.status(403).json({ message: LIMIT_MSG });
  }

  // Edit korle abar admin review lagbe
  await items().updateOne({ _id }, { $set: { ...parsed.data, status: "pending" } });
  res.json({ message: "Item updated and sent for re-approval" });
}

// Availability: approved <-> inactive
export async function toggleAvailability(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid item ID" });

  const item = await items().findOne({ _id });
  if (!item) return res.status(404).json({ message: "Menu item not found" });

  const vendorId = new ObjectId(req.user!.id);
  if (!item.vendorId.equals(vendorId)) {
    return res.status(403).json({ message: "You can only manage your own items" });
  }
  if (!["approved", "inactive"].includes(item.status)) {
    return res.status(400).json({ message: "Only approved or inactive items can be toggled" });
  }

  const next = item.status === "approved" ? "inactive" : "approved";
  if (next === "approved" && !(await canAddActive(vendorId))) {
    return res.status(403).json({ message: LIMIT_MSG });
  }

  await items().updateOne({ _id }, { $set: { status: next } });
  res.json({ message: `Item is now ${next}`, status: next });
}

// Vendor (nijer) ba Admin (jekono) delete korte pare
export async function deleteMenuItem(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid item ID" });

  const item = await items().findOne({ _id });
  if (!item) return res.status(404).json({ message: "Menu item not found" });

  if (req.user!.role === "vendor" && String(item.vendorId) !== req.user!.id) {
    return res.status(403).json({ message: "You can only delete your own items" });
  }

  await items().deleteOne({ _id });
  res.json({ message: "Item deleted" });
}