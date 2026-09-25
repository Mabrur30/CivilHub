import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Conversation, type IConversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { type IUser, User } from "../models/User.model";
import conversationsRouter from "../routes/conversations.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let outsider: IUser;
let conversation: IConversation;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(user));

const summaryFor = async (
  user: IUser,
): Promise<{ isStarred: boolean; isArchived: boolean; unreadCount: number }> => {
  const response = await as(user, request(app).get("/api/conversations"));
  expect(response.status).toBe(200);
  return response.body.find(
    (item: { id: string }) => item.id === conversation._id.toString(),
  );
};

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
  await Promise.all(
    [Conversation, Message, Notification, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  client = await User.create({ name: "Nusrat Jahan", email: "nusrat@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
  outsider = await User.create({ name: "Rafiq Uddin", email: "rafiq@test.dev", passwordHash: "x", role: "engineer" });
  conversation = await Conversation.create({
    participants: [client._id, engineer._id],
    pairKey: [client._id.toString(), engineer._id.toString()].sort().join(":"),
  });
});

describe("Conversation inbox flags", () => {
  test("stars and unstars for the requester only", async () => {
    const starred = await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({ starred: true }),
    );
    expect(starred.status).toBe(200);
    expect(starred.body).toMatchObject({ isStarred: true, isArchived: false });

    expect((await summaryFor(client)).isStarred).toBe(true);
    expect((await summaryFor(engineer)).isStarred).toBe(false);

    const unstarred = await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({ starred: false }),
    );
    expect(unstarred.body.isStarred).toBe(false);
    expect((await summaryFor(client)).isStarred).toBe(false);
  });

  test("archives, and a new message brings the conversation back", async () => {
    await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({ archived: true }),
    );
    expect((await summaryFor(client)).isArchived).toBe(true);

    const sent = await as(
      engineer,
      request(app)
        .post(`/api/conversations/${conversation._id.toString()}/messages`)
        .send({ content: "Soil test report is ready." }),
    );
    expect(sent.status).toBe(201);
    expect((await summaryFor(client)).isArchived).toBe(false);
  });

  test("rejects non-participants and malformed bodies", async () => {
    const forbidden = await as(
      outsider,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({ starred: true }),
    );
    expect(forbidden.status).toBe(403);

    const notBoolean = await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({ starred: "yes" }),
    );
    expect(notBoolean.status).toBe(400);

    const empty = await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}`).send({}),
    );
    expect(empty.status).toBe(400);
  });

  test("mark as read clears the unread count without opening the thread", async () => {
    await as(
      engineer,
      request(app)
        .post(`/api/conversations/${conversation._id.toString()}/messages`)
        .send({ content: "Drawings attached tomorrow." }),
    );
    expect((await summaryFor(client)).unreadCount).toBe(1);

    const read = await as(
      client,
      request(app).patch(`/api/conversations/${conversation._id.toString()}/read`),
    );
    expect(read.status).toBe(200);
    expect((await summaryFor(client)).unreadCount).toBe(0);
  });
});
