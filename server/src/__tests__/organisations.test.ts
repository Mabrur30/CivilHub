import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Bid } from "../models/Bid.model";
import { BidInvitation } from "../models/BidInvitation.model";
import { Client } from "../models/Client.model";
import { Connection } from "../models/Connection.model";
import { Conversation } from "../models/Conversation.model";
import { Engineer } from "../models/Engineer.model";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import {
  Organisation,
  type OrganisationService,
} from "../models/Organisation.model";
import { Payment } from "../models/Payment.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { type IUser, User } from "../models/User.model";
import authRouter from "../routes/auth.routes";
import bidInvitationsRouter from "../routes/bidInvitations.routes";
import bidsRouter from "../routes/bids.routes";
import conversationsRouter from "../routes/conversations.routes";
import costEstimatorRouter from "../routes/costEstimator.routes";
import engineerRouter from "../routes/engineer.routes";
import equipmentRouter from "../routes/equipment.routes";
import equipmentBookingRouter from "../routes/equipmentBooking.routes";
import organisationRouter from "../routes/organisation.routes";
import paymentsRouter from "../routes/payments.routes";
import projectsRouter from "../routes/projects.routes";
import userRouter from "../routes/user.routes";
import {
  installFakeGateway,
  payViaGateway,
  type FakeGateway,
} from "./helpers/fakeGateway";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let gateway: FakeGateway;
let client: IUser;
let engineer: IUser;
let plantHire: IUser;
let builder: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const as = (user: IUser, req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(user));

const makeCompany = async (
  name: string,
  email: string,
  services: OrganisationService[],
): Promise<IUser> => {
  const user = await User.create({ name, email, passwordHash: "x", role: "organisation" });
  await Organisation.create({
    user: user._id,
    services,
    location: "Tongi, Gazipur",
    specialties: ["Civil & site works"],
    teamSize: "11-50",
    yearFounded: 2012,
    phone: "01711000000",
  });
  return user;
};

const openProject = () =>
  Project.create({
    title: "Warehouse slab in Savar",
    client: client._id,
    clientName: client.name,
    status: "open_for_bids",
    category: "Industrial",
    location: "Savar",
    budgetMin: 400000,
    budgetMax: 600000,
  });

