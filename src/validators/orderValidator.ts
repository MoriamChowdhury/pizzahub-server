import { z } from "zod";

export const orderSchema = z.object({
  itemId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid item ID"),
  deliveryDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid delivery date")
    .refine((d) => {
      const date = new Date(d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    }, "Delivery date cannot be in the past"),
  deliveryAddress: z.string().trim().min(5, "Delivery address is too short").max(300),
  message: z.string().trim().max(500).optional().default(""),
});