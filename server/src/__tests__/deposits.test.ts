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
import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking, type IEquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Refund } from "../models/Refund.model";
import { type IUser, User } from "../models/User.model";
import adminRouter from "../routes/admin.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import { settleDueDeposits } from "../utils/deposits";
import { getPayeeEarnings } from "../utils/earnings";
import { getRefundsDue } from "../utils/refunds";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ADMIN_JWT_SECRET = "admin-integration-secret-that-is-long-enough";

const ADMIN_PASSWORD = "correct horse battery staple";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

let memoryServer: MongoMemoryServer;
let app: Express;
let renter: IUser;
let owner: IUser;

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

/** A paid, returned rental of a mixer with a 10,000 deposit, not yet settled. */
const returnedRental = async (returnedDaysAgo = 0): Promise<IEquipmentBooking> => {
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
  const booking = await EquipmentBooking.create({
    equipment: mixer._id,
    renter: renter._id,
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
    returnConfirmedAt: daysAgo(returnedDaysAgo),
    returnConditionNotes: "Drum dented on the left side",
  });
  await Payment.create({
    equipmentBooking: booking._id,
    type: "equipment_booking",
    method: "sslcommerz",
    status: "paid",
    paidAt: new Date(),
    amount: 20000,
    paidBy: renter._id,
    payee: owner._id,
    platformFee: 1000,
    payeeAmount: 9000,
    depositAmount: 10000,
    refundDue: false,
    bankTranId: `BANK-${booking._id.toString()}`,
    tranId: `TRAN-${booking._id.toString()}`,
    description: "Concrete mixer rental",
  });
  return booking;
};

const claim = (booking: IEquipmentBooking, amount = 4000): request.Test =>
  as(owner, request(app).patch(`/api/equipment-bookings/${booking._id.toString()}/resolve-deposit`)).send({
    resolution: "claimed",
    claimNotes: "Dented drum needs panel work",
    claimAmount: amount,
  });

const dispute = (booking: IEquipmentBooking, user: IUser = renter, reason = "The dent was there at pickup, see my photos"): request.Test =>
  as(user, request(app).post(`/api/equipment-bookings/${booking._id.toString()}/deposit-dispute`)).send({ reason });

const depositRefund = async (): Promise<number | undefined> =>
  (await getRefundsDue()).find((item) => item.kind === "deposit")?.amount;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Admin.syncIndexes();
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", equipmentBookingRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Admin, AdminAction, Equipment, EquipmentBooking, Notification, Payment, Refund, User].map((model) =>
      (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  await Admin.create({ name: "Ops", email: "ops@civilhub.test", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4) });
  renter = await User.create({ name: "Nusrat Jahan", email: "r@test.dev", passwordHash: "x", role: "client" });
  owner = await User.create({ name: "Rahman Plant Hire", email: "o@test.dev", passwordHash: "x", role: "organisation" });
});

describe("Deposit claims", () => {
  test("a claim is on hold until the renter can no longer dispute it", async () => {
    const booking = await returnedRental();
    expect((await claim(booking)).status).toBe(200);

    const view = await as(renter, request(app).get(`/api/equipment-bookings/${booking._id.toString()}`));
    expect(view.body.disputeDeadline).toEqual(expect.any(String));
    expect(await Notification.findOne({ recipient: renter._id, type: "equipment_deposit_claimed" })).toMatchObject({
      message: expect.stringContaining("dispute it within 3 days"),
    });

    // Held: the owner hasn't earned the claim, and the renter's refund waits.
    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ released: 9000, onHold: 4000 });
    expect(await depositRefund()).toBeUndefined();

    // Three days on, nobody disputed it, so it stands.
    await EquipmentBooking.updateOne({ _id: booking._id }, { depositClaimedAt: daysAgo(3.1) });
    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ released: 13000, onHold: 0 });
    expect(await depositRefund()).toBe(6000);
  });

  test("only the renter can dispute, once, and only within 3 days", async () => {
    const booking = await returnedRental();
    expect((await dispute(booking)).status).toBe(409); // nothing claimed yet
    await claim(booking);

    expect((await dispute(booking, owner)).status).toBe(403);
    expect((await dispute(booking, renter, "no")).status).toBe(400);

    const opened = await dispute(booking);
    expect(opened.status).toBe(200);
    expect(opened.body.depositDispute).toMatchObject({ status: "open", originalClaimAmount: 4000 });
    expect(await Notification.countDocuments({ recipient: owner._id, type: "equipment_deposit_disputed" })).toBe(1);
    expect((await dispute(booking)).status).toBe(409);

    // An open dispute keeps the claim on hold past the 3 days.
    await EquipmentBooking.updateOne({ _id: booking._id }, { depositClaimedAt: daysAgo(10) });
    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ onHold: 4000 });
    expect(await depositRefund()).toBeUndefined();

    const late = await returnedRental();
    await claim(late);
    await EquipmentBooking.updateOne({ _id: late._id }, { depositClaimedAt: daysAgo(3.1) });
    expect((await dispute(late)).status).toBe(409);
  });
});

