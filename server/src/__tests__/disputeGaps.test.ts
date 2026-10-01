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
import { CaseMessage } from "../models/CaseMessage.model";
import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking, type IEquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Project } from "../models/Project.model";
import { ProjectDispute } from "../models/ProjectDispute.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Refund } from "../models/Refund.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import disputeCasesRouter from "../routes/disputeCases.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import projectsRouter from "../routes/projects.routes";
import { uploadBuffer } from "../utils/cloudinaryUpload";
import { settleCaseReplyReminders } from "../utils/disputeCases";
import { finalizeDueDecisions } from "../utils/disputeDecisions";
import { jpegWithExif } from "./helpers/exifJpeg";

jest.mock("../utils/cloudinaryUpload", () => ({
  // The real helpers, so they call the mocked uploads below.
  uploadAllOrNone: jest.requireActual("../utils/cloudinaryUpload").uploadAllOrNone,
  STRIP_IMAGE_METADATA: {},
  uploadBuffer: jest.fn(),
  deleteCloudinaryAsset: jest.fn().mockResolvedValue(undefined),
  deletePrivateAsset: jest.fn().mockResolvedValue(undefined),
  privateDownloadUrl: jest.fn((publicId: string) => `https://signed.example.test/${publicId}`),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const uploadMock = uploadBuffer as jest.Mock;
const ADMIN_PASSWORD = "correct horse battery staple";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let owner: IUser;
let outsider: IUser;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set(
    "Cookie",
    `civilhub_token=${jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`,
  );

const signedInAdmin = async (email = "ops@civilhub.test"): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);
  await agent.post("/api/admin/auth/login").send({ email, password: ADMIN_PASSWORD });
  return agent;
};

/** A phase-by-phase project with a dispute the client opened. */
const disputedProject = async () => {
  const project = await Project.create({
    title: "Duplex in Mirpur",
    client: client._id,
    assignedEngineer: engineer._id,
    status: "in-progress",
    totalAgreedValue: 100000,
    paymentPlan: "phase_by_phase",
    phasePlanStatus: "approved",
    advanceRequiredAmount: 20000,
    advancePaid: true,
  });
  await ProjectPhase.create({ project: project._id, name: "Foundation", order: 0, price: 100000, status: "in_progress" });
  // The advance is all CivilHub holds: 20,000, nothing released yet.
  await Payment.create({
    method: "sslcommerz",
    status: "paid",
    paidAt: daysAgo(20),
    refundDue: false,
    depositAmount: 0,
    project: project._id,
    paidBy: client._id,
    payee: engineer._id,
    type: "advance",
    amount: 20000,
    platformFee: 2000,
    payeeAmount: 18000,
    description: "Advance",
    tranId: "T-ADV",
    bankTranId: "B-ADV",
  });
  const opened = await as(client, request(app).post(`/api/projects/${project._id.toString()}/dispute`)).send({
    reason: "quality",
    description: "The footings are shallower than the drawings say they should be.",
  });
  expect(opened.status).toBe(201);
  return { project, disputeId: opened.body.dispute.id as string };
};

/** A returned rental whose 4,000 deposit claim the renter (the client) disputed. */
const disputedDeposit = async (): Promise<IEquipmentBooking> => {
  const mixer = await Equipment.create({
    owner: owner._id,
    title: "Concrete mixer",
    description: "Diesel mixer",
    category: "Concrete Mixer",
    location: "Gazipur",
    dailyRate: 5000,
    securityDeposit: 10000,
    quantity: 1,
    photos: [{ url: "https://example.test/m.jpg", publicId: "m" }],
  });
  return EquipmentBooking.create({
    equipment: mixer._id,
    renter: client._id,
    owner: owner._id,
    startDate: new Date(Date.UTC(2026, 8, 1)),
    endDate: new Date(Date.UTC(2026, 8, 2)),
    units: 1,
    rentalDays: 2,
    rentalFee: 10000,
    totalRentalFee: 10000,
    securityDeposit: 10000,
    status: "completed",
    paymentStatus: "paid",
    returnConfirmedAt: daysAgo(2),
    depositResolution: "claimed",
    depositClaimAmount: 4000,
    depositClaimNotes: "Dented drum",
    depositClaimedAt: daysAgo(1),
    depositDispute: { status: "open", reason: "The dent was there at pickup", openedAt: daysAgo(1), originalClaimAmount: 4000 },
  });
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), ProjectDispute.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/projects", projectsRouter);
  app.use("/api/dispute-cases", disputeCasesRouter);
  app.use("/api", equipmentBookingRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  uploadMock.mockReset();
  uploadMock.mockImplementation(() =>
    Promise.resolve({ public_id: `civilhub/dispute-evidence/f${uploadMock.mock.calls.length}`, format: "jpg" }),
  );
  await Promise.all(
    [Admin, AdminAction, CaseMessage, Equipment, EquipmentBooking, Notification, Payment, Project, ProjectDispute, ProjectPhase, Refund, User].map(
      (model) => (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash: "x", role: "engineer" });
  owner = await User.create({ name: "Rahman Plant Hire", email: "o@test.dev", passwordHash: "x", role: "organisation" });
  outsider = await User.create({ name: "Rafiq Uddin", email: "r@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Messages with CivilHub", () => {
  test("an admin asks one side a question; only that side sees it and can answer with evidence", async () => {
    const { disputeId } = await disputedProject();
    const agent = await signedInAdmin();
    const url = `/api/admin/project-disputes/${disputeId}/messages`;

    expect((await agent.post(url).send({ to: "renter", text: "Hello" })).status).toBe(400);
    expect((await agent.post(url).send({ to: "client", text: "Hi", replyByDays: 9 })).status).toBe(400);
    const asked = await agent.post(url).send({ to: "client", text: "Please send photos of the footings with a tape measure.", replyByDays: 2 });
    expect(asked.status).toBe(201);
    expect(await Notification.countDocuments({ recipient: client._id, type: "dispute_message" })).toBe(1);
    expect(await AdminAction.countDocuments({ action: "dispute.message" })).toBe(1);

    const thread = `/api/dispute-cases/project/${disputeId}/messages`;
    const mine = await as(client, request(app).get(thread));
    expect(mine.body).toMatchObject({ role: "client", active: true, messages: [expect.objectContaining({ from: "admin" })] });
    expect(mine.body.replyBy).not.toBeNull();
    // The provider's thread is empty; outsiders can't look.
    expect((await as(engineer, request(app).get(thread))).body.messages).toEqual([]);
    expect((await as(outsider, request(app).get(thread))).status).toBe(403);

    expect((await as(client, request(app).post(thread)).field("text", "")).status).toBe(400);
    const replied = await as(client, request(app).post(thread))
      .field("text", "Photos attached")
      .attach("files", jpegWithExif({ takenAt: "2026:09:30 10:00:00", lat: 23.8, lng: 90.4 }), { filename: "footing.jpg", contentType: "image/jpeg" });
    expect(replied.status).toBe(201);
    expect(uploadMock).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ type: "authenticated" }));
    expect(replied.body.files[0]).toMatchObject({ name: "footing.jpg", isImage: true, takenAt: "2026-09-30T04:00:00.000Z" });

    const stored = await CaseMessage.findOne({ from: "party" }).lean();
    expect(stored?.files[0]).toMatchObject({ uploadedBy: client._id, camera: null });
    expect((await as(client, request(app).get(thread))).body.replyBy).toBeNull();

    const detail = await agent.get(`/api/admin/project-disputes/${disputeId}`);
    expect(detail.body.threads.client.messages).toHaveLength(2);
    expect(detail.body.threads.provider.messages).toHaveLength(0);
    expect((await agent.get("/api/admin/project-disputes")).body.items[0]).toMatchObject({ newReply: true });
    expect((await agent.get("/api/admin/overview")).body.disputeReplies).toBe(1);
  });

  test("renters and owners have threads on deposit disputes too", async () => {
    const booking = await disputedDeposit();
    const agent = await signedInAdmin();
    const sent = await agent
      .post(`/api/admin/deposits/${booking._id.toString()}/messages`)
      .send({ to: "owner", text: "Do you have photos from before the rental?" });
    expect(sent.status).toBe(201);
    const thread = `/api/dispute-cases/deposit/${booking._id.toString()}/messages`;
    expect((await as(owner, request(app).get(thread))).body).toMatchObject({ role: "owner", messages: [expect.objectContaining({ from: "admin" })] });
    expect((await as(engineer, request(app).get(thread))).status).toBe(403);
    expect((await agent.get("/api/admin/deposits")).body.items[0]).toMatchObject({ newReply: false });
  });

  test("a reply that's almost due is chased once", async () => {
    const { disputeId } = await disputedProject();
    const agent = await signedInAdmin();
    await agent.post(`/api/admin/project-disputes/${disputeId}/messages`).send({ to: "provider", text: "What depth did you dig to?", replyByDays: 1 });
    expect(await settleCaseReplyReminders()).toBe(1);
    expect(await settleCaseReplyReminders()).toBe(0);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "dispute_reply_reminder" })).toBe(1);
  });
});

