import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db";
import { assertPaymentModeChosen } from "./config/payments";
import clientRouter from "./routes/client.routes";
import errorHandler from "./middleware/errorHandler";
import authRouter from "./routes/auth.routes";
import projectsRouter from "./routes/projects.routes";
import dashboardRouter from "./routes/dashboard.routes";
import bidsRouter from "./routes/bids.routes";
import bidInvitationsRouter from "./routes/bidInvitations.routes";
import engineerRouter from "./routes/engineer.routes";
import networkRouter from "./routes/network.routes";
import conversationsRouter from "./routes/conversations.routes";
import userRouter from "./routes/user.routes";
import postRouter from "./routes/post.routes";
import notificationsRouter from "./routes/notifications.routes";
import reviewsRouter from "./routes/reviews.routes";
import commentsRouter from "./routes/comments.routes";
import costEstimatorRouter from "./routes/costEstimator.routes";
import equipmentRouter from "./routes/equipment.routes";
import equipmentBookingRouter from "./routes/equipmentBooking.routes";
import paymentsRouter from "./routes/payments.routes";
import organisationRouter from "./routes/organisation.routes";
import geoRouter from "./routes/geo.routes";
import { blocksRouter, reportsRouter } from "./routes/safety.routes";
import adminRouter from "./routes/admin.routes";
import payoutsRouter from "./routes/payouts.routes";
import verificationRouter from "./routes/verification.routes";
import disputeCasesRouter from "./routes/disputeCases.routes";
import publicRouter from "./routes/public.routes";
import { settleCaseReplyReminders } from "./utils/disputeCases";
import { finalizeDueDecisions } from "./utils/disputeDecisions";
import { getAdminSecret } from "./middleware/adminAuth.middleware";
import { authLimiter, passwordCheckLimiter, socialWriteLimiter } from "./middleware/rateLimit";
import { assertUserSecretStrong } from "./middleware/auth.middleware";
import { parseQueryString } from "./utils/queryParser";
import { backfillCompletedProjectStatuses } from "./controllers/projectProgress.controller";
import { tidyConnections } from "./controllers/network.controller";
import { Payment } from "./models/Payment.model";
import { settleDueDepositsQuietly } from "./utils/deposits";
import { settleDueConfirmations } from "./utils/bookingConfirmations";
import { settleVerificationExpiries } from "./utils/verification";
import { settleApprovalReminders, settleFundingReminders } from "./utils/projectMoney";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;

// Every query value is a single string; see parseQueryString.
app.set("query parser", parseQueryString);

// Behind a reverse proxy, how many hops to trust for the client's address.
// Without it every visitor shares the proxy's IP, and so its rate limits.
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (Number.isInteger(trustProxy) && trustProxy > 0) {
  app.set("trust proxy", trustProxy);
}

// The main site and the separate admin app both call this API.
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:5173",
      process.env.ADMIN_URL || "http://localhost:5174",
    ],
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "CivilHub Backend API is running",
    frontendUrl: process.env.CLIENT_URL || "http://localhost:5173",
    healthCheck: "/api/health",
  });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "CivilHub API is running" });
});

app.use(["/api/auth/login", "/api/auth/signup"], authLimiter);
app.use(["/api/auth/me/password", "/api/auth/me/email", "/api/payouts/me/account"], passwordCheckLimiter);
app.use(
  ["/api/network", "/api/posts", "/api/comments", "/api/conversations", "/api/reports", "/api/blocks"],
  socialWriteLimiter,
);
app.use("/api/auth", authRouter);
app.use("/api/clients", clientRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bids", bidsRouter);
app.use("/api/bid-invitations", bidInvitationsRouter);
app.use("/api/engineers", engineerRouter);
app.use("/api/network", networkRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/users", userRouter);
app.use("/api/posts", postRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/cost-estimator", costEstimatorRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api", equipmentBookingRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/organisations", organisationRouter);
app.use("/api/geo", geoRouter);
app.use("/api/blocks", blocksRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/payouts", payoutsRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/dispute-cases", disputeCasesRouter);
app.use("/api/public", publicRouter);
app.use("/api/admin", adminRouter);
app.use(errorHandler);

const SWEEP_MS = 60 * 60 * 1000;

const startServer = async (): Promise<void> => {
  // Admin routes can't work without their own secret; say so at start-up
  // rather than on the first admin sign-in.
  try {
    getAdminSecret();
  } catch (error: unknown) {
    console.warn(`Admin dashboard disabled: ${(error as Error).message}`);
  }
  assertPaymentModeChosen();
  assertUserSecretStrong();
  await connectDB();
  // Payments recorded before the gateway had no status; they were all paid.
  await Payment.updateMany(
    { status: { $exists: false } },
    { $set: { status: "paid" } },
  ).exec();
  await backfillCompletedProjectStatuses();
  await tidyConnections();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  // Hourly housekeeping: remind owners about unsettled deposits and release
  // overdue ones; remind companies about expiring licences and lapse expired
  // ones; remind clients about hand-overs they haven't answered and phases
  // they haven't funded.
  const sweep = (): void => {
    // Before deposits: an auto-confirmed return starts the deposit clock.
    settleDueConfirmations()
      .catch((error: unknown) => {
        console.error("Rental confirmation sweep failed", error);
      })
      .finally(settleDueDepositsQuietly);
    settleVerificationExpiries().catch((error: unknown) => {
      console.error("Verification expiry sweep failed", error);
    });
    settleApprovalReminders().catch((error: unknown) => {
      console.error("Phase approval reminder sweep failed", error);
    });
    settleFundingReminders().catch((error: unknown) => {
      console.error("Phase funding reminder sweep failed", error);
    });
    settleCaseReplyReminders().catch((error: unknown) => {
      console.error("Dispute reply reminder sweep failed", error);
    });
    finalizeDueDecisions().catch((error: unknown) => {
      console.error("Dispute decision sweep failed", error);
    });
  };
  sweep();
  setInterval(sweep, SWEEP_MS).unref();
};

startServer().catch((error: unknown) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

export default app;
