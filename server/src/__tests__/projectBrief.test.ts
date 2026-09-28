import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Project } from "../models/Project.model";
import { type IUser, User } from "../models/User.model";
import projectsRouter from "../routes/projects.routes";
import { distanceM } from "../utils/projectSite";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;
let client: IUser;
let engineer: IUser;
let otherEngineer: IUser;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const SITE = { lat: 23.8069, lng: 90.3687 };

const validBrief = {
  title: "Six-storey apartment, Mirpur",
  description: "RCC frame apartment building on a 5 katha plot.",
  category: "Residential",
  budgetMin: 4_000_000,
  budgetMax: 5_000_000,
  targetStartDate: "2030-01-01",
  targetCompletionDate: "2031-01-01",
  servicesNeeded: ["structural_design", "supervision"],
  site: {
    ...SITE,
    district: "Dhaka",
    area: "Mirpur 10",
    addressLine: "House 12, Road 3",
    directions: "Behind the mosque, blue gate",
    vehicleAccess: "limited",
    utilities: ["electricity"],
    documentsAvailable: ["land_deed"],
  },
  requirements: {
    buildingType: "apartment",
    plotArea: { value: 5, unit: "katha" },
    storeys: 6,
    soilTest: "done",
    approval: "approved",
    approvalAuthority: "rajuk",
  },
};

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Project.syncIndexes();
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
  await Promise.all([Project.deleteMany({}), User.deleteMany({})]);
  client = await User.create({ name: "Rumana Akter", email: "rumana@test.dev", passwordHash: "x", role: "client" });
  engineer = await User.create({ name: "Tanvir Hasan", email: "tanvir@test.dev", passwordHash: "x", role: "engineer" });
  otherEngineer = await User.create({ name: "Nabila Karim", email: "nabila@test.dev", passwordHash: "x", role: "engineer" });
});

const postBrief = (body: unknown): request.Test =>
  request(app).post("/api/projects").set("Cookie", cookieFor(client)).send(body as object);

describe("posting a brief with a site and requirements", () => {
  test("stores the site, a nearby public point and a derived location", async () => {
    const response = await postBrief(validBrief);
    expect(response.status).toBe(201);

    const project = await Project.findById(response.body.id).lean().exec();
    expect(project?.location).toBe("Mirpur 10, Dhaka");
    expect(project?.servicesNeeded).toEqual(["structural_design", "supervision"]);
    expect(project?.requirements).toMatchObject({ buildingType: "apartment", storeys: 6 });
    const approx = project?.site?.approxPoint.coordinates ?? [0, 0];
    const distance = distanceM(SITE, { lat: approx[1], lng: approx[0] });
    expect(distance).toBeGreaterThan(140);
    expect(distance).toBeLessThan(420);
  });

  test.each([
    ["no pin", { ...validBrief, site: { district: "Dhaka", area: "Mirpur" } }, /Pin the site/],
    ["an unknown district", { ...validBrief, site: { ...validBrief.site, district: "Narnia" } }, /district/],
    ["a missing required answer", { ...validBrief, requirements: { buildingType: "duplex" } }, /Plot size is required/],
    ["an unknown category", { ...validBrief, category: "Spaceport" }, /category/],
    ["an unknown service", { ...validBrief, servicesNeeded: ["catering"] }, /services/],
  ])("rejects %s", async (_label, body, message) => {
    const response = await postBrief(body);
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(message);
  });
});

describe("who sees the exact site", () => {
  const briefUrl = (id: string): string => `/api/projects/${id}/brief`;

  test("the open list and other engineers only get the approximate area", async () => {
    const { body: created } = await postBrief(validBrief);

    const list = await request(app).get("/api/projects/open");
    expect(list.body[0]).toMatchObject({
      district: "Dhaka",
      siteSummary: "Apartment · 5 katha · 6 storeys · Soil test done",
    });
    expect(JSON.stringify(list.body)).not.toMatch(/House 12|mosque|90\.3687/);

    const brief = await request(app)
      .get(briefUrl(created.id))
      .set("Cookie", cookieFor(otherEngineer));
    expect(brief.status).toBe(200);
    expect(brief.body.canSeeExactSite).toBe(false);
    expect(brief.body.site).toMatchObject({ district: "Dhaka", radiusM: 500 });
    expect(brief.body.site).not.toHaveProperty("exact");
    expect(JSON.stringify(brief.body)).not.toMatch(/House 12|mosque/);
  });

  test("the client and the hired engineer get the pin, address and directions", async () => {
    const { body: created } = await postBrief(validBrief);
    await Project.updateOne(
      { _id: created.id },
      { assignedEngineer: engineer._id, status: "in-progress" },
    );

    for (const viewer of [client, engineer]) {
      const brief = await request(app).get(briefUrl(created.id)).set("Cookie", cookieFor(viewer));
      expect(brief.status).toBe(200);
      expect(brief.body.canSeeExactSite).toBe(true);
      expect(brief.body.site).toMatchObject({
        exact: SITE,
        addressLine: "House 12, Road 3",
        directions: "Behind the mosque, blue gate",
      });
    }

    const progress = await request(app)
      .get(`/api/projects/${created.id}/progress`)
      .set("Cookie", cookieFor(engineer));
    expect(progress.status).toBe(200);
    expect(progress.body.project.site).toMatchObject({ exact: SITE });
    expect(progress.body.project.requirements).toMatchObject({ storeys: 6 });
  });

  test("a brief that is no longer open is hidden from everyone else", async () => {
    const { body: created } = await postBrief(validBrief);
    await Project.updateOne(
      { _id: created.id },
      { assignedEngineer: engineer._id, status: "in-progress" },
    );
    const brief = await request(app)
      .get(briefUrl(created.id))
      .set("Cookie", cookieFor(otherEngineer));
    expect(brief.status).toBe(404);
  });

  test("an older brief without a site still loads", async () => {
    const project = await Project.create({
      title: "Boundary wall",
      client: client._id,
      status: "open_for_bids",
      location: "Savar",
    });
    const brief = await request(app)
      .get(briefUrl(project._id.toString()))
      .set("Cookie", cookieFor(otherEngineer));
    expect(brief.status).toBe(200);
    expect(brief.body).toMatchObject({ site: null, requirements: null, location: "Savar" });
  });

  test("serves the criteria spec without signing in", async () => {
    const response = await request(app).get("/api/projects/criteria");
    expect(response.status).toBe(200);
    expect(response.body.categories.map((entry: { category: string }) => entry.category)).toContain(
      "Land development",
    );
    expect(response.body.districts).toHaveLength(64);
  });
});
