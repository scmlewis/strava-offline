# Strava 離線分析儀

純前端 PWA — 拖上 Strava 匯出檔，離線睇你嘅跑步數據。零 backend，數據留喺你部機（IndexedDB）。

## 運行（本地開發）
```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm run build      # 生產 build 到 dist/（含 PWA service worker）
npm run preview    # 預覽生產 build
npm test           # 跑核心邏輯單元測試（zone / csv / gpx / TSS / PR / Riegel）
```

## 數據來源
Strava → 設定 → 匯出資料 → 會拎到一個 zip，入面有 `activities.csv` 同每件活動嘅 GPX。
直接拖個 zip（或個 csv）落 app 就得。

- **CSV**：計到週量、配速趨勢、平均 HR 趨勢；easy% 用「平均 HR」做 proxy。
- **GPX**（含 `gpxtpx:hr` 每秒心率）：計到**真·時間佔 zone**（histogram）。app 會自動用 GPX 嘅 histogram 覆蓋 CSV 嘅 proxy（按活動 ID 對應）。

## 功能（Tier 1–3）
- 卡片：總距離/時間/爬升、Easy% 對照 80% 目標、**Form (TSB)** 訓練狀態
- 圖表：近 16 週週量、**訓練負荷 CTL/ATL/TSB**、跑步配速趨勢、心率區分布
- 分析：**TSS / CTL / ATL / TSB**（HR-based）、**個人最佳 PR**（5K/10K/Half/Marathon）、**Riegel 比賽預測**
- 路線形狀 mini-map（由 GPX 畫 polyline，無 basemap tiles）
- 過濾（類型 / 時間範圍）、**Zone 設定面板**（localStorage 持久化，改 HRmax/rest/FTHR 重計全部）、**匯出/匯入備份 JSON**

## Zone 模型（錨定實測數據）
| Zone | HRmax% | 心率（HRmax 206） |
|---|---|---|
| Z1 恢復 | <60% | <124 |
| Z2 Easy | 60–75% | 124–154（你嘅 base 段瞄 148） |
| Z3 Tempo | 75–85% | 155–175 |
| Z4 Threshold | 85–95% | 176–196 |
| Z5 VO2 | >95% | >196 |

改 `src/data/zones.ts` 嘅 `DEFAULT_ZONES`，或用 app 內嘅「Zone 設定」面板。

## 部署去 Cloudflare Pages（手機安裝 PWA 必要，要 HTTPS）
agent sandbox 綁唔到 `wrangler login` 嘅 OAuth callback port，所以你要自己喺正常 terminal 跑：
```bash
npm install
wrangler login            # 瀏覽器授權（一次）
npm run build
npx wrangler pages deploy dist --project-name strava-offline-analyzer
# 或者直接：./deploy.sh
```
部署完會有個 `*.pages.dev` URL，手機開 → 安裝 → 離線可用。

## 限制（老實講）
- 跨裝置同步：無 backend，換機要重新匯入（可用備份 JSON 搬）。
- GPX HR namespace 用咗幾個常見 tag 做 fallback；個別裝置 export 唔同 namespace 就攞唔到真 histogram，會 fallback 返 avg-HR proxy。
- 路線係 polyline 形狀，無地圖底圖、無導航（係大坑，MVP 刻意唔做）。
- TSS/CTL 係 HR-based 估算（無功率計）；有 FTHR 就轉用 HRR 計 intensity。
