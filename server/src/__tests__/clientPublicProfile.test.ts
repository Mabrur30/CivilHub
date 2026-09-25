import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Bid } from "../models/Bid.model";
import { Client } from "../models/Client.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { type IUser, User } from "../models/User.model";
import clientRouter from "../routes/client.routes";
import userRouter from "../routes/user.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;

const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/users", userRouter);
  app.use("/api/clients", clientRouter);
  app.use(errorHandler);
  return app;
};

const authCookieForUser = (user: IUser): string => {
  const token = jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  );
  return `civilhub_token=${token}`;
};

const createUser = async (
  name: string,
  email: string,
  role: "engineer" | "client",
): Promise<IUser> =>
  User.create({ name, email, passwordHash: "hashed-password", role });

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
    Client.deleteMany({}),
    Project.deleteMany({}),
    ProjectPhase.deleteMany({}),
    User.deleteMany({}),
  ]);
});

describe("Client public profile", () => {
  test("derives the track record from project, bid and phase records", async () => {
    const app = createTestApp();
    const client = await createUser("Nusrat Jahan", "nusrat@test.dev", "client");
    const engineer = await createUser("Tanvir Alam", "tanvir@test.dev", "engineer");
    const otherEngineer = await createUser("Rafiq Uddin", "rafiq@test.dev", "engineer");
    await Client.create({
      user: client._id,
      companyName: "Padma Homes",
      clientType: "developer",
      location: "Dhaka",
    });

    const open = await Project.create({
      title: "Duplex foundation",
      client: client._id,
      status: "open_for_bids",
      budgetMin: 4000,
      budgetMax: 9000,
      category: "Structural",
    });
    const completed = await Project.create({
      title: "Warehouse slab",
      client: client._id,
      status: "completed",
      assignedEngineer: engineer._id,
      paymentPlan: "phase_by_phase",
      category: "Structural",
      budgetMin: 2500,
      budgetMax: 12000,
      completedAt: new Date(),
    });
    await Project.create({
      title: "Boundary wall",
      client: client._id,
      status: "in-progress",
      assignedEngineer: otherEngineer._id,
      category: "Masonry",
    });
    // Cancelled before anyone was hired, so it counts against the hire rate.
    await Project.create({
      title: "Rooftop garden",
      client: client._id,
      status: "cancelled",
    });

    await ProjectPhase.create([
      { project: completed._id, name: "Excavation", order: 0, price: 500, status: "completed", paymentStatus: "paid" },
      { project: completed._id, name: "Pour", order: 1, price: 900, status: "completed", paymentStatus: "paid" },
      { project: completed._id, name: "Cure", order: 2, price: 300, status: "awaiting_approval", paymentStatus: "unpaid" },
      // Work not finished yet, so no payment is due and it is left out.
      { project: completed._id, name: "Handover", order: 3, price: 100, status: "not_started", paymentStatus: "unpaid" },
    ]);

    await Bid.create({ engineer: engineer._id, project: open._id, amount: 5000, message: "Bid", status: "pending" });
    await Bid.create({ engineer: otherEngineer._id, project: open._id, amount: 6000, message: "Bid", status: "pending" });

    const response = await request(app)
      .get(`/api/users/${client._id.toString()}/public-profile`)
      .set("Cookie", authCookieForUser(engineer));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      role: "client",
      companyName: "Padma Homes",
      clientType: "developer",
      location: "Dhaka",
      completedProjects: 1,
    });
    expect(typeof response.body.memberSince).toBe("string");
    expect(response.body.stats).toEqual({
      projectsPosted: 4,
      activeProjects: 1,
      completedProjects: 1,
      openProjects: 1,
      hiredProjects: 2,
      decidedProjects: 3,
      hireRate: 67,
      phasesDue: 3,
      phasesPaid: 2,
      budgetMin: 2500,
      budgetMax: 12000,
      topCategories: ["Masonry", "Structural"],
    });
    expect(response.body.openProjectsList).toHaveLength(1);
    expect(response.body.openProjectsList[0]).toMatchObject({
      id: open._id.toString(),
      title: "Duplex foundation",
      bidCount: 2,
      myBidStatus: "pending",
    });
    expect(response.body.completedWork).toEqual([
      expect.objectContaining({
        title: "Warehouse slab",
        engineer: {
          id: engineer._id.toString(),
          name: "Tanvir Alam",
          profilePhotoUrl: null,
        },
      }),
    ]);
  });

  test("reports no hire rate for a client who has not decided on any brief yet", async () => {
    const app = createTestApp();
    const client = await createUser("New Client", "new@test.dev", "client");
    await Project.create({ title: "Only brief", client: client._id, status: "open_for_bids" });

    const response = await request(app)
      .get(`/api/users/${client._id.toString()}/public-profile`)
      .set("Cookie", authCookieForUser(client));

    expect(response.status).toBe(200);
    expect(response.body.stats.hireRate).toBeNull();
    expect(response.body.stats.phasesDue).toBe(0);
    expect(response.body.profilePhotoUrl).toBeNull();
    expect(response.body.openProjectsList[0].myBidStatus).toBeNull();
  });
});

describe("Client profile updates", () => {
  test("saves client type and location, and rejects an unknown type", async () => {
    const app = createTestApp();
    const client = await createUser("Nusrat Jahan", "nusrat@test.dev", "client");
    const cookie = authCookieForUser(client);

    const saved = await request(app)
      .patch("/api/clients/me")
      .set("Cookie", cookie)
      .send({ clientType: "business", location: "  Chattogram  " });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ clientType: "business", location: "Chattogram" });

    const cleared = await request(app)
      .patch("/api/clients/me")
      .set("Cookie", cookie)
      .send({ clientType: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.clientType).toBeNull();

    const rejected = await request(app)
      .patch("/api/clients/me")
      .set("Cookie", cookie)
      .send({ clientType: "landlord" });
    expect(rejected.status).toBe(400);
  });
});
