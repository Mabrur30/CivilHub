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
import { Comment } from "../models/Comment.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Post } from "../models/Post.model";
import { Report } from "../models/Report.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import authRouter from "../routes/auth.routes";
import engineerRouter from "../routes/engineer.routes";
import postRouter from "../routes/post.routes";
import { reportsRouter } from "../routes/safety.routes";
import userRouter from "../routes/user.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";
const USER_PASSWORD = "user-pass-123";

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

/** A supertest agent signed in as the admin; it keeps the admin cookie. */
const signedInAdmin = async (): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/admin/auth/login")
    .send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
  expect(response.status).toBe(200);
  return agent;
};

const report = (reporter: IUser, targetType: string, targetId: string, reason = "spam") =>
  as(reporter, request(app).post("/api/reports")).send({ targetType, targetId, reason });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), Report.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/engineers", engineerRouter);
  app.use("/api/posts", postRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Admin, AdminAction, Comment, Engineer, Notification, Post, Report, User].map((model) =>
      (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({
    name: "Ops",
    email: "ops@civilhub.test",
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
  });
  const passwordHash = await bcrypt.hash(USER_PASSWORD, 4);
  tanvir = await User.create({ name: "Tanvir Hasan", email: "t@test.dev", passwordHash, role: "engineer" });
  nabila = await User.create({ name: "Nabila Karim", email: "n@test.dev", passwordHash, role: "engineer" });
  await Engineer.create([{ user: tanvir._id }, { user: nabila._id }]);
});

describe("Admin sign-in", () => {
  test("user sessions can't reach admin routes, and signup can't make an admin", async () => {
    expect((await as(tanvir, request(app).get("/api/admin/overview"))).status).toBe(401);
    expect((await request(app).get("/api/admin/overview")).status).toBe(401);

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ name: "Sneaky", email: "s@test.dev", password: "password-123", role: "admin" });
    expect(signup.status).toBe(400);
    expect(await Admin.countDocuments()).toBe(1);
  });

  test("a wrong password or a disabled admin gets the same generic error", async () => {
    const wrong = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "ops@civilhub.test", password: "not it" });
    const unknown = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "nobody@civilhub.test", password: ADMIN_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);

    const agent = await signedInAdmin();
    await Admin.updateOne({ email: "ops@civilhub.test" }, { isActive: false });
    // Disabling ends the live session too.
    expect((await agent.get("/api/admin/overview")).status).toBe(401);
    const disabled = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
    expect(disabled.status).toBe(401);
    expect(disabled.body.message).toBe(wrong.body.message);
  });

  test("the admin cookie is scoped to /api/admin and httpOnly", async () => {
    const response = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toContain("civilhub_admin=");
    expect(cookie).toContain("Path=/api/admin");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });
});

