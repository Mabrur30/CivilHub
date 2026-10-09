# CivilHub Project Documentation

## 1. Overview

CivilHub is a full-stack marketplace platform for construction and engineering services. It connects:

- Clients who need projects, equipment, or specialist support.
- Engineers and companies that provide project delivery, labour, and equipment services.
- Admin staff who monitor platform activity, disputes, payouts, verifications, and content.

The platform supports project posting, bidding, phase-based delivery, payments, equipment rentals, messaging, verification, and moderation workflows.

## 2. Product Scope

### Core user roles

- Client
  - Posts projects
  - Reviews bids and invites engineers
  - Tracks progress and approvals
  - Pays milestones and deposits
  - Can raise disputes and cancellations

- Engineer
  - Browses project opportunities
  - Submits bids and project updates
  - Manages assigned project phases
  - Uploads deliverables and evidence
  - Handles equipment listings and bookings when relevant

- Organisation (company account)
  - Shares the provider dashboard with engineer-style workflows
  - Can act as a project delivery company
  - Can sell/rent equipment and manage company profile

- Admin
  - Reviews users, reports, payouts, verifications, disputes, and deposits
  - Manages platform settings and moderation actions
  - Oversees financial and compliance operations

## 3. Solution Architecture

### Technology stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js + TypeScript + Express |
| Database | MongoDB via Mongoose |
| Frontend | React + TypeScript + Vite |
| Admin app | React + TypeScript + Vite |
| Authentication | JWT + cookie-based auth |
| File uploads | Multer + Cloudinary |
| Payments | SSLCommerz integration |
| Styling | Tailwind CSS |
| API testing | Jest + Supertest |

### Repository structure

```text
civilhub/
├── README.md
├── package.json
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── scripts/
│   │   └── index.ts
│   ├── package.json
│   └── .env
├── client/
│   ├── src/
│   └── package.json
├── admin/
│   ├── src/
│   └── package.json
├── docs/
│   └── PROJECT_DOCUMENTATION.md
├── civilhub.postman_collection.json
└── house_price_bd.csv
```

### Runtime layout

- `server/` hosts the API server and business logic.
- `client/` hosts end-user portal for clients and service providers.
- `admin/` hosts platform management dashboard.
- `docs/` contains project-level documentation.

## 4. Backend Architecture

The server entry point is `server/src/index.ts`. It initializes:

- Express app and JSON parsing
- CORS with client/admin origins
- Cookie parsing
- Database connection
- Global rate limiting
- API routers
- Background sweeps for payment, project, dispute, and verification housekeeping

### API routing domains

The API is organized by feature area, including:

- `auth` - login, signup, session, password/email changes
- `clients` - client profile and client-specific operations
- `engineers` - engineer profile and provider operations
- `users` - user and account management
- `projects` - creating, querying, bidding, phase planning, approvals, cancellations, disputes
- `dashboard` - role-based dashboard data
- `bids` and `bid-invitations` - bid workflow
- `network` - connections/following/recommendations
- `conversations` - messaging and chat
- `notifications` - user alerts
- `posts` and `comments` - feed/social activity
- `reviews` - customer/reputation feedback
- `cost-estimator` - cost estimation flows
- `equipment` and `equipmentBooking` - equipment listings and rentals
- `payments` and `payouts` - financial operations
- `organisations` - company profile management
- `verification` - KYC / verification workflows
- `dispute-cases` - formal dispute handling
- `safety` - reports and blocks
- `admin` - admin-only operations
- `public` - public-facing endpoints
- `geo` - site and location helpers

### Key backend patterns

- Model-based persistence with MongoDB/Mongoose.
- `protect` middleware for authenticated routes.
- Role-aware access control and admin checks.
- Upload middleware for attachments and deliverables.
- Background sweeps to settle reminders and expiry conditions.
- Payment and project integrity checks at startup and runtime.

## 5. Data Model Highlights

### Main entities

#### User

`server/src/models/User.model.ts`

Represents all user accounts, with roles:

- `client`
- `engineer`
- `organisation`

Important properties include:

- `name`, `email`, `passwordHash`
- `role`
- `status` (`active`, `suspended`, `banned`)
- `suspendedUntil`, `statusReason`
- `verifiedAt`
- `sessionVersion`

#### Project

`server/src/models/Project.model.ts`

Represents construction or service jobs, including:

- project title/name and description
- budget, category, location
- site details with geo coordinates and access info
- required services and project criteria
- assignment to engineer/company
- payment plan, funding rule, milestones
- status lifecycle (`open_for_bids`, `active`, `in-progress`, `completed`, `cancelled`)
- dispute and cancellation state

