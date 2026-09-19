import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Engineer } from "../models/Engineer.model";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Review } from "../models/Review.model";
import { type IUser, User } from "../models/User.model";
import equipmentRouter from "../routes/equipment.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import reviewsRouter from "../routes/reviews.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

interface TestFixture {
  ownerUser: IUser;
  renterUser: IUser;
  equipment: IEquipment;
}

interface CreateRequestInput {
  app: Express;
  authCookie: string;
  equipmentId: string;
  startDate: Date;
  endDate: Date;
}

let memoryServer: MongoMemoryServer;

const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api/equipment", equipmentRouter);
  app.use("/api", equipmentBookingRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use(errorHandler);
  return app;
};

const authCookieForUser = (user: IUser): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set for tests");
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    secret,
    { expiresIn: "1h" },
  );

  return `civilhub_token=${token}`;
};

const addDays = (base: Date, dayOffset: number): Date => {
  const value = new Date(base);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const createEngineerUser = async (
  name: string,
  email: string,
): Promise<IUser> => {
  const user = await User.create({
    name,
    email,
    passwordHash: "hashed-password",
    role: "engineer",
  });

  await Engineer.create({
    user: user._id,
    bio: `${name} profile`,
    certificates: [],
    portfolio: [],
  });

  return user;
};

const createBaseFixture = async (): Promise<TestFixture> => {
  const ownerUser = await createEngineerUser(
    "Owner Engineer",
    "owner@test.dev",
  );
  const renterUser = await createEngineerUser(
    "Renter Engineer",
    "renter@test.dev",
  );

  const equipment = await Equipment.create({
    owner: ownerUser._id,
    title: "Tracked Excavator",
    description: "Heavy equipment for excavation",
    category: "Excavator",
    dailyRate: 300,
    securityDeposit: 500,
    location: "Dhaka",
    photos: [{ url: "https://example.com/equipment.jpg", publicId: "eq-1" }],
    status: "active",
  });

  return { ownerUser, renterUser, equipment };
};

const createBookingRequest = async (
  input: CreateRequestInput,
): Promise<request.Response> => {
  return request(input.app)
    .post("/api/equipment-bookings")
    .set("Cookie", input.authCookie)
    .send({
      equipmentId: input.equipmentId,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
    });
};

const approveBooking = async (
  app: Express,
  ownerUser: IUser,
  bookingId: string,
): Promise<request.Response> => {
  return request(app)
    .patch(`/api/equipment-bookings/${bookingId}/respond`)
    .set("Cookie", authCookieForUser(ownerUser))
    .send({ action: "approve" });
};

const payBooking = async (
  app: Express,
  renterUser: IUser,
  bookingId: string,
): Promise<request.Response> => {
  return request(app)
    .post(`/api/equipment-bookings/${bookingId}/pay`)
    .set("Cookie", authCookieForUser(renterUser))
    .send({});
};

const confirmPickup = async (
  app: Express,
  user: IUser,
  bookingId: string,
): Promise<request.Response> => {
  return request(app)
    .post(`/api/equipment-bookings/${bookingId}/pickup`)
    .set("Cookie", authCookieForUser(user))
    .send({ conditionNotes: "Pickup condition looks good" });
};

const confirmReturn = async (
  app: Express,
  user: IUser,
  bookingId: string,
): Promise<request.Response> => {
  return request(app)
    .post(`/api/equipment-bookings/${bookingId}/return`)
    .set("Cookie", authCookieForUser(user))
    .send({ conditionNotes: "Returned in stable condition" });
};

const resolveDeposit = async (
  app: Express,
  ownerUser: IUser,
  bookingId: string,
): Promise<request.Response> => {
  return request(app)
    .patch(`/api/equipment-bookings/${bookingId}/resolve-deposit`)
    .set("Cookie", authCookieForUser(ownerUser))
    .send({ resolution: "released" });
};

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
    EquipmentBooking.deleteMany({}),
    Equipment.deleteMany({}),
    Engineer.deleteMany({}),
    User.deleteMany({}),
    Notification.deleteMany({}),
    Payment.deleteMany({}),
    Review.deleteMany({}),
  ]);
});

