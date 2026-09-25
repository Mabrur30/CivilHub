import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import {
  EquipmentBooking,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { type IUser, User } from "../models/User.model";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import paymentsRouter from "../routes/payments.routes";
import projectsRouter from "../routes/projects.routes";
import {
  installFakeGateway,
  payViaGateway,
  TEST_CLIENT_URL,
  TEST_SERVER_URL,
  validRecord,
  type FakeGateway,
} from "./helpers/fakeGateway";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let gateway: FakeGateway;
let owner: IUser;
let renter: IUser;
let stranger: IUser;
let excavator: IEquipment;
let booking: IEquipmentBooking;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const checkout = (user: IUser, body: Record<string, unknown>) =>
  request(app).post("/api/payments/checkout").set("Cookie", cookieFor(user)).send(body);

const payBooking = (override = {}) =>
  payViaGateway(
    app,
    gateway,
    cookieFor(renter),
    { purpose: "equipment_booking", bookingId: booking._id.toString() },
    override,
  );

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  gateway = installFakeGateway();
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api/projects", projectsRouter);
  app.use("/api", equipmentBookingRouter);
  app.use("/api/payments", paymentsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  gateway.restore();
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  gateway.validations.clear();
  gateway.queries.clear();
  gateway.sessions.length = 0;
  gateway.failInitWith = null;
  process.env.SSLCOMMERZ_STORE_ID = "civilhubtest";
  await Promise.all(
    [Equipment, EquipmentBooking, Notification, Payment, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  owner = await User.create({ name: "Rahim Plant Hire", email: "owner@test.dev", passwordHash: "x", role: "engineer" });
  renter = await User.create({ name: "Nusrat Jahan", email: "client@test.dev", passwordHash: "x", role: "client" });
  stranger = await User.create({ name: "Someone Else", email: "else@test.dev", passwordHash: "x", role: "client" });
  excavator = await Equipment.create({
    owner: owner._id,
    title: "Excavator 20t",
    description: "Tracked excavator",
    category: "Excavator",
    dailyRate: 10_000,
    securityDeposit: 20_000,
    location: "Mirpur, Dhaka",
    photos: [{ url: "https://example.test/x.jpg", publicId: "x" }],
  });
  booking = await EquipmentBooking.create({
    equipment: excavator._id,
    renter: renter._id,
    owner: owner._id,
    startDate: new Date("2030-03-01"),
    endDate: new Date("2030-03-03"),
    rentalDays: 3,
    rentalFee: 30_000,
    totalRentalFee: 30_000,
    securityDeposit: 20_000,
    status: "approved",
  });
});

describe("Checkout", () => {
  test("opens an SSLCommerz session for the server-computed amount and fee split", async () => {
    const response = await checkout(renter, {
      purpose: "equipment_booking",
      bookingId: booking._id.toString(),
    });
    expect(response.status).toBe(201);
    expect(response.body.gatewayUrl).toMatch(/^https:\/\/sandbox\.sslcommerz\.com\//);

    const payment = await Payment.findOne({ tranId: response.body.tranId }).exec();
    expect(payment).toMatchObject({
      status: "initiated",
      amount: 50_000,
      depositAmount: 20_000,
      platformFee: 3_000,
      payeeAmount: 27_000,
      method: "sslcommerz",
    });
    expect(payment?.payee?.toString()).toBe(owner._id.toString());

    const form = gateway.sessions[0];
    expect(form.get("total_amount")).toBe("50000.00");
    expect(form.get("success_url")).toBe(`${TEST_SERVER_URL}/api/payments/sslcommerz/success`);
    expect(form.get("ipn_url")).toBe(`${TEST_SERVER_URL}/api/payments/sslcommerz/ipn`);
    expect(form.get("cus_email")).toBe("client@test.dev");
  });

  test("only the renter can pay, and only for an approved, unpaid booking", async () => {
    expect((await checkout(owner, { purpose: "equipment_booking", bookingId: booking._id.toString() })).status).toBe(403);
    expect((await checkout(stranger, { purpose: "equipment_booking", bookingId: booking._id.toString() })).status).toBe(403);
    expect((await checkout(renter, { purpose: "rent", bookingId: booking._id.toString() })).status).toBe(400);

    await EquipmentBooking.updateOne({ _id: booking._id }, { $set: { status: "pending" } });
    expect((await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() })).status).toBe(409);
  });

  test("says so when the gateway isn't configured, or refuses the session", async () => {
    process.env.SSLCOMMERZ_STORE_ID = "";
    const unconfigured = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    expect(unconfigured.status).toBe(503);

    process.env.SSLCOMMERZ_STORE_ID = "civilhubtest";
    gateway.failInitWith = "Store Credential Error Or Store is De-active";
    const refused = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    expect(refused.status).toBe(502);
    expect(refused.body.message).toMatch(/Store Credential/);
    expect(await Payment.countDocuments({ status: "failed" })).toBe(1);
  });

  test("the old mock payment routes are gone", async () => {
    const mock = await request(app)
      .post(`/api/equipment-bookings/${booking._id.toString()}/pay`)
      .set("Cookie", cookieFor(renter));
    expect(mock.status).toBe(404);
  });
});

describe("Coming back from SSLCommerz", () => {
  test("a verified payment marks the booking paid and tells the owner their share", async () => {
    const { callback, tranId } = await payBooking();
    expect(callback?.status).toBe(303);
    expect(callback?.headers.location).toBe(`${TEST_CLIENT_URL}/payments/result?tran=${tranId}`);

    const paid = await EquipmentBooking.findById(booking._id).exec();
    expect(paid?.paymentStatus).toBe("paid");
    const notice = await Notification.findOne({ recipient: owner._id }).exec();
    expect(notice?.type).toBe("equipment_booking_payment_received");
    expect(notice?.message).toMatch(/bKash/);
    expect(notice?.message).toMatch(/27,000/);
  });

  test("a posted success without a matching validation doesn't count", async () => {
    const opened = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const forged = await request(app)
      .post("/api/payments/sslcommerz/success")
      .type("form")
      .send({ tran_id: opened.body.tranId as string, val_id: "made-up", status: "VALID", amount: "50000.00" });
    expect(forged.status).toBe(303);
    expect((await Payment.findOne({ tranId: opened.body.tranId as string }).exec())?.status).toBe("failed");
    expect((await EquipmentBooking.findById(booking._id).exec())?.paymentStatus).toBe("unpaid");
  });

  test("a validation for another transaction's val_id doesn't count", async () => {
    const other = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const mine = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    gateway.validations.set("VAL-OTHER", validRecord(other.body.tranId as string, 50_000, "VAL-OTHER"));
    await request(app)
      .post("/api/payments/sslcommerz/success")
      .type("form")
      .send({ tran_id: mine.body.tranId as string, val_id: "VAL-OTHER" });
    expect((await Payment.findOne({ tranId: mine.body.tranId as string }).exec())?.status).toBe("failed");
  });

  test("a payment still settles after a (possibly forged) fail notice", async () => {
    const opened = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const tranId = opened.body.tranId as string;
    await request(app).post("/api/payments/sslcommerz/fail").type("form").send({ tran_id: tranId, error: "Declined" });
    expect((await Payment.findOne({ tranId }).exec())?.status).toBe("failed");

    gateway.validations.set("VAL1", validRecord(tranId, 50_000, "VAL1"));
    const ipn = await request(app)
      .post("/api/payments/sslcommerz/ipn")
      .type("form")
      .send({ tran_id: tranId, val_id: "VAL1", status: "VALID" });
    expect(ipn.status).toBe(200);
    expect((await Payment.findOne({ tranId }).exec())?.status).toBe("paid");
    expect((await EquipmentBooking.findById(booking._id).exec())?.paymentStatus).toBe("paid");
  });

  test("paying for a booking that was already paid flags the money for a refund", async () => {
    const first = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const second = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    for (const [index, opened] of [first, second].entries()) {
      const valId = `VAL${index}`;
      gateway.validations.set(valId, validRecord(opened.body.tranId as string, 50_000, valId));
      await request(app).post("/api/payments/sslcommerz/success").type("form").send({ tran_id: opened.body.tranId as string, val_id: valId });
    }
    expect((await Payment.findOne({ tranId: first.body.tranId as string }).exec())?.refundDue).toBe(false);
    expect((await Payment.findOne({ tranId: second.body.tranId as string }).exec())?.refundDue).toBe(true);
    expect(await Notification.countDocuments({ recipient: renter._id, type: "payment_refund_due" })).toBe(1);
  });
});

describe("Payment result", () => {
  test("the payer and the payee can read it; anyone else can't", async () => {
    const { tranId } = await payBooking();
    const asRenter = await request(app).get(`/api/payments/${tranId}`).set("Cookie", cookieFor(renter));
    expect(asRenter.status).toBe(200);
    expect(asRenter.body).toMatchObject({
      status: "paid",
      amount: 50_000,
      method: "bKash",
      viewerRole: "payer",
      returnPath: `/dashboard/client/equipment/bookings/${booking._id.toString()}`,
    });

    const asOwner = await request(app).get(`/api/payments/${tranId}`).set("Cookie", cookieFor(owner));
    expect(asOwner.body.viewerRole).toBe("payee");
    expect(asOwner.body.payeeAmount).toBe(27_000);

    expect((await request(app).get(`/api/payments/${tranId}`).set("Cookie", cookieFor(stranger))).status).toBe(404);
  });

  test("a checkout nobody reported back on is settled by asking SSLCommerz", async () => {
    const opened = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const tranId = opened.body.tranId as string;
    // The customer paid, then closed the tab; no redirect or IPN reached us.
    await Payment.collection.updateOne({ tranId }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });
    gateway.queries.set(tranId, [validRecord(tranId, 50_000, "VALQ")]);

    const result = await request(app).get(`/api/payments/${tranId}`).set("Cookie", cookieFor(renter));
    expect(result.body.status).toBe("paid");
    expect((await EquipmentBooking.findById(booking._id).exec())?.paymentStatus).toBe("paid");
  });

  test("a checkout left open past the window expires", async () => {
    const opened = await checkout(renter, { purpose: "equipment_booking", bookingId: booking._id.toString() });
    const tranId = opened.body.tranId as string;
    await Payment.collection.updateOne({ tranId }, { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });

    const result = await request(app).get(`/api/payments/${tranId}`).set("Cookie", cookieFor(renter));
    expect(result.body.status).toBe("expired");
  });
});