#### Bid / Bid Invitation

Support the selection workflow where clients and providers exchange project offers and invitations.

#### Payment and Payout

The platform includes finance flows for:

- deposits
- project advances
- phase billing
- payout settlements
- refund logic
- platform commission handling

#### Equipment

Used for equipment listings, rental agreements, and booking states.

#### Verification

Supports user/company verification with identity or compliance checks.

#### Dispute / Safety

The system supports:

- dispute cases between parties
- cancellation proposals
- blocking/reporting users or content
- moderation tools for admin actions

## 6. Platform Workflows

### 1. Project lifecycle

1. Client creates a project brief.
2. Project is exposed as open or assigned for bidding.
3. Engineers/companies review project criteria.
4. Bids or invitations are issued.
5. Client selects a provider.
6. Phase plan is created and approved.
7. Work proceeds in phases.
8. Deliverables are submitted for approval.
9. Payment is released or held according to payment rules.
10. Project concludes or enters dispute/cancellation handling.

### 2. Payment workflow

The backend includes logic for:

- advance or full upfront funding
- phase-based payments
- secure payment requests via SSLCommerz
- payouts to providers after approval
- deposit settlement, reminders, and confirmation events

### 3. Dispute workflow

The platform supports structured project disputes with:

- dispute opening
- cancellation proposals
- approval/decline workflows
- reminder sweeps for unresolved actions
- admin decision support

### 4. Verification workflow

Users or organisations may be verified by the platform; expiry and reminder logic are tracked automatically.

## 7. Frontend Structure

### Client app (`client/`)

The client app exposes the public and dashboard experiences for end users. It includes pages for:

- landing and marketing pages
- login/signup
- dashboard overview and project management
- marketplace browsing
- messaging/inbox
- payments and payment result feedback
- equipment browsing and booking
- profile pages
- settings and notifications

### Admin app (`admin/`)

The admin app provides moderation and operations views for:

- overview dashboard
- user management
- verification review
- payouts and refunds
- payments and deposits
- disputes and reports
- content moderation
- platform settings
- action log

## 8. Security and Operational Controls

The server includes several protections and operational safeguards:

- JWT-based auth and cookies
- JWT secret validation for production mode
- rate limiting for auth and social write traffic
- CORS restrictions to configured origins
- admin secret validation at startup
- payment-mode enforcement
- Cloudinary integration for media uploads
- proxy trust configuration for reverse-proxy deployments
- hourly sweeps for housekeeping tasks

### Environment variables

The backend requires configuration for:

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `CLIENT_URL`
- `ADMIN_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `SSLCOMMERZ_STORE_ID`
- `SSLCOMMERZ_STORE_PASSWORD`
- `SSLCOMMERZ_IS_SANDBOX`
- `PLATFORM_COMMISSION_RATE`

The repo includes a live-looking server `.env` file in the working copy, which should be treated as sensitive configuration.

## 9. Development Workflow

### Install dependencies

From the repo root, install the package sets needed by each app:

```bash
npm --prefix server install
npm --prefix client install
npm --prefix admin install
```

### Run local development servers

```bash
npm run dev:server
npm run dev:client
npm run dev:admin
```

The root `package.json` exposes scripts for the server, client, and admin apps.

### Build commands

```bash
npm --prefix server run build
npm --prefix client run build
npm --prefix admin run build
```

The root script also runs server + client build together:

```bash
npm run build
```

### Test commands

```bash
npm --prefix server run test
```

The server includes a substantial Jest suite covering users, projects, money, disputes, billing, safety, and verification flows.

## 10. Operational Notes

- The server performs scheduled housekeeping on an hourly interval.
- Background jobs cover deposit settlements, verification expiries, approval reminders, and decision finalization.
- Admin routes are gated by a dedicated admin secret and authentication middleware.
- Payments and financial state are not treated as optional or incidental—they are first-class business logic.
- The platform is designed for production use with environment-driven configuration and a structured API layer.

## 11. Summary

CivilHub is a vertically integrated marketplace platform for engineering and construction services, with a strong emphasis on:

- project lifecycle management
- provider selection and bidding
- milestone-based payment trust
- dispute handling and moderation
- verification and compliance
- equipment booking and rental support
- multi-role dashboard experiences

This is a substantial, business-logic-heavy application rather than a demo starter; it has an operational backend, separate client/admin frontends, and a rich workflow model across project delivery and finance.
