# 鏡地 Terra Mirror 🌍

一個與真實地球同步呼吸的持久人工生命世界。
A persistent artificial-life world that breathes in sync with the real Earth.

**線上：https://terra.smarternic.com**

## 這是什麼

- 世界每真實分鐘推進一個 tick，**無人觀看時照樣演化**（GitHub Actions 心跳，每 5 分鐘）
- **晝夜線是真實太陽直射點**——UTC 時間驅動黑暗在地圖上移動
- **真實地震**（USGS）在世界對應座標引發災難；規模 ≥5 時半徑內生命消逝
- **地磁風暴**（NOAA Kp ≥5）提高突變率、點亮極光
- 季節跟隨真實月份，影響植物生長率
- 生物有基因組（速度/感知/代謝/體型/色相），突變遺傳，天擇真實發生
- 訪客是小神：播種、降雨、召喚隕石、為生物賜名（名字寫入編年史）
- 創世紀錄刻在 DNS TXT 記錄裡：`_genesis.terra.smarternic.com`

## 架構（多主機）

| 節點 | 角色 |
|---|---|
| GitHub Actions | 心臟 — cron 每 5 分鐘演化世界並提交狀態 |
| GitHub repo | 記憶 — `state/world.json` 即世界本身 |
| Vercel | 臉面與神諭 — 前端 + `/api/intervene` 干預佇列 |
| Cloudflare DNS | 神經 — 子網域接線 + 創世 TXT 石碑 |

```
訪客 → terra.smarternic.com (Vercel)
        │ POST /api/intervene → 寫入 state/pending.json (GitHub Contents API)
        ↓
GitHub Actions 心跳 (*/5)
        │ node engine/tick.mjs
        │   ├─ 讀取 pending 佇列
        │   ├─ 抓取 USGS 地震 + NOAA Kp
        │   ├─ advanceWorld() — 演化 N ticks
        │   └─ 提交新 world.json
        ↓
前端每 30 秒讀 raw.githubusercontent.com 的世界狀態
```

## 本地運行

```bash
node engine/tick.mjs        # 推進世界一個心跳
python3 -m http.server      # 前端（API 需 Vercel 環境）
```
