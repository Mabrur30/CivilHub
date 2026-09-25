import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { type IProject, Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { type IUser, User } from "../models/User.model";
import projectsRouter from "../routes/projects.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const asClient = (req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(client));
const asEngineer = (req: request.Test): request.Test =>
  req.set("Cookie", cookieFor(engineer));

interface PhaseInput {
  title: string;
  price: number;
}

/** Runs a project through planning to an approved plan, ready for the advance. */
const createApprovedProject = async (
  total: number,
  phases: PhaseInput[],
  paymentPlan: "phase_by_phase" | "full_upfront",
): Promise<{ project: IProject; phaseIds: string[] }> => {
  const project = await Project.create({
    title: "Duplex in Mirpur",
    client: client._id,
    assignedEngineer: engineer._id,
    status: "in-progress",
    totalAgreedValue: total,
  });
  const base = `/api/projects/${project._id.toString()}`;

  const plan = await asEngineer(request(app).post(`${base}/phase-plan`)).send({
    phases: phases.map((phase, index) => ({
      title: phase.title,
      description: `${phase.title} work`,
      price: phase.price,
      estimatedDueDate: new Date(Date.now() + (index + 1) * 864e5).toISOString(),
      order: index,
    })),
  });
  expect(plan.status).toBe(201);
  expect((await asEngineer(request(app).post(`${base}/phase-plan/submit`))).status).toBe(200);
  expect(
    (await asClient(request(app).post(`${base}/phase-plan/approve`)).send({ paymentPlan })).status,
  ).toBe(200);

  const phaseIds = (plan.body.phases as Array<{ id: string }>).map((phase) => phase.id);
  return { project, phaseIds };
};

const setStatus = (projectId: string, phaseId: string, status: string) =>
  asEngineer(request(app).patch(`/api/projects/${projectId}/phases/${phaseId}`)).send({ status });

const approve = (projectId: string, phaseId: string) =>
  asClient(request(app).post(`/api/projects/${projectId}/phases/${phaseId}/approve`));

const payAdvance = (projectId: string) =>
  asClient(request(app).post(`/api/projects/${projectId}/payments/advance`));

/** Engineer starts and submits a phase, client approves it. */
const deliverPhase = async (projectId: string, phaseId: string) => {
  expect((await setStatus(projectId, phaseId, "in_progress")).status).toBe(200);
  expect((await setStatus(projectId, phaseId, "awaiting_approval")).status).toBe(200);
  return approve(projectId, phaseId);
};

const totalPaid = async (projectId: string): Promise<number> => {
  const payments = await Payment.find({ project: projectId }).exec();
  return Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/projects", projectsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Notification.deleteMany({}),
    Payment.deleteMany({}),
    Project.deleteMany({}),
    ProjectPhase.deleteMany({}),
    User.deleteMany({}),
  ]);
  client = await User.create({ name: "Nusrat Jahan", email: "nusrat@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Alam", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
});

