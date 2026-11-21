import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { getDB } from "../config/db";
import { getStripe } from "../config/stripe";
import { isPremiumActive } from "../utils/helpers";

const PREMIUM_PRICE_CENTS = 500; // $5.00
const CURRENCY = "usd";

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:3000";
const users = () => getDB().collection("user");
const transactions = () => getDB().collection("transactions");

/* ---------- VENDOR APIs ---------- */

// Vendor id token theke ashe, body theke na. Onno vendor er jonno session banano jay na
export async function createCheckoutSession(req: Request, res: Response) {
  const vendorId = new ObjectId(req.user!.id);
  const vendor = await users().findOne({ _id: vendorId });
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  if (isPremiumActive(vendor)) {
    return res.status(400).json({ message: "You already have an active Premium plan" });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    ...(vendor.stripeCustomerId
      ? { customer: vendor.stripeCustomerId }
      : { customer_email: vendor.email }),
    client_reference_id: String(vendorId),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: PREMIUM_PRICE_CENTS,
          recurring: { interval: "month" },
          product_data: {
            name: "PizzaHub Premium",
            description: "Unlimited menu items, Premium badge and featured placement",
          },
        },
      },
    ],
    metadata: { vendorId: String(vendorId), plan: "premium" },
    subscription_data: { metadata: { vendorId: String(vendorId) } },
    success_url: `${clientUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/payment/cancel`,
  });

  res.json({ url: session.url });
}

export async function getSubscriptionStatus(req: Request, res: Response) {
  const vendor = await users().findOne({ _id: new ObjectId(req.user!.id) });
  res.json({
    plan: isPremiumActive(vendor) ? "premium" : "free",
    expiresAt: vendor?.subscriptionExpiresAt || null,
    cancelAtPeriodEnd: !!vendor?.cancelAtPeriodEnd,
    hasSubscription: !!vendor?.stripeSubscriptionId,
  });
}

// Period sesh porjonto Premium thakbe, tarpor webhook free kore dibe
export async function cancelSubscription(req: Request, res: Response) {
  const _id = new ObjectId(req.user!.id);
  const vendor = await users().findOne({ _id });
  if (!vendor?.stripeSubscriptionId) {
    return res.status(400).json({ message: "No active subscription found" });
  }

  await getStripe().subscriptions.update(vendor.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await users().updateOne({ _id }, { $set: { cancelAtPeriodEnd: true } });
  res.json({ message: "Subscription will end at the end of the current billing period" });
}

/* ---------- WEBHOOK ---------- */

// Stripe API version bhedey field jaygay change hoy, tai duita jaygay-i dekhi
function periodEnd(sub: any): Date | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

const subIdOf = (v: any): string | null =>
  !v ? null : typeof v === "string" ? v : v.id || null;

const findVendorBySub = (subId: string | null) =>
  subId ? users().findOne({ stripeSubscriptionId: subId }) : Promise.resolve(null);

async function handleEvent(event: Stripe.Event) {
  const stripe = getStripe();

  switch (event.type) {
    // Prothom payment: ekhane-i Premium activate hoy
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "subscription" || s.payment_status !== "paid") break;

      const vendorIdStr = s.metadata?.vendorId;
      if (!vendorIdStr || !ObjectId.isValid(vendorIdStr)) break;
      const vendorId = new ObjectId(vendorIdStr);

      const vendor = await users().findOne({ _id: vendorId });
      if (!vendor || vendor.role !== "vendor") break;

      const subId = subIdOf(s.subscription);
      if (!subId) break;
      const sub = await stripe.subscriptions.retrieve(subId);
      const expires = periodEnd(sub) ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await users().updateOne(
        { _id: vendorId },
        {
          $set: {
            subscriptionPlan: "premium",
            subscriptionExpiresAt: expires,
            stripeCustomerId: subIdOf(s.customer),
            stripeSubscriptionId: subId,
            cancelAtPeriodEnd: false,
          },
        }
      );

      // Upsert: Stripe same event abar pathale duplicate transaction hobe na
      await transactions().updateOne(
        { stripeSessionId: s.id },
        {
          $setOnInsert: {
            vendorId,
            plan: "premium",
            amount: s.amount_total ?? PREMIUM_PRICE_CENTS,
            currency: s.currency ?? CURRENCY,
            stripeSessionId: s.id,
            stripeSubscriptionId: subId,
            status: "paid",
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      break;
    }

    // Proti mash er renewal
    case "invoice.paid": {
      const inv = event.data.object as any;
      if (inv.billing_reason !== "subscription_cycle") break;

      const subId = subIdOf(inv.subscription ?? inv.parent?.subscription_details?.subscription);
      const vendor = await findVendorBySub(subId);
      if (!vendor || !subId) break;

      const sub = await stripe.subscriptions.retrieve(subId);
      const expires = periodEnd(sub);
      if (expires) {
        await users().updateOne(
          { _id: vendor._id },
          { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: expires } }
        );
      }
      await transactions().updateOne(
        { stripeInvoiceId: inv.id },
        {
          $setOnInsert: {
            vendorId: vendor._id,
            plan: "premium",
            amount: inv.amount_paid ?? PREMIUM_PRICE_CENTS,
            currency: inv.currency ?? CURRENCY,
            stripeSessionId: null,
            stripeInvoiceId: inv.id,
            stripeSubscriptionId: subId,
            status: "paid",
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      break;
    }

    // Renewal payment fail
    case "invoice.payment_failed": {
      const inv = event.data.object as any;
      const subId = subIdOf(inv.subscription ?? inv.parent?.subscription_details?.subscription);
      const vendor = await findVendorBySub(subId);
      if (!vendor) break;

      await transactions().updateOne(
        { stripeInvoiceId: inv.id },
        {
          $setOnInsert: {
            vendorId: vendor._id,
            plan: "premium",
            amount: inv.amount_due ?? PREMIUM_PRICE_CENTS,
            currency: inv.currency ?? CURRENCY,
            stripeSessionId: null,
            stripeInvoiceId: inv.id,
            stripeSubscriptionId: subId,
            status: "failed",
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      break;
    }

    // Cancel schedule / period update. Ekhane Premium activate hoy na, shudhu already-premium vendor update hoy
    case "customer.subscription.updated": {
      const sub = event.data.object as any;
      const vendor = await findVendorBySub(sub.id);
      if (!vendor) break;

      const set: Record<string, any> = { cancelAtPeriodEnd: !!sub.cancel_at_period_end };
      const expires = periodEnd(sub);
      if (expires && ["active", "trialing"].includes(sub.status)) {
        set.subscriptionExpiresAt = expires;
      }
      await users().updateOne({ _id: vendor._id }, { $set: set });
      break;
    }

    // Subscription sesh: free e fire jao
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const vendor = await findVendorBySub(sub.id);
      if (!vendor) break;

      await users().updateOne(
        { _id: vendor._id },
        {
          $set: {
            subscriptionPlan: "free",
            subscriptionExpiresAt: null,
            stripeSubscriptionId: null,
            cancelAtPeriodEnd: false,
          },
        }
      );
      break;
    }

    default:
      break;
  }
}

// req.body ekhane raw Buffer (server.ts e express.raw diye)
export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Missing signature or webhook secret");
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await handleEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Webhook handler failed"); // Stripe abar retry korbe
  }
}