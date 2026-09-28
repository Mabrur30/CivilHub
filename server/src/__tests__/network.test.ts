import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { tidyConnections } from "../controllers/network.controller";
import errorHandler from "../middleware/errorHandler";
import { Comment } from "../models/Comment.model";
import { Connection } from "../models/Connection.model";
import { Notification } from "../models/Notification.model";
import { Post } from "../models/Post.model";
import { type IUser, User } from "../models/User.model";
import commentsRouter from "../routes/comments.routes";
import networkRouter from "../routes/network.routes";
import postRouter from "../routes/post.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let tanvir: IUser;
let nabila: IUser;
let rumana: IUser;

const cookieFor = (user: IUser, expiresIn: string | number = "1h"): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn } as jwt.SignOptions,
  )}`;

const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));
const id = (user: IUser): string => user._id.toString();

const connect = async (a: IUser, b: IUser): Promise<void> => {
  const sent = await as(a, request(app).post(`/api/network/${id(b)}/request`));
  await as(b, request(app).patch(`/api/network/${sent.body.id}/accept`));
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Connection.syncIndexes(), Post.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/network", networkRouter);
  app.use("/api/posts", postRouter);
  app.use("/api/comments", commentsRouter);
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
    Notification.deleteMany({}),
  ]);
  tanvir = await User.create({ name: "Tanvir Hasan", email: "t@test.dev", passwordHash: "x", role: "engineer" });
  nabila = await User.create({ name: "Nabila Karim", email: "n@test.dev", passwordHash: "x", role: "organisation" });
  rumana = await User.create({ name: "Rumana Akter", email: "r@test.dev", passwordHash: "x", role: "client" });
});

describe("Connections", () => {
  test("send, accept and see each other as connected", async () => {
    const sent = await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    expect(sent.status).toBe(201);

    const incoming = await as(nabila, request(app).get("/api/network/incoming"));
    expect(incoming.body.map((row: { name: string }) => row.name)).toEqual(["Tanvir Hasan"]);

    const accepted = await as(nabila, request(app).patch(`/api/network/${sent.body.id}/accept`));
    expect(accepted.body.status).toBe("accepted");
    const status = await as(tanvir, request(app).get(`/api/network/status/${id(nabila)}`));
    expect(status.body.status).toBe("connected");

    const notification = await Notification.findOne({ recipient: tanvir._id }).exec();
    expect(notification?.message).toBe("Nabila Karim accepted your connection request.");
  });

  test("a repeat request is a 409, and a declined one can be sent again as new", async () => {
    const first = await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    const again = await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    expect(again.status).toBe(409);

    await as(nabila, request(app).patch(`/api/network/${first.body.id}/decline`));
    const renewed = await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    expect(renewed.status).toBe(201);
    expect(await Connection.countDocuments()).toBe(1);
  });

  test("requesting someone who already asked you accepts their request", async () => {
    await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    const back = await as(nabila, request(app).post(`/api/network/${id(tanvir)}/request`));
    expect(back.status).toBe(200);
    expect(back.body.status).toBe("accepted");
    expect(await Connection.countDocuments()).toBe(1);
  });

  test("the database refuses a second record for the same pair either way round", async () => {
    await Connection.create({ requester: tanvir._id, recipient: nabila._id, status: "pending" });
    await expect(
      Connection.create({ requester: nabila._id, recipient: tanvir._id, status: "pending" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  test("clients don't connect, in either direction", async () => {
    const fromClient = await as(rumana, request(app).post(`/api/network/${id(tanvir)}/request`));
    expect(fromClient.status).toBe(403);
    const toClient = await as(tanvir, request(app).post(`/api/network/${id(rumana)}/request`));
    expect(toClient.status).toBe(403);
    expect(toClient.body.message).toBe("Connections are for engineers and companies");
  });

  test("startup tidy merges duplicate pairs and clears clients' pending requests", async () => {
    // Records written before pairKey existed.
    await Connection.collection.insertMany([
      { requester: tanvir._id, recipient: nabila._id, status: "pending", createdAt: new Date(), updatedAt: new Date() },
      { requester: nabila._id, recipient: tanvir._id, status: "accepted", createdAt: new Date(), updatedAt: new Date() },
      { requester: tanvir._id, recipient: rumana._id, status: "pending", createdAt: new Date(), updatedAt: new Date() },
    ]);
    await tidyConnections();
    const left = await Connection.find().lean().exec();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: "accepted", pairKey: [id(tanvir), id(nabila)].sort().join(":") });
  });

  test("malformed ids are a 400 and an expired session is a 401, not a 500", async () => {
    expect((await as(tanvir, request(app).get("/api/network/status/not-an-id"))).status).toBe(400);
    expect((await as(tanvir, request(app).patch("/api/network/xyz/accept"))).status).toBe(400);
    const expired = await request(app)
      .get("/api/network/incoming")
      .set("Cookie", cookieFor(tanvir, -10));
    expect(expired.status).toBe(401);
    expect(expired.body.message).toMatch(/session has expired/);
  });
});

describe("Posts", () => {
  test("clients can't repost; reposts point at the original and aren't repeated", async () => {
    const original = await Post.create({ author: nabila._id, content: "New piling rig on site", likes: [] });
    const clientRepost = await as(rumana, request(app).post("/api/posts/repost")).send({ originalPostId: original._id.toString() });
    expect(clientRepost.status).toBe(403);

    const first = await as(tanvir, request(app).post("/api/posts/repost")).send({ originalPostId: original._id.toString() });
    expect(first.status).toBe(201);
    const repeat = await as(tanvir, request(app).post("/api/posts/repost")).send({ originalPostId: original._id.toString() });
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(first.body.id);

    // Reposting the repost shares the original instead.
    await connect(tanvir, nabila);
    const chained = await as(nabila, request(app).post("/api/posts/repost")).send({ originalPostId: first.body.id });
    expect(chained.body.originalPost.id).toBe(original._id.toString());

    const tooLong = await as(tanvir, request(app).post("/api/posts/repost")).send({
      originalPostId: original._id.toString(),
      content: "x".repeat(2001),
    });
    expect(tooLong.status).toBe(400);
  });

  test("deleting a post removes its comments and marks reposts as removed", async () => {
    await connect(tanvir, nabila);
    const original = await Post.create({ author: nabila._id, content: "Site visit notes", likes: [] });
    await Comment.create({ post: original._id, author: tanvir._id, content: "Great work" });
    await as(tanvir, request(app).post("/api/posts/repost")).send({ originalPostId: original._id.toString() });

    const deleted = await as(nabila, request(app).delete(`/api/posts/${original._id.toString()}`));
    expect(deleted.status).toBe(200);
    expect(await Comment.countDocuments({ post: original._id })).toBe(0);

    const feed = await as(tanvir, request(app).get("/api/posts/feed"));
    expect(feed.body.posts).toHaveLength(1);
    expect(feed.body.posts[0]).toMatchObject({ originalPost: null, originalRemoved: true });
  });

  test("likes are atomic: quick taps never double-count", async () => {
    const post = await Post.create({ author: nabila._id, content: "Formwork done", likes: [] });
    const like = () => as(tanvir, request(app).patch(`/api/posts/${post._id.toString()}/like`));
    const [first, second] = await Promise.all([like(), like()]);
    // Two taps at once: one likes, the other unlikes. Never a count of 2.
    expect([first.body.likeCount, second.body.likeCount].sort()).toEqual([0, 1]);

    const liked = await like();
    expect(liked.body).toEqual({ likedByMe: true, likeCount: 1 });
    const stored = await Post.findById(post._id).lean().exec();
    expect(stored?.likes.map(String)).toEqual([id(tanvir)]);
    // A notification only for a like that was actually added.
    expect(await Notification.countDocuments({ recipient: nabila._id, type: "post_liked" })).toBe(2);
  });

  test("the feed cursor never repeats a post when new ones arrive", async () => {
    await connect(tanvir, nabila);
    for (let i = 0; i < 5; i += 1) {
      await Post.create({ author: nabila._id, content: `Post ${i}`, likes: [], createdAt: new Date(Date.now() - (10 - i) * 1000) });
    }
    const page1 = await as(tanvir, request(app).get("/api/posts/feed?limit=3"));
    expect(page1.body.posts).toHaveLength(3);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    await Post.create({ author: nabila._id, content: "Brand new", likes: [] });
    const page2 = await as(tanvir, request(app).get(`/api/posts/feed?limit=3&before=${encodeURIComponent(page1.body.nextCursor)}`));
    const seen = [...page1.body.posts, ...page2.body.posts].map((post: { id: string }) => post.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(page2.body.posts.map((post: { content: string }) => post.content)).toEqual(["Post 1", "Post 0"]);
    expect(page2.body.nextCursor).toBeNull();
  });

  test("a comment with non-text content is a 400", async () => {
    const post = await Post.create({ author: nabila._id, content: "Hello", likes: [] });
    const response = await as(tanvir, request(app).post("/api/comments")).send({
      postId: post._id.toString(),
      content: 42,
    });
    expect(response.status).toBe(400);
  });
});

describe("Round 2: missing actions", () => {
  test("a request notifies the recipient; withdrawing removes it", async () => {
    const sent = await as(tanvir, request(app).post(`/api/network/${id(nabila)}/request`));
    const notification = await Notification.findOne({ recipient: nabila._id, type: "connection_request" }).exec();
    expect(notification?.message).toBe("Tanvir Hasan wants to connect with you.");

    // Only the sender can withdraw a pending request.
    expect((await as(nabila, request(app).delete(`/api/network/${sent.body.id}`))).status).toBe(404);
    const withdrawn = await as(tanvir, request(app).delete(`/api/network/${sent.body.id}`));
    expect(withdrawn.body).toEqual({ removed: true, previousStatus: "pending" });
    expect(await Connection.countDocuments()).toBe(0);
    expect(await Notification.countDocuments({ type: "connection_request" })).toBe(0);
  });

  test("either side can remove a connection, and the list carries its id", async () => {
    await connect(tanvir, nabila);
    const list = await as(nabila, request(app).get("/api/network/connections"));
    const connectionId = list.body[0].connectionId as string;
    expect(connectionId).toEqual(expect.any(String));

    const removed = await as(nabila, request(app).delete(`/api/network/${connectionId}`));
    expect(removed.body.previousStatus).toBe("accepted");
    const status = await as(tanvir, request(app).get(`/api/network/status/${id(nabila)}`));
    expect(status.body.status).toBe("not_connected");
  });

  test("lists page with ?limit=&offset=", async () => {
    const others = await Promise.all(
      [1, 2, 3].map((n) =>
        User.create({ name: `Engineer ${n}`, email: `e${n}@test.dev`, passwordHash: "x", role: "engineer" }),
      ),
    );
    for (const other of others) {
      await as(other, request(app).post(`/api/network/${id(tanvir)}/request`));
    }
    const first = await as(tanvir, request(app).get("/api/network/incoming?limit=2&offset=0"));
    const second = await as(tanvir, request(app).get("/api/network/incoming?limit=2&offset=2"));
    expect(first.body).toHaveLength(2);
    expect(second.body).toHaveLength(1);
    const all = await as(tanvir, request(app).get("/api/network/incoming"));
    expect(all.body).toHaveLength(3);
  });

  test("suggestions rank mutual connections first and skip people you already know", async () => {
    const arif = await User.create({ name: "Arif Hossain", email: "a@test.dev", passwordHash: "x", role: "engineer" });
    const sadia = await User.create({ name: "Sadia Islam", email: "s@test.dev", passwordHash: "x", role: "engineer" });
    // Tanvir knows Nabila; Nabila knows Arif, so Arif is a friend of a friend.
    await connect(tanvir, nabila);
    await connect(nabila, arif);

    const suggestions = await as(tanvir, request(app).get("/api/network/suggestions"));
    const names = suggestions.body.map((row: { name: string }) => row.name);
    expect(names[0]).toBe("Arif Hossain");
    expect(suggestions.body[0]).toMatchObject({ mutualCount: 1, reason: "1 mutual connection" });
    expect(names).toContain("Sadia Islam");
    expect(names).not.toContain("Nabila Karim");
    expect(names).not.toContain("Rumana Akter"); // clients aren't suggested
    expect(names).not.toContain("Tanvir Hasan");
    expect(sadia).toBeTruthy();

    // Clients get no suggestions.
    expect((await as(rumana, request(app).get("/api/network/suggestions"))).body).toEqual([]);
  });

  test("post notifications link to the post, which opens on its own", async () => {
    const post = await Post.create({ author: nabila._id, content: "Pile test passed", likes: [] });
    await as(tanvir, request(app).patch(`/api/posts/${post._id.toString()}/like`));
    const liked = await Notification.findOne({ type: "post_liked" }).exec();
    expect(liked?.post?.toString()).toBe(post._id.toString());

    const single = await as(tanvir, request(app).get(`/api/posts/${post._id.toString()}`));
    expect(single.status).toBe(200);
    expect(single.body).toMatchObject({ id: post._id.toString(), content: "Pile test passed", likeCount: 1 });
    expect((await as(tanvir, request(app).get("/api/posts/not-a-post"))).status).toBe(404);
  });

  test("comments page by top-level thread, replies included", async () => {
    const post = await Post.create({ author: nabila._id, content: "Thread", likes: [] });
    const roots = [];
    for (let i = 0; i < 3; i += 1) {
      roots.push(await Comment.create({ post: post._id, author: tanvir._id, content: `Root ${i}`, createdAt: new Date(Date.now() + i * 1000) }));
    }
    await Comment.create({ post: post._id, author: nabila._id, content: "Reply to root 0", parentComment: roots[0]._id, createdAt: new Date(Date.now() + 5000) });

    const url = `/api/posts/${post._id.toString()}/comments`;
    const first = await as(tanvir, request(app).get(`${url}?limit=2&offset=0`));
    expect(first.body.map((row: { content: string }) => row.content)).toEqual(["Root 0", "Root 1", "Reply to root 0"]);
    const second = await as(tanvir, request(app).get(`${url}?limit=2&offset=2`));
    expect(second.body.map((row: { content: string }) => row.content)).toEqual(["Root 2"]);
  });
});
