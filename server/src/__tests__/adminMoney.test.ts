import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose, { type Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Admin } from "../models/Admin.model";
import { AdminAction } from "../models/AdminAction.model";
import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Payout } from "../models/Payout.model";
import { PayoutAccount } from "../models/PayoutAccount.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Refund } from "../models/Refund.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import payoutsRouter from "../routes/payouts.routes";
import { type FakeGateway, installFakeGateway } from "./helpers/fakeGateway";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";
const ENGINEER_PASSWORD = "tanvir-site-password";

let memoryServer: MongoMemoryServer;
let app: Express;
let gateway: FakeGateway;
let client: IUser;
let engineer: IUser;
let owner: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;
const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));
const id = (user: IUser): string => user._id.toString();

const signedInAdmin = async (): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);
  await agent.post("/api/admin/auth/login").send({ email: "ops@civilhub.test", password: ADMIN_PASSWORD });
  return agent;
};

/** A paid gateway payment with the split the checkout would have made. */
const paid = (fields: Record<string, unknown>) =>
  Payment.create({
    method: "sslcommerz",
    status: "paid",
    paidAt: new Date(),
    platformFee: 0,
    depositAmount: 0,
    refundDue: false,
    cardType: "BKASH-BKash",
    ...fields,
  });

/** 100,000 agreed: 20,000 advance, then two phases of 40,000. */
const projectWithOnePhaseDone = async (): Promise<{ projectId: Types.ObjectId }> => {
  const project = await Project.create({
    title: "Duplex in Mirpur",
    client: client._id,
    assignedEngineer: engineer._id,
    status: "in-progress",
    totalAgreedValue: 100000,
    paymentPlan: "phase_by_phase",
    phasePlanStatus: "approved",
    advancePaid: true,
  });
  const [first] = await ProjectPhase.create([
    { project: project._id, name: "Foundation", order: 0, price: 50000, status: "completed", paymentStatus: "paid" },
    { project: project._id, name: "Frame", order: 1, price: 50000, status: "in_progress", paymentStatus: "unpaid" },
  ]);
  await paid({
    project: project._id,
    type: "advance",
    amount: 20000,
    paidBy: client._id,
    payee: engineer._id,
    platformFee: 2000,
    payeeAmount: 18000,
    description: "Advance for Duplex in Mirpur",
  });
  await paid({
    project: project._id,
    phase: first._id,
    type: "phase",
    amount: 40000,
    paidBy: client._id,
    payee: engineer._id,
    platformFee: 4000,
    payeeAmount: 36000,
    description: "Foundation",
  });
  return { projectId: project._id as Types.ObjectId };
};

