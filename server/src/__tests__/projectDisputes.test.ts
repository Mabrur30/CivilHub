import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose, { type Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { prepareProjectCharge } from "../controllers/projectProgress.controller";
import errorHandler from "../middleware/errorHandler";
import { Admin } from "../models/Admin.model";
import { AdminAction } from "../models/AdminAction.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Project } from "../models/Project.model";
import { ProjectDispute } from "../models/ProjectDispute.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Refund } from "../models/Refund.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import projectsRouter from "../routes/projects.routes";
import { getPayeeEarnings } from "../utils/earnings";
import { getHeldMoney, settleApprovalReminders, settleFundingReminders } from "../utils/projectMoney";
import { finalizeDueDecisions } from "../utils/disputeDecisions";
import { getRefundsDue } from "../utils/refunds";

jest.mock("../utils/cloudinaryUpload", () => ({
  // The real helpers, so they call the mocked uploads below.
  uploadAllOrNone: jest.requireActual("../utils/cloudinaryUpload").uploadAllOrNone,
  STRIP_IMAGE_METADATA: {},
  uploadBuffer: jest.fn(),
  deleteCloudinaryAsset: jest.fn().mockResolvedValue(undefined),
  deletePrivateAsset: jest.fn().mockResolvedValue(undefined),
  privateDownloadUrl: jest.fn(() => "https://signed.example.test/x"),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let outsider: IUser;

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

const submission = (daysOld: number) => ({ note: "Frame done, photos attached", files: [], submittedAt: daysAgo(daysOld) });

/**
 * 100,000 agreed on the phase-by-phase plan: a 20,000 advance (18,000 to the
 * engineer), the foundation done and paid, the frame handed over.
 * Half the work is accepted, so 10,000 of the advance is still held.
 */
const phaseByPhase = async (handedOverDaysAgo = 1) => {
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
  const [, frame] = await ProjectPhase.create([
    { project: project._id, name: "Foundation", order: 0, price: 50000, status: "completed", paymentStatus: "paid" },
    {
      project: project._id,
      name: "Frame",
      order: 1,
      price: 50000,
      status: "awaiting_approval",
      paymentStatus: "unpaid",
      submissions: [submission(handedOverDaysAgo)],
    },
  ]);
  const paid = { method: "sslcommerz" as const, status: "paid" as const, paidAt: daysAgo(30), refundDue: false, depositAmount: 0, project: project._id, paidBy: client._id, payee: engineer._id };
  await Payment.create([
    { ...paid, type: "advance" as const, amount: 20000, platformFee: 2000, payeeAmount: 18000, description: "Advance", tranId: "T-ADV", bankTranId: "B-ADV" },
    { ...paid, type: "phase" as const, amount: 40000, platformFee: 4000, payeeAmount: 36000, description: "Foundation", tranId: "T-PH1", bankTranId: "B-PH1" },
  ]);
  return { project, frame };
};

/** Upfront plan: the first of two phases is handed over; approving it costs nothing. */
const upfront = async () => {
  const project = await Project.create({
    title: "Warehouse slab",
    client: client._id,
    assignedEngineer: engineer._id,
    status: "in-progress",
    totalAgreedValue: 60000,
    paymentPlan: "full_upfront",
    phasePlanStatus: "approved",
    advanceRequiredAmount: 12000,
    advancePaid: true,
  });
  const [first] = await ProjectPhase.create([
    { project: project._id, name: "Excavation", order: 0, price: 30000, status: "awaiting_approval", paymentStatus: "unpaid", submissions: [submission(2)] },
    { project: project._id, name: "Pour", order: 1, price: 30000, status: "not_started", paymentStatus: "unpaid" },
  ]);
  return { project, first };
};

/**
 * The same project under today's rule: each phase is funded before work.
 * The foundation is approved; the frame is funded (40,000) and handed over.
 * Held: half the advance (10,000) plus the frame's funding (40,000).
 */
const funded = async (handedOverDaysAgo = 1) => {
  const { project, frame } = await phaseByPhase(handedOverDaysAgo);
  await Project.updateOne({ _id: project._id }, { fundingRule: "before_work" });
  await ProjectPhase.updateOne({ _id: frame._id }, { paymentStatus: "paid", paidAt: daysAgo(10) });
  await Payment.create({
    method: "sslcommerz",
    status: "paid",
    paidAt: daysAgo(10),
    refundDue: false,
    depositAmount: 0,
    project: project._id,
    phase: frame._id,
    paidBy: client._id,
    payee: engineer._id,
    type: "phase",
    amount: 40000,
    platformFee: 4000,
    payeeAmount: 36000,
    description: "Funding for Frame",
    tranId: "T-PH2",
    bankTranId: "B-PH2",
  });
  return { project, frame };
};

/** The appeal window passes unused. */
const takeEffect = () => finalizeDueDecisions(new Date(Date.now() + 4 * DAY_MS));

const openDispute = (user: IUser, projectId: Types.ObjectId | string, reason = "quality") =>
  as(user, request(app).post(`/api/projects/${projectId.toString()}/dispute`)).send({
    reason,
    description: "The frame columns are out of plumb and the engineer won't fix them.",
  });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), ProjectDispute.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/projects", projectsRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Admin, AdminAction, Notification, Payment, Project, ProjectDispute, ProjectPhase, Refund, User].map((model) =>
      (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash: "x", role: "engineer" });
  outsider = await User.create({ name: "Rafiq Uddin", email: "r@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Opening a dispute", () => {
  test("pauses the project until it's withdrawn", async () => {
    const { project, frame } = await phaseByPhase();
    const base = `/api/projects/${project._id.toString()}`;

    expect((await openDispute(outsider, project._id)).status).toBe(403);
    const opened = await openDispute(client, project._id);
    expect(opened.status).toBe(201);
    expect((await openDispute(engineer, project._id)).status).toBe(409);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "project_dispute_opened" })).toBe(1);

    // Frozen: no phase actions, plan changes or payments.
    expect((await as(client, request(app).post(`${base}/phases/${frame._id.toString()}/request-changes`)).send({ note: "Fix it" })).status).toBe(409);
    expect((await as(client, request(app).post(`${base}/phases/${frame._id.toString()}/approve`))).status).toBe(409);
    expect((await as(client, request(app).post(`${base}/phase-plan/reject`)).send({ note: "No" })).status).toBe(409);
    await expect(
      prepareProjectCharge(client._id.toString(), "client", "phase", project._id.toString(), frame._id.toString()),
    ).rejects.toMatchObject({ statusCode: 409 });

    const state = await as(engineer, request(app).get(`${base}/dispute`));
    expect(state.body).toMatchObject({ paused: true, held: 10000, dispute: { status: "open", openedByRole: "client" } });

    expect((await as(engineer, request(app).post(`${base}/dispute/withdraw`))).status).toBe(409);
    expect((await as(client, request(app).post(`${base}/dispute/withdraw`))).status).toBe(200);
    expect(await Project.findById(project._id).lean()).toMatchObject({ disputeOpen: false });
  });

  test("an unanswered hand-over can be reported by the provider after 7 days", async () => {
    const fresh = await phaseByPhase(2);
    expect((await openDispute(engineer, fresh.project._id, "no_response")).status).toBe(400);
    await ProjectPhase.updateOne({ _id: fresh.frame._id }, { submissions: [submission(8)] });
    expect((await openDispute(client, fresh.project._id, "no_response")).status).toBe(400);
    expect((await openDispute(engineer, fresh.project._id, "no_response")).status).toBe(201);
  });
});

