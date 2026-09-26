import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { CustomerReview } from "../models/CustomerReview.model";
import { Engineer } from "../models/Engineer.model";
import { Equipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Review } from "../models/Review.model";
import { type IUser, User } from "../models/User.model";
import authRouter from "../routes/auth.routes";
import engineerRouter from "../routes/engineer.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import projectsRouter from "../routes/projects.routes";
import reviewsRouter from "../routes/reviews.routes";
import userRouter from "../routes/user.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let plantHire: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(user));

const profileOf = (viewer: IUser, user: IUser | string) =>
  as(
    viewer,
    request(app).get(
      `/api/users/${typeof user === "string" ? user : user._id.toString()}/public-profile`,
    ),
  );

/** A finished project between the client and a provider, fully paid. */
const finishedProject = async (provider: IUser, title = "Duplex in Mirpur") => {
  const project = await Project.create({
    title,
    client: client._id,
    assignedEngineer: provider._id,
    status: "completed",
    completedAt: new Date(),
    totalAgreedValue: 850000,
    category: "Residential",
    location: "Mirpur, Dhaka",
    phasePlanStatus: "approved",
    paymentPlan: "phase_by_phase",
    advancePaid: true,
  });
  await ProjectPhase.create({
    project: project._id,
    name: "Build",
    order: 0,
    price: 850000,
    status: "completed",
    paymentStatus: "paid",
  });
  return project;
};