describe("Admin decisions", () => {
  const disputed = async (): Promise<IEquipmentBooking> => {
    const booking = await returnedRental();
    await claim(booking);
    await dispute(booking);
    return booking;
  };
  const decide = (agent: ReturnType<typeof request.agent>, booking: IEquipmentBooking, body: object) =>
    agent.post(`/api/admin/deposits/${booking._id.toString()}/decide`).send(body);

  test("users can't reach the deposit queue", async () => {
    expect((await as(renter, request(app).get("/api/admin/deposits"))).status).toBe(401);
  });

  test("the queue shows the claim, the dispute and the condition evidence", async () => {
    const booking = await disputed();
    const agent = await signedInAdmin();
    const list = await agent.get("/api/admin/deposits");
    expect(list.body.items).toEqual([
      expect.objectContaining({ claimAmount: 4000, dispute: expect.objectContaining({ status: "open" }) }),
    ]);
    const detail = await agent.get(`/api/admin/deposits/${booking._id.toString()}`);
    expect(detail.body).toMatchObject({
      equipment: "Concrete mixer",
      renter: { name: "Nusrat Jahan" },
      return: { notes: "Drum dented on the left side" },
      payment: { depositAmount: 10000 },
    });
  });

  test("upholding keeps the claim, and pays it to the owner", async () => {
    const booking = await disputed();
    const agent = await signedInAdmin();
    expect((await decide(agent, booking, { decision: "upheld" })).status).toBe(400); // note required
    const res = await decide(agent, booking, { decision: "upheld", note: "Pickup photos show no dent" });
    expect(res.status).toBe(200);
    expect(res.body.dispute).toMatchObject({ status: "decided", decision: "upheld" });

    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ released: 13000, onHold: 0 });
    expect(await depositRefund()).toBe(6000);
    expect(await Notification.countDocuments({ type: "equipment_deposit_decided" })).toBe(2);
    expect(await AdminAction.countDocuments({ action: "deposit.decide", targetType: "booking" })).toBe(1);

    expect((await decide(agent, booking, { decision: "rejected", note: "Changed my mind" })).status).toBe(409);
  });

  test("reducing sets a lower claim", async () => {
    const booking = await disputed();
    const agent = await signedInAdmin();
    expect((await decide(agent, booking, { decision: "reduced", amount: 0, note: "x" })).status).toBe(400);
    expect((await decide(agent, booking, { decision: "reduced", amount: 4000, note: "x" })).status).toBe(400);
    const res = await decide(agent, booking, { decision: "reduced", amount: 1500, note: "Only the panel, not the paint" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ claimAmount: 1500, dispute: { originalClaimAmount: 4000, decision: "reduced" } });
    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ released: 10500 });
    expect(await depositRefund()).toBe(8500);
  });

  test("rejecting releases the whole deposit to the renter", async () => {
    const booking = await disputed();
    const agent = await signedInAdmin();
    expect((await decide(agent, booking, { decision: "rejected", note: "Dent visible at pickup" })).status).toBe(200);
    expect(await EquipmentBooking.findById(booking._id).lean()).toMatchObject({ depositResolution: "released" });
    expect(await getPayeeEarnings(owner._id.toString())).toMatchObject({ released: 9000, onHold: 0 });
    expect(await depositRefund()).toBe(10000);
  });
});

describe("Unsettled deposits", () => {
  test("owners are reminded after 5 days, and the deposit is released after 7", async () => {
    const fresh = await returnedRental(1);
    const nearly = await returnedRental(5.5);
    const overdue = await returnedRental(7.5);
    const settled = await returnedRental(9);
    await EquipmentBooking.updateOne({ _id: settled._id }, { depositResolution: "claimed", depositClaimAmount: 2000 });

    expect(await settleDueDeposits()).toEqual({ reminded: 1, released: 1 });
    expect(await settleDueDeposits()).toEqual({ reminded: 0, released: 0 });

    const state = async (booking: IEquipmentBooking) => EquipmentBooking.findById(booking._id).lean();
    expect(await state(fresh)).toMatchObject({ depositResolution: "pending" });
    expect((await state(fresh))?.depositReminderSentAt).toBeUndefined();
    expect(await state(nearly)).toMatchObject({ depositResolution: "pending", depositReminderSentAt: expect.any(Date) });
    expect(await state(overdue)).toMatchObject({ depositResolution: "released" });
    expect(await state(settled)).toMatchObject({ depositResolution: "claimed", depositClaimAmount: 2000 });

    expect(await Notification.countDocuments({ type: "equipment_deposit_reminder", equipmentBooking: nearly._id })).toBe(1);
    expect(await Notification.countDocuments({ type: "equipment_deposit_released", equipmentBooking: overdue._id })).toBe(2);
  });
});
