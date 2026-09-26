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
import { type IProject, Project } from "../models/Project.model";
import { type IUser, User } from "../models/User.model";
import conversationsRouter from "../routes/conversations.routes";
import { CONTACT_PLACEHOLDER, maskContactInfo } from "../utils/projectContact";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let project: IProject;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(user));

const openChat = (from: IUser, to: IUser, projectId?: string): request.Test =>
  as(
    from,
    request(app).get(
      `/api/conversations/with/${to._id.toString()}${projectId ? `?project=${projectId}` : ""}`,
    ),
  );

const send = (from: IUser, conversationId: string, body: object): request.Test =>
  as(from, request(app).post(`/api/conversations/${conversationId}/messages`)).send(body);

const CONTACT_TEXT = "Call me on 01712-345678 or a.rahman@gmail.com. Budget ৳40 lakh, or 12,00,000 for phase one.";

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/conversations", conversationsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Project.deleteMany({}),
    Bid.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  client = await User.create({ name: "Rumana Akter", email: "rumana@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Hasan", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
  project = await Project.create({
    title: "Six-storey apartment, Mirpur",
    client: client._id,
    status: "open_for_bids",
  });
});

describe("masking contact details", () => {
  test.each([
    "01712-345678",
    "+880 1712 345678",
    "01712.345.678",
    "০১৭১২৩৪৫৬৭৮",
    "rahman.eng@yahoo.com",
  ])("hides %s", (contact) => {
    const { text, masked } = maskContactInfo(`Reach me at ${contact} anytime`);
    expect(masked).toBe(true);
    expect(text).toBe(`Reach me at ${CONTACT_PLACEHOLDER} anytime`);
  });

  test.each([
    "Budget ৳40 lakh",
    "About 12,00,000 for the frame",
    "Start on 2026-10-01",
    "Plot is 5 katha, 6 storeys, road 20 ft",
    "৳ 1500000000 total",
  ])("keeps %s", (text) => {
    expect(maskContactInfo(text)).toEqual({ text, masked: false });
  });
});

describe("starting a chat about a project", () => {
  test("an engineer can message the client of an open brief without a connection", async () => {
    const withoutProject = await openChat(engineer, client);
    expect(withoutProject.status).toBe(403);

    const response = await openChat(engineer, client, project._id.toString());
    expect(response.status).toBe(201);
    const conversation = await Conversation.findById(response.body.id).exec();
    expect(conversation?.projects.map((entry) => entry.project.toString())).toEqual([
      project._id.toString(),
    ]);
  });

  test("a closed project the engineer never bid on can't be used", async () => {
    await Project.updateOne({ _id: project._id }, { status: "in-progress" });
    const response = await openChat(engineer, client, project._id.toString());
    expect(response.status).toBe(403);
  });

  test("a bidder can still talk about a project after it closes, and the client can start", async () => {
    await Bid.create({ engineer: engineer._id, project: project._id, amount: 4_000_000, message: "Ready" });
    await Project.updateOne({ _id: project._id }, { status: "in-progress", assignedEngineer: null });
    const response = await openChat(client, engineer, project._id.toString());
    expect(response.status).toBe(201);
  });

  test("the thread lists its projects and whether contacts are hidden", async () => {
    const { body: created } = await openChat(engineer, client, project._id.toString());
    const thread = await as(client, request(app).get(`/api/conversations/${created.id}/messages`));
    expect(thread.body).toMatchObject({
      contactsHidden: true,
      projects: [{ id: project._id.toString(), title: "Six-storey apartment, Mirpur", relation: "open" }],
    });
    const list = await as(client, request(app).get("/api/conversations"));
    expect(list.body[0]).toMatchObject({ contactsHidden: true, projects: [{ relation: "open" }] });
  });
});

describe("sending messages about a project", () => {
  test("before a hire, phone numbers and emails are hidden but prices are kept", async () => {
    const { body: created } = await openChat(engineer, client, project._id.toString());
    const response = await send(engineer, created.id, {
      content: CONTACT_TEXT,
      projectId: project._id.toString(),
    });
    expect(response.status).toBe(201);
    expect(response.body.contactHidden).toBe(true);
    expect(response.body.content).not.toMatch(/01712|gmail/);
    expect(response.body.content).toContain("৳40 lakh");
    expect(response.body.content).toContain("12,00,000");
    expect(response.body.projectId).toBe(project._id.toString());

    // The original is never stored.
    const stored = await Message.findById(response.body.id).lean().exec();
    expect(stored?.content).not.toMatch(/01712|gmail/);

    const notification = await Notification.findOne({ recipient: client._id }).exec();
    expect(notification?.message).toBe("Tanvir Hasan messaged you about Six-storey apartment, Mirpur.");
  });

  test("after the client hires the engineer, contacts go through", async () => {
    const { body: created } = await openChat(engineer, client, project._id.toString());
    await Project.updateOne(
      { _id: project._id },
      { status: "in-progress", assignedEngineer: engineer._id },
    );
    const response = await send(client, created.id, { content: CONTACT_TEXT });
    expect(response.body.contactHidden).toBe(false);
    expect(response.body.content).toBe(CONTACT_TEXT);

    const thread = await as(engineer, request(app).get(`/api/conversations/${created.id}/messages`));
    expect(thread.body).toMatchObject({ contactsHidden: false, projects: [{ relation: "hired" }] });
  });

  test("a project the conversation isn't about is rejected", async () => {
    const other = await Project.create({ title: "Other", client: client._id, status: "open_for_bids" });
    const { body: created } = await openChat(engineer, client, project._id.toString());
    const response = await send(engineer, created.id, {
      content: "Hello",
      projectId: other._id.toString(),
    });
    expect(response.status).toBe(400);
  });

  test("engineers chatting with each other are never masked", async () => {
    const colleague = await User.create({ name: "Nabila Karim", email: "nabila@test.dev", passwordHash: "x", role: "engineer" });
    const conversation = await Conversation.create({
      participants: [engineer._id, colleague._id],
      pairKey: [engineer._id.toString(), colleague._id.toString()].sort().join(":"),
    });
    const response = await send(engineer, conversation._id.toString(), { content: CONTACT_TEXT });
    expect(response.body.content).toBe(CONTACT_TEXT);
  });
});