describe("Suspending and banning", () => {
  test("a suspension blocks sign-in and the live session, and hides the account", async () => {
    const agent = await signedInAdmin();
    const missingReason = await agent.post(`/api/admin/users/${id(nabila)}/status`).send({ status: "suspended", days: 3 });
    expect(missingReason.status).toBe(400);

    const suspended = await agent
      .post(`/api/admin/users/${id(nabila)}/status`)
      .send({ status: "suspended", days: 3, reason: "Spamming clients" });
    expect(suspended.status).toBe(200);

    // Her existing session stops working, and sign-in says why.
    const live = await as(nabila, request(app).get("/api/posts/feed"));
    expect(live.status).toBe(403);
    expect(live.body.message).toContain("suspended until");
    const login = await request(app).post("/api/auth/login").send({ email: "n@test.dev", password: USER_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.message).toContain("Spamming clients");

    // Others can't find her.
    expect((await as(tanvir, request(app).get(`/api/users/${id(nabila)}/public-profile`))).status).toBe(404);
    const search = await as(tanvir, request(app).get("/api/engineers/search?q=Nabila"));
    expect(search.body.engineers).toEqual([]);

    const reinstated = await agent
      .post(`/api/admin/users/${id(nabila)}/status`)
      .send({ status: "active", reason: "Appeal accepted" });
    expect(reinstated.status).toBe(200);
    expect((await as(nabila, request(app).get("/api/posts/feed"))).status).toBe(200);
    expect(await Notification.countDocuments({ recipient: nabila._id, type: "moderation_notice" })).toBe(1);

    const log = await AdminAction.find({ subjectUser: nabila._id }).sort({ createdAt: 1 });
    expect(log.map((entry) => entry.action)).toEqual(["user.suspend", "user.reinstate"]);
  });

  test("a suspension that has run out lifts itself", async () => {
    await User.updateOne(
      { _id: nabila._id },
      { status: "suspended", suspendedUntil: new Date(Date.now() - 1000), statusReason: "Cool-off" },
    );
    const login = await request(app).post("/api/auth/login").send({ email: "n@test.dev", password: USER_PASSWORD });
    expect(login.status).toBe(200);
    expect((await User.findById(nabila._id))?.status).toBe("active");
  });

  test("a ban has no end date and says the account is closed", async () => {
    const agent = await signedInAdmin();
    await agent.post(`/api/admin/users/${id(nabila)}/status`).send({ status: "banned", reason: "Fraud" });
    const login = await request(app).post("/api/auth/login").send({ email: "n@test.dev", password: USER_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.message).toContain("closed");
    expect((await User.findById(nabila._id))?.suspendedUntil).toBeNull();
  });
});

describe("Reports queue", () => {
  test("reports on one post are grouped; removing it closes them all and tells the author", async () => {
    const post = await Post.create({ author: nabila._id, content: "Buy cheap cement here!!", likes: [] });
    const rafi = await User.create({ name: "Rafi", email: "r@test.dev", passwordHash: "x", role: "client" });
    await report(tanvir, "post", post._id.toString(), "spam");
    await report(rafi, "post", post._id.toString(), "scam");

    const agent = await signedInAdmin();
    const queue = await agent.get("/api/admin/reports");
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({
      targetType: "post",
      count: 2,
      target: { exists: true, content: "Buy cheap cement here!!", user: { name: "Nabila Karim" } },
    });

    const overview = await agent.get("/api/admin/overview");
    expect(overview.body.openReports).toBe(1);

    const removed = await agent
      .post(`/api/admin/reports/post/${post._id.toString()}/action`)
      .send({ action: "remove_content", reason: "Advertising" });
    expect(removed.status).toBe(200);
    expect(removed.body.closed).toBe(2);
    expect(await Post.exists({ _id: post._id })).toBeNull();
    expect(await Report.countDocuments({ status: "actioned" })).toBe(2);
    expect(await Notification.countDocuments({ recipient: nabila._id, type: "moderation_notice" })).toBe(1);
    expect((await agent.get("/api/admin/reports")).body.items).toEqual([]);

    const actions = (await AdminAction.find()).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["post.remove", "report.action"]));
  });

  test("a comment is blanked, not deleted, so its replies stay", async () => {
    const post = await Post.create({ author: tanvir._id, content: "Site photos", likes: [] });
    const comment = await Comment.create({ post: post._id, author: nabila._id, content: "Rude words" });
    await report(tanvir, "comment", comment._id.toString(), "harassment");
    const agent = await signedInAdmin();
    await agent
      .post(`/api/admin/reports/comment/${comment._id.toString()}/action`)
      .send({ action: "remove_content", reason: "Harassment" });
    expect((await Comment.findById(comment._id))?.content).toBe("[removed by CivilHub]");
  });

  test("dismissing closes the reports without touching the account; a report can lead to a suspension", async () => {
    await report(tanvir, "user", id(nabila), "fake_profile");
    const agent = await signedInAdmin();
    const dismissed = await agent
      .post(`/api/admin/reports/user/${id(nabila)}/dismiss`)
      .send({ reason: "Checked, she's real" });
    expect(dismissed.status).toBe(200);
    expect((await User.findById(nabila._id))?.status ?? "active").toBe("active");
    expect(
      (await agent.post(`/api/admin/reports/user/${id(nabila)}/dismiss`).send({ reason: "again" })).status,
    ).toBe(404);

    await report(tanvir, "user", id(nabila), "scam");
    const suspended = await agent
      .post(`/api/admin/reports/user/${id(nabila)}/action`)
      .send({ action: "suspend_user", days: 7, reason: "Scam attempts" });
    expect(suspended.status).toBe(200);
    expect((await User.findById(nabila._id))?.status).toBe("suspended");

    const detail = await agent.get(`/api/admin/users/${id(nabila)}`);
    expect(detail.body).toMatchObject({ status: "suspended", statusReason: "Scam attempts" });
    expect(detail.body.reports).toHaveLength(2);
    expect(detail.body.actions.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining(["report.dismiss", "user.suspend", "report.action"]),
    );
  });
});