describe("Phase-by-phase payments", () => {
  test("the advance plus every phase adds up to exactly the agreed value", async () => {
    const { project, phaseIds } = await createApprovedProject(
      10000.01,
      [
        { title: "Foundation", price: 3333.33 },
        { title: "Frame", price: 3333.34 },
        { title: "Finishing", price: 3333.34 },
      ],
      "phase_by_phase",
    );
    const id = project._id.toString();

    const plan = await asClient(request(app).get(`/api/projects/${id}/phase-plan`));
    expect(plan.body.advanceAmount).toBe(2000);
    const dueTotal = (plan.body.phases as Array<{ amountDue: number }>).reduce(
      (sum, phase) => sum + phase.amountDue,
      0,
    );
    expect(Math.round(dueTotal * 100) / 100).toBe(8000.01);

    expect((await payAdvance(id)).status).toBe(200);
    for (const phaseId of phaseIds) {
      const approved = await deliverPhase(id, phaseId);
      expect(approved.status).toBe(200);
    }

    expect(await totalPaid(id)).toBe(10000.01);
    const finished = await Project.findById(id).exec();
    expect(finished?.status).toBe("completed");
    expect(finished?.progressPercentage).toBe(100);
  });

  test("approving charges the phase's share, and a second approve charges nothing", async () => {
    const { project, phaseIds } = await createApprovedProject(
      5000,
      [
        { title: "Survey", price: 1000 },
        { title: "Build", price: 4000 },
      ],
      "phase_by_phase",
    );
    const id = project._id.toString();
    await payAdvance(id);

    const first = await deliverPhase(id, phaseIds[0]);
    expect(first.status).toBe(200);
    expect(first.body.amountCharged).toBe(800);

    const again = await approve(id, phaseIds[0]);
    expect(again.status).toBe(409);
    expect(await Payment.countDocuments({ project: id, type: "phase" })).toBe(1);
  });

  test("two approvals racing for the same phase create one payment", async () => {
    const { project, phaseIds } = await createApprovedProject(
      2000,
      [{ title: "Survey", price: 2000 }],
      "phase_by_phase",
    );
    const id = project._id.toString();
    await payAdvance(id);
    await setStatus(id, phaseIds[0], "in_progress");
    await setStatus(id, phaseIds[0], "awaiting_approval");

    const results = await Promise.all([approve(id, phaseIds[0]), approve(id, phaseIds[0])]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await Payment.countDocuments({ project: id, type: "phase" })).toBe(1);
  });

  test("the advance can only be paid once", async () => {
    const { project } = await createApprovedProject(1000, [{ title: "Survey", price: 1000 }], "phase_by_phase");
    const id = project._id.toString();
    const results = await Promise.all([payAdvance(id), payAdvance(id)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await Payment.countDocuments({ project: id, type: "advance" })).toBe(1);
  });

  test("a phase an engineer completed under the old rules can still be paid", async () => {
    const { project, phaseIds } = await createApprovedProject(1000, [{ title: "Survey", price: 1000 }], "phase_by_phase");
    const id = project._id.toString();
    await payAdvance(id);
    await ProjectPhase.updateOne({ _id: phaseIds[0] }, { $set: { status: "completed", completedAt: new Date() } });

    const settled = await approve(id, phaseIds[0]);
    expect(settled.status).toBe(200);
    expect(settled.body.amountCharged).toBe(800);
    expect(await totalPaid(id)).toBe(1000);
  });
});

describe("Phase status rules", () => {
  let id: string;
  let phaseIds: string[];

  beforeEach(async () => {
    const created = await createApprovedProject(
      3000,
      [
        { title: "Survey", price: 1000 },
        { title: "Build", price: 2000 },
      ],
      "phase_by_phase",
    );
    id = created.project._id.toString();
    phaseIds = created.phaseIds;
  });

  test("work can't start before the advance is paid", async () => {
    const response = await setStatus(id, phaseIds[0], "in_progress");
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/advance/i);
  });

  test("the engineer can't complete a phase, or skip ahead", async () => {
    await payAdvance(id);
    expect((await setStatus(id, phaseIds[0], "completed")).status).toBe(409);
    expect((await setStatus(id, phaseIds[1], "in_progress")).status).toBe(409);
    expect((await setStatus(id, phaseIds[0], "awaiting_approval")).status).toBe(409);
  });

  test("a completed phase can't be reopened", async () => {
    await payAdvance(id);
    await deliverPhase(id, phaseIds[0]);
    expect((await setStatus(id, phaseIds[0], "in_progress")).status).toBe(409);
    expect((await setStatus(id, phaseIds[0], "not_started")).status).toBe(409);
  });

  test("a delayed phase can resume and be submitted", async () => {
    await payAdvance(id);
    expect((await setStatus(id, phaseIds[0], "in_progress")).status).toBe(200);
    expect((await setStatus(id, phaseIds[0], "delayed")).status).toBe(200);
    expect((await setStatus(id, phaseIds[0], "in_progress")).status).toBe(200);
    expect((await setStatus(id, phaseIds[0], "delayed")).status).toBe(200);
    expect((await setStatus(id, phaseIds[0], "awaiting_approval")).status).toBe(200);
  });

  test("requesting changes sends the phase back with the note, and it can be resubmitted", async () => {
    await payAdvance(id);
    await setStatus(id, phaseIds[0], "in_progress");
    await setStatus(id, phaseIds[0], "awaiting_approval");

    const empty = await asClient(
      request(app).post(`/api/projects/${id}/phases/${phaseIds[0]}/request-changes`),
    ).send({ note: "  " });
    expect(empty.status).toBe(400);

    const sentBack = await asClient(
      request(app).post(`/api/projects/${id}/phases/${phaseIds[0]}/request-changes`),
    ).send({ note: "Soil report is missing" });
    expect(sentBack.status).toBe(200);

    const progress = await asEngineer(request(app).get(`/api/projects/${id}/progress`));
    expect(progress.body.phases[0].status).toBe("in_progress");
    expect(progress.body.phases[0].changeRequest.note).toBe("Soil report is missing");
    expect(await Payment.countDocuments({ project: id, type: "phase" })).toBe(0);

    expect((await setStatus(id, phaseIds[0], "awaiting_approval")).status).toBe(200);
    expect((await approve(id, phaseIds[0])).status).toBe(200);
    const after = await asEngineer(request(app).get(`/api/projects/${id}/progress`));
    expect(after.body.phases[0].changeRequest).toBeNull();
  });

  test("only the project's client can approve", async () => {
    await payAdvance(id);
    await setStatus(id, phaseIds[0], "in_progress");
    await setStatus(id, phaseIds[0], "awaiting_approval");
    const byEngineer = await asEngineer(
      request(app).post(`/api/projects/${id}/phases/${phaseIds[0]}/approve`),
    );
    expect(byEngineer.status).toBe(403);
  });
});

