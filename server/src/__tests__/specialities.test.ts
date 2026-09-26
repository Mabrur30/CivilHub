import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import errorHandler from "../middleware/errorHandler";
import { Engineer } from "../models/Engineer.model";
import { Organisation } from "../models/Organisation.model";
import { Project } from "../models/Project.model";
import { type IUser, User } from "../models/User.model";
import authRouter from "../routes/auth.routes";
import engineerRouter from "../routes/engineer.routes";
import organisationRouter from "../routes/organisation.routes";

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

let memoryServer: MongoMemoryServer;
let app: Express;

const cookieFor = (user: IUser): string =>
  `civilhub_token=${jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  )}`;

const signup = (body: object): request.Test =>
  request(app)
    .post("/api/auth/signup")
    .send({ password: "long-enough-1", ...body });

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use("/api/engineers", engineerRouter);
  app.use("/api/organisations", organisationRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Engineer.deleteMany({}),
    Organisation.deleteMany({}),
    Project.deleteMany({}),
  ]);
});

describe("Choosing a speciality at signup", () => {
  test("an engineer must choose a main speciality, and up to two more", async () => {
    const base = { name: "Tanvir Hasan", email: "t@test.dev", role: "engineer" };
    expect((await signup(base)).status).toBe(400);
    expect((await signup({ ...base, disciplines: [] })).status).toBe(400);
    expect((await signup({ ...base, disciplines: ["Wizardry"] })).status).toBe(400);
    expect(
      (await signup({ ...base, disciplines: ["Structural", "MEP", "Surveying", "Geotechnical"] })).status,
    ).toBe(400);
    expect(await User.countDocuments({ email: "t@test.dev" })).toBe(0);

    const response = await signup({ ...base, disciplines: ["Geotechnical", "Structural"] });
    expect(response.status).toBe(201);
    expect(response.body.disciplines).toEqual(["Geotechnical", "Structural"]);
    const engineer = await Engineer.findOne({ user: response.body.id }).exec();
    expect(engineer?.disciplines).toEqual(["Geotechnical", "Structural"]);
  });

  test("a company taking on projects needs one; a rental-only company doesn't", async () => {
    const projects = await signup({
      name: "BuildRight",
      email: "b@test.dev",
      role: "organisation",
      services: ["projects"],
    });
    expect(projects.status).toBe(400);

    const rental = await signup({
      name: "Rahman Plant Hire",
      email: "r@test.dev",
      role: "organisation",
      services: ["equipment"],
    });
    expect(rental.status).toBe(201);
    expect(rental.body.disciplines).toEqual([]);
  });

  test("/me tells the app whether the provider has chosen one", async () => {
    const user = await User.create({ name: "Old Engineer", email: "o@test.dev", passwordHash: "x", role: "engineer" });
    await Engineer.create({ user: user._id });
    const me = await request(app).get("/api/auth/me").set("Cookie", cookieFor(user));
    expect(me.body.disciplines).toEqual([]);
  });
});

describe("Company specialities use the discipline list", () => {
  test("old free-text entries drop out and edits must use the list", async () => {
    const user = await User.create({ name: "BuildRight", email: "b@test.dev", passwordHash: "x", role: "organisation" });
    await Organisation.create({
      user: user._id,
      services: ["projects"],
      specialties: ["Earthworks", "structural", "Piling"],
    });
    const as = (req: request.Test): request.Test => req.set("Cookie", cookieFor(user));

    const profile = await as(request(app).get("/api/organisations/me"));
    expect(profile.body.specialties).toEqual(["Structural"]);

    expect((await as(request(app).patch("/api/organisations/me")).send({ specialties: ["Piling"] })).status).toBe(400);
    const saved = await as(request(app).patch("/api/organisations/me")).send({
      specialties: ["Civil & site works", "Geotechnical"],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.specialties).toEqual(["Civil & site works", "Geotechnical"]);
  });
});

describe("Searching by speciality", () => {
  test("never invents a speciality, and filters and searches on chosen ones", async () => {
    const client = await User.create({ name: "Rumana", email: "c@test.dev", passwordHash: "x", role: "client" });
    const chosen = await User.create({ name: "Nabila Karim", email: "n@test.dev", passwordHash: "x", role: "engineer" });
    await Engineer.create({ user: chosen._id, disciplines: ["Geotechnical"] });
    const unset = await User.create({ name: "Arif Hossain", email: "a@test.dev", passwordHash: "x", role: "engineer" });
    await Engineer.create({ user: unset._id });
    // A past project used to become Arif's "speciality".
    await Project.create({ title: "House", client: client._id, assignedEngineer: unset._id, category: "Residential", status: "in-progress" });

    const search = (query: string): request.Test =>
      request(app).get(`/api/engineers/search${query}`).set("Cookie", cookieFor(client));

    const all = await search("");
    const byName = Object.fromEntries(
      (all.body.engineers as Array<{ name: string; specialty: string | null }>).map((row) => [row.name, row.specialty]),
    );
    expect(byName).toEqual({ "Arif Hossain": null, "Nabila Karim": "Geotechnical" });

    const filtered = await search("?category=Geotechnical");
    expect(filtered.body.engineers.map((row: { name: string }) => row.name)).toEqual(["Nabila Karim"]);
    expect((await search("?category=Residential")).body.engineers).toEqual([]);

    const text = await search("?q=geotech");
    expect(text.body.engineers.map((row: { name: string }) => row.name)).toEqual(["Nabila Karim"]);
  });
});
