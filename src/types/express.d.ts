export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "customer" | "vendor" | "admin";
  isBlocked: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}