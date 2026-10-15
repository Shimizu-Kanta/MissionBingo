import { useState } from "react";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from "../shared/types";
import { navigate } from "./navigation";
import { formatCode } from "./theme";
import { Logo, useToast } from "./ui";

const ROOM_CODE_CHARS = new Set(ROOM_CODE_ALPHABET);

export function TopPage() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const valid = ROOM_CODE_PATTERN.test(code);
  const join = () => {
    if (valid) navigate(`/room/${code}`);
    else toast.show("招待コード（6文字）を入力してください");
  };

  return (
    <div className="screen">
      <header className="app-header">
        <div className="left" style={{ gap: 10 }}>
          <Logo />
          <span className="title">ミッションビンゴ</span>
        </div>
      </header>
      <div className="page top-page">
        <div className="top-hero">
          <div className="kicker">身内で遊ぶ、オンライン対戦ビンゴ</div>
          <h1>
            ミッションをこなして、
            <br />
            マスを開けよう。
          </h1>
          <p>数字の抽選ではなく、マスに書かれたミッションを達成するとカードが開きます。先に指定数のビンゴを揃えたチームの勝ち。</p>
        </div>
        <div className="top-cards">
          <div className="panel top-card">
            <div>
              <h2>ルームを作る</h2>
              <p>GMの有無とカード形式を選び、お題を設定します。</p>
            </div>
            <button type="button" className="btn primary" onClick={() => navigate("/create")}>
              ルームを作成
            </button>
          </div>
          <div className="panel top-card">
            <div>
              <h2>ルームに参加</h2>
              <p>招待コードを入力するか、共有されたリンクを開きます。</p>
            </div>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <input
                className="code-input"
                value={code.length > 3 ? formatCode(code) : code}
                onChange={(e) => {
                  const chars = [...e.target.value.toUpperCase()].filter((ch) => ROOM_CODE_CHARS.has(ch));
                  setCode(chars.join("").slice(0, ROOM_CODE_LENGTH));
                }}
                placeholder="例：K7Q-24M"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="招待コード"
              />
              <button type="submit" className="btn outline">
                参加
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
