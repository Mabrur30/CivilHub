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
import { Bid } from "../models/Bid.model";
import { Conversation } from "../models/Conversation.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { Project } from "../models/Project.model";
import { type IUser, User } from "../models/User.model";
import { Verification } from "../models/Verification.model";
import adminRouter from "../routes/admin.routes";
import authRouter from "../routes/auth.routes";
import bidsRouter from "../routes/bids.routes";
import conversationsRouter from "../routes/conversations.routes";
import engineerRouter from "../routes/engineer.routes";
import organisationRouter from "../routes/organisation.routes";
import userRouter from "../routes/user.routes";
import verificationRouter from "../routes/verification.routes";
import { deletePrivateAsset, uploadBuffer } from "../utils/cloudinaryUpload";
import { settleVerificationExpiries } from "../utils/verification";
import { fakeFile } from "./helpers/fakeFiles";

jest.mock("../utils/cloudinaryUpload", () => ({
  // The real helpers, so they call the mocked uploads below.
  uploadAllOrNone: jest.requireActual("../utils/cloudinaryUpload").uploadAllOrNone,
  STRIP_IMAGE_METADATA: {},
  uploadBuffer: jest.fn(),
  deleteCloudinaryAsset: jest.fn().mockResolvedValue(undefined),
  deletePrivateAsset: jest.fn().mockResolvedValue(undefined),
  privateDownloadUrl: jest.fn((publicId: string) => `https://signed.example.test/${publicId}?expires=600`),
}));
const uploadMock = uploadBuffer as jest.Mock;
const deleteMock = deletePrivateAsset as jest.Mock;

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";
const DAY_MS = 24 * 60 * 60 * 1000;

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let other: IUser;
let company: IUser;
let uploads = 0;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set(
    "Cookie",
    `civilhub_token=${jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`,
  );

const signedInAdmin = async (): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);
  await agent.post("/api/admin/auth/login").send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
  return agent;
};

const jpg = (name: string) => [fakeFile("image/jpeg"), { filename: name, contentType: "image/jpeg" }] as const;

const submitEngineer = (user: IUser = engineer, iebNumber = "m 12345"): request.Test =>
  as(user, request(app).post("/api/verification/me"))
    .field("iebNumber", iebNumber)
    .attach("ieb", ...jpg("ieb.jpg"))
    .attach("nid", ...jpg("nid-front.jpg"))
    .attach("nid", ...jpg("nid-back.jpg"));

const submitCompany = (tradeLicenceNo = "TRAD/DNCC/012345/2026"): request.Test =>
  as(company, request(app).post("/api/verification/me"))
    .field("tradeLicenceNo", tradeLicenceNo)
    .attach("licence", Buffer.from("%PDF-1.4"), { filename: "licence.pdf", contentType: "application/pdf" })
    .attach("nid", ...jpg("owner-nid.jpg"));

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), Verification.syncIndexes(), Conversation.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/bids", bidsRouter);
  app.use("/api/engineers", engineerRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/users", userRouter);
  app.use("/api/organisations", organisationRouter);
  app.use("/api/verification", verificationRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  uploadMock.mockReset();
  uploadMock.mockImplementation(async () => {
    uploads += 1;
    return { public_id: `civilhub/verification/doc-${uploads}`, format: "jpg" };
  });
  deleteMock.mockClear();
  await Promise.all(
    [Admin, AdminAction, Bid, Conversation, Engineer, Notification, Organisation, Project, User, Verification].map((model) =>
      (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash: "x", role: "engineer" });
  other = await User.create({ name: "Arif Hossain", email: "a@test.dev", passwordHash: "x", role: "engineer" });
  company = await User.create({ name: "Rahman Builders", email: "o@test.dev", passwordHash: "x", role: "organisation" });
  await Engineer.create([{ user: engineer._id }, { user: other._id }]);
  await Organisation.create({ user: company._id, services: ["projects"] });
});

describe("Submitting for verification", () => {
  test("only engineers and companies, with an IEB number and NID", async () => {
    expect((await as(client, request(app).get("/api/verification/me"))).status).toBe(403);

    const noNumber = await as(engineer, request(app).post("/api/verification/me"))
      .attach("ieb", ...jpg("ieb.jpg"))
      .attach("nid", ...jpg("nid.jpg"));
    expect(noNumber.status).toBe(400);
    const noNid = await as(engineer, request(app).post("/api/verification/me"))
      .field("iebNumber", "M/12345")
      .attach("ieb", ...jpg("ieb.jpg"));
    expect(noNid.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();

    const sent = await submitEngineer();
    expect(sent.status).toBe(201);
    expect(sent.body.verification).toMatchObject({ status: "pending", iebNumber: "M/12345" });
    expect(sent.body.verification.documents).toHaveLength(3);
    // Users never get links to the files, only their names.
    expect(JSON.stringify(sent.body)).not.toContain("civilhub/verification");
    expect(uploadMock).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ type: "authenticated" }));

    expect((await submitEngineer()).status).toBe(409);
  });

  test("a company's licence number is saved to its profile", async () => {
    const sent = await submitCompany();
    expect(sent.status).toBe(201);
    expect(await Organisation.findOne({ user: company._id }).lean()).toMatchObject({ tradeLicenceNo: "TRAD/DNCC/012345/2026" });
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ type: "authenticated", resource_type: "raw" }),
    );
  });
});

