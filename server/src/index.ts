import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db";
import clientRouter from "./routes/client.routes";
import errorHandler from "./middleware/errorHandler";
import authRouter from "./routes/auth.routes";
import projectsRouter from "./routes/projects.routes";
import dashboardRouter from "./routes/dashboard.routes";
import bidsRouter from "./routes/bids.routes";
import engineerRouter from "./routes/engineer.routes";
import networkRouter from "./routes/network.routes";
import conversationsRouter from "./routes/conversations.routes";
import userRouter from "./routes/user.routes";
import postRouter from "./routes/post.routes";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "CivilHub API is running" });
});

app.use("/api/auth", authRouter);
app.use("/api/clients", clientRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bids", bidsRouter);
app.use("/api/engineers", engineerRouter);
app.use("/api/network", networkRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/users", userRouter);
app.use("/api/posts", postRouter);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  await connectDB();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer().catch((error: unknown) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

export default app;
