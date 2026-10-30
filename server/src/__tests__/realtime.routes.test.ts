import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import http from "http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { User, type IUser } from "../models/User.model";
import realtimeRouter from "../realtime/realtime.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let user: IUser;

const cookieFor = (account: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: account._id.toString(), role: account.role, sv: account.sessionVersion ?? 0 },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(cookieParser());
  app.use("/api/realtime", realtimeRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  user = await User.create({
    name: "Stream User",
    email: "stream@test.dev",
    passwordHash: "not-used",
    role: "client",
  });
});

test("rejects a stream without a session cookie", async () => {
  const response = await request(app).get("/api/realtime/stream");
  expect(response.status).toBe(401);
});

test("rejects a suspended account", async () => {
  await User.updateOne({ _id: user._id }, { $set: { status: "suspended" } });
  const response = await request(app)
    .get("/api/realtime/stream")
    .set("Cookie", cookieFor(user));
  expect(response.status).toBe(403);
});

test("opens an authenticated stream and sends ready", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test server did not expose a port");
  }

  await new Promise<void>((resolve, reject) => {
    const request = http.get(
      {
        port: address.port,
        path: "/api/realtime/stream",
        headers: { Cookie: cookieFor(user) },
      },
      (response) => {
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toMatch(/^text\/event-stream/);
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString();
          if (body.includes("event: ready")) {
            response.destroy();
            resolve();
          }
        });
      },
    );
    request.on("error", reject);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
