import { Hono } from "hono";
import { ROOM_ID_PATTERN } from "../shared/types";

export { RoomDO } from "./room";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

// WebSocket をルームIDごとの RoomDO へ振り分ける
app.get("/api/rooms/:roomId/ws", async (c) => {
  const roomId = c.req.param("roomId");
  if (!ROOM_ID_PATTERN.test(roomId)) {
    return c.json({ error: "ルームIDが不正です" }, 400);
  }
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "WebSocket の接続が必要です" }, 426);
  }
  return c.env.ROOM.getByName(roomId).fetch(c.req.raw);
});

export default app;