describe("Admin review", () => {
  test("users can't reach the queue", async () => {
    expect((await as(engineer, request(app).get("/api/admin/verifications"))).status).toBe(401);
  });

  test("approving gives the badge everywhere, and verified engineers rank first", async () => {
    await submitEngineer();
    const agent = await signedInAdmin();

    const queue = await agent.get("/api/admin/verifications");
    expect(queue.body.items).toEqual([expect.objectContaining({ name: "Tanvir Alam", status: "pending" })]);
    const detail = await agent.get(`/api/admin/verifications/${engineer._id.toString()}`);
    expect(detail.body.documents[0].url).toContain("https://signed.example.test/");

    const approved = await agent.post(`/api/admin/verifications/${engineer._id.toString()}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("verified");
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "verification_approved" })).toBe(1);
    expect(await AdminAction.countDocuments({ action: "verification.approve" })).toBe(1);

    // Search: Tanvir sorts before Arif despite the alphabet, and the filter works.
    const search = await as(client, request(app).get("/api/engineers/search"));
    expect(search.body.engineers.map((row: { name: string; verified: boolean }) => [row.name, row.verified])).toEqual([
      ["Tanvir Alam", true],
      ["Arif Hossain", false],
      ["Rahman Builders", false],
    ]);
    const onlyVerified = await as(client, request(app).get("/api/engineers/search?verified=1"));
    expect(onlyVerified.body.engineers).toHaveLength(1);

    // Profile, bids and chats.
    const profile = await as(client, request(app).get(`/api/users/${engineer._id.toString()}/public-profile`));
    expect(profile.body).toMatchObject({ verified: true, verifiedAt: expect.any(String) });
    expect(profile.body).not.toHaveProperty("ownVerificationStatus");
    const own = await as(engineer, request(app).get(`/api/users/${engineer._id.toString()}/public-profile`));
    expect(own.body.ownVerificationStatus).toBe("verified");

    const project = await Project.create({ title: "Duplex", client: client._id, status: "open_for_bids" });
    await Bid.create({ engineer: engineer._id, project: project._id, amount: 50000, message: "Can start Monday" });
    const bids = await as(client, request(app).get("/api/bids/my-projects-bids"));
    expect(JSON.stringify(bids.body)).toContain('"engineerVerified":true');

    const conversation = await Conversation.create({
      participants: [client._id, engineer._id],
      pairKey: [client._id.toString(), engineer._id.toString()].sort().join(":"),
    });
    const thread = await as(client, request(app).get(`/api/conversations/${conversation._id.toString()}/messages`));
    expect(thread.body.otherParticipant).toMatchObject({ name: "Tanvir Alam", verified: true });
  });

  test("a company needs a licence expiry date to be approved", async () => {
    await submitCompany();
    const agent = await signedInAdmin();
    const url = `/api/admin/verifications/${company._id.toString()}/approve`;
    expect((await agent.post(url).send({})).status).toBe(400);
    expect((await agent.post(url).send({ licenceExpiresAt: "2020-06-30" })).status).toBe(400);
    const expiry = new Date(Date.now() + 200 * DAY_MS).toISOString();
    const res = await agent.post(url).send({ licenceExpiresAt: expiry });
    expect(res.status).toBe(200);
    expect(res.body.licenceExpiresAt).toBe(expiry);
  });

  test("rejecting keeps the reason, and sending again replaces the files", async () => {
    await submitEngineer();
    const agent = await signedInAdmin();
    const url = `/api/admin/verifications/${engineer._id.toString()}`;
    expect((await agent.post(`${url}/reject`).send({})).status).toBe(400);
    const rejected = await agent.post(`${url}/reject`).send({ reason: "The NID photo is too blurry to read" });
    expect(rejected.body).toMatchObject({ status: "rejected", note: "The NID photo is too blurry to read" });
    expect(await Notification.findOne({ recipient: engineer._id, type: "verification_rejected" })).toMatchObject({
      message: expect.stringContaining("too blurry to read. You can send"),
    });
    expect((await agent.post(`${url}/approve`).send({})).status).toBe(409);

    const again = await submitEngineer();
    expect(again.status).toBe(201);
    expect(again.body.verification.note).toBeNull();
    expect(deleteMock).toHaveBeenCalledTimes(3);
  });

  test("revoking removes the badge", async () => {
    await submitEngineer();
    const agent = await signedInAdmin();
    const url = `/api/admin/verifications/${engineer._id.toString()}`;
    await agent.post(`${url}/approve`).send({});
    expect((await agent.post(`${url}/revoke`).send({ reason: "The IEB number belongs to someone else" })).status).toBe(200);
    expect((await User.findById(engineer._id).lean())?.verifiedAt).toBeNull();
    expect(await AdminAction.countDocuments({ action: "verification.revoke" })).toBe(1);
  });
});

describe("Badges lapse", () => {
  test("renaming a verified engineer sends them back for review", async () => {
    await submitEngineer();
    const agent = await signedInAdmin();
    await agent.post(`/api/admin/verifications/${engineer._id.toString()}/approve`).send({});

    expect((await as(engineer, request(app).patch("/api/auth/me")).send({ name: "Someone Else" })).status).toBe(200);
    expect((await User.findById(engineer._id).lean())?.verifiedAt).toBeNull();
    expect(await Verification.findOne({ user: engineer._id }).lean()).toMatchObject({
      status: "pending",
      nameAtSubmission: "Someone Else",
    });
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "verification_lapsed" })).toBe(1);
  });

  test("changing a company's licence number sends it back for review", async () => {
    await submitCompany();
    const agent = await signedInAdmin();
    await agent
      .post(`/api/admin/verifications/${company._id.toString()}/approve`)
      .send({ licenceExpiresAt: new Date(Date.now() + 200 * DAY_MS).toISOString() });

    const saved = await as(company, request(app).patch("/api/organisations/me")).send({ tradeLicenceNo: "TRAD/DNCC/999999/2026" });
    expect(saved.status).toBe(200);
    expect(await Verification.findOne({ user: company._id }).lean()).toMatchObject({
      status: "pending",
      tradeLicenceNo: "TRAD/DNCC/999999/2026",
    });
    expect((await User.findById(company._id).lean())?.verifiedAt).toBeNull();
  });

  test("companies are reminded 30 days before the licence expires, then lose the badge", async () => {
    await submitCompany();
    const agent = await signedInAdmin();
    await agent
      .post(`/api/admin/verifications/${company._id.toString()}/approve`)
      .send({ licenceExpiresAt: new Date(Date.now() + 20 * DAY_MS).toISOString() });

    expect(await settleVerificationExpiries()).toEqual({ reminded: 1, lapsed: 0 });
    expect(await settleVerificationExpiries()).toEqual({ reminded: 0, lapsed: 0 });

    expect(await settleVerificationExpiries(new Date(Date.now() + 21 * DAY_MS))).toEqual({ reminded: 0, lapsed: 1 });
    expect(await Verification.findOne({ user: company._id }).lean()).toMatchObject({ status: "lapsed" });
    expect((await User.findById(company._id).lean())?.verifiedAt).toBeNull();
    expect(await Notification.countDocuments({ recipient: company._id, type: "verification_expiring" })).toBe(1);
    expect(await Notification.countDocuments({ recipient: company._id, type: "verification_lapsed" })).toBe(1);

    // A lapsed company can send its renewed licence.
    expect((await submitCompany()).status).toBe(201);
  });
});