/** A finished rental of the owner's mixer, with a 10,000 deposit. */
const finishedRental = async (resolution: "pending" | "released" | "claimed", claim = 0) => {
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
  const day = (offset: number) => new Date(Date.UTC(2026, 8, 1 + offset));
  const booking = await EquipmentBooking.create({
    equipment: mixer._id,
    renter: client._id,
    owner: owner._id,
    startDate: day(0),
    endDate: day(1),
    units: 1,
    rentalDays: 2,
    rentalFee: 10000,
    totalRentalFee: 10000,
    securityDeposit: 10000,
    status: "completed",
    paymentStatus: "paid",
    depositResolution: resolution,
    ...(resolution === "claimed" ? { depositClaimAmount: claim, depositClaimNotes: "Cracked drum" } : {}),
  });
  const payment = await paid({
    equipmentBooking: booking._id,
    type: "equipment_booking",
    amount: 20000,
    paidBy: client._id,
    payee: owner._id,
    platformFee: 1000,
    payeeAmount: 9000,
    depositAmount: 10000,
    bankTranId: "BANK-RENTAL",
    tranId: "TRAN-RENTAL",
    description: "Concrete mixer rental",
  });
  return { booking, payment };
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Promise.all([Admin.syncIndexes(), PayoutAccount.syncIndexes(), Refund.syncIndexes()]);
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/payouts", payoutsRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  gateway = installFakeGateway();
  await Promise.all(
    [Admin, AdminAction, Equipment, EquipmentBooking, Notification, Payment, Payout, PayoutAccount, Project, ProjectPhase, Refund, User].map(
      (model) => (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({
    name: "Tanvir Alam",
    email: "e@test.dev",
    passwordHash: await bcrypt.hash(ENGINEER_PASSWORD, 4),
    role: "engineer",
  });
  owner = await User.create({ name: "Rahman Plant Hire", email: "o@test.dev", passwordHash: "x", role: "organisation" });
});

afterEach(() => gateway.restore());

describe("Earnings and payouts", () => {
  test("money is released as work is accepted, and paid out only to a saved account", async () => {
    await projectWithOnePhaseDone();

    // The phase is paid in full; half the advance is released with it.
    const mine = await as(engineer, request(app).get("/api/payouts/me"));
    expect(mine.body).toMatchObject({ released: 45000, onHold: 9000, paidOut: 0, owed: 45000, account: null });
    expect((await as(client, request(app).get("/api/payouts/me"))).status).toBe(403);

    const agent = await signedInAdmin();
    const noAccount = await agent
      .post(`/api/admin/money/payees/${id(engineer)}/payouts`)
      .send({ amount: 45000, reference: "BK123" });
    expect(noAccount.status).toBe(409);

    const badWallet = await as(engineer, request(app).put("/api/payouts/me/account")).send({
      method: "bkash",
      accountName: "Tanvir Alam",
      accountNumber: "12345",
    });
    expect(badWallet.status).toBe(400);
    // Changing where the money goes needs the password, not just the session.
    const noPassword = await as(engineer, request(app).put("/api/payouts/me/account")).send({
      method: "bkash",
      accountName: "Tanvir Alam",
      accountNumber: "01712-345678",
    });
    expect(noPassword.status).toBe(403);

    const saved = await as(engineer, request(app).put("/api/payouts/me/account")).send({
      method: "bkash",
      accountName: "Tanvir Alam",
      accountNumber: "01712-345678",
      currentPassword: ENGINEER_PASSWORD,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.accountNumber).toBe("01712345678");
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "payout_account_updated" })).toBe(1);

    const list = await agent.get("/api/admin/money/payees");
    expect(list.body.items[0]).toMatchObject({ payee: { name: "Tanvir Alam" }, owed: 45000, hasAccount: true });

    const tooMuch = await agent
      .post(`/api/admin/money/payees/${id(engineer)}/payouts`)
      .send({ amount: 50000, reference: "BK123" });
    expect(tooMuch.status).toBe(409);
    const noReference = await agent.post(`/api/admin/money/payees/${id(engineer)}/payouts`).send({ amount: 100 });
    expect(noReference.status).toBe(400);

    const sent = await agent
      .post(`/api/admin/money/payees/${id(engineer)}/payouts`)
      .send({ amount: 45000, reference: "BK123", note: "September" });
    expect(sent.status).toBe(201);
    expect(sent.body.owed).toBe(0);

    const after = await as(engineer, request(app).get("/api/payouts/me"));
    expect(after.body).toMatchObject({ paidOut: 45000, owed: 0, onHold: 9000 });
    expect(after.body.payouts[0]).toMatchObject({ amount: 45000, reference: "BK123", method: "bkash" });
    expect(await Notification.countDocuments({ recipient: engineer._id, type: "payout_sent" })).toBe(1);
    expect(await AdminAction.countDocuments({ action: "payout.record" })).toBe(1);

    // The project finishing releases the rest of the advance.
    await Project.updateOne({}, { status: "completed" });
    const done = await as(engineer, request(app).get("/api/payouts/me"));
    expect(done.body).toMatchObject({ released: 54000, onHold: 0, owed: 9000 });
  });

  test("a rental pays the owner once completed, plus any deposit they claimed", async () => {
    await finishedRental("claimed", 3000);
    const agent = await signedInAdmin();
    const payee = await agent.get(`/api/admin/money/payees/${id(owner)}`);
    expect(payee.body.earnings).toMatchObject({ released: 12000, onHold: 0, owed: 12000 });
  });

  test("a payment waiting for a refund isn't earned", async () => {
    const { projectId } = await projectWithOnePhaseDone();
    await Payment.updateMany({ project: projectId, type: "phase" }, { refundDue: true });
    const mine = await as(engineer, request(app).get("/api/payouts/me"));
    expect(mine.body.released).toBe(9000);
  });
});

