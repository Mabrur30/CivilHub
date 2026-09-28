import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Block } from "../models/Block.model";
import { Comment } from "../models/Comment.model";
import { Connection } from "../models/Connection.model";
import { Conversation } from "../models/Conversation.model";
import { Post } from "../models/Post.model";
import { Report } from "../models/Report.model";
import { type IUser, User } from "../models/User.model";
import commentsRouter from "../routes/comments.routes";
import conversationsRouter from "../routes/conversations.routes";
import networkRouter from "../routes/network.routes";
import postRouter from "../routes/post.routes";
import { blocksRouter, reportsRouter } from "../routes/safety.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let tanvir: IUser;
let nabila: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;
const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));
const id = (user: IUser): string => user._id.toString();

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Connection.syncIndexes(), Report.syncIndexes(), Block.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/network", networkRouter);
  app.use("/api/posts", postRouter);
  app.use("/api/comments", commentsRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/blocks", blocksRouter);
  app.use("/api/reports", reportsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Connection.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Conversation.deleteMany({}),
    Block.deleteMany({}),
    Report.deleteMany({}),
  ]);
  tanvir = await User.create({ name: "Tanvir Hasan", email: "t@test.dev", passwordHash: "x", role: "engineer" });
  nabila = await User.create({ name: "Nabila Karim", email: "n@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Blocking", () => {
  test("ends the connection and stops requests, messages and comments both ways", async () => {
    await Connection.create({ requester: tanvir._id, recipient: nabila._id, status: "accepted" });
    const post = await Post.create({ author: tanvir._id, content: "Site photos", likes: [] });
    await Comment.create({ post: post._id, author: nabila._id, content: "Nice" });

    const blocked = await as(tanvir, request(app).post(`/api/blocks/${id(nabila)}`));
    expect(blocked.status).toBe(200);
    expect(await Connection.countDocuments()).toBe(0);

    // Nabila can't reach Tanvir any more, and neither can he reach her.
    expect((await as(nabila, request(app).post(`/api/network/${id(tanvir)}/request`))).status).toBe(403);
    expect((await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`))).status).toBe(403);
    expect((await as(nabila, request(app).get(`/api/conversations/with/${id(tanvir)}`))).status).toBe(403);
    const comment = await as(nabila, request(app).post("/api/comments")).send({ postId: post._id.toString(), content: "Hello?" });
    expect(comment.status).toBe(403);

    // Her earlier comment is hidden from him.
    const thread = await as(tanvir, request(app).get(`/api/posts/${post._id.toString()}/comments`));
    expect(thread.body).toEqual([]);

    const list = await as(tanvir, request(app).get("/api/blocks"));
    expect(list.body.map((row: { name: string }) => row.name)).toEqual(["Nabila Karim"]);

    // Suggestions skip her.
    const suggestions = await as(tanvir, request(app).get("/api/network/suggestions"));
    expect(suggestions.body.map((row: { name: string }) => row.name)).not.toContain("Nabila Karim");
  });

  test("unblocking lets them connect again; blocking twice is harmless", async () => {
    await as(tanvir, request(app).post(`/api/blocks/${id(nabila)}`));
    await as(tanvir, request(app).post(`/api/blocks/${id(nabila)}`));
    expect(await Block.countDocuments()).toBe(1);
    await as(tanvir, request(app).delete(`/api/blocks/${id(nabila)}`));
    expect((await as(nabila, request(app).post(`/api/network/${id(tanvir)}/request`))).status).toBe(201);
  });

  test("you can't block yourself", async () => {
    expect((await as(tanvir, request(app).post(`/api/blocks/${id(tanvir)}`))).status).toBe(400);
  });
});

describe("Reporting", () => {
  test("stores one open report per person per thing, and checks the input", async () => {
    const post = await Post.create({ author: nabila._id, content: "Buy cheap rods", likes: [] });
    const report = (body: object) => as(tanvir, request(app).post("/api/reports")).send(body);

    expect((await report({ targetType: "post", targetId: post._id.toString(), reason: "spam" })).status).toBe(201);
    expect((await report({ targetType: "post", targetId: post._id.toString(), reason: "scam", note: "Asks for bKash up front" })).status).toBe(201);
    const stored = await Report.find().lean().exec();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ reason: "scam", note: "Asks for bKash up front", status: "open" });

    expect((await report({ targetType: "post", targetId: post._id.toString(), reason: "rude" })).status).toBe(400);
    expect((await report({ targetType: "user", targetId: id(tanvir), reason: "spam" })).status).toBe(400);
    expect((await report({ targetType: "user", targetId: new mongoose.Types.ObjectId().toString(), reason: "spam" })).status).toBe(404);
  });
});
