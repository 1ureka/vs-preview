# 軟體架構設計報告

本文件針對 `@host`（擴展主機端）與 `@view`（Webview 前端）兩個核心區域，分別設計可擴展的軟體架構。設計目標：

- **容納髒代碼**：允許快速原型開發與實驗性功能，不汙染核心邏輯
- **多人並行開發**：每位開發者可獨立負責一個功能域，將衝突降至最低
- **未來擴展能力**：輕鬆新增多媒體類型（音訊、3D 模型等）與功能增強（裁剪、多圖片瀏覽等）

---

## 一、現況分析

### 當前目錄結構

```
src/
├── host/                  # 擴展主機端
│   ├── index.ts           # 入口：activate()
│   ├── config.ts          # 配置與型別
│   ├── handlers.ts        # 業務邏輯處理器
│   ├── provider.ts        # CustomReadonlyEditorProvider
│   └── service.ts         # Service 門面
│
├── webview/               # Webview 前端
│   ├── index.tsx          # React 入口
│   ├── ImageViewer.tsx    # 圖片檢視器元件 + 右鍵選單
│   ├── store.ts           # Zustand 狀態管理
│   ├── hooks.ts           # 自訂 Hooks
│   └── action.ts          # 操作邏輯
│
├── vscode/                # VS Code API 橋接層
├── utils/host/            # Node.js 端工具
├── utils/webview/         # 瀏覽器端工具
└── utils/shared/          # 跨環境共用工具
```

### 當前架構的優點

- **訊息協議設計良好**：`invoke` / `response` 模式將主機與前端完全解耦，具有良好的型別推導能力
- **橋接層抽象完整**：`@vscode/utils` 封裝了 Webview Panel 建立、HTML 生成、訊息監聽，新增功能域時無需碰觸這一層
- **ESLint 規則嚴謹**：透過 `no-restricted-imports` 與 `no-restricted-syntax` 強制使用正確的抽象層，從工具層面防止規範被破壞

### 當前架構的擴展瓶頸

| 問題                   | 影響                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| 圖片邏輯散佈在頂層目錄 | 新增第二種媒體類型時，無法清楚區分各自的檔案歸屬                     |
| 單一 handlers 檔案     | 所有業務處理器集中在一個檔案，多人同時修改時容易衝突                 |
| 元件與邏輯耦合         | `ImageViewer.tsx` 同時包含圖片顯示與右鍵選單元件，職責過重           |
| 缺乏實驗性代碼的安置處 | 沒有約定的位置放置原型代碼或實驗性功能，容易汙染生產路徑             |

---

## 二、Host 端架構設計

### 設計原則

1. **功能域隔離（Feature Domain Isolation）**：每種媒體類型是一個獨立的功能域目錄，擁有完整的 Provider → Service → Operations 結構
2. **Operation 單一職責**：每個使用者操作（複製、導出、取色等）獨立成一個檔案，降低合併衝突的可能性
3. **Service 作為防火牆**：Service 定義門面介面，即使 Operation 內部實作混亂，對外暴露的介面始終乾淨
4. **沙箱慣例**：`_sandbox/` 目錄用於實驗性代碼，不會被 Service 引用，不進入生產路徑

### 建議目錄結構

```
src/host/
├── index.ts                          # 擴展入口：統一註冊所有功能域的 Provider
│
├── image/                            # ── 圖片功能域 ──
│   ├── _types.ts                     # 域內型別定義（供域內檔案共用）
│   ├── provider.ts                   # CustomReadonlyEditorProvider 實作
│   ├── service.ts                    # Service 門面：定義暴露給 Webview 的 API
│   ├── operations/                   # 每個檔案 = 一個獨立的使用者操作
│   │   ├── copy.ts                   # 複製圖片到剪貼簿
│   │   ├── export.ts                 # 導出圖片為其他格式
│   │   └── eyedropper.ts             # 吸管取色結果處理
│   └── _sandbox/                     # 實驗性代碼（不納入 Service）
│       └── crop.ts                   # 範例：裁剪功能原型
│
├── [audio]/                          # ── 音訊功能域（未來）──
│   ├── _types.ts
│   ├── provider.ts
│   ├── service.ts
│   └── operations/
│       └── ...
│
└── [model]/                          # ── 3D 模型功能域（未來）──
    └── ...
```

