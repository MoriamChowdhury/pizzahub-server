import Stripe from "stripe";

let stripe: Stripe | null = null;

// Lazy: dotenv load hower por env pora hoy
export function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}