const someListing = (owner: IUser): Promise<IEquipment> =>
  Equipment.create({
    owner: owner._id,
    title: "Excavator 20t",
    description: "Tracked excavator",
    category: "Excavator",
    dailyRate: 10_000,
    securityDeposit: 20_000,
    location: "Mirpur, Dhaka",
    photos: [{ url: "https://example.test/x.jpg", publicId: "x" }],
  });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  gateway = installFakeGateway();
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/bids", bidsRouter);
  app.use("/api/bid-invitations", bidInvitationsRouter);
  app.use("/api/engineers", engineerRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/cost-estimator", costEstimatorRouter);
  app.use("/api/users", userRouter);
  app.use("/api/equipment", equipmentRouter);
  app.use("/api", equipmentBookingRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/organisations", organisationRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  gateway.restore();
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [
      Bid, BidInvitation, Client, Connection, Conversation, Engineer, Equipment, EquipmentBooking,
      Notification, Organisation, Payment, Project, ProjectPhase, User,
    ].map((model) => (model as unknown as mongoose.Model<unknown>).deleteMany({})),
  );
  client = await User.create({ name: "Nusrat Jahan", email: "client@test.dev", passwordHash: "x", role: "client" });
  await Client.create({ user: client._id });
  engineer = await User.create({ name: "Tanvir Alam", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
  await Engineer.create({ user: engineer._id });
  plantHire = await makeCompany("Rahman Plant Hire", "hire@test.dev", ["equipment"]);
  builder = await makeCompany("BuildRight Ltd", "build@test.dev", ["projects"]);
});

describe("Company signup", () => {
  test("a company signs up with what it offers and gets a company profile", async () => {
    const response = await request(app).post("/api/auth/signup").send({
      name: "Delta Cranes",
      email: "delta@test.dev",
      password: "long-enough-1",
      role: "organisation",
      services: ["equipment", "projects", "equipment"],
      disciplines: ["Civil & site works", "Structural"],
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ role: "organisation", services: ["equipment", "projects"] });

    const profile = await Organisation.findOne({ user: response.body.id }).exec();
    expect(profile?.services).toEqual(["equipment", "projects"]);
  });

  test("a company must say what it does", async () => {
    const base = { name: "Delta", email: "d@test.dev", password: "long-enough-1", role: "organisation" };
    expect((await request(app).post("/api/auth/signup").send(base)).status).toBe(400);
    expect((await request(app).post("/api/auth/signup").send({ ...base, services: [] })).status).toBe(400);
    expect((await request(app).post("/api/auth/signup").send({ ...base, services: ["hiring"] })).status).toBe(400);
    expect(await User.countDocuments({ email: "d@test.dev" })).toBe(0);
  });

  test("the company edits its own profile, including its name", async () => {
    const updated = await as(plantHire, request(app).patch("/api/organisations/me")).send({
      name: "Rahman Plant Hire Ltd",
      about: "Excavators and cranes across Dhaka division.",
      services: ["equipment", "projects"],
      serviceAreas: ["Dhaka", "Gazipur", "Dhaka"],
      tradeLicenceNo: "TRAD/DNCC/012345/2020",
      yearFounded: 2008,
      teamSize: "51-200",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: "Rahman Plant Hire Ltd",
      services: ["equipment", "projects"],
      serviceAreas: ["Dhaka", "Gazipur"],
      teamSize: "51-200",
    });
    expect((await User.findById(plantHire._id).exec())?.name).toBe("Rahman Plant Hire Ltd");

    expect((await as(plantHire, request(app).patch("/api/organisations/me")).send({ teamSize: "huge" })).status).toBe(400);
    expect((await as(engineer, request(app).get("/api/organisations/me"))).status).toBe(403);
  });
});

describe("What a company can do depends on its services", () => {
  test("only companies that take on projects get the cost estimator", async () => {
    const history = (user: IUser) => as(user, request(app).get("/api/cost-estimator/history"));
    const rental = await history(plantHire);
    expect(rental.status).toBe(403);
    expect(rental.body.message).toMatch(/cost estimator is for project work/);
    expect((await as(plantHire, request(app).post("/api/cost-estimator/predict")).send({})).status).toBe(403);

    expect((await history(builder)).status).toBe(200);
    expect((await history(engineer)).status).toBe(200);
    expect((await history(client)).status).toBe(200);
  });

  test("a rental-only company can list equipment but not bid", async () => {
    const project = await openProject();
    const bid = await as(plantHire, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 500000,
      message: "We can do it",
    });
    expect(bid.status).toBe(403);
    expect(bid.body.message).toMatch(/doesn't offer project work/);

    // Allowed through to validation (no photos attached), not refused.
    const listing = await as(plantHire, request(app).post("/api/equipment")).field("title", "Crane");
    expect(listing.status).toBe(400);
    expect((await as(plantHire, request(app).get("/api/equipment/mine"))).status).toBe(200);
  });

  test("a project company can bid but not list equipment", async () => {
    const listing = await as(builder, request(app).post("/api/equipment")).field("title", "Crane");
    expect(listing.status).toBe(403);
    expect(listing.body.message).toMatch(/doesn't offer equipment rental/);

    const project = await openProject();
    const bid = await as(builder, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 500000,
      message: "Slab and columns, 10 weeks",
    });
    expect(bid.status).toBe(201);

    const clientView = await as(client, request(app).get("/api/bids/my-projects-bids"));
    expect(clientView.body[0].bids[0]).toMatchObject({ engineerName: "BuildRight Ltd", isCompany: true });
  });

  test("every company can rent equipment", async () => {
    const excavator = await someListing(engineer);
    for (const company of [plantHire, builder]) {
      const booking = await as(company, request(app).post("/api/equipment-bookings")).send({
        equipmentId: excavator._id.toString(),
        startDate: company === plantHire ? "2030-03-01" : "2030-04-01",
        endDate: company === plantHire ? "2030-03-02" : "2030-04-02",
      });
      expect(booking.status).toBe(201);
    }

    const detail = await as(client, request(app).get(`/api/equipment/${(await someListing(plantHire))._id.toString()}`));
    expect(detail.body.owner).toMatchObject({ name: "Rahman Plant Hire", isCompany: true });
  });
});

describe("Messaging and discovery", () => {
  test("a client can message a company directly; another provider needs a connection", async () => {
    expect((await as(client, request(app).get(`/api/conversations/with/${builder._id.toString()}`))).status).toBe(201);
    expect((await as(engineer, request(app).get(`/api/conversations/with/${builder._id.toString()}`))).status).toBe(403);
  });

  test("Browse Engineers lists project companies alongside engineers, and can filter", async () => {
    const all = await as(client, request(app).get("/api/engineers/search"));
    const names = (all.body.engineers as Array<{ name: string }>).map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(["BuildRight Ltd", "Tanvir Alam"]));
    expect(names).not.toContain("Rahman Plant Hire");

    const companies = await as(client, request(app).get("/api/engineers/search").query({ type: "company" }));
    expect(companies.body.engineers).toHaveLength(1);
    expect(companies.body.engineers[0]).toMatchObject({
      name: "BuildRight Ltd",
      role: "organisation",
      location: "Tongi, Gazipur",
      specialty: "Civil & site works",
      teamSize: "11-50",
    });

    const engineers = await as(client, request(app).get("/api/engineers/search").query({ type: "engineer" }));
    expect((engineers.body.engineers as Array<{ role: string }>).every((item) => item.role === "engineer")).toBe(true);
  });

  test("a company's public profile shows its company details and listings", async () => {
    await someListing(plantHire);
    const profile = await as(client, request(app).get(`/api/users/${plantHire._id.toString()}/public-profile`));
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({
      name: "Rahman Plant Hire",
      role: "organisation",
      company: { services: ["equipment"], teamSize: "11-50", yearFounded: 2012, phone: "" },
    });
    expect(profile.body.equipment).toHaveLength(1);
    // Same shape as engineers and clients, so shared profile cards accept it.
    expect(profile.body.bio).toBe(profile.body.company.about);
  });

  test("a client can invite a project company to bid, but not a rental-only one", async () => {
    const project = await openProject();
    const invite = (company: IUser) =>
      as(client, request(app).post("/api/bid-invitations")).send({
        projectId: project._id.toString(),
        engineerId: company._id.toString(),
      });
    expect((await invite(builder)).status).toBe(201);
    expect((await invite(plantHire)).status).toBe(404);

    const pending = await as(builder, request(app).get("/api/bid-invitations/engineer/pending"));
    expect(pending.status).toBe(200);
    expect(pending.body.invitations ?? pending.body).toHaveLength(1);
  });
});

