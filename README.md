# 🍕 PizzaHub: Server

Express + TypeScript REST API for **PizzaHub**, a pizza ordering and delivery platform.

- **Live Client Site:** https://pizzahub-client-theta.vercel.app
- **Live API:** https://pizzahub-server-two.vercel.app/
- **Client Repo:** https://github.com/MoriamChowdhury/pizzahub-client
- **Server Repo:** https://github.com/MoriamChowdhury/pizzahub-server

## Features

- JWT verification (`jose` + Better Auth JWKS) and role middleware (customer, vendor, admin)
- Menu, order, stats, admin, profile and payment APIs with Zod validation
- Role is always read from the database, never trusted from the token or client
- Ownership checks before update/delete; `401` for unauthorized, `403` for forbidden
- Blocked users are rejected on every protected API
- Advanced menu search, filter, price sorting and pagination
- Free plan limit (3 active items), Premium unlimited
- Stripe Checkout (subscription) with a signature-verified, idempotent webhook
- Subscription cancel and expiry handling

## Tech Stack

Express, TypeScript, MongoDB, jose, Stripe, Zod, cors, dotenv, tsx

## Installation

```bash
git clone https://github.com/MoriamChowdhury/pizzahub-server.git
cd pizzahub-server
npm install
cp .env.example .env   # fill in values
npm run dev
```

Runs at http://localhost:5000

## Environment Variables

```
PORT=
CLIENT_URL=
BETTER_AUTH_URL=
MONGODB_URI=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`BETTER_AUTH_URL` must be the **client** URL (the JWT public keys are fetched from `<client>/api/auth/jwks`).

## Create an Admin

Admins cannot be created through public signup. Sign up normally, then run:

```bash
npx tsx scripts/make-admin.ts <email>
```

## Main Endpoints

| Route | Access |
|---|---|
| `GET /api/menu`, `/featured`, `/locations` | Public |
| `GET /api/menu/:id` | Logged in |
| `POST/PATCH /api/menu` | Vendor |
| `DELETE /api/menu/:id` | Vendor (own) / Admin |
| `/api/orders/*` | Customer / Vendor |
| `/api/stats/*` | Role based |
| `/api/admin/*` | Admin |
| `/api/profile` | Logged in |
| `/api/payments/*` | Vendor |
| `POST /api/webhooks/stripe` | Stripe (signature verified) |

## JWT Middleware Flow

`Authorization: Bearer <token>` → verify signature and issuer (JWKS) → load user from DB → reject if missing (`401`) or blocked (`403`) → `verifyRole(...)` (`403`) → controller (ownership checks).

## Menu Search API (Challenge)

`GET /api/menu?search=&category=&location=&sort=price_asc|price_desc|newest&page=&limit=`

## Test Credentials

> These are test accounts on the live site: https://pizzahub-client-theta.vercel.app

| Role | Email | Password |
|---|---|---|
| Admin | `admin@gmail.com` | `Admin123` |
| Vendor 1 | `alexa@gmail.com` | `Alexa123` |
| Vendor 2 | `john@gmail.com` | `John123` |
| Customer | `nova@gmail.com` | `Nova123` |

> Google login creates a **Customer** account by default.

## Stripe Test Payment (Vendor Premium Subscription)

Stripe runs in **test (sandbox) mode**, so no real money is charged.

1. Sign in as a **Vendor** and open **Dashboard → Subscription**
2. Click **Upgrade to Premium** (you are redirected to Stripe Checkout)
3. Choose **USD** and pay with the test card below:

| Field | Value |
|---|---|
| Card number | `4242 4242 4242 4242` |
| Expiry (MM/YY) | `12/34` (any future date) |
| Security code (CVC) | `123` (any 3 digits) |
| Name on card | Any name |
| Billing country | Any |

4. After payment you are sent to the Payment Success page. Premium is activated **only after Stripe's verified webhook** arrives (usually within a few seconds)
5. Verify: Subscription page shows **Premium**, and the Admin **Transactions** page shows the payment

Other test cards:
- Declined card: `4000 0000 0000 0002`

> Note: Customers do not pay through Stripe. Stripe is used only for vendor subscriptions.

## Notes

- Webhook endpoint: `POST /api/webhooks/stripe` (raw body, registered before `express.json()`). Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- After a Premium subscription expires, existing items remain but new items follow the Free limit