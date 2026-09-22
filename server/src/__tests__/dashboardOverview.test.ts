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
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { type IUser, User } from "../models/User.model";
import dashboardRouter from "../routes/dashboard.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;

const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/dashboard", dashboardRouter);
  app.use(errorHandler);
  return app;
};

const authCookieForUser = (user: IUser): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set for tests");
  }

  const token = jwt.sign(
    { userId: user._id.toString(), role: user.role },
    secret,
    { expiresIn: "1h" },
  );

  return `civilhub_token=${token}`;
};

const createUser = async (name: string, email: string, role: "engineer" | "client"): Promise<IUser> =>
  User.create({ name, email, passwordHash: "hashed-password", role });

interface QueryExplanation {
  queryPlanner: { winningPlan: unknown };
}

const explainWinningPlanJson = (explanation: unknown): string =>
  JSON.stringify((explanation as QueryExplanation).queryPlanner.winningPlan);

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Bid.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
    Project.deleteMany({}),
    ProjectPhase.deleteMany({}),
    User.deleteMany({}),
  ]);
});

describe("Engineer overview: pending bids", () => {
  test("counts only this engineer's pending bids, excluding accepted/declined and other engineers' bids", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const otherEngineer = await createUser("Eng Two", "eng2@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");

    const projectA = await Project.create({ title: "Project A", client: client._id, status: "open_for_bids" });
    const projectB = await Project.create({ title: "Project B", client: client._id, status: "open_for_bids" });
    const projectC = await Project.create({ title: "Project C", client: client._id, status: "open_for_bids" });

    await Bid.create({ engineer: engineer._id, project: projectA._id, amount: 1000, message: "Bid A", status: "pending" });
    await Bid.create({ engineer: engineer._id, project: projectB._id, amount: 2000, message: "Bid B", status: "pending" });
    await Bid.create({ engineer: engineer._id, project: projectC._id, amount: 3000, message: "Bid C", status: "accepted" });
    await Bid.create({ engineer: otherEngineer._id, project: projectA._id, amount: 1500, message: "Bid D", status: "pending" });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    expect(response.body.pendingBids).toBe(2);
  });
});

describe("Engineer overview: unread messages", () => {
  test("counts unread messages across all of the engineer's conversations", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const clientA = await createUser("Client A", "clienta@test.dev", "client");
    const clientB = await createUser("Client B", "clientb@test.dev", "client");

    const conversationA = await Conversation.create({
      participants: [engineer._id, clientA._id],
      pairKey: [engineer._id.toString(), clientA._id.toString()].sort().join(":"),
    });
    const conversationB = await Conversation.create({
      participants: [engineer._id, clientB._id],
      pairKey: [engineer._id.toString(), clientB._id.toString()].sort().join(":"),
    });

    // Two unread messages from clientA, one already read
    await Message.create({ conversation: conversationA._id, sender: clientA._id, content: "Hi 1", readBy: [] });
    await Message.create({ conversation: conversationA._id, sender: clientA._id, content: "Hi 2", readBy: [] });
    await Message.create({ conversation: conversationA._id, sender: clientA._id, content: "Hi 3 (read)", readBy: [engineer._id] });

    // One unread message from clientB
    await Message.create({ conversation: conversationB._id, sender: clientB._id, content: "Hello", readBy: [] });

    // A message the engineer themself sent should never count as unread
    await Message.create({ conversation: conversationB._id, sender: engineer._id, content: "My own message", readBy: [engineer._id] });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    expect(response.body.unreadMessages).toBe(3);
  });
});

describe("Engineer overview: recent activity typing", () => {
  test("passes through the notification's real type instead of collapsing it", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");

    await Notification.create({
      recipient: engineer._id,
      type: "equipment_booking_request",
      message: "You have a new equipment booking request.",
    });
    await Notification.create({
      recipient: engineer._id,
      type: "bid_accepted",
      message: "Your bid was accepted.",
    });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    const types = response.body.recentActivity.map(
      (activity: { type: string }) => activity.type,
    );
    expect(types).toContain("equipment_booking_request");
    expect(types).toContain("bid_accepted");
    expect(types).not.toContain("review");
    expect(types).not.toContain("success");
  });

  test("exposes the notification's related entity ids, nulling out absent refs", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");
    const project = await Project.create({
      title: "Bridge Retrofit",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "active",
    });

    await Notification.create({
      recipient: engineer._id,
      type: "phase_plan_approved",
      message: "Your phase plan was approved.",
      project: project._id,
    });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    const [activity] = response.body.recentActivity;
    expect(activity.projectId).toBe(project._id.toString());
    expect(activity.equipmentId).toBeNull();
    expect(activity.bidId).toBeNull();
    expect(activity.conversationId).toBeNull();
    expect(activity.messageId).toBeNull();
  });
});

