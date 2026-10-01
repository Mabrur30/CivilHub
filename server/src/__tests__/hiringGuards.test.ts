import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose, { type Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Bid } from "../models/Bid.model";
import { Notification } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { type IUser, User } from "../models/User.model";
import bidsRouter from "../routes/bids.routes";
import bidInvitationsRouter from "../routes/bidInvitations.routes";
import { BidInvitation } from "../models/BidInvitation.model";
import organisationRouter from "../routes/organisation.routes";
import projectsRouter from "../routes/projects.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let rival: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;
const as = (user: IUser, req: request.Test): request.Test => req.set("Cookie", cookieFor(user));

const openProject = () =>
  Project.create({
    title: "Duplex in Mirpur",
    client: client._id,
    status: "open_for_bids",
    assignedEngineer: null,
    budgetMin: 50_000,
    budgetMax: 150_000,
  });

const pendingBid = (projectId: Types.ObjectId, by: IUser, amount = 100_000) =>
  Bid.create({ project: projectId, engineer: by._id, amount, message: "I can build this", status: "pending" });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/projects", projectsRouter);
  app.use("/api/bids", bidsRouter);
  app.use("/api/bid-invitations", bidInvitationsRouter);
  app.use("/api/organisations", organisationRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Bid, BidInvitation, Notification, Organisation, Project, ProjectPhase, User].map((model) =>
      (model as unknown as mongoose.Model<unknown>).deleteMany({}),
    ),
  );
  client = await User.create({ name: "Nusrat Jahan", email: "c@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "e@test.dev", passwordHash: "x", role: "engineer" });
  rival = await User.create({ name: "Farhan Kabir", email: "r@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Hiring", () => {
  test("two bids accepted at once hire only one engineer", async () => {
    const project = await openProject();
    const bids = await Promise.all([pendingBid(project._id, engineer), pendingBid(project._id, rival, 90_000)]);

    const results = await Promise.all(
      bids.map((bid) => as(client, request(app).patch(`/api/bids/${bid._id.toString()}/accept`))),
    );

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await Bid.countDocuments({ status: "accepted" })).toBe(1);
    const hired = await Project.findById(project._id).exec();
    const winner = await Bid.findOne({ status: "accepted" }).exec();
    expect(hired?.assignedEngineer?.toString()).toBe(winner?.engineer.toString());
    expect(hired?.totalAgreedValue).toBe(winner?.amount);
    expect(await Notification.countDocuments({ type: "bid_accepted" })).toBe(1);
  });

  test("engineers who weren't hired are told", async () => {
    const project = await openProject();
    const [winning] = await Promise.all([pendingBid(project._id, engineer), pendingBid(project._id, rival)]);

    expect((await as(client, request(app).patch(`/api/bids/${winning._id.toString()}/accept`))).status).toBe(200);
    expect(await Notification.countDocuments({ recipient: rival._id, type: "bid_declined" })).toBe(1);
    expect(await Bid.countDocuments({ engineer: rival._id, status: "declined" })).toBe(1);
  });

  test("a banned engineer can't be hired", async () => {
    const project = await openProject();
    const bid = await pendingBid(project._id, engineer);
    await User.updateOne({ _id: engineer._id }, { $set: { status: "banned" } });

    expect((await as(client, request(app).patch(`/api/bids/${bid._id.toString()}/accept`))).status).toBe(409);
    expect((await Project.findById(project._id).exec())?.status).toBe("open_for_bids");
  });

  test("a suspended client's open projects are hidden from engineers", async () => {
    await openProject();
    expect((await request(app).get("/api/projects/open")).body).toHaveLength(1);
    await User.updateOne(
      { _id: client._id },
      { $set: { status: "suspended", suspendedUntil: new Date(Date.now() + 864e5) } },
    );
    expect((await request(app).get("/api/projects/open")).body).toHaveLength(0);
  });
});

describe("Amounts too small to pay online", () => {
  test("a bid too small for its advance to be paid is refused", async () => {
    const project = await openProject();
    const tooSmall = await as(engineer, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 40,
      message: "Cheap",
    });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.message).toMatch(/at least/);

    const enough = await as(engineer, request(app).post("/api/bids")).send({
      projectId: project._id.toString(),
      amount: 50,
      message: "Just enough",
    });
    expect(enough.status).toBe(201);
  });

  test("a phase plan with a phase too small to pay for can't be submitted", async () => {
    const project = await Project.create({
      title: "Boundary wall",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "in-progress",
      totalAgreedValue: 10_000,
    });
    const base = `/api/projects/${project._id.toString()}`;
    const plan = await as(engineer, request(app).post(`${base}/phase-plan`)).send({
      phases: [
        { title: "Survey", description: "Mark out", price: 5, estimatedDueDate: new Date(Date.now() + 864e5).toISOString(), order: 0 },
        { title: "Wall", description: "Build it", price: 9_995, estimatedDueDate: new Date(Date.now() + 2 * 864e5).toISOString(), order: 1 },
      ],
    });
    expect(plan.status).toBe(201);

    const submitted = await as(engineer, request(app).post(`${base}/phase-plan/submit`));
    expect(submitted.status).toBe(400);
    expect(submitted.body.message).toMatch(/Survey is too small/);
  });
});

