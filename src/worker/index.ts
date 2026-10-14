import { Hono } from "hono";

export { RoomDO } from "./room";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