/** A finished rental of the plant-hire firm's excavator, deposit settled. */
const finishedRental = async (
  renter: IUser,
  depositResolution: "pending" | "released" | "claimed" = "released",
) => {
  const excavator = await Equipment.create({
    owner: plantHire._id,
    title: "CAT 320 excavator",
    description: "Tracked excavator",
    category: "Excavator",
    location: "Gazipur",
    dailyRate: 18000,
    securityDeposit: 30000,
    quantity: 1,
    photos: [{ url: "https://example.test/cat.jpg", publicId: "cat" }],
  });
  const day = (offset: number) => new Date(Date.UTC(2026, 8, 1 + offset));
  const booking = await EquipmentBooking.create({
    equipment: excavator._id,
    renter: renter._id,
    owner: plantHire._id,
    startDate: day(0),
    endDate: day(1),
    units: 1,
    rentalDays: 2,
    rentalFee: 36000,
    totalRentalFee: 36000,
    securityDeposit: 30000,
    status: "completed",
    paymentStatus: "paid",
    depositResolution,
  });
  return { excavator, booking };
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/engineers", engineerRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/users", userRouter);
  app.use("/api", equipmentBookingRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [CustomerReview, Engineer, Equipment, EquipmentBooking, Notification, Organisation, Project, ProjectPhase, Review, User].map(
      (model) => (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  const passwordHash = await bcrypt.hash("current-pass-1", 4);
  client = await User.create({ name: "Nusrat Jahan", email: "nusrat@test.dev", passwordHash, role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "tanvir@test.dev", passwordHash, role: "engineer" });
  plantHire = await User.create({ name: "Rahman Plant Hire", email: "rahman@test.dev", passwordHash, role: "organisation" });
  await Organisation.create({ user: plantHire._id, services: ["equipment"] });
  await Engineer.create({
    user: engineer._id,
    location: "Mirpur, Dhaka",
    certificates: [
      {
        title: "IEB membership",
        fileUrl: "https://example.test/ieb.pdf",
        publicId: "ieb",
        resourceType: "raw",
      },
    ],
  });
});

describe("Public profiles", () => {
  test("a link with a malformed id is a 404, not a server error", async () => {
    const response = await profileOf(client, "not-an-id");
    expect(response.status).toBe(404);
  });

  test("an engineer's profile shows delivered work without the price, and openable certificates", async () => {
    await finishedProject(engineer);
    const response = await profileOf(client, engineer);

    expect(response.status).toBe(200);
    expect(typeof response.body.memberSince).toBe("string");
    expect(response.body.completedWork).toEqual([
      expect.objectContaining({ title: "Duplex in Mirpur", category: "Residential" }),
    ]);
    expect(response.body.completedWork[0]).not.toHaveProperty("contractValue");
    expect(response.body.certificates[0]).toMatchObject({
      title: "IEB membership",
      fileUrl: "https://example.test/ieb.pdf",
    });
    expect(response.body.equipment).toEqual([]);
  });

  test("a rental-only company leads with its equipment rating", async () => {
    const { booking } = await finishedRental(client);
    await Review.create({
      equipmentBooking: booking._id,
      client: client._id,
      engineer: plantHire._id,
      rating: 4,
      reviewText: "Machine arrived on time",
    });

    const profile = await profileOf(client, plantHire);
    expect(profile.body).toMatchObject({
      rating: 4,
      reviewCount: 1,
      ratingKind: "equipment",
      ratings: { project: { rating: null, count: 0 }, equipment: { rating: 4, count: 1 } },
    });
    expect(profile.body.equipment).toHaveLength(1);

    const reviews = await as(client, request(app).get(`/api/engineers/${plantHire._id.toString()}/reviews`));
    expect(reviews.body.totalReviews).toBe(1);
    expect(reviews.body.byKind.equipment.totalReviews).toBe(1);
    expect(reviews.body.reviews[0]).toMatchObject({ kind: "equipment", equipmentTitle: "CAT 320 excavator" });
  });
});

describe("Disciplines", () => {
  test("engineers pick up to three from the list, and search finds them by it", async () => {
    const tooMany = await as(engineer, request(app).patch("/api/engineers/me")).send({
      disciplines: ["Structural", "MEP", "Surveying", "Geotechnical"],
    });
    expect(tooMany.status).toBe(400);
    const unknown = await as(engineer, request(app).patch("/api/engineers/me")).send({
      disciplines: ["Wizardry"],
    });
    expect(unknown.status).toBe(400);

    const saved = await as(engineer, request(app).patch("/api/engineers/me")).send({
      disciplines: ["Structural", "Geotechnical"],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.disciplines).toEqual(["Structural", "Geotechnical"]);

    const search = await as(client, request(app).get("/api/engineers/search?category=geotech"));
    expect(search.body.engineers).toHaveLength(1);
    expect(search.body.engineers[0]).toMatchObject({
      name: "Tanvir Alam",
      specialty: "Structural",
      certificateCount: 1,
      location: "Mirpur, Dhaka",
    });
    expect(search.body.engineers[0]).not.toHaveProperty("isVerified");

    const none = await as(client, request(app).get("/api/engineers/search?category=MEP"));
    expect(none.body.engineers).toHaveLength(0);
  });
});

describe("Reviewing clients and renters", () => {
  const reviewCustomer = (author: IUser, body: Record<string, unknown>) =>
    as(author, request(app).post("/api/reviews/customer")).send({
      rating: 5,
      reviewText: "Clear brief and paid promptly",
      ...body,
    });

  test("the engineer who delivered a finished project can rate the client once", async () => {
    const project = await finishedProject(engineer);
    const projectId = project._id.toString();

    const byClient = await reviewCustomer(client, { projectId });
    expect(byClient.status).toBe(403);

    const review = await reviewCustomer(engineer, { projectId });
    expect(review.status).toBe(201);
    expect(review.body.review).toMatchObject({
      rating: 5,
      context: "project",
      title: "Duplex in Mirpur",
      author: { name: "Tanvir Alam", role: "engineer" },
    });
    expect((await reviewCustomer(engineer, { projectId })).status).toBe(409);

    expect(
      await Notification.countDocuments({ recipient: client._id, type: "customer_review_received" }),
    ).toBe(1);

    const profile = await profileOf(engineer, client);
    expect(profile.body).toMatchObject({ rating: 5, reviewCount: 1 });

    const listed = await as(engineer, request(app).get(`/api/users/${client._id.toString()}/customer-reviews`));
    expect(listed.body.totalReviews).toBe(1);

    const progress = await as(engineer, request(app).get(`/api/projects/${projectId}/progress`));
    expect(progress.body.completion.customerReview).toMatchObject({ rating: 5 });
  });

  test("a client can't be rated before the project is finished", async () => {
    const project = await finishedProject(engineer);
    await ProjectPhase.updateOne({ project: project._id }, { $set: { status: "awaiting_approval" } });
    const early = await reviewCustomer(engineer, { projectId: project._id.toString() });
    expect(early.status).toBe(409);
  });

  test("the owner rates the renter once the rental is done and the deposit settled", async () => {
    const pending = await finishedRental(engineer, "pending");
    const tooSoon = await reviewCustomer(plantHire, { bookingId: pending.booking._id.toString() });
    expect(tooSoon.status).toBe(409);

    const { booking } = await finishedRental(engineer);
    const bookingId = booking._id.toString();
    expect((await reviewCustomer(engineer, { bookingId })).status).toBe(403);

    const review = await reviewCustomer(plantHire, { bookingId, rating: 4 });
    expect(review.status).toBe(201);
    expect(review.body.review).toMatchObject({ context: "rental", title: "CAT 320 excavator" });

    const detail = await as(plantHire, request(app).get(`/api/equipment-bookings/${bookingId}`));
    expect(detail.body.ownerReview).toMatchObject({ rating: 4 });

    // The engineer's rating as a provider is untouched by how they rent.
    const profile = await profileOf(client, engineer);
    expect(profile.body.rating).toBeNull();
  });

  test("a review needs exactly one of a project or a booking, and a rating from 1 to 5", async () => {
    const project = await finishedProject(engineer);
    expect((await reviewCustomer(engineer, {})).status).toBe(400);
    expect((await reviewCustomer(engineer, { projectId: project._id.toString(), rating: 6 })).status).toBe(400);
  });
});

describe("Account settings", () => {
  const patch = (path: string, body: Record<string, unknown>) =>
    as(engineer, request(app).patch(`/api/auth/me${path}`)).send(body);

  test("the name can be changed", async () => {
    expect((await patch("", { name: " " })).status).toBe(400);
    const renamed = await patch("", { name: "Tanvir Alam, P.Eng" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Tanvir Alam, P.Eng");
  });

  test("changing email needs the current password and a free address", async () => {
    expect((await patch("/email", { email: "new@test.dev", currentPassword: "wrong" })).status).toBe(401);
    expect((await patch("/email", { email: "nusrat@test.dev", currentPassword: "current-pass-1" })).status).toBe(409);
    expect((await patch("/email", { email: "not an email", currentPassword: "current-pass-1" })).status).toBe(400);

    const changed = await patch("/email", { email: "New@Test.dev", currentPassword: "current-pass-1" });
    expect(changed.status).toBe(200);
    expect(changed.body.email).toBe("new@test.dev");
  });

  test("changing password needs the current one, and the new one works for login", async () => {
    expect((await patch("/password", { currentPassword: "current-pass-1", newPassword: "short" })).status).toBe(400);
    expect((await patch("/password", { currentPassword: "wrong", newPassword: "brand-new-pass" })).status).toBe(401);
    expect((await patch("/password", { currentPassword: "current-pass-1", newPassword: "brand-new-pass" })).status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ email: "tanvir@test.dev", password: "current-pass-1" });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ email: "tanvir@test.dev", password: "brand-new-pass" });
    expect(newLogin.status).toBe(200);
  });
});
