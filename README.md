# CivilHub

CivilHub is a full-stack marketplace platform for engineering, construction, and equipment services. It connects clients, engineers, companies, and admins through a project-based workflow that includes bidding, milestone tracking, payments, equipment rentals, messaging, verification, and moderation.

## Overview

The platform is organized into three main apps:

- Server API: Node.js + TypeScript + Express + MongoDB/Mongoose
- Client app: React + TypeScript + Vite for end users
- Admin app: React + TypeScript + Vite for moderation and operations

## Features

- Project posting, bidding, and assignment workflows
- Phase planning and approval tracking
- Milestone and payment handling with secured gateway integration
- Equipment listing and rental booking flows
- User messaging and notifications
- Verification and compliance workflows
- Admin moderation, payouts, reports, and disputes
- Role-based dashboards for clients, engineers, companies, and admins

## Tech Stack

- Backend: Node.js, TypeScript, Express, Mongoose
- Database: MongoDB
- Frontend: React, Vite, TypeScript, Tailwind CSS
- Auth: JWT + cookie-based session handling
- Media: Cloudinary
- Payments: SSLCommerz
- Testing: Jest, Supertest

## Repository Structure

```text
civilhub/
├── README.md
├── package.json
├── server/
│   ├── src/
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
├── BUILDING_COST_ESTIMATOR_REPORT.md
└── house_price_bd.csv
```

## Getting Started

### 1. Install dependencies

```bash
npm --prefix server install
npm --prefix client install
npm --prefix admin install
```

### 2. Configure environment variables

Create and fill the server environment file:

```bash
server/.env
```

Required configuration includes MongoDB, JWT secrets, Cloudinary credentials, and payment gateway settings. See the detailed setup notes in [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md).

### 3. Run the apps

From the project root:

```bash
npm run dev:server
npm run dev:client
npm run dev:admin
```

Or run them individually with project-local scripts.

## Build and Test

### Build

```bash
npm --prefix server run build
npm --prefix client run build
npm --prefix admin run build
```

The root workspace also provides:

```bash
npm run build
```

### Test

```bash
npm --prefix server run test
```

## Documentation

For the full architecture, API domains, workflows, data model, operational logic, and environment details, see:

- [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)

## Notes

This project includes a substantial backend and multiple frontends, and it is designed around real-world business logic rather than a simple starter template. The server performs scheduled housekeeping tasks for deposits, verification expiry, payment reminders, and dispute resolution.
