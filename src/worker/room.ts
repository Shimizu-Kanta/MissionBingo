import { DurableObject } from "cloudflare:workers";

// 1ルーム = 1 RoomDO。ゲーム状態を変える処理はすべてここで行う（ステップ1以降で実装）。
export class RoomDO extends DurableObject<Env> {}
