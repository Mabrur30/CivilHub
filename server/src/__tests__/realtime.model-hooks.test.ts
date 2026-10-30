import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { realtimeHub } from "../realtime/realtime.hub";

let memoryServer: MongoMemoryServer;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([Notification.deleteMany({}), Message.deleteMany({}), Conversation.deleteMany({})]);
  jest.restoreAllMocks();
});

test("notification create, save, and insertMany emit only to each recipient", async () => {
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();
  const project = new mongoose.Types.ObjectId();
  const emit = jest.spyOn(realtimeHub, "emitToUser");

  await Notification.create({
    recipient: first,
    type: "bid_updated",
    message: "Bid changed",
    project,
  });
  const saved = new Notification({
    recipient: second,
    type: "review_received",
    message: "Review received",
  });
  await saved.save();
  await Notification.insertMany([
    { recipient: first, type: "connection_request", message: "Connect" },
    { recipient: second, type: "post_liked", message: "Liked" },
  ]);

  expect(emit).toHaveBeenCalledTimes(4);
  expect(emit.mock.calls[0][0]).toBe(first.toString());
  expect(emit.mock.calls[0][2]).toEqual({ projectId: project.toString() });
  expect(emit.mock.calls[1][0]).toBe(second.toString());
  expect(emit.mock.calls[2][0]).toBe(first.toString());
  expect(emit.mock.calls[3][0]).toBe(second.toString());
});

test("message hook emits to the other participant only", async () => {
  const sender = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const conversation = await Conversation.create({
    participants: [sender, recipient],
    pairKey: `${sender.toString()}:${recipient.toString()}`,
  });
  const emit = jest.spyOn(realtimeHub, "emitToUsers");

  await Message.create({
    conversation: conversation._id,
    sender,
    messageType: "text",
    content: "Hello",
  });

  expect(emit).toHaveBeenCalledWith(
    [recipient.toString()],
    ["conversations", "messages"],
    { conversationId: conversation._id.toString() },
  );
});

test("hub errors do not fail persistence", async () => {
  jest.spyOn(realtimeHub, "emitToUser").mockImplementation(() => {
    throw new Error("stream unavailable");
  });
  const notification = await Notification.create({
    recipient: new mongoose.Types.ObjectId(),
    type: "moderation_notice",
    message: "Notice",
  });
  expect(notification).toBeDefined();
});
