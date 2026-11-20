import { Router } from "express";
import { getDB } from "../config/db";

const router = Router();

// Public: approved item, premium vendor er item age
router.get("/featured", async (_req, res, next) => {
  try {
    const items = await getDB()
      .collection("menuItems")
      .aggregate([
        { $match: { status: "approved" } },
        {
          $lookup: {
            from: "user",
            localField: "vendorId",
            foreignField: "_id",
            as: "vendor",
          },
        },
        { $unwind: "$vendor" },
        { $match: { "vendor.isBlocked": { $ne: true } } },
        {
          $addFields: {
            isPremium: {
              $cond: [{ $eq: ["$vendor.subscriptionPlan", "premium"] }, 1, 0],
            },
          },
        },
        { $sort: { isPremium: -1, createdAt: -1 } },
        { $limit: 6 },
        {
          $project: {
            itemName: 1,
            category: 1,
            price: 1,
            location: 1,
            images: 1,
            "vendor.name": 1,
            "vendor.businessName": 1,
            "vendor.subscriptionPlan": 1,
          },
        },
      ])
      .toArray();

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;