describe("A company wins and runs a project", () => {
  test("bid, accept, phase plan and a paid advance with the company as payee", async () => {
    const project = await openProject();
    const bid = await as(builder, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 500000,
      message: "Slab and columns, 10 weeks",
    });
    expect((await as(client, request(app).patch(`/api/bids/${bid.body.id as string}/accept`))).status).toBe(200);

    const base = `/api/projects/${project._id.toString()}`;
    const plan = await as(builder, request(app).post(`${base}/phase-plan`)).send({
      phases: [
        { title: "Foundation", description: "Footings", price: 200000, estimatedDueDate: "2030-01-10", order: 0 },
        { title: "Slab", description: "Slab and columns", price: 300000, estimatedDueDate: "2030-02-20", order: 1 },
      ],
    });
    expect(plan.status).toBe(201);
    expect((await as(builder, request(app).post(`${base}/phase-plan/submit`))).status).toBe(200);
    expect(
      (await as(client, request(app).post(`${base}/phase-plan/approve`)).send({ paymentPlan: "phase_by_phase" })).status,
    ).toBe(200);

    const paid = await payViaGateway(app, gateway, cookieFor(client), {
      purpose: "advance",
      projectId: project._id.toString(),
    });
    expect(paid.callback?.status).toBe(303);

    const payment = await Payment.findOne({ tranId: paid.tranId }).exec();
    expect(payment?.payee?.toString()).toBe(builder._id.toString());
    expect(payment).toMatchObject({ status: "paid", amount: 100000, platformFee: 10000, payeeAmount: 90000 });

    // Work starts once the client has funded the phase into CivilHub's hold.
    const phases = (plan.body.phases as Array<{ id: string }>).map((phase) => phase.id);
    const start = () => as(builder, request(app).patch(`${base}/phases/${phases[0]}`)).send({ status: "in_progress" });
    expect((await start()).status).toBe(409);
    const funded = await payViaGateway(app, gateway, cookieFor(client), {
      purpose: "phase",
      projectId: project._id.toString(),
      phaseId: phases[0],
    });
    expect(funded.callback?.status).toBe(303);
    expect((await Payment.findOne({ tranId: funded.tranId }).exec())?.payee?.toString()).toBe(builder._id.toString());
    expect((await start()).status).toBe(200);
  });
});
