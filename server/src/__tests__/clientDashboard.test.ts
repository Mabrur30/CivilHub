import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Bid } from "../models/Bid.model";
import { Conversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Review } from "../models/Review.model";
import { type IUser, User } from "../models/User.model";
import bidsRouter from "../routes/bids.routes";
import dashboardRouter from "../routes/dashboard.routes";
import projectsRouter from "../routes/projects.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const asClient = (req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(client));

const daysAgo = (days: number): Date => new Date(Date.now() - days * 864e5);

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/bids", bidsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Bid, Conversation, Message, Notification, Payment, Project, ProjectPhase, Review, User].map(
      (model) => (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  client = await User.create({ name: "Nusrat Jahan", email: "nusrat@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Client overview", () => {
  test("lists every decision waiting on the client, oldest first, with amounts", async () => {
    const other = await User.create({ name: "Rafiq Uddin", email: "rafiq@test.dev", passwordHash: "x", role: "engineer" });

    // Open brief with two pending bids.
    const open = await Project.create({ title: "Boundary wall", client: client._id, status: "open_for_bids" });
    await Bid.create({ engineer: engineer._id, project: open._id, amount: 900, message: "Bid", status: "pending", createdAt: daysAgo(6) });
    await Bid.create({ engineer: other._id, project: open._id, amount: 950, message: "Bid", status: "pending", createdAt: daysAgo(2) });

    // Plan submitted, waiting for review.
    await Project.create({
      title: "Warehouse slab", client: client._id, assignedEngineer: engineer._id, status: "in-progress",
      totalAgreedValue: 4000, phasePlanStatus: "pending_client_approval",
    });

    // Plan approved but the advance isn't paid.
    await Project.create({
      title: "Duplex frame", client: client._id, assignedEngineer: other._id, status: "in-progress",
      totalAgreedValue: 10000, phasePlanStatus: "approved", paymentPlan: "phase_by_phase", advanceRequiredAmount: 2000,
    });

    // In delivery, one phase submitted for approval.
    const delivery = await Project.create({
      title: "Six-storey block", client: client._id, assignedEngineer: engineer._id, status: "in-progress",
      totalAgreedValue: 5000, phasePlanStatus: "approved", paymentPlan: "phase_by_phase",
      advanceRequiredAmount: 1000, advancePaid: true,
    });
    await ProjectPhase.create([
      { project: delivery._id, name: "Survey", order: 0, price: 1000, status: "completed", paymentStatus: "paid" },
      { project: delivery._id, name: "Frame", order: 1, price: 4000, status: "awaiting_approval", paymentStatus: "unpaid" },
    ]);
    await Payment.create([
      { project: delivery._id, type: "advance", amount: 1000, paidBy: client._id, method: "mock", paidAt: daysAgo(10) },
      { project: delivery._id, type: "phase", amount: 800, paidBy: client._id, method: "mock", paidAt: daysAgo(5) },
    ]);

    const response = await asClient(request(app).get("/api/dashboard/client/overview"));
    expect(response.status).toBe(200);

    const kinds = (response.body.actionItems as Array<{ kind: string }>).map((item) => item.kind);
    expect(kinds).toHaveLength(4);
    expect(kinds[0]).toBe("bids_review");
    expect(new Set(kinds)).toEqual(new Set(["bids_review", "plan_review", "advance_due", "phase_review"]));

    const byKind = Object.fromEntries(
      (response.body.actionItems as Array<{ kind: string }>).map((item) => [item.kind, item]),
    );
    expect(byKind.bids_review).toMatchObject({ count: 2, amount: null, href: `/dashboard/client/bids?project=${open._id.toString()}` });
    expect(byKind.advance_due).toMatchObject({ amount: 2000 });
    expect(byKind.phase_review).toMatchObject({ phaseName: "Frame", amount: 3200 });

    expect(response.body.money).toEqual({ committed: 19000, paidToDate: 1800, dueNow: 5200 });
    expect(response.body.activeProjects).toBe(3);
    expect(response.body.pendingBidReviews).toBe(2);
  });

  test("reports real unread messages and recent notifications", async () => {
    const conversation = await Conversation.create({
      participants: [client._id, engineer._id],
      pairKey: [client._id.toString(), engineer._id.toString()].sort().join(":"),
    });
    await Message.create({ conversation: conversation._id, sender: engineer._id, content: "Site visit Tuesday?", readBy: [] });
    await Notification.create({ recipient: client._id, type: "project_phase_updated", message: "Frame is ready for your approval." });

    const response = await asClient(request(app).get("/api/dashboard/client/overview"));
    expect(response.body.unreadMessages).toBe(1);
    expect(response.body.recentActivity).toHaveLength(1);
    expect(response.body.recentActivity[0]).toMatchObject({ source: "notification", message: "Frame is ready for your approval." });
    expect(response.body.actionItems).toEqual([]);
    expect(response.body.money).toEqual({ committed: 0, paidToDate: 0, dueNow: 0 });
  });

  test("is only for clients", async () => {
    const response = await request(app)
      .get("/api/dashboard/client/overview")
      .set("Cookie", cookieFor(engineer));
    expect(response.status).toBe(403);
  });
});

describe("Client project and bid lists", () => {
  test("posted projects carry stage details, and no fake due date", async () => {
    const open = await Project.create({ title: "Boundary wall", client: client._id, status: "open_for_bids", budgetRange: "$800 - $1,200" });
    await Bid.create({ engineer: engineer._id, project: open._id, amount: 900, message: "Bid", status: "pending" });
    await Bid.create({ engineer: engineer._id, project: open._id, amount: 950, message: "Bid", status: "declined" });

    const response = await asClient(request(app).get("/api/projects/my-posted-projects"));
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      status: "open_for_bids",
      bidCount: 2,
      pendingBidCount: 1,
      budgetRange: "$800 - $1,200",
      nextMilestoneDueDate: null,
      phasesAwaitingApproval: 0,
    });
  });

  test("bids include the engineer's rating, track record and the project budget", async () => {
    const open = await Project.create({ title: "Boundary wall", client: client._id, status: "open_for_bids", budgetMin: 800, budgetMax: 1200 });
    await Bid.create({ engineer: engineer._id, project: open._id, amount: 900, message: "Bid", status: "pending" });
    const done = await Project.create({ title: "Old job", client: client._id, assignedEngineer: engineer._id, status: "completed" });
    await Review.create({ project: done._id, client: client._id, engineer: engineer._id, rating: 4, reviewText: "Solid work" });

    const response = await asClient(request(app).get("/api/bids/my-projects-bids"));
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ projectStatus: "open_for_bids", budgetMin: 800, budgetMax: 1200 });
    expect(response.body[0].bids[0]).toMatchObject({
      engineerName: "Tanvir Alam",
      engineerPhotoUrl: null,
      engineerRating: 4,
      engineerReviewCount: 1,
      engineerCompletedProjects: 1,
    });
  });
});
