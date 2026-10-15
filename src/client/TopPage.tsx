import { useState } from "react";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from "../shared/types";
import { navigate } from "./navigation";

const ROOM_CODE_CHARS = new Set(ROOM_CODE_ALPHABET);

export function TopPage() {
  const [code, setCode] = useState("");
  const valid = ROOM_CODE_PATTERN.test(code);

  return (
    <main>
      <h1>ミッションビンゴ</h1>
      <section>
        <h2>ルームに参加</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) navigate(`/room/${code}`);
          }}
        >
          <label className="field">
            ルームコード
            <input
              value={code}
              onChange={(e) => {
                const chars = [...e.target.value.toUpperCase()].filter((ch) => ROOM_CODE_CHARS.has(ch));
                setCode(chars.join("").slice(0, ROOM_CODE_LENGTH));
              }}
              placeholder="6文字"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="primary" disabled={!valid}>
            参加する
          </button>
        </form>
      </section>
      <section>
        <h2>ルームを作る</h2>
        <button type="button" onClick={() => navigate("/create")}>
          新しいルームを作る
        </button>
      </section>
    </main>
  );
}
