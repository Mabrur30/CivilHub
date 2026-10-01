import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Bid } from "../models/Bid.model";
import { Block } from "../models/Block.model";
import CostEstimate from "../models/CostEstimate.model";
import { Equipment } from "../models/Equipment.model";
import { Post } from "../models/Post.model";
import { Project } from "../models/Project.model";
import { type IUser, User } from "../models/User.model";
import authRouter from "../routes/auth.routes";
import bidsRouter from "../routes/bids.routes";
import costEstimatorRouter from "../routes/costEstimator.routes";
import equipmentRouter from "../routes/equipment.routes";
import postRouter from "../routes/post.routes";
import { parseQueryString } from "../utils/queryParser";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

const PASSWORD = "site-office-password";

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
const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));

/** The session cookie a response set, ready to send back. */
const sessionCookie = (response: request.Response): string => {
  const header = response.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith("civilhub_token="));
  if (!cookie) throw new Error("No session cookie was set");
  return cookie.split(";")[0];
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/bids", bidsRouter);
  app.use("/api/cost-estimator", costEstimatorRouter);
  app.use("/api/equipment", equipmentRouter);
  app.use("/api/posts", postRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Bid, Block, CostEstimate, Equipment, Post, Project, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash, role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash, role: "engineer" });
});

describe("Saved cost estimates", () => {
  test("only their owner can read one", async () => {
    const { insertedId } = await CostEstimate.collection.insertOne({ user: client._id, title: "My duplex" });
    const url = `/api/cost-estimator/${insertedId.toString()}`;

    expect((await request(app).get(url)).status).toBe(401);
    expect((await as(engineer, request(app).get(url))).status).toBe(404);
    expect((await as(client, request(app).get("/api/cost-estimator/not-an-id"))).status).toBe(404);
    const mine = await as(client, request(app).get(url));
    expect(mine.status).toBe(200);
    expect(mine.body.title).toBe("My duplex");
  });
});

describe("Sessions", () => {
  test("changing the password signs out every other session", async () => {
    const login = () => request(app).post("/api/auth/login").send({ email: "c@test.dev", password: PASSWORD });
    const laptop = sessionCookie(await login());
    const phone = sessionCookie(await login());

    const changed = await request(app)
      .patch("/api/auth/me/password")
      .set("Cookie", phone)
      .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" });
    expect(changed.status).toBe(200);
    const phoneAfter = sessionCookie(changed);

    expect((await request(app).get("/api/auth/me").set("Cookie", laptop)).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", phoneAfter)).status).toBe(200);
  });

  test("a sign-in with a non-text email is a 400, not a crash", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: { $ne: null }, password: PASSWORD });
    expect(response.status).toBe(400);
  });
});

describe("Query strings", () => {
  test("a repeated key keeps its first value", () => {
    expect(parseQueryString("q=steel&q=brick&page=2")).toEqual({ q: "steel", page: "2" });
  });
});

describe("Blocks", () => {
  test("a blocked person can't like the blocker's post", async () => {
    const post = await Post.create({ author: engineer._id, content: "Slab poured today", likes: [] });
    await Block.create({ blocker: engineer._id, blocked: client._id });

    const like = await as(client, request(app).patch(`/api/posts/${post._id.toString()}/like`));
    expect(like.status).toBe(403);
    expect((await Post.findById(post._id).exec())?.likes).toHaveLength(0);
  });

  test("an engineer can't bid on the project of a client who blocked them", async () => {
    const project = await Project.create({ title: "Duplex", client: client._id, status: "open_for_bids" });
    await Block.create({ blocker: client._id, blocked: engineer._id });

    const bid = await as(engineer, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 100_000,
      message: "I can build this",
    });
    expect(bid.status).toBe(403);
  });
});

describe("Contact details in bids", () => {
  test("a phone number in a bid message is hidden", async () => {
    const project = await Project.create({ title: "Duplex", client: client._id, status: "open_for_bids" });
    const bid = await as(engineer, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 100_000,
      message: "Call me on 01712-345678 to talk it through",
    });
    expect(bid.status).toBe(201);
    expect(bid.body.message).not.toMatch(/345678/);
  });
});

describe("Paused listings", () => {
  test("are only shown to the owner, and only the owner sees why", async () => {
    const listing = await Equipment.create({
      owner: engineer._id,
      title: "Tracked Excavator",
      description: "Heavy equipment for excavation",
      category: "Excavator",
      dailyRate: 300,
      securityDeposit: 500,
      location: "Dhaka",
      photos: [{ url: "https://example.com/equipment.jpg", publicId: "eq-1" }],
      status: "paused",
      adminHold: { reason: "Photos don't match the machine", at: new Date() },
    });
    const url = `/api/equipment/${listing._id.toString()}`;

    expect((await as(client, request(app).get(url))).status).toBe(404);
    const asOwner = await as(engineer, request(app).get(url));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.pausedByCivilHub?.reason).toMatch(/Photos/);
  });
});