describe("Cancelling by agreement", () => {
  test("the provider keeps their share and the client is refunded the rest", async () => {
    const { project } = await phaseByPhase();
    const base = `/api/projects/${project._id.toString()}`;

    expect((await as(client, request(app).post(`${base}/cancellation`)).send({ providerAmount: 20000 })).status).toBe(400);
    const proposed = await as(client, request(app).post(`${base}/cancellation`)).send({ providerAmount: 4000, note: "Let's stop here" });
    expect(proposed.status).toBe(201);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "project_cancellation_proposed" })).toBe(1);
    expect((await as(client, request(app).post(`${base}/cancellation/accept`))).status).toBe(403);

    const accepted = await as(engineer, request(app).post(`${base}/cancellation/accept`));
    expect(accepted.status).toBe(200);
    expect(accepted.body.cancellation).toMatchObject({ by: "agreement", held: 10000, providerAmount: 4000, refundAmount: 6000 });

    // Advance: 9,000 already earned plus 40% of the 9,000 held; the phase payment is untouched.
    const earnings = await getPayeeEarnings(engineer._id.toString());
    expect(earnings).toMatchObject({ released: 36000 + 9000 + 3600, onHold: 0 });
    const refunds = (await getRefundsDue()).filter((item) => item.kind === "cancellation");
    expect(refunds).toEqual([expect.objectContaining({ amount: 6000, canUseGateway: true })]);

    // A cancelled project can't be changed.
    expect((await openDispute(client, project._id)).status).toBe(409);
  });

  test("a declined proposal is cleared", async () => {
    const { project } = await phaseByPhase();
    const base = `/api/projects/${project._id.toString()}`;
    await as(engineer, request(app).post(`${base}/cancellation`)).send({ providerAmount: 10000 });
    expect((await as(client, request(app).post(`${base}/cancellation/decline`))).status).toBe(200);
    expect((await Project.findById(project._id).lean())?.cancellationProposal).toBeNull();
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "project_cancellation_declined" })).toBe(1);
  });
});