describe("Engineer overview: merged activity feed", () => {
  test("merges notifications, own bids and own completed phases, newest first", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");

    const project = await Project.create({
      title: "Bridge Retrofit",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "active",
    });

    const base = Date.now();
    const at = (offsetMs: number): Date => new Date(base + offsetMs);

    // Mongoose marks createdAt immutable under `timestamps: true`, so these
    // backdates have to go through the raw driver to actually apply.
    const notification = await Notification.create({
      recipient: engineer._id,
      type: "bid_accepted",
      message: "Your bid was accepted.",
      project: project._id,
    });
    await Notification.collection.updateOne(
      { _id: notification._id },
      { $set: { createdAt: at(2000) } },
    );

    const bid = await Bid.create({
      engineer: engineer._id,
      project: project._id,
      amount: 1000,
      message: "Bid A",
      status: "pending",
    });
    await Bid.collection.updateOne(
      { _id: bid._id },
      { $set: { createdAt: at(0) } },
    );

    await ProjectPhase.create({
      project: project._id,
      name: "Site survey",
      order: 0,
      price: 500,
      status: "completed",
      completedAt: at(1000),
    });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    const feed = response.body.recentActivity;
    expect(feed).toHaveLength(3);

    // Timestamp order (notification > phase > bid) deliberately differs from
    // creation order, so this asserts the merge sort rather than insertion order.
    expect(feed[0]).toMatchObject({
      source: "notification",
      type: "bid_accepted",
    });
    expect(feed[1]).toMatchObject({
      source: "own_phase_completion",
      projectId: project._id.toString(),
      projectTitle: "Bridge Retrofit",
      phaseTitle: "Site survey",
    });
    expect(feed[2]).toMatchObject({
      source: "own_bid",
      bidId: bid._id.toString(),
      projectId: project._id.toString(),
      projectTitle: "Bridge Retrofit",
    });
  });

  test("caps the merged feed at five entries across all three sources", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");

    const project = await Project.create({
      title: "Bridge Retrofit",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "active",
    });

    for (let index = 0; index < 4; index += 1) {
      await Notification.create({
        recipient: engineer._id,
        type: "new_message",
        message: `Message ${index}`,
      });
      await ProjectPhase.create({
        project: project._id,
        name: `Phase ${index}`,
        order: index,
        price: 100,
        status: "completed",
        completedAt: new Date(),
      });
    }

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    expect(response.body.recentActivity).toHaveLength(5);
  });

  test("excludes phases from projects the engineer is not assigned to", async () => {
    const app = createTestApp();
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const otherEngineer = await createUser("Eng Two", "eng2@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");

    const foreignProject = await Project.create({
      title: "Someone Else's Project",
      client: client._id,
      assignedEngineer: otherEngineer._id,
      status: "active",
    });
    await ProjectPhase.create({
      project: foreignProject._id,
      name: "Not yours",
      order: 0,
      price: 100,
      status: "completed",
      completedAt: new Date(),
    });

    const response = await request(app)
      .get("/api/dashboard/engineer/overview")
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    expect(response.body.recentActivity).toHaveLength(0);
  });
});

describe("Engineer overview: index usage", () => {
  test("Bid.countDocuments({engineer, status: 'pending'}) is answered by an index scan, not a collection scan", async () => {
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");
    const project = await Project.create({ title: "Project A", client: client._id, status: "open_for_bids" });
    await Bid.create({ engineer: engineer._id, project: project._id, amount: 1000, message: "Bid A", status: "pending" });

    const explanation = await Bid.find({ engineer: engineer._id, status: "pending" })
      .explain("queryPlanner");

    const winningPlanJson = explainWinningPlanJson(explanation);
    expect(winningPlanJson).not.toContain("COLLSCAN");
    expect(winningPlanJson).toContain("IXSCAN");
  });

  test("Project range query on nextMilestoneDueDate is answered by an index scan", async () => {
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");
    await Project.create({
      title: "Project A",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "active",
      nextMilestoneDueDate: new Date(Date.now() + 86400000),
    });

    const explanation = await Project.find({
      assignedEngineer: engineer._id,
      nextMilestoneDueDate: { $gt: new Date() },
      status: { $ne: "completed" },
    }).explain("queryPlanner");

    const winningPlanJson = explainWinningPlanJson(explanation);
    expect(winningPlanJson).not.toContain("COLLSCAN");
  });

  test("own-bid feed query (engineer + createdAt sort) avoids an in-memory sort", async () => {
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");
    const project = await Project.create({ title: "P", client: client._id, status: "open_for_bids" });
    await Bid.create({ engineer: engineer._id, project: project._id, amount: 1, message: "m", status: "pending" });

    const explanation = await Bid.find({ engineer: engineer._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .explain("queryPlanner");

    const winningPlanJson = explainWinningPlanJson(explanation);
    expect(winningPlanJson).not.toContain("COLLSCAN");
    expect(winningPlanJson).not.toContain("SORT");
  });

  test("completed-phase feed query (project + completedAt sort) avoids an in-memory sort", async () => {
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    const client = await createUser("Client One", "client1@test.dev", "client");
    const project = await Project.create({
      title: "P",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "active",
    });
    await ProjectPhase.create({
      project: project._id,
      name: "Phase",
      order: 0,
      price: 10,
      status: "completed",
      completedAt: new Date(),
    });

    const explanation = await ProjectPhase.find({
      project: { $in: [project._id] },
      status: "completed",
      completedAt: { $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(5)
      .explain("queryPlanner");

    const winningPlanJson = explainWinningPlanJson(explanation);
    expect(winningPlanJson).not.toContain("COLLSCAN");
    expect(winningPlanJson).not.toContain("SORT");
  });

  test("Notification recipient+createdAt sorted query is answered without an in-memory sort", async () => {
    const engineer = await createUser("Eng One", "eng1@test.dev", "engineer");
    await Notification.create({
      recipient: engineer._id,
      type: "bid_accepted",
      message: "Your bid was accepted.",
    });

    const explanation = await Notification.find({ recipient: engineer._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .explain("queryPlanner");

    const winningPlanJson = explainWinningPlanJson(explanation);
    expect(winningPlanJson).not.toContain("COLLSCAN");
    expect(winningPlanJson).not.toContain("SORT");
  });
});