describe("Appealing a decision", () => {
  const cancelWith = (agent: ReturnType<typeof request.agent>, disputeId: string, providerAmount: number) =>
    agent
      .post(`/api/admin/project-disputes/${disputeId}/resolve`)
      .send({ outcome: "cancelled", providerAmount, note: "The footings were dug to the drawings." });
  const caseUrl = (disputeId: string, action: string) => `/api/dispute-cases/project/${disputeId}/${action}`;

  test("one side appeals once; another admin changes the decision, and that's final", async () => {
    await Admin.create({ name: "Lead", email: "lead@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
    const { project, disputeId } = await disputedProject();
    const ops = await signedInAdmin();
    expect((await cancelWith(ops, disputeId, 15000)).status).toBe(200);
    expect(await Notification.countDocuments({ type: "dispute_decided" })).toBe(2);

    expect((await as(client, request(app).post(caseUrl(disputeId, "appeal"))).send({ reason: "No" })).status).toBe(400);
    const appealed = await as(client, request(app).post(caseUrl(disputeId, "appeal"))).send({
      reason: "The engineer dug 3 feet, not the 5 in the drawings; my surveyor's report is in my messages.",
    });
    expect(appealed.status).toBe(201);
    expect((await as(engineer, request(app).post(caseUrl(disputeId, "appeal"))).send({ reason: "I want to appeal as well, please." })).status).toBe(409);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "dispute_appealed" })).toBe(1);
    // An appeal isn't carried out by the sweep; it waits for an admin.
    expect(await finalizeDueDecisions(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000))).toBe(0);
    expect((await ops.get("/api/admin/project-disputes?status=appealed")).body.items).toHaveLength(1);

    const appealUrl = `/api/admin/project-disputes/${disputeId}/appeal`;
    // The admin who decided can't review the appeal while another admin can.
    expect((await ops.post(appealUrl).send({ decision: "uphold", note: "I stand by it" })).status).toBe(409);
    const lead = await signedInAdmin("lead@civilhub.test");
    expect((await lead.post(appealUrl).send({ decision: "change", outcome: "cancelled", providerAmount: 25000, note: "x" })).status).toBe(400);
    const changed = await lead
      .post(appealUrl)
      .send({ decision: "change", outcome: "cancelled", providerAmount: 5000, note: "The surveyor's report shows shallow footings." });
    expect(changed.status).toBe(200);
    expect(await Project.findById(project._id).lean()).toMatchObject({
      status: "cancelled",
      cancellation: { providerAmount: 5000, refundAmount: 15000 },
    });
    expect(await Notification.countDocuments({ type: "dispute_appeal_decided" })).toBe(2);
    expect(await AdminAction.countDocuments({ action: "project.dispute_appeal" })).toBe(1);
    expect((await lead.post(appealUrl).send({ decision: "uphold", note: "Again" })).status).toBe(409);
  });

  test("when both sides accept, the decision takes effect at once", async () => {
    const { project, disputeId } = await disputedProject();
    const ops = await signedInAdmin();
    await cancelWith(ops, disputeId, 15000);
    expect((await as(outsider, request(app).post(caseUrl(disputeId, "accept")))).status).toBe(403);
    expect((await as(client, request(app).post(caseUrl(disputeId, "accept")))).status).toBe(200);
    expect(await Project.findById(project._id).lean()).toMatchObject({ status: "in-progress" });
    expect((await as(engineer, request(app).post(caseUrl(disputeId, "accept")))).status).toBe(200);
    expect(await Project.findById(project._id).lean()).toMatchObject({ status: "cancelled", cancellation: { providerAmount: 15000 } });
    // Nothing is left to appeal.
    expect((await as(client, request(app).post(caseUrl(disputeId, "appeal"))).send({ reason: "Changed my mind about accepting it." })).status).toBe(409);
  });

  test("an appeal after the deadline is refused, and a lone admin may review their own decision", async () => {
    const { disputeId } = await disputedProject();
    const ops = await signedInAdmin();
    await cancelWith(ops, disputeId, 15000);
    await ProjectDispute.updateOne({ _id: disputeId }, { "decision.appealDeadline": daysAgo(0.01) });
    const late = await as(client, request(app).post(caseUrl(disputeId, "appeal"))).send({
      reason: "I was away and couldn't reply in time to this decision.",
    });
    expect(late.status).toBe(409);

    const second = await disputedDeposit();
    await ops.post(`/api/admin/deposits/${second._id.toString()}/decide`).send({ decision: "rejected", note: "Dent visible at pickup" });
    const appealed = await as(owner, request(app).post(`/api/dispute-cases/deposit/${second._id.toString()}/appeal`)).send({
      reason: "The pickup photo is of a different machine; ours has a blue drum.",
    });
    expect(appealed.status).toBe(201);
    const upheld = await ops
      .post(`/api/admin/deposits/${second._id.toString()}/appeal`)
      .send({ decision: "uphold", note: "Both photos show the same serial plate." });
    expect(upheld.status).toBe(200);
    expect(await EquipmentBooking.findById(second._id).lean()).toMatchObject({
      depositResolution: "released",
      depositDispute: { status: "decided", decision: "rejected", appeal: { decision: "upheld" } },
    });
    expect(await AdminAction.countDocuments({ action: "deposit.appeal" })).toBe(1);
  });

  test("resuming takes effect at once and can't be appealed", async () => {
    const { project, disputeId } = await disputedProject();
    const ops = await signedInAdmin();
    const resumed = await ops
      .post(`/api/admin/project-disputes/${disputeId}/resolve`)
      .send({ outcome: "resumed", note: "Carry on; the depth is within tolerance." });
    expect(resumed.body).toMatchObject({ status: "resolved" });
    expect(await Project.findById(project._id).lean()).toMatchObject({ disputeOpen: false });
    expect((await as(client, request(app).post(caseUrl(disputeId, "appeal"))).send({ reason: "I disagree with this decision entirely." })).status).toBe(409);
  });
});