describe("Admin decisions", () => {
  test("users can't reach the queue", async () => {
    expect((await as(client, request(app).get("/api/admin/project-disputes"))).status).toBe(401);
  });

  test("resume unpauses the project, with a note to both sides", async () => {
    const { project } = await phaseByPhase();
    const opened = await openDispute(client, project._id);
    const agent = await signedInAdmin();

    const queue = await agent.get("/api/admin/project-disputes");
    expect(queue.body.items).toEqual([expect.objectContaining({ projectTitle: "Duplex in Mirpur", reason: "quality" })]);
    const detail = await agent.get(`/api/admin/project-disputes/${opened.body.dispute.id as string}`);
    expect(detail.body).toMatchObject({ held: 10000, project: { paused: true } });
    expect(detail.body.phases[1]).toMatchObject({ name: "Frame", canApproveForClient: false });

    const url = `/api/admin/project-disputes/${opened.body.dispute.id as string}/resolve`;
    expect((await agent.post(url).send({ outcome: "resumed" })).status).toBe(400);
    const res = await agent.post(url).send({ outcome: "resumed", note: "The columns are within tolerance; carry on." });
    expect(res.status).toBe(200);
    expect(await Project.findById(project._id).lean()).toMatchObject({ disputeOpen: false, status: "in-progress" });
    expect(await Notification.countDocuments({ type: "project_dispute_resolved" })).toBe(2);
    expect(await AdminAction.countDocuments({ action: "project.dispute_resolve", targetType: "project" })).toBe(1);
    expect((await agent.post(url).send({ outcome: "resumed", note: "Again" })).status).toBe(409);
  });

  test("approves a phase for the client only when no payment is due", async () => {
    const paidByPhase = await phaseByPhase(8);
    const disputeA = await openDispute(engineer, paidByPhase.project._id, "no_response");
    const agent = await signedInAdmin();
    const refused = await agent
      .post(`/api/admin/project-disputes/${disputeA.body.dispute.id as string}/resolve`)
      .send({ outcome: "phase_approved", phaseId: paidByPhase.frame._id.toString(), note: "Delivered as agreed" });
    expect(refused.status).toBe(409);
    expect(await Project.findById(paidByPhase.project._id).lean()).toMatchObject({ disputeOpen: true });

    const { project, first } = await upfront();
    const disputeB = await openDispute(engineer, project._id, "communication");
    const approved = await agent
      .post(`/api/admin/project-disputes/${disputeB.body.dispute.id as string}/resolve`)
      .send({ outcome: "phase_approved", phaseId: first._id.toString(), note: "The excavation matches the drawings" });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "open", stage: "awaiting_final", decision: { outcome: "phase_approved" } });
    // Still paused, and the phase untouched, until the appeal window passes.
    expect(await ProjectPhase.findById(first._id).lean()).toMatchObject({ status: "awaiting_approval" });
    expect(await Project.findById(project._id).lean()).toMatchObject({ disputeOpen: true });
    await takeEffect();
    expect(await ProjectPhase.findById(first._id).lean()).toMatchObject({ status: "completed" });
    expect(await Project.findById(project._id).lean()).toMatchObject({ disputeOpen: false });
  });

  test("cancelling splits the held money as decided", async () => {
    const { project } = await phaseByPhase();
    const opened = await openDispute(client, project._id);
    const agent = await signedInAdmin();
    const url = `/api/admin/project-disputes/${opened.body.dispute.id as string}/resolve`;
    expect((await agent.post(url).send({ outcome: "cancelled", providerAmount: 10001, note: "x" })).status).toBe(400);
    const res = await agent.post(url).send({ outcome: "cancelled", providerAmount: 10000, note: "The work so far was sound" });
    expect(res.status).toBe(200);
    expect(res.body.decision).toMatchObject({ outcome: "cancelled", providerAmount: 10000 });
    expect(await Project.findById(project._id).lean()).toMatchObject({ status: "in-progress", disputeOpen: true });
    await takeEffect();
    const closed = await agent.get(`/api/admin/project-disputes/${opened.body.dispute.id as string}`);
    expect(closed.body.resolution).toMatchObject({ outcome: "cancelled", providerAmount: 10000, refundAmount: 0 });
    expect(await Project.findById(project._id).lean()).toMatchObject({ status: "cancelled", disputeOpen: false });
    expect(await getPayeeEarnings(engineer._id.toString())).toMatchObject({ released: 36000 + 18000, onHold: 0 });
    expect((await getRefundsDue()).filter((item) => item.kind === "cancellation")).toHaveLength(0);
  });
});

