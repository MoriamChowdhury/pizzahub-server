import { z } from "zod";

export const CATEGORIES = [
  "Classic Pizzas",
  "Vegetarian Pizzas",
  "Meat Lovers",
  "Specialty / Gourmet Pizzas",
  "Sides & Appetizers",
  "Beverages & Desserts",
] as const;

export const menuItemSchema = z.object({
  itemName: z.string().trim().min(2, "Item name is too short").max(100),
  category: z.enum(CATEGORIES, { message: "Invalid category" }),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  price: z.coerce.number().positive("Price must be greater than 0").max(100000),
  location: z.string().trim().min(2, "Location is required").max(100),
  images: z.array(z.string().url("Invalid image URL")).min(1, "At least one image is required").max(5),
});