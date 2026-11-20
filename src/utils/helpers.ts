import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";

export const FREE_PLAN_LIMIT = 3;

export const escapeRegex = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const toObjectId = (id: string) =>
  /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;

export function isPremiumActive(user: any): boolean {
  if (!user || user.subscriptionPlan !== "premium") return false;
  if (!user.subscriptionExpiresAt) return true;
  return new Date(user.subscriptionExpiresAt) > new Date();
}

// async controller er error automatic errorHandler e jabe
export const catchAsync =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);