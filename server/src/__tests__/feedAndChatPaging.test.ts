import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Comment } from "../models/Comment.model";
import { Conversation, type IConversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Post } from "../models/Post.model";
import { type IUser, User } from "../models/User.model";
import conversationsRouter from "../routes/conversations.routes";
import postRouter from "../routes/post.routes";
import { uploadAllOrNone } from "../utils/cloudinaryUpload";
import { matchesDeclaredType } from "../utils/fileSignature";
import { fakeFile } from "./helpers/fakeFiles";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let engineer: IUser;
let client: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;
const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/posts", postRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Comment, Conversation, Message, Post, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  engineer = await User.create({
    name: "Tanvir Alam",
    email: "e@test.dev",
    passwordHash: "x",
    role: "engineer",
    verifiedAt: new Date(),
  });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
});

describe("Verified badge in the network", () => {
  test("a verified author is marked on their post and comment; others aren't", async () => {
    const post = await Post.create({ author: engineer._id, content: "Slab poured today", likes: [] });
    await Comment.create({ post: post._id, author: engineer._id, content: "Curing for 7 days" });
    await Comment.create({ post: post._id, author: client._id, content: "Looks great" });

    const shown = await as(engineer, request(app).get(`/api/posts/${post._id.toString()}`));
    expect(shown.status).toBe(200);
    expect(shown.body.author.verified).toBe(true);

    const comments = await as(engineer, request(app).get(`/api/posts/${post._id.toString()}/comments`));
    const byName = new Map(
      (comments.body as Array<{ author: { name: string; verified: boolean } }>).map((comment) => [
        comment.author.name,
        comment.author,
      ]),
    );
    expect(byName.get("Tanvir Alam")).toMatchObject({ verified: true, reviewCount: 0 });
    expect(byName.get("Nusrat Jahan")?.verified).toBe(false);
  });
});

describe("Chat history in pages", () => {
  let conversation: IConversation;

  beforeEach(async () => {
    conversation = await Conversation.create({
      participants: [engineer._id, client._id],
      pairKey: [engineer._id.toString(), client._id.toString()].sort().join(":"),
    });
    await Message.insertMany(
      Array.from({ length: 120 }, (_, index) => ({
        conversation: conversation._id,
        sender: index % 2 === 0 ? client._id : engineer._id,
        content: `Message ${index + 1}`,
        readBy: [],
      })),
    );
  });

  const messagesUrl = (query = ""): string => `/api/conversations/${conversation._id.toString()}/messages${query}`;

  test("the newest 50 come first, and earlier ones page back", async () => {
    const newest = await as(engineer, request(app).get(messagesUrl()));
    expect(newest.status).toBe(200);
    expect(newest.body.hasMore).toBe(true);
    expect(newest.body.messages).toHaveLength(50);
    expect(newest.body.messages[0].content).toBe("Message 71");
    expect(newest.body.messages[49].content).toBe("Message 120");

    const earlier = await as(engineer, request(app).get(messagesUrl(`?before=${newest.body.messages[0].id as string}`)));
    expect(earlier.body.messages[0].content).toBe("Message 21");
    expect(earlier.body.messages[49].content).toBe("Message 70");

    const first = await as(engineer, request(app).get(messagesUrl(`?before=${earlier.body.messages[0].id as string}`)));
    expect(first.body.messages).toHaveLength(20);
    expect(first.body.hasMore).toBe(false);
  });

  test("a poll returns only what's new", async () => {
    const newest = await as(engineer, request(app).get(messagesUrl()));
    const lastId = newest.body.messages[49].id as string;
    await Message.create({ conversation: conversation._id, sender: client._id, content: "Site visit Tuesday?", readBy: [] });

    const poll = await as(engineer, request(app).get(messagesUrl(`?after=${lastId}`)));
    expect(poll.body.messages.map((message: { content: string }) => message.content)).toEqual(["Site visit Tuesday?"]);
    expect((await as(engineer, request(app).get(messagesUrl("?after=not-an-id")))).status).toBe(400);
  });

  test("reading messages doesn't mark them read; opening the thread does", async () => {
    await as(engineer, request(app).get(messagesUrl()));
    expect(await Message.countDocuments({ readBy: engineer._id })).toBe(0);

    expect((await as(engineer, request(app).patch(`/api/conversations/${conversation._id.toString()}/read`))).status).toBe(200);
    expect(await Message.countDocuments({ sender: client._id, readBy: engineer._id })).toBe(60);
  });

  test("starting a conversation is a POST, not a GET", async () => {
    const other = await User.create({ name: "Farhan Kabir", email: "f@test.dev", passwordHash: "x", role: "engineer" });
    expect((await as(client, request(app).get(`/api/conversations/with/${other._id.toString()}`))).status).toBe(404);
    expect((await as(client, request(app).post(`/api/conversations/with/${other._id.toString()}`))).status).toBe(201);
  });
});

describe("Upload checks", () => {
  test("a program renamed to photo.jpg is refused before it's stored", async () => {
    const response = await as(engineer, request(app).post("/api/posts"))
      .field("content", "New site photos")
      .attach("image", Buffer.from("MZ\x90\x00 this is a program"), { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/doesn't look like an image/);
    expect(await Post.countDocuments()).toBe(0);
  });

  test.each([
    ["image/jpeg", true],
    ["application/pdf", true],
    ["audio/webm", true],
    ["text/plain", true],
  ])("a real %s passes", (mimeType, expected) => {
    expect(matchesDeclaredType(fakeFile(mimeType as string), mimeType as string)).toBe(expected);
  });

  test("text with binary bytes isn't plain text", () => {
    expect(matchesDeclaredType(Buffer.from([0x4d, 0x5a, 0x00, 0x01]), "text/plain")).toBe(false);
  });

  test("when one upload in a batch fails, the others are deleted again", async () => {
    const discarded: string[] = [];
    await expect(
      uploadAllOrNone(
        ["a.jpg", "b.jpg", "c.jpg"],
        async (name) => {
          if (name === "b.jpg") throw new Error("Cloudinary is down");
          return name;
        },
        async (uploaded) => {
          discarded.push(uploaded);
        },
      ),
    ).rejects.toThrow("Cloudinary is down");
    expect(discarded.sort()).toEqual(["a.jpg", "c.jpg"]);
  });
});