describe("Full upfront payments", () => {
  test("approving the final phase collects the remaining balance once", async () => {
    const { project, phaseIds } = await createApprovedProject(
      5000,
      [
        { title: "Survey", price: 1000 },
        { title: "Build", price: 4000 },
      ],
      "full_upfront",
    );
    const id = project._id.toString();
    await payAdvance(id);

    const first = await deliverPhase(id, phaseIds[0]);
    expect(first.body.amountCharged).toBe(0);

    const last = await deliverPhase(id, phaseIds[1]);
    expect(last.status).toBe(200);
    expect(last.body.amountCharged).toBe(4000);

    expect(await totalPaid(id)).toBe(5000);
    expect((await Project.findById(id).exec())?.status).toBe("completed");
  });

  test("a remaining balance paid early isn't charged again at the end", async () => {
    const { project, phaseIds } = await createApprovedProject(2000, [{ title: "Build", price: 2000 }], "full_upfront");
    const id = project._id.toString();
    await payAdvance(id);
    expect((await asClient(request(app).post(`/api/projects/${id}/payments/full-remaining`))).status).toBe(200);

    const last = await deliverPhase(id, phaseIds[0]);
    expect(last.body.amountCharged).toBe(0);
    expect(await totalPaid(id)).toBe(2000);
  });
});

describe("Phase plan feedback", () => {
  test("the rejection reason is kept for the engineer and cleared on resubmit", async () => {
    const project = await Project.create({
      title: "Warehouse",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "in-progress",
      totalAgreedValue: 1000,
    });
    const base = `/api/projects/${project._id.toString()}`;
    const phases = [{ title: "Build", description: "All of it", price: 1000, estimatedDueDate: "2026-12-01", order: 0 }];

    await asEngineer(request(app).post(`${base}/phase-plan`)).send({ phases });
    await asEngineer(request(app).post(`${base}/phase-plan/submit`));
    const rejected = await asClient(request(app).post(`${base}/phase-plan/reject`)).send({ feedback: "Split the build into two phases" });
    expect(rejected.status).toBe(200);

    const plan = await asEngineer(request(app).get(`${base}/phase-plan`));
    expect(plan.body.phasePlanFeedback.note).toBe("Split the build into two phases");

    await asEngineer(request(app).post(`${base}/phase-plan`)).send({ phases });
    await asEngineer(request(app).post(`${base}/phase-plan/submit`));
    const resubmitted = await asEngineer(request(app).get(`${base}/phase-plan`));
    expect(resubmitted.body.phasePlanFeedback).toBeNull();
  });

  test("an unparseable due date is a 400, not a server error", async () => {
    const project = await Project.create({
      title: "Warehouse",
      client: client._id,
      assignedEngineer: engineer._id,
      status: "in-progress",
      totalAgreedValue: 1000,
    });
    const response = await asEngineer(
      request(app).post(`/api/projects/${project._id.toString()}/phase-plan`),
    ).send({
      phases: [{ title: "Build", description: "All of it", price: 1000, estimatedDueDate: "next tuesday-ish", order: 0 }],
    });
    expect(response.status).toBe(400);
  });
});