describe("Equipment Booking integration: overlap conflicts", () => {
  test("1) creating a booking request for open dates succeeds", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const startDate = addDays(new Date(), 5);
    const endDate = addDays(new Date(), 8);

    const response = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate,
      endDate,
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");

    const booking = await EquipmentBooking.findById(response.body.id).exec();
    expect(booking).not.toBeNull();
  });

  test("2) approving a booking request succeeds when no conflicting approved booking exists", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 10),
      endDate: addDays(new Date(), 12),
    });

    const approveResponse = await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );

    expect(approveResponse.status).toBe(200);

    const booking = await EquipmentBooking.findById(
      bookingResponse.body.id,
    ).exec();
    expect(booking?.status).toBe("approved");
  });

  test("3) approving a second overlapping request after one is approved is rejected with 409", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();
    const secondRenter = await createEngineerUser(
      "Second Renter",
      "renter2@test.dev",
    );

    const startDate = addDays(new Date(), 15);
    const endDate = addDays(new Date(), 18);

    const first = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate,
      endDate,
    });

    const second = await createBookingRequest({
      app,
      authCookie: authCookieForUser(secondRenter),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 16),
      endDate: addDays(new Date(), 19),
    });

    await approveBooking(app, fixture.ownerUser, first.body.id as string);

    // Auto-decline runs on first approval; restore pending to exercise explicit conflict guard.
    await EquipmentBooking.findByIdAndUpdate(second.body.id as string, {
      $set: { status: "pending" },
    }).exec();

    const secondApproval = await approveBooking(
      app,
      fixture.ownerUser,
      second.body.id as string,
    );

    expect(secondApproval.status).toBe(409);
    expect(secondApproval.body.message).toContain("no longer available");
  });

  test("4) two overlapping pending requests can both exist before approval", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();
    const secondRenter = await createEngineerUser(
      "Overlap Renter",
      "renter-overlap@test.dev",
    );

    const first = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 20),
      endDate: addDays(new Date(), 23),
    });

    const second = await createBookingRequest({
      app,
      authCookie: authCookieForUser(secondRenter),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 21),
      endDate: addDays(new Date(), 24),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const pendingCount = await EquipmentBooking.countDocuments({
      equipment: fixture.equipment._id,
      status: "pending",
    }).exec();

    expect(pendingCount).toBe(2);
  });

  test("5) approving one overlapping pending request auto-declines the other", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();
    const secondRenter = await createEngineerUser(
      "Auto Decline Renter",
      "renter-autodecline@test.dev",
    );

    const first = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 25),
      endDate: addDays(new Date(), 28),
    });

    const second = await createBookingRequest({
      app,
      authCookie: authCookieForUser(secondRenter),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 26),
      endDate: addDays(new Date(), 29),
    });

    const response = await approveBooking(
      app,
      fixture.ownerUser,
      first.body.id as string,
    );

    expect(response.status).toBe(200);

    const firstBooking = await EquipmentBooking.findById(first.body.id).exec();
    const secondBooking = await EquipmentBooking.findById(
      second.body.id,
    ).exec();

    expect(firstBooking?.status).toBe("approved");
    expect(secondBooking?.status).toBe("declined");
  });

  test("6) a booking request with endDate equal/before startDate is rejected", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const startDate = addDays(new Date(), 6);

    const equalDates = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate,
      endDate: startDate,
    });

    expect(equalDates.status).toBe(400);
    expect(equalDates.body.message).toContain(
      "End date must be after start date",
    );
  });

  test("7) a booking request with startDate in the past is rejected", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const response = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), -2),
      endDate: addDays(new Date(), 2),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Start date cannot be in the past");
  });
});

