import { Router, type Request, type Response } from "express";
import { protect } from "../middleware/auth.middleware";
import { realtimeHub } from "./realtime.hub";

const router = Router();

router.get(
  "/stream",
  protect,
  (req: Request, res: Response): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    req.setTimeout(0);
    res.setTimeout(0);
    req.socket.setTimeout(0);
    res.socket?.setTimeout(0);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    res.write("event: ready\ndata: {}\n\n");

    realtimeHub.subscribe(user.userId, user.role, res);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": ping\n\n");
    }, 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      realtimeHub.unsubscribe(user.userId, res);
    });
  },
);

export default router;
