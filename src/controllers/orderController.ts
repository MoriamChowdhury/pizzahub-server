import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { orderSchema } from "../validators/orderValidator";
import { toObjectId } from "../utils/helpers";

const orders = () => getDB().collection("orders");

// Order er shathe item, vendor, customer info join
function joinStages(match: object) {
  return [
    { $match: match },
    { $lookup: { from: "menuItems", localField: "itemId", foreignField: "_id", as: "item" } },
    { $unwind: "$item" },
    { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
    { $unwind: "$vendor" },
    { $lookup: { from: "user", localField: "customerId", foreignField: "_id", as: "customer" } },
    { $unwind: "$customer" },
    {
      $project: {
        deliveryDate: 1, deliveryAddress: 1, message: 1, status: 1, createdAt: 1,
        "item._id": 1, "item.itemName": 1, "item.images": 1, "item.price": 1, "item.category": 1,
        "vendor._id": 1, "vendor.name": 1, "vendor.businessName": 1, "vendor.email": 1,
        "customer._id": 1, "customer.name": 1, "customer.email": 1, "customer.image": 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ];
}

/* ---------- CUSTOMER ---------- */

export async function createOrder(req: Request, res: Response) {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { itemId, deliveryDate, deliveryAddress, message } = parsed.data;

  const item = await getDB().collection("menuItems").findOne({ _id: new ObjectId(itemId) });
  if (!item || item.status !== "approved") {
    return res.status(400).json({ message: "This item is not available for ordering" });
  }

  const customerId = new ObjectId(req.user!.id);

  // Nijer item order kora jabe na
  if (item.vendorId.equals(customerId)) {
    return res.status(403).json({ message: "You cannot order your own item" });
  }

  // Vendor blocked hole order kora jabe na
  const vendor = await getDB().collection("user").findOne({ _id: item.vendorId });
  if (!vendor || vendor.isBlocked) {
    return res.status(400).json({ message: "This restaurant is currently unavailable" });
  }

  // Duplicate active order: same customer + item + date
  const day = new Date(deliveryDate);
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(day); end.setHours(23, 59, 59, 999);

  const duplicate = await orders().findOne({
    customerId,
    itemId: item._id,
    status: { $in: ["pending", "accepted"] },
    deliveryDate: { $gte: start, $lte: end },
  });
  if (duplicate) {
    return res.status(409).json({
      message: "You already have an active order for this item on that date",
    });
  }

  const result = await orders().insertOne({
    itemId: item._id,
    vendorId: item.vendorId,
    customerId,
    deliveryDate: start,
    deliveryAddress,
    message,
    status: "pending",
    createdAt: new Date(),
  });

  res.status(201).json({ message: "Order placed successfully", id: result.insertedId });
}

export async function getMyOrders(req: Request, res: Response) {
  const data = await orders()
    .aggregate(joinStages({ customerId: new ObjectId(req.user!.id) }))
    .toArray();
  res.json({ orders: data });
}

export async function cancelOrder(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid order ID" });

  const order = await orders().findOne({ _id });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (String(order.customerId) !== req.user!.id) {
    return res.status(403).json({ message: "You can only cancel your own orders" });
  }

  // Atomic: shudhu pending hole-i cancel hobe
  const result = await orders().updateOne(
    { _id, status: "pending" },
    { $set: { status: "cancelled" } }
  );
  if (!result.matchedCount) {
    return res.status(400).json({
      message: `Only pending orders can be cancelled (this order is ${order.status})`,
    });
  }
  res.json({ message: "Order cancelled" });
}

/* ---------- VENDOR ---------- */

export async function getVendorOrders(req: Request, res: Response) {
  const data = await orders()
    .aggregate(joinStages({ vendorId: new ObjectId(req.user!.id) }))
    .toArray();
  res.json({ orders: data });
}

export async function updateOrderStatus(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid order ID" });

  const status = req.body?.status;
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Status must be accepted or rejected" });
  }

  const order = await orders().findOne({ _id });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (String(order.vendorId) !== req.user!.id) {
    return res.status(403).json({ message: "You can only manage your own orders" });
  }

  // Atomic: shudhu pending, ar ekbar-i change hobe
  const result = await orders().updateOne(
    { _id, status: "pending" },
    { $set: { status } }
  );
  if (!result.matchedCount) {
    return res.status(400).json({
      message: `Only pending orders can be updated (this order is ${order.status})`,
    });
  }
  res.json({ message: `Order ${status}` });
}

/* ---------- SHARED (details) ---------- */

export async function getOrder(req: Request, res: Response) {
  const _id = toObjectId(String(req.params.id));
  if (!_id) return res.status(400).json({ message: "Invalid order ID" });

  const [order] = await orders().aggregate(joinStages({ _id })).toArray();
  if (!order) return res.status(404).json({ message: "Order not found" });

  const u = req.user!;
  const allowed =
    u.role === "admin" ||
    String(order.customer._id) === u.id ||
    String(order.vendor._id) === u.id;
  if (!allowed) return res.status(403).json({ message: "Access denied" });

  res.json({ order });
}