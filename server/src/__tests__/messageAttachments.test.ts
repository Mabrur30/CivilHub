import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import cloudinary, { uploadBuffer } from "../config/cloudinary";
import errorHandler from "../middleware/errorHandler";
import { Conversation, type IConversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { type IUser, User } from "../models/User.model";
import conversationsRouter from "../routes/conversations.routes";

jest.mock("../config/cloudinary", () => ({
  __esModule: true,
  uploadBuffer: jest.fn(),
  default: { uploader: { destroy: jest.fn() } },
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

const uploadBufferMock = uploadBuffer as jest.MockedFunction<
  typeof uploadBuffer
>;
const destroyMock = cloudinary.uploader.destroy as jest.Mock;

let memoryServer: MongoMemoryServer;

const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/conversations", conversationsRouter);
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

const createUser = (name: string, email: string): Promise<IUser> =>
  User.create({ name, email, passwordHash: "hashed-password", role: "client" });

interface Fixture {
  sender: IUser;
  recipient: IUser;
  outsider: IUser;
  conversation: IConversation;
}

const createFixture = async (): Promise<Fixture> => {
  const sender = await createUser("Sender", "sender@test.dev");
  const recipient = await createUser("Recipient", "recipient@test.dev");
  const outsider = await createUser("Outsider", "outsider@test.dev");
  const conversation = await Conversation.create({
    participants: [sender._id, recipient._id],
    pairKey: [sender._id.toString(), recipient._id.toString()].sort().join(":"),
  });
  return { sender, recipient, outsider, conversation };
};

const mockUploadResult = (overrides: Record<string, unknown> = {}) =>
  ({
    secure_url: "https://res.cloudinary.com/demo/raw/upload/site-plan.pdf",
    public_id: "civilhub/messages/files/site-plan",
    resource_type: "raw",
    ...overrides,
  }) as unknown as Awaited<ReturnType<typeof uploadBuffer>>;

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
    User.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
  ]);
});

describe("Message attachments", () => {
  test("text messages still send as JSON with no attachment", async () => {
    const { sender, conversation } = await createFixture();

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .send({ content: "  Hello there  " });

    expect(response.status).toBe(201);
    expect(response.body.messageType).toBe("text");
    expect(response.body.content).toBe("Hello there");
    expect(response.body.attachment).toBeNull();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  test("an empty message with no file is rejected", async () => {
    const { sender, conversation } = await createFixture();

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .send({ content: "   " });

    expect(response.status).toBe(400);
  });

  test("a file message stores attachment metadata without text content", async () => {
    const { sender, recipient, conversation } = await createFixture();
    uploadBufferMock.mockResolvedValueOnce(mockUploadResult());

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .field("messageType", "file")
      .attach("attachment", Buffer.from("%PDF-1.4 test"), {
        filename: "site-plan.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.messageType).toBe("file");
    expect(response.body.content).toBe("");
    expect(response.body.attachment).toMatchObject({
      url: "https://res.cloudinary.com/demo/raw/upload/site-plan.pdf",
      name: "site-plan.pdf",
      mimeType: "application/pdf",
      size: 13,
    });
    expect(uploadBufferMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        folder: "civilhub/messages/files",
        resource_type: "raw",
      }),
    );

    const listResponse = await request(createTestApp())
      .get("/api/conversations")
      .set("Cookie", authCookieForUser(recipient));
    expect(listResponse.body[0].lastMessage).toMatchObject({
      messageType: "file",
      attachmentName: "site-plan.pdf",
      content: "",
    });
  });

  test("an audio message uses the duration Cloudinary reports", async () => {
    const { sender, conversation } = await createFixture();
    uploadBufferMock.mockResolvedValueOnce(
      mockUploadResult({
        secure_url: "https://res.cloudinary.com/demo/video/upload/note.webm",
        public_id: "civilhub/messages/audio/note",
        resource_type: "video",
        duration: 41.6,
      }),
    );

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .field("messageType", "audio")
      .field("durationSeconds", "3")
      .attach("attachment", Buffer.from("fake-audio"), {
        filename: "voice-message.webm",
        contentType: "audio/webm;codecs=opus",
      });

    expect(response.status).toBe(201);
    expect(response.body.messageType).toBe("audio");
    expect(response.body.attachment).toMatchObject({
      mimeType: "audio/webm",
      durationSeconds: 42,
    });
    expect(uploadBufferMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        folder: "civilhub/messages/audio",
        resource_type: "video",
      }),
    );
  });

  test("audio over five minutes is rejected and the upload is removed", async () => {
    const { sender, conversation } = await createFixture();
    uploadBufferMock.mockResolvedValueOnce(
      mockUploadResult({
        public_id: "civilhub/messages/audio/long",
        resource_type: "video",
        duration: 360,
      }),
    );

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .field("messageType", "audio")
      .attach("attachment", Buffer.from("fake-audio"), {
        filename: "voice-message.webm",
        contentType: "audio/webm",
      });

    expect(response.status).toBe(400);
    expect(destroyMock).toHaveBeenCalledWith("civilhub/messages/audio/long", {
      resource_type: "video",
    });
    expect(await Message.countDocuments()).toBe(0);
  });

  test("unsupported file types are rejected before upload", async () => {
    const { sender, conversation } = await createFixture();

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(sender))
      .attach("attachment", Buffer.from("MZ"), {
        filename: "setup.exe",
        contentType: "application/x-msdownload",
      });

    expect(response.status).toBe(400);
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  test("non-participants cannot send attachments and nothing is uploaded", async () => {
    const { outsider, conversation } = await createFixture();

    const response = await request(createTestApp())
      .post(`/api/conversations/${conversation._id.toString()}/messages`)
      .set("Cookie", authCookieForUser(outsider))
      .attach("attachment", Buffer.from("%PDF-1.4"), {
        filename: "site-plan.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(403);
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});
