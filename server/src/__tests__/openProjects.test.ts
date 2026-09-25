import express, { type Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Project } from "../models/Project.model";
import { User } from "../models/User.model";
import projectsRouter from "../routes/projects.routes";

let memoryServer: MongoMemoryServer;
let app: Express;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use("/api/projects", projectsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([Project.deleteMany({}), User.deleteMany({})]);
});

describe("Open projects for the marketplace", () => {
  test("include budget numbers and target dates for the brief card", async () => {
    const client = await User.create({ name: "Adro Sheikh", email: "adro@test.dev", passwordHash: "x", role: "client" });
    await Project.create({
      title: "Construction of 1-Story Apartment Building (1,400 sq.ft)",
      client: client._id,
      clientName: "Adro Sheikh",
      status: "open_for_bids",
      budgetMin: 4_057_000,
      budgetMax: 4_763_000,
      targetStartDate: new Date("2026-10-01T00:00:00.000Z"),
      targetCompletionDate: new Date("2027-10-01T00:00:00.000Z"),
      location: "Mirpur, Dhaka",
      category: "Residential",
    });
    await Project.create({
      title: "Boundary wall",
      status: "open_for_bids",
      budgetRange: "Budget to be discussed",
    });

    const response = await request(app).get("/api/projects/open");
    expect(response.status).toBe(200);

    const byTitle = Object.fromEntries(
      (response.body as Array<{ title: string }>).map((project) => [project.title, project]),
    );
    expect(byTitle["Construction of 1-Story Apartment Building (1,400 sq.ft)"]).toMatchObject({
      budgetMin: 4_057_000,
      budgetMax: 4_763_000,
      targetStartDate: "2026-10-01T00:00:00.000Z",
      targetCompletionDate: "2027-10-01T00:00:00.000Z",
    });
    expect(byTitle["Boundary wall"]).toMatchObject({
      budgetMin: null,
      budgetMax: null,
      targetStartDate: null,
      targetCompletionDate: null,
      budgetRange: "Budget to be discussed",
    });
  });
});