describe("Both sides' condition photos", () => {
  /** Returned 2 hours ago; the renter confirmed the return with their photos. */
  const returnedByRenter = async (hoursAgo = 2): Promise<IEquipmentBooking> => {
    const booking = await disputedDeposit();
    await EquipmentBooking.updateOne(
      { _id: booking._id },
      {
        returnConfirmedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        returnConfirmedBy: client._id,
        pickupConfirmedAt: new Date(Date.UTC(2026, 8, 1, 4)),
        pickupConfirmedBy: owner._id,
      },
    );
    return booking;
  };
  const report = (user: IUser, booking: IEquipmentBooking, stage = "return") =>
    as(user, request(app).post(`/api/equipment-bookings/${booking._id.toString()}/condition-report`))
      .field("stage", stage)
      .field("notes", "Dent on the drum, see photo");

  test("the side that didn't confirm adds their own photos once, within a day", async () => {
    const booking = await returnedByRenter();
    expect((await report(client, booking)).status).toBe(409);
    // An old photo, taken before the rental began.
    const added = await report(owner, booking).attach(
      "photos",
      jpegWithExif({ takenAt: "2026:08:20 10:00:00", lat: 23.99, lng: 90.42 }),
      { filename: "drum.jpg", contentType: "image/jpeg" },
    );
    expect(added.status).toBe(201);
    expect(await Notification.countDocuments({ recipient: client._id, type: "equipment_condition_report" })).toBe(1);
    expect((await report(owner, booking)).status).toBe(409);
    // The pickup was the owner's to confirm, so only the renter may add to it.
    expect((await report(owner, booking, "pickup")).status).toBe(409);

    const agent = await signedInAdmin();
    const detail = await agent.get(`/api/admin/deposits/${booking._id.toString()}`);
    expect(detail.body.counterReports).toEqual([
      expect.objectContaining({
        stage: "return",
        by: "owner",
        photos: [
          expect.objectContaining({
            uploadedByRole: "owner",
            takenAt: "2026-08-20T04:00:00.000Z",
            flags: expect.arrayContaining(["Taken before the rental started.", "Return photo taken before the pickup."]),
          }),
        ],
      }),
    ]);
    expect(detail.body.return).toMatchObject({ by: "renter" });

    const shown = await as(client, request(app).get(`/api/equipment-bookings/${booking._id.toString()}`));
    expect(shown.body).toMatchObject({ returnConfirmedBy: "renter", counterReports: [expect.objectContaining({ role: "owner" })] });
  });

  test("the window closes after a day", async () => {
    const booking = await returnedByRenter(25);
    expect((await report(owner, booking)).status).toBe(409);
  });
});