describe("A company that stops taking projects", () => {
  const makeCompany = async (): Promise<IUser> => {
    const user = await User.create({ name: "Rahman Builders", email: "o@test.dev", passwordHash: "x", role: "organisation" });
    await Organisation.create({
      user: user._id,
      services: ["equipment", "projects"],
      location: "Tongi, Gazipur",
      specialties: ["Civil & site works"],
      teamSize: "11-50",
      yearFounded: 2012,
      phone: "01711000000",
    });
    return user;
  };

  test("can't turn projects off while one is in progress", async () => {
    const company = await makeCompany();
    await Project.create({
      title: "Warehouse",
      client: client._id,
      assignedEngineer: company._id,
      status: "in-progress",
      totalAgreedValue: 100_000,
    });

    const response = await as(company, request(app).patch("/api/organisations/me")).send({ services: ["equipment"] });
    expect(response.status).toBe(409);
    expect((await Organisation.findOne({ user: company._id }).exec())?.services).toContain("projects");
  });

  test("can turn projects off once nothing is running or bid on", async () => {
    const company = await makeCompany();
    const response = await as(company, request(app).patch("/api/organisations/me")).send({ services: ["equipment"] });
    expect(response.status).toBe(200);
    expect(response.body.services).toEqual(["equipment"]);
  });
});

describe("Bid invitations", () => {
  test("the engineer hears they were invited, and the client hears the answer", async () => {
    const project = await openProject();
    const invited = await as(client, request(app).post("/api/bid-invitations")).send({
      projectId: project._id.toString(),
      engineerId: engineer._id.toString(),
    });
    expect(invited.status).toBe(201);
    const invite = await Notification.findOne({ recipient: engineer._id, type: "bid_invitation" }).exec();
    expect(invite?.message).toMatch(/Nusrat Jahan invited you to bid on Duplex in Mirpur/);

    const accepted = await as(engineer, request(app).patch(`/api/bid-invitations/${invited.body.id as string}/accept`)).send({
      amount: 120_000,
      message: "Happy to take this on",
    });
    expect(accepted.status).toBe(200);
    const answer = await Notification.findOne({ recipient: client._id, type: "bid_invitation_answered" }).exec();
    expect(answer?.message).toMatch(/Tanvir Alam accepted your invitation/);
  });

  test("a declined invitation is reported to the client", async () => {
    const project = await openProject();
    const invited = await as(client, request(app).post("/api/bid-invitations")).send({
      projectId: project._id.toString(),
      engineerId: rival._id.toString(),
    });
    const declined = await as(rival, request(app).patch(`/api/bid-invitations/${invited.body.id as string}/decline`));
    expect(declined.status).toBe(200);
    const answer = await Notification.findOne({ recipient: client._id, type: "bid_invitation_answered" }).exec();
    expect(answer?.message).toMatch(/Farhan Kabir declined your invitation/);
  });
});