describe("Refunds", () => {
  test("an overpayment is refunded through SSLCommerz once, and the payer is told", async () => {
    const payment = await paid({
      type: "advance",
      amount: 20000,
      paidBy: client._id,
      payee: engineer._id,
      refundDue: true,
      bankTranId: "BANK-DUP",
      tranId: "TRAN-DUP",
      description: "Advance for Duplex in Mirpur",
    });
    const agent = await signedInAdmin();
    const queue = await agent.get("/api/admin/money/refunds");
    expect(queue.body.due).toEqual([
      expect.objectContaining({ kind: "overpayment", amount: 20000, canUseGateway: true, paidWith: "bKash" }),
    ]);

    const refunded = await agent.post("/api/admin/money/refunds").send({
      paymentId: payment._id.toString(),
      kind: "overpayment",
      method: "sslcommerz",
    });
    expect(refunded.status).toBe(201);
    expect(refunded.body).toMatchObject({ status: "completed", amount: 20000, method: "sslcommerz" });
    expect(gateway.refundRequests[0].get("bank_tran_id")).toBe("BANK-DUP");
    expect(gateway.refundRequests[0].get("refund_amount")).toBe("20000.00");
    expect(await Notification.countDocuments({ recipient: client._id, type: "refund_issued" })).toBe(1);

    expect((await agent.get("/api/admin/money/refunds")).body.due).toEqual([]);
    const again = await agent.post("/api/admin/money/refunds").send({
      paymentId: payment._id.toString(),
      kind: "overpayment",
      method: "manual",
      reference: "X",
    });
    expect(again.status).toBe(409);
  });

  test("when SSLCommerz refuses, it stays in the queue and can be refunded by hand", async () => {
    const payment = await paid({
      type: "phase",
      amount: 5000,
      paidBy: client._id,
      refundDue: true,
      bankTranId: "BANK-OLD",
      description: "Frame",
    });
    gateway.refundReply = { APIConnect: "DONE", status: "failed", errorReason: "Transaction too old" };
    const agent = await signedInAdmin();
    const refused = await agent
      .post("/api/admin/money/refunds")
      .send({ paymentId: payment._id.toString(), kind: "overpayment", method: "sslcommerz" });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toContain("Transaction too old");
    expect((await agent.get("/api/admin/money/refunds")).body.due).toHaveLength(1);

    const manual = await agent.post("/api/admin/money/refunds").send({
      paymentId: payment._id.toString(),
      kind: "overpayment",
      method: "manual",
      reference: "BKASH-REF-9",
    });
    expect(manual.status).toBe(201);
    expect(manual.body).toMatchObject({ status: "completed", reference: "BKASH-REF-9" });
    expect((await agent.get("/api/admin/money/refunds")).body.due).toEqual([]);
  });

  test("a released deposit, less any claim, is refunded; a processing refund can be checked", async () => {
    const { payment } = await finishedRental("claimed", 3000);
    gateway.refundReply = { APIConnect: "DONE", status: "processing", refund_ref_id: "RFD-9" };
    const agent = await signedInAdmin();
    const queue = await agent.get("/api/admin/money/refunds");
    expect(queue.body.due).toEqual([expect.objectContaining({ kind: "deposit", amount: 7000 })]);

    const started = await agent
      .post("/api/admin/money/refunds")
      .send({ paymentId: payment._id.toString(), kind: "deposit", method: "sslcommerz" });
    expect(started.body).toMatchObject({ status: "processing", reference: "RFD-9" });
    // Processing counts as handled, so it isn't offered twice.
    expect((await agent.get("/api/admin/money/refunds")).body.due).toEqual([]);

    gateway.refundQueries.set("RFD-9", { APIConnect: "DONE", status: "refunded" });
    const checked = await agent.post(`/api/admin/money/refunds/${started.body.id as string}/check`);
    expect(checked.body.status).toBe("completed");
    expect(await Notification.countDocuments({ recipient: client._id, type: "refund_issued" })).toBe(1);
  });

  test("a deposit the owner hasn't settled yet isn't refundable", async () => {
    await finishedRental("pending");
    const agent = await signedInAdmin();
    expect((await agent.get("/api/admin/money/refunds")).body.due).toEqual([]);
    const overview = await agent.get("/api/admin/overview");
    expect(overview.body.money).toMatchObject({ depositsPending: 1, refundsDue: 0 });
  });
});