### 架構圖

```
┌─────────────────────────────────────────────────────────────────────┐
│  VS Code Extension Host                                            │
│                                                                     │
│  ┌─────────────┐                                                    │
│  │  index.ts   │  activate() ──► 遍歷功能域，逐一註冊 Provider      │
│  └──────┬──────┘                                                    │
│         │                                                           │
│    ┌────▼────────────────────────────┐   ┌────────────────────┐     │
│    │  image/                         │   │  [audio/]          │     │
│    │                                 │   │                    │     │
│    │  provider.ts                    │   │  (同樣結構)        │     │
│    │    │  resolveCustomEditor()     │   │                    │     │
│    │    │    ├─ createWebviewPanel() │   └────────────────────┘     │
│    │    │    └─ registerInvokeEvents(service)                 │     │
│    │    ▼                            │                              │
│    │  service.ts ◄─── 門面介面       │                              │
│    │    │  "image.copy"   → copy.ts  │                              │
│    │    │  "image.export" → export.ts│                              │
│    │    │  "image.copyColor" → ...   │                              │
│    │    ▼                            │                              │
│    │  operations/                    │                              │
│    │    ├─ copy.ts                   │                              │
│    │    ├─ export.ts                 │                              │
│    │    └─ eyedropper.ts             │                              │
│    │                                 │                              │
│    │  _sandbox/  (隔離實驗)          │                              │
│    └─────────────────────────────────┘                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐               │
│  │  @vscode/utils  (橋接層 — 穩定，幾乎不需修改)   │               │
│  │    webview.ts ─ message.host.ts ─ webview-html.ts│               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐               │
│  │  utils/host  &  utils/shared  (共用工具)         │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### 依賴流向規則

```
index.ts ──► 各功能域/provider.ts ──► 各功能域/service.ts ──► 各功能域/operations/*
                   │                                                    │
                   ▼                                                    ▼
            @vscode/utils                               utils/host, utils/shared
```

**嚴格禁止：**
- 功能域之間互相引用（`image/` ← ✕ → `audio/`）
- Operations 直接引用 VS Code API（必須透過 `@vscode/utils` 或 Service 參數注入）
- `_sandbox/` 內的模組被 `service.ts` 引用

### 新增功能域的步驟

以新增「音訊預覽」為例：

1. 建立 `src/host/audio/` 目錄與子結構（provider、service、operations）
2. 在 `package.json` 的 `contributes.customEditors` 新增音訊編輯器宣告
3. 在 `src/host/index.ts` 的 `activate()` 中註冊新 Provider
4. 完成 — 圖片模組完全不受影響

### 新增使用者操作的步驟

以為圖片新增「裁剪」功能為例：

1. 在 `src/host/image/_sandbox/crop.ts` 中實作原型
2. 原型穩定後，移至 `src/host/image/operations/crop.ts`
3. 在 `src/host/image/service.ts` 新增一行 `"image.crop": runCropWorkflow`
4. 完成 — 其他 Operation 完全不受影響

### 髒代碼容納策略

| 層級 | 策略 | 說明 |
| --- | --- | --- |
| **Operation 層** | 隔離 | 每個操作獨立一個檔案，「髒」只會侷限在該檔案內部。需要重構時替換單一檔案即可，不影響其他操作。 |
| **Service 層** | 防火牆 | Service 只負責將 ID 映射到 Operation 函式。即使 Operation 內部混亂，Service 的介面始終是 `{ [id: string]: (params) => result }` 形式的乾淨映射。 |
| **_sandbox 目錄** | 安全實驗區 | 約定 `_sandbox/` 內的代碼不會被 Service 引用。開發者可在此自由寫原型代碼，不怕意外被載入或影響生產功能。可搭配 ESLint 規則禁止從 `_sandbox` 向外導出。 |

### 多人並行開發策略

| 場景 | 衝突來源 | 解法 |
| --- | --- | --- |
| 兩人各自開發不同功能域 | `index.ts` 的 Provider 註冊 | 每人只新增一行，衝突機率極低 |
| 兩人在同一功能域開發不同操作 | `service.ts` 的 ID 映射 | 每人只新增一行映射，衝突機率極低 |
| 兩人修改同一 Operation | 同一檔案內部 | 此為最細粒度，需透過溝通協調。但單一 Operation 檔案通常只有一個函式，規模很小，衝突也容易解決。 |

---

## 三、Webview 端架構設計

### 設計原則

1. **單向資料流（Unidirectional Data Flow）**：Actions → Stores → Components → 使用者互動 → Actions
2. **元件純粹責任（Component Purity）**：React 元件只負責渲染 UI，不直接執行副作用
3. **Actions 作為副作用唯一入口**：所有與主機通訊、狀態變更的操作都透過 Actions 進行
4. **沙箱慣例**：與 Host 端對稱，`_sandbox/` 目錄用於實驗性元件或邏輯

### 建議目錄結構

```
src/webview/
├── image/                            # ── 圖片檢視器 Webview ──
│   ├── index.tsx                     # 入口：App 元件 + 啟動邏輯
│   ├── _types.ts                     # 域內型別定義
│   │
│   ├── components/                   # React 元件（純 UI 展示層）
│   │   ├── ImageDisplay.tsx          # 圖片顯示 + 手勢互動
│   │   ├── ContextMenu.tsx           # 右鍵選單
│   │   └── _sandbox/                 # 實驗性元件
│   │       └── CropOverlay.tsx       # 範例：裁剪覆蓋層原型
│   │
│   ├── stores/                       # Zustand 狀態管理
│   │   ├── data.ts                   # 圖片檔案資料 store
│   │   └── ui.ts                     # UI 狀態 store（選單開關、工具狀態等）
│   │
│   ├── actions/                      # 操作邏輯（副作用唯一入口）
│   │   ├── copy.ts                   # 複製操作
│   │   ├── export.ts                 # 導出操作
│   │   ├── eyedropper.ts             # 吸管取色
│   │   └── transform.ts             # 縮放/平移重設
│   │
│   └── hooks/                        # 自訂 Hooks（React 生命週期整合）
│       └── useDecodeImage.ts         # 圖片非同步解碼
│
├── [audio]/                          # ── 音訊播放器 Webview（未來）──
│   ├── index.tsx
│   ├── components/
│   ├── stores/
│   ├── actions/
│   └── hooks/
│
└── [model]/                          # ── 3D 模型檢視器 Webview（未來）──
    └── ...
```

### 架構圖

```
┌─────────────────────────────────────────────────────────────────────┐
│  VS Code Webview (Browser Environment)                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  image/                                                     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────┐               │    │
│  │  │  components/                             │               │    │
│  │  │    ImageDisplay ── ContextMenu           │               │    │
│  │  │         │               │                │               │    │
│  │  │         │  使用者互動    │  使用者點擊     │               │    │
│  │  └─────────┼───────────────┼────────────────┘               │    │
│  │            ▼               ▼                                │    │
│  │  ┌──────────────────────────────────────────┐               │    │
│  │  │  actions/                                │               │    │
│  │  │    copy ── export ── eyedropper ── ...   │               │    │
│  │  │      │                                   │               │    │
│  │  │      ├── invoke("image.copy", ...)  ───────────────► Host│    │
│  │  │      └── store.setState(...)             │               │    │
│  │  └──────────────────────┬───────────────────┘               │    │
│  │                         │ 更新                               │    │
│  │                         ▼                                   │    │
│  │  ┌──────────────────────────────────────────┐               │    │
│  │  │  stores/                                 │               │    │
│  │  │    dataStore ── uiStore                  │               │    │
│  │  │      │                                   │               │    │
│  │  │      │  訂閱驅動                          │               │    │
│  │  └──────┼───────────────────────────────────┘               │    │
│  │         │                                                   │    │
│  │         └──────────► components/ 重新渲染                    │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────┐               │    │
│  │  │  hooks/                                  │               │    │
│  │  │    useDecodeImage (側效果整合)            │               │    │
│  │  └──────────────────────────────────────────┘               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐               │
│  │  @vscode/utils  (訊息協議 — 穩定，幾乎不需修改) │               │
│  │    message.view.ts (createInvoke, getInitialData)│               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐               │
│  │  utils/webview  (UI 工具 — 穩定)                 │               │
│  │    ui.tsx ─ theme.ts ─ style.ts                  │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### 資料流向

```
使用者操作 (點擊/手勢/快捷鍵)
       │
       ▼
   actions/*        ◄── 副作用在此發生 ──► invoke() 與擴展主機通訊
       │
       ├── 更新 stores/*
       │        │
       │        ▼
       │   components/*  ◄── 從 store 訂閱資料，純渲染
       │        │
       │        └──► 使用者操作 (循環)
       │
       └── 使用 hooks/*  ◄── 封裝 React 生命週期相關側效果
```

**嚴格禁止：**
- Components 直接呼叫 `invoke()`（必須透過 Actions）
- Stores 包含業務邏輯（Stores 只是狀態容器）
- Actions 之間互相呼叫（保持扁平，若需共用邏輯則提取到 hooks 或工具函式）

### 新增功能域的步驟

以新增「音訊播放器」為例：

1. 建立 `src/webview/audio/` 目錄與子結構
2. 在 `src/build.ts` 的 `buildWebview()` 新增音訊 Webview 的建構入口
3. 在對應的 Host 端 provider 中指定正確的 `jsBundleName`
4. 完成 — 圖片 Webview 完全不受影響

### 新增 UI 功能的步驟

以為圖片新增「裁剪覆蓋層」為例：

1. 在 `components/_sandbox/CropOverlay.tsx` 中實作原型元件
2. 在 `actions/` 新增 `crop.ts` 處理裁剪操作邏輯
3. 必要時在 `stores/` 新增裁剪狀態（如選取區域座標）
4. 原型穩定後，將 `CropOverlay.tsx` 移出 `_sandbox/`，整合進主元件樹
5. 完成 — 其他元件與操作完全不受影響

### 髒代碼容納策略

| 層級 | 策略 | 說明 |
| --- | --- | --- |
| **Actions 層** | 隔離 | 每個操作獨立一個檔案。Actions 是最可能出現髒代碼的位置（處理邊界案例、格式轉換等），但因為彼此隔離，髒汙範圍可控。 |
| **Components 層** | 純粹性保護 | 元件只從 Store 讀資料和呈現 UI，不包含副作用。這使得元件天然地難以「變髒」——因為副作用被推到了 Actions 層。 |
| **Stores 層** | 最小化 | Store 只定義狀態結構與初始值，不包含衍生邏輯或計算。保持 Store 的極簡性，讓它不可能成為髒代碼的容器。 |
| **_sandbox 目錄** | 安全實驗區 | 與 Host 端對稱。實驗性元件放在 `components/_sandbox/`，正式採用前不會被主元件樹引用。 |

### 多人並行開發策略

| 場景 | 衝突來源 | 解法 |
| --- | --- | --- |
| 兩人各自開發不同功能域 Webview | `build.ts` 的入口配置 | 每人只新增一行，衝突機率極低 |
| 兩人在同一 Webview 開發不同 UI 功能 | `index.tsx` 的元件組合 | 每人新增自己的元件，在 App 內新增一行渲染 |
| 兩人修改同一元件 | 同一檔案內部 | 此為最細粒度，需透過溝通協調。但元件通常較小且純粹，衝突也容易理解。 |

---

## 四、跨層共用設施

以下模組在 Host 與 Webview 之間共用，設計上追求**極度穩定**，一旦建立後幾乎不需要修改。

### @vscode/utils（橋接層）

| 模組 | 職責 | 修改頻率 |
| --- | --- | --- |
| `webview.ts` | 建立/初始化 Webview Panel | 極低 |
| `webview-html.ts` | 生成 React Webview 的 HTML 模板 | 極低 |
| `message.host.ts` | Host 端監聽 invoke 請求並路由到 Service | 極低 |
| `message.view.ts` | Webview 端發送 invoke 請求並接收回應 | 極低 |
| `message.type.ts` | 訊息協議型別定義 | 極低 |

**擴展新功能域時不需要修改此層。** 這是架構可擴展性的關鍵基石。

### utils/shared（跨環境工具）

| 模組 | 職責 | 適用環境 |
| --- | --- | --- |
| `index.ts` | 通用工具函式（tryCatch, defer, clamp 等） | Host + Webview |
| `type.d.ts` | 共用型別定義 | Host + Webview |
| `formatter.ts` | 格式化工具（日期、檔案大小） | Host + Webview |
| `collator.ts` | 字串比較器（排序、搜尋） | Host + Webview |

### utils/host（Node.js 專用工具）

| 模組 | 職責 |
| --- | --- |
| `image.ts` | 圖片讀取、格式轉換（基於 sharp） |
| `image.windows.ts` | Windows 剪貼簿操作（基於 PowerShell） |

> 隨著功能域增加，可考慮將工具也按域分類：`utils/host/image/`、`utils/host/audio/` 等。

### utils/webview（瀏覽器專用工具）

| 模組 | 職責 |
| --- | --- |
| `ui.tsx` | React 應用程式啟動器 |
| `theme.ts` | MUI 主題（基於 VS Code CSS 變數） |
| `style.ts` | 共用樣式工具 |

---

## 五、建構系統對多功能域的支援

當功能域增加時，`build.ts` 需要支援多個 Webview 入口。建議模式：

```typescript
// 每個功能域的 Webview 入口配置
const webviewEntries = [
  { src: "src/webview/image/index.tsx", out: "dist/webviews/webview.image.js" },
  // { src: "src/webview/audio/index.tsx", out: "dist/webviews/webview.audio.js" },
  // { src: "src/webview/model/index.tsx", out: "dist/webviews/webview.model.js" },
];

async function buildWebview() {
  for (const entry of webviewEntries) {
    await build({ entryPoints: [entry.src], outfile: entry.out, /* ... */ });
  }
}
```

新增功能域時，只需在 `webviewEntries` 陣列中加一行。

---

## 六、總結

### 架構核心原則

| 原則 | Host 端體現 | Webview 端體現 |
| --- | --- | --- |
| **功能域隔離** | `host/image/`、`host/audio/` 各自獨立 | `webview/image/`、`webview/audio/` 各自獨立 |
| **單一職責** | 每個 Operation 一個檔案 | 每個 Action 一個檔案 |
| **介面防火牆** | Service 門面屏蔽 Operation 內部複雜度 | Store 屏蔽 Action 與 Component 之間的複雜度 |
| **髒代碼隔離** | `_sandbox/` + Operation 獨立檔案 | `_sandbox/` + Action 獨立檔案 + 元件純粹性 |
| **並行開發** | 功能域目錄 → 操作檔案 → 衝突最小化 | 功能域目錄 → 元件/操作檔案 → 衝突最小化 |
| **穩定底層** | `@vscode/utils` 不因新功能而改動 | `utils/webview` 不因新功能而改動 |
