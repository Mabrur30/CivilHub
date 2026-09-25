import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { type IUser, User } from "../models/User.model";
import equipmentRouter from "../routes/equipment.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let owner: IUser;
let homeowner: IUser;
let contractor: IUser;
let excavator: IEquipment;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(user));

const book = (user: IUser, body: Record<string, unknown>) =>
  as(
    user,
    request(app)
      .post("/api/equipment-bookings")
      .send({ equipmentId: excavator._id.toString(), ...body }),
  );

const approve = (bookingId: string) =>
  as(
    owner,
    request(app)
      .patch(`/api/equipment-bookings/${bookingId}/respond`)
      .send({ action: "approve" }),
  );

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/equipment", equipmentRouter);
  app.use("/api", equipmentBookingRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Equipment, EquipmentBooking, Notification, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  owner = await User.create({ name: "Rahim Plant Hire", email: "owner@test.dev", passwordHash: "x", role: "engineer" });
  homeowner = await User.create({ name: "Nusrat Jahan", email: "client@test.dev", passwordHash: "x", role: "client" });
  contractor = await User.create({ name: "Tanvir Rahman", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
  excavator = await Equipment.create({
    owner: owner._id,
    title: "Excavator 20t",
    description: "Tracked excavator",
    category: "Excavator",
    dailyRate: 10_000,
    weeklyRate: 55_000,
    securityDeposit: 50_000,
    quantity: 2,
    operator: "optional",
    operatorDailyRate: 2_000,
    transport: "both",
    deliveryFee: 8_000,
    location: "Mirpur, Dhaka",
    photos: [{ url: "https://example.test/x.jpg", publicId: "x" }],
  });
});

describe("Equipment bookings", () => {
  test("a homeowner client can quote and book, and the booking stores the quoted price", async () => {
    const quote = await as(
      homeowner,
      request(app)
        .get(`/api/equipment/${excavator._id.toString()}/quote`)
        .query({ startDate: "2030-03-01", endDate: "2030-03-09", units: "1", withOperator: "true", fulfilment: "delivery" }),
    );
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ rentalDays: 9, rentalFee: 75_000, operatorFee: 18_000, deliveryFee: 8_000, fits: true });

    const created = await book(homeowner, {
      startDate: "2030-03-01",
      endDate: "2030-03-09",
      units: 1,
      withOperator: true,
      fulfilment: "delivery",
      deliveryAddress: "House 12, Road 3, Mirpur DOHS",
    });
    expect(created.status).toBe(201);

    const stored = await EquipmentBooking.findById(created.body.id).exec();
    expect(stored).toMatchObject({
      units: 1,
      rentalDays: 9,
      totalRentalFee: quote.body.totalRentalFee,
      securityDeposit: 50_000,
      fulfilment: "delivery",
      withOperator: true,
    });
  });

  test("a same-day hire is allowed and priced as one day", async () => {
    const created = await book(contractor, { startDate: "2030-04-02", endDate: "2030-04-02" });
    expect(created.status).toBe(201);
    expect(created.body.totalRentalFee).toBe(10_000);
  });

  test("units are shared: two approved single-unit hires fill a two-unit listing", async () => {
    const first = await book(homeowner, { startDate: "2030-05-01", endDate: "2030-05-05" });
    const second = await book(contractor, { startDate: "2030-05-03", endDate: "2030-05-08" });
    expect((await approve(first.body.id)).status).toBe(200);
    expect((await approve(second.body.id)).status).toBe(200);

    const third = await book(homeowner, { startDate: "2030-05-04", endDate: "2030-05-04" });
    expect(third.status).toBe(409);

    const freeDay = await book(homeowner, { startDate: "2030-05-09", endDate: "2030-05-09" });
    expect(freeDay.status).toBe(201);
  });

  test("a machine out on rent keeps its dates blocked", async () => {
    const hire = await book(contractor, { startDate: "2030-06-01", endDate: "2030-06-03", units: 2 });
    await EquipmentBooking.updateOne({ _id: hire.body.id }, { status: "in_progress" });

    const availability = await as(
      homeowner,
      request(app)
        .get(`/api/equipment/${excavator._id.toString()}/availability`)
        .query({ month: "6", year: "2030" }),
    );
    expect(availability.body.quantity).toBe(2);
    expect(availability.body.days).toContainEqual({ date: "2030-06-02", unitsBooked: 2 });

    const clash = await book(homeowner, { startDate: "2030-06-03", endDate: "2030-06-04" });
    expect(clash.status).toBe(409);
  });

  test("approving declines only the pending requests that no longer fit", async () => {
    const single = await book(homeowner, { startDate: "2030-07-01", endDate: "2030-07-02" });
    const otherSingle = await book(contractor, { startDate: "2030-07-02", endDate: "2030-07-03" });
    const both = await book(contractor, { startDate: "2030-07-01", endDate: "2030-07-01", units: 2 });

    expect((await approve(single.body.id)).status).toBe(200);

    const statuses = Object.fromEntries(
      (await EquipmentBooking.find().exec()).map((booking) => [booking._id.toString(), booking.status]),
    );
    expect(statuses[otherSingle.body.id]).toBe("pending");
    expect(statuses[both.body.id]).toBe("declined");
  });

  test("a listing with a live booking can't be deleted", async () => {
    await book(homeowner, { startDate: "2030-08-01", endDate: "2030-08-02" });
    const response = await as(owner, request(app).delete(`/api/equipment/${excavator._id.toString()}`));
    expect(response.status).toBe(409);
    expect(await Equipment.exists({ _id: excavator._id })).toBeTruthy();
  });

  test("a deposit claim can't exceed the deposit held", async () => {
    const hire = await book(homeowner, { startDate: "2030-09-01", endDate: "2030-09-02" });
    await EquipmentBooking.updateOne({ _id: hire.body.id }, { status: "completed", paymentStatus: "paid" });

    const tooMuch = await as(
      owner,
      request(app)
        .patch(`/api/equipment-bookings/${hire.body.id}/resolve-deposit`)
        .send({ resolution: "claimed", claimNotes: "Cracked bucket tooth", claimAmount: 60_000 }),
    );
    expect(tooMuch.status).toBe(400);

    const fair = await as(
      owner,
      request(app)
        .patch(`/api/equipment-bookings/${hire.body.id}/resolve-deposit`)
        .send({ resolution: "claimed", claimNotes: "Cracked bucket tooth", claimAmount: 12_000 }),
    );
    expect(fair.status).toBe(200);
  });

  test("a client can't list equipment", async () => {
    const response = await as(homeowner, request(app).get("/api/equipment/mine"));
    expect(response.status).toBe(403);
  });
});