describe("Equipment Booking integration: status transition guards", () => {
  test("8) cannot confirm pickup when booking is unpaid", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 31),
      endDate: addDays(new Date(), 34),
    });

    await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );

    const pickupResponse = await confirmPickup(
      app,
      fixture.renterUser,
      bookingResponse.body.id as string,
    );

    expect(pickupResponse.status).toBe(409);
    expect(pickupResponse.body.message).toContain("Payment must be completed");
  });

  test("9) cannot confirm pickup when booking is not approved", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 35),
      endDate: addDays(new Date(), 38),
    });

    const pickupResponse = await confirmPickup(
      app,
      fixture.renterUser,
      bookingResponse.body.id as string,
    );

    expect(pickupResponse.status).toBe(409);
    expect(pickupResponse.body.message).toContain("approved bookings");
  });

  test("10) cannot confirm return before pickup confirms in_progress", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 39),
      endDate: addDays(new Date(), 42),
    });

    await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );
    await payBooking(
      app,
      fixture.renterUser,
      bookingResponse.body.id as string,
    );

    const returnResponse = await confirmReturn(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );

    expect(returnResponse.status).toBe(409);
    expect(returnResponse.body.message).toContain("active bookings");
  });

  test("11) cannot resolve deposit before booking is completed", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 43),
      endDate: addDays(new Date(), 46),
    });

    await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );

    const resolveResponse = await request(app)
      .patch(
        `/api/equipment-bookings/${bookingResponse.body.id as string}/resolve-deposit`,
      )
      .set("Cookie", authCookieForUser(fixture.ownerUser))
      .send({ resolution: "released" });

    expect(resolveResponse.status).toBe(409);
    expect(resolveResponse.body.message).toContain("after completion");
  });

  test("12) cannot resolve deposit twice", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 47),
      endDate: addDays(new Date(), 50),
    });

    await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );
    await payBooking(
      app,
      fixture.renterUser,
      bookingResponse.body.id as string,
    );
    await confirmPickup(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );
    await confirmReturn(
      app,
      fixture.renterUser,
      bookingResponse.body.id as string,
    );

    const firstResolve = await request(app)
      .patch(
        `/api/equipment-bookings/${bookingResponse.body.id as string}/resolve-deposit`,
      )
      .set("Cookie", authCookieForUser(fixture.ownerUser))
      .send({ resolution: "released" });

    const secondResolve = await request(app)
      .patch(
        `/api/equipment-bookings/${bookingResponse.body.id as string}/resolve-deposit`,
      )
      .set("Cookie", authCookieForUser(fixture.ownerUser))
      .send({ resolution: "released" });

    expect(firstResolve.status).toBe(200);
    expect(secondResolve.status).toBe(409);
    expect(secondResolve.body.message).toContain("already been resolved");
  });

  test("13) renter cannot approve or decline their own booking request", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 51),
      endDate: addDays(new Date(), 54),
    });

    const unauthorizedApprove = await request(app)
      .patch(
        `/api/equipment-bookings/${bookingResponse.body.id as string}/respond`,
      )
      .set("Cookie", authCookieForUser(fixture.renterUser))
      .send({ action: "approve" });

    expect(unauthorizedApprove.status).toBe(403);
    expect(unauthorizedApprove.body.message).toContain("not authorized");
  });

  test("14) owner cannot pay for a booking", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 55),
      endDate: addDays(new Date(), 58),
    });

    await approveBooking(
      app,
      fixture.ownerUser,
      bookingResponse.body.id as string,
    );

    const ownerPayAttempt = await request(app)
      .post(`/api/equipment-bookings/${bookingResponse.body.id as string}/pay`)
      .set("Cookie", authCookieForUser(fixture.ownerUser))
      .send({});

    expect(ownerPayAttempt.status).toBe(403);
    expect(ownerPayAttempt.body.message).toContain("Only the renter can pay");
  });

  test("15) renter can review only after completion and deposit resolution", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 59),
      endDate: addDays(new Date(), 62),
    });

    const bookingId = bookingResponse.body.id as string;

    await approveBooking(app, fixture.ownerUser, bookingId);
    await payBooking(app, fixture.renterUser, bookingId);
    await confirmPickup(app, fixture.ownerUser, bookingId);
    await confirmReturn(app, fixture.renterUser, bookingId);

    const beforeResolve = await request(app)
      .get(`/api/equipment-bookings/${bookingId}/can-review`)
      .set("Cookie", authCookieForUser(fixture.renterUser));

    expect(beforeResolve.status).toBe(200);
    expect(beforeResolve.body.canReview).toBe(false);
    expect(beforeResolve.body.reason).toContain("Deposit");

    await resolveDeposit(app, fixture.ownerUser, bookingId);

    const afterResolve = await request(app)
      .get(`/api/equipment-bookings/${bookingId}/can-review`)
      .set("Cookie", authCookieForUser(fixture.renterUser));

    expect(afterResolve.status).toBe(200);
    expect(afterResolve.body.canReview).toBe(true);
    expect(afterResolve.body.alreadyReviewed).toBe(false);
  });

  test("16) renter can submit one equipment review and owner can reply", async () => {
    const app = createTestApp();
    const fixture = await createBaseFixture();

    const bookingResponse = await createBookingRequest({
      app,
      authCookie: authCookieForUser(fixture.renterUser),
      equipmentId: fixture.equipment._id.toString(),
      startDate: addDays(new Date(), 63),
      endDate: addDays(new Date(), 66),
    });

    const bookingId = bookingResponse.body.id as string;

    await approveBooking(app, fixture.ownerUser, bookingId);
    await payBooking(app, fixture.renterUser, bookingId);
    await confirmPickup(app, fixture.ownerUser, bookingId);
    await confirmReturn(app, fixture.renterUser, bookingId);
    await resolveDeposit(app, fixture.ownerUser, bookingId);

    const createReviewResponse = await request(app)
      .post("/api/reviews/equipment")
      .set("Cookie", authCookieForUser(fixture.renterUser))
      .send({
        bookingId,
        rating: 5,
        reviewText: "Excellent handover and accurate listing.",
      });

    expect(createReviewResponse.status).toBe(201);
    expect(createReviewResponse.body.review.rating).toBe(5);
    expect(createReviewResponse.body.review.projectId).toBeNull();
    expect(createReviewResponse.body.review.equipmentBookingId).toBe(bookingId);

    const duplicateAttempt = await request(app)
      .post("/api/reviews/equipment")
      .set("Cookie", authCookieForUser(fixture.renterUser))
      .send({
        bookingId,
        rating: 4,
        reviewText: "Second review should fail.",
      });

    expect(duplicateAttempt.status).toBe(409);

    const equipmentReviews = await request(app)
      .get(`/api/equipment/${fixture.equipment._id.toString()}/reviews`)
      .set("Cookie", authCookieForUser(fixture.renterUser));

    expect(equipmentReviews.status).toBe(200);
    expect(equipmentReviews.body.totalReviews).toBe(1);
    expect(equipmentReviews.body.averageRating).toBe(5);
    expect(equipmentReviews.body.reviews[0].reviewText).toContain(
      "Excellent handover",
    );

    const reviewId = createReviewResponse.body.review.id as string;
    const replyResponse = await request(app)
      .patch(`/api/reviews/${reviewId}/reply`)
      .set("Cookie", authCookieForUser(fixture.ownerUser))
      .send({ reply: "Thanks for the feedback." });

    expect(replyResponse.status).toBe(200);
    expect(replyResponse.body.review.engineerReply).toBe(
      "Thanks for the feedback.",
    );

    const canReviewAfterSubmit = await request(app)
      .get(`/api/equipment-bookings/${bookingId}/can-review`)
      .set("Cookie", authCookieForUser(fixture.renterUser));

    expect(canReviewAfterSubmit.status).toBe(200);
    expect(canReviewAfterSubmit.body.canReview).toBe(false);
    expect(canReviewAfterSubmit.body.alreadyReviewed).toBe(true);
  });
});