describe("Unanswered hand-overs", () => {
  test("the client is reminded at 5 days and the provider told at 7, once each", async () => {
    await phaseByPhase(8);
    expect(await settleApprovalReminders()).toEqual({ reminded: 1, escalated: 1 });
    expect(await settleApprovalReminders()).toEqual({ reminded: 0, escalated: 0 });
    expect(await Notification.countDocuments({ recipient: client._id, type: "phase_approval_reminder" })).toBe(1);
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "phase_approval_reminder" })).toBe(1);
  });

  test("a paused project isn't chased", async () => {
    const { project } = await phaseByPhase(6);
    await Project.updateOne({ _id: project._id }, { disputeOpen: true });
    expect(await settleApprovalReminders()).toEqual({ reminded: 0, escalated: 0 });
  });
});

describe("Funded phases", () => {
  test("a funded phase's money is held until it's approved", async () => {
    const { project, frame } = await funded();
    expect((await getHeldMoney(project._id as Types.ObjectId)).held).toBe(10000 + 40000);
    // Foundation and 9,000 of the advance are released; the frame's 36,000 waits.
    expect(await getPayeeEarnings(engineer._id.toString())).toMatchObject({ released: 36000 + 9000, onHold: 9000 + 36000 });

    const approved = await as(client, request(app).post(`/api/projects/${project._id.toString()}/phases/${frame._id.toString()}/approve`));
    expect(approved.status).toBe(200);
    expect(await getPayeeEarnings(engineer._id.toString())).toMatchObject({ released: 36000 + 36000 + 18000, onHold: 0 });
    expect(await Project.findById(project._id).lean()).toMatchObject({ status: "completed" });
  });

  test("an admin can approve a funded phase for a silent client", async () => {
    const { project, frame } = await funded(8);
    const opened = await openDispute(engineer, project._id, "no_response");
    expect(opened.status).toBe(201);
    const agent = await signedInAdmin();
    const detail = await agent.get(`/api/admin/project-disputes/${opened.body.dispute.id as string}`);
    expect(detail.body).toMatchObject({ held: 50000, project: { fundsBeforeWork: true } });
    expect(detail.body.phases[1]).toMatchObject({ name: "Frame", canApproveForClient: true });
  });

  test("cancelling splits the funded phase along with the advance", async () => {
    const { project } = await funded();
    const base = `/api/projects/${project._id.toString()}`;
    await as(client, request(app).post(`${base}/cancellation`)).send({ providerAmount: 25000 });
    const accepted = await as(engineer, request(app).post(`${base}/cancellation/accept`));
    expect(accepted.body.cancellation).toMatchObject({ held: 50000, providerAmount: 25000, refundAmount: 25000 });

    const refunds = (await getRefundsDue()).filter((item) => item.kind === "cancellation");
    expect(refunds.map((item) => item.amount).sort((a, b) => a - b)).toEqual([5000, 20000]);
    expect(refunds.find((item) => item.amount === 20000)?.description).toContain("phase funding");
    const frameLine = (await getPayeeEarnings(engineer._id.toString())).lines.find((line) => line.description === "Funding for Frame");
    expect(frameLine).toMatchObject({ released: 18000, refunded: 18000, onHold: 0 });
  });

  test("an unfunded next phase chases the client, then lets the provider escalate", async () => {
    const { project, frame } = await funded();
    // The frame is approved and the next phase isn't funded.
    await ProjectPhase.updateOne({ _id: frame._id }, { status: "completed", completedAt: daysAgo(6) });
    await ProjectPhase.create({ project: project._id, name: "Roof", order: 2, price: 50000, status: "not_started", paymentStatus: "unpaid" });

    expect(await settleFundingReminders()).toEqual({ reminded: 1, escalated: 0 });
    expect(await settleFundingReminders()).toEqual({ reminded: 0, escalated: 0 });
    expect((await openDispute(engineer, project._id, "no_response")).status).toBe(400);
    const state = await as(engineer, request(app).get(`/api/projects/${project._id.toString()}/dispute`));
    expect(state.body.waitingForFunding).toMatchObject({ phase: "Roof" });

    await ProjectPhase.updateOne({ _id: frame._id }, { completedAt: daysAgo(8) });
    expect(await settleFundingReminders()).toEqual({ reminded: 0, escalated: 1 });
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "phase_funding_reminder" })).toBe(1);
    expect((await openDispute(engineer, project._id, "no_response")).status).toBe(201);
  });
});
