import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Admin } from "../models/Admin.model";
import { AdminAction } from "../models/AdminAction.model";
import { CustomerReview } from "../models/CustomerReview.model";
import { Equipment } from "../models/Equipment.model";
import { Notification } from "../models/Notification.model";
import { PlatformSetting } from "../models/PlatformSetting.model";
import { Project } from "../models/Project.model";
import { Review } from "../models/Review.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import equipmentRouter from "../routes/equipment.routes";
import publicRouter from "../routes/public.routes";
import { getCommissionRate } from "../utils/platformSettings";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let owner: IUser;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set(
    "Cookie",
    `civilhub_token=${jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`,
  );

const signedInAdmin = async (): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);
  await agent.post("/api/admin/auth/login").send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
  return agent;
};

const mixer = () =>
  Equipment.create({
    owner: owner._id,
    title: "Concrete mixer",
    description: "Diesel mixer",
    category: "Concrete Mixer",
    location: "Gazipur",
    dailyRate: 5000,
    securityDeposit: 10000,
    quantity: 1,
    photos: [{ url: "https://example.test/m.jpg", publicId: "m" }],
  });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), PlatformSetting.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/equipment", equipmentRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/public", publicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Admin, AdminAction, CustomerReview, Equipment, Notification, PlatformSetting, Project, Review, User].map((model) =>
      (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash: "x", role: "engineer" });
  owner = await User.create({ name: "Rahman Plant Hire", email: "o@test.dev", passwordHash: "x", role: "organisation" });
});

describe("Removing reviews", () => {
  test("only admins can see the review list", async () => {
    expect((await as(client, request(app).get("/api/admin/content/reviews"))).status).toBe(401);
  });

  test("a provider's reply can go on its own, then the review itself", async () => {
    const project = await Project.create({ title: "Duplex", client: client._id, assignedEngineer: engineer._id, status: "completed" });
    const review = await Review.create({
      project: project._id,
      client: client._id,
      engineer: engineer._id,
      rating: 1,
      reviewText: "Abusive text that breaks the rules",
      engineerReply: "An equally rude reply",
      engineerRepliedAt: new Date(),
    });
    const agent = await signedInAdmin();
    const listed = await agent.get("/api/admin/content/reviews?q=tanvir");
    expect(listed.body.items).toEqual([
      expect.objectContaining({ author: expect.objectContaining({ name: "Nusrat Jahan" }), reply: "An equally rude reply" }),
    ]);
    expect((await agent.get("/api/admin/content/reviews?q=nobody")).body.total).toBe(0);

    const url = `/api/admin/content/reviews/provider/${review._id.toString()}/remove`;
    expect((await agent.post(url).send({ part: "reply" })).status).toBe(400);
    expect((await agent.post(url).send({ part: "reply", reason: "Insulting language" })).status).toBe(200);
    expect(await Review.findById(review._id).lean()).toMatchObject({ reviewText: "Abusive text that breaks the rules" });
    expect((await Review.findById(review._id).lean())?.engineerReply).toBeUndefined();
    expect((await agent.post(url).send({ part: "reply", reason: "Again" })).status).toBe(409);

    expect((await agent.post(url).send({ reason: "Personal abuse" })).status).toBe(200);
    expect(await Review.exists({ _id: review._id })).toBeNull();
    expect(await Notification.countDocuments({ recipient: client._id, type: "moderation_notice" })).toBe(1);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "moderation_notice" })).toBe(1);
    // The removed text is kept in the log.
    expect(await AdminAction.findOne({ action: "review.remove" }).lean()).toMatchObject({
      meta: expect.objectContaining({ text: "Abusive text that breaks the rules" }),
    });
    expect((await agent.post(url).send({ reason: "Again" })).status).toBe(404);
  });

  test("a provider's review of a client can be removed", async () => {
    const project = await Project.create({ title: "Duplex", client: client._id, assignedEngineer: engineer._id, status: "completed" });
    const review = await CustomerReview.create({ project: project._id, author: engineer._id, subject: client._id, rating: 1, reviewText: "Shares her phone number: 01712345678" });
    const agent = await signedInAdmin();
    const url = `/api/admin/content/reviews/customer/${review._id.toString()}/remove`;
    expect((await agent.post(url).send({ part: "reply", reason: "x" })).status).toBe(400);
    expect((await agent.post(url).send({ reason: "Personal details" })).status).toBe(200);
    expect(await CustomerReview.exists({ _id: review._id })).toBeNull();
  });
});

describe("Pausing listings", () => {
  test("an admin pause can't be undone by the owner", async () => {
    const listing = await mixer();
    const agent = await signedInAdmin();
    const url = `/api/admin/content/listings/${listing._id.toString()}`;

    expect((await agent.post(`${url}/pause`).send({})).status).toBe(400);
    expect((await agent.post(`${url}/pause`).send({ reason: "Photos show a different machine" })).status).toBe(200);
    expect(await Equipment.findById(listing._id).lean()).toMatchObject({ status: "paused", adminHold: { reason: "Photos show a different machine" } });
    expect((await agent.post(`${url}/pause`).send({ reason: "Again" })).status).toBe(409);

    const reopen = await as(owner, request(app).patch(`/api/equipment/${listing._id.toString()}`)).send({ status: "active" });
    expect(reopen.status).toBe(409);
    expect(reopen.body.message).toContain("Photos show a different machine.");

    const held = await agent.get("/api/admin/content/listings?status=held");
    expect(held.body.items).toEqual([expect.objectContaining({ title: "Concrete mixer" })]);

    expect((await agent.post(`${url}/unpause`).send({ reason: "Owner sent real photos" })).status).toBe(200);
    expect(await Equipment.findById(listing._id).lean()).toMatchObject({ status: "active", adminHold: null });
    expect(await Notification.countDocuments({ recipient: owner._id, type: "moderation_notice" })).toBe(2);
    expect(await AdminAction.countDocuments({ action: { $in: ["listing.pause", "listing.unpause"] } })).toBe(2);
  });
});

describe("Commission rate", () => {
  test("defaults to the environment, then follows what an admin sets", async () => {
    const agent = await signedInAdmin();
    expect((await agent.get("/api/admin/settings")).body).toMatchObject({ commissionRate: 0.1, commissionSource: "default" });
    expect((await request(app).get("/api/public/platform")).body).toEqual({ commissionRate: 0.1 });

    expect((await agent.post("/api/admin/settings/commission").send({ percent: 60, reason: "x" })).status).toBe(400);
    expect((await agent.post("/api/admin/settings/commission").send({ percent: 7.5 })).status).toBe(400);
    const set = await agent.post("/api/admin/settings/commission").send({ percent: 7.5, reason: "Launch promotion" });
    expect(set.body).toEqual({ commissionRate: 0.075, previous: 0.1 });

    expect(await getCommissionRate()).toBe(0.075);
    // The landing page reads it without signing in.
    expect((await request(app).get("/api/public/platform")).body).toEqual({ commissionRate: 0.075 });
    expect((await agent.get("/api/admin/settings")).body).toMatchObject({ commissionSource: "admin", updatedBy: "Ops" });
    expect(await AdminAction.findOne({ action: "settings.commission" }).lean()).toMatchObject({
      reason: "Launch promotion",
      meta: { from: 0.1, to: 0.075 },
    });
  });
});