describe("Payments ledger", () => {
  test("finds payments by payer name or transaction id", async () => {
    await finishedRental("released");
    const agent = await signedInAdmin();
    const byName = await agent.get("/api/admin/money/payments?q=Nusrat");
    expect(byName.body.items).toHaveLength(1);
    expect(byName.body.items[0]).toMatchObject({ type: "equipment_booking", payer: { name: "Nusrat Jahan" } });
    const byTran = await agent.get("/api/admin/money/payments?q=TRAN-RENTAL");
    expect(byTran.body.total).toBe(1);
    expect((await agent.get("/api/admin/money/payments?q=nobody")).body.total).toBe(0);
  });
});

describe("Money moved twice at once", () => {
  test("two refunds of the same payment at once send it once", async () => {
    const payment = await paid({
      type: "advance",
      amount: 20000,
      paidBy: client._id,
      payee: engineer._id,
      refundDue: true,
      bankTranId: "BANK-DUP",
      tranId: "TRAN-DUP",
      description: "Advance for Duplex in Mirpur",
    });
    const agent = await signedInAdmin();
    const body = { paymentId: payment._id.toString(), kind: "overpayment", method: "sslcommerz" };
    const results = await Promise.all([
      agent.post("/api/admin/money/refunds").send(body),
      agent.post("/api/admin/money/refunds").send(body),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(gateway.refundRequests).toHaveLength(1);
    expect(gateway.refundRequests[0].get("refund_trans_id")).toMatch(/^RF[0-9a-f]{24}$/);
    expect(await Refund.countDocuments({ status: { $ne: "failed" } })).toBe(1);
  });

  test("a refund the gateway refuses can be tried again", async () => {
    const payment = await paid({
      type: "advance",
      amount: 20000,
      paidBy: client._id,
      refundDue: true,
      bankTranId: "BANK-RETRY",
      tranId: "TRAN-RETRY",
    });
    const agent = await signedInAdmin();
    const body = { paymentId: payment._id.toString(), kind: "overpayment", method: "sslcommerz" };
    gateway.refundReply = { APIConnect: "DONE", status: "failed", errorReason: "Try later" };
    expect((await agent.post("/api/admin/money/refunds").send(body)).status).toBe(422);

    gateway.refundReply = { APIConnect: "DONE", status: "success", refund_ref_id: "RFD-2" };
    expect((await agent.post("/api/admin/money/refunds").send(body)).status).toBe(201);
  });

  test("two payouts at once can't add up to more than is owed", async () => {
    await projectWithOnePhaseDone();
    await PayoutAccount.create({
      user: engineer._id,
      method: "bkash",
      accountName: "Tanvir Alam",
      accountNumber: "01712345678",
    });
    const agent = await signedInAdmin();
    const results = await Promise.all(
      ["BK1", "BK2"].map((reference) =>
        agent.post(`/api/admin/money/payees/${id(engineer)}/payouts`).send({ amount: 45000, reference }),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await Payout.countDocuments()).toBe(1);
    // The lock is let go, so the next payout isn't blocked by it.
    expect((await PayoutAccount.findOne({ user: engineer._id }).lean())?.payoutLockUntil).toBeNull();
  });
});
