# SCARA HMI: Stack and Architecture Reference
**Multi-Route Client Dashboard | Next.js 16 | Drizzle & Turso | Web Serial API**

---

This document outlines the software architecture, state lifecycle, routing topology, and data injection flow of the SCARA Robot Human-Machine Interface (HMI).

---

## 1. Complete Technology Stack

- **Core Web Framework**: Next.js v16.2.6 (App Router) + React v19.2.4.
- **Languages**: TypeScript v5 & C++ (ESP32 firmware).
- **Embedded Web Interface**: HTML5 Web Serial API (`navigator.serial`) communicating directly at **921600** baud.
- **Global State Ingestion**: Client-side React Context (`HMIContext`) with Reducer dispatch patterns.
- **Database Engine**: Turso (LibSQL / Edge SQLite) for storing trajectory records and sequence results.
- **Database Mapping**: Drizzle ORM v0.45.2 for SQL schemas, migration scripts (`db:push`), and queries.
- **Security Boundary**: NextAuth.js v5 (auth.js) with Google OAuth 2.0 Credentials Provider.
- **Styling Engine**: Tailwind CSS v4 configured with a high-contrast industrial dark mode palette (`#09090b` zinc bases, custom slate borders).
- **Plotting Engines**:
  - **HTML5 Canvas**: Multi-layered, fast render context for rendering the SCARA link models, safety warnings, and trajectory overlay traces.
  - **Recharts v3.8.1**: Time-series plots for tracking errors, FFT spectrums, and PID gain breakouts.
- **UI Components**: Radix UI primitive templates (Dialog, Dropdown, Collapsible, Sheet).
- **Diagnostic Toasts**: Sonner library for toast notifications on error logs (`ERR:`, `WARN:`).

---

## 2. Directory Layout & Routing Map

```text
hmi/
├── app/                              # Next.js Routing Modules
│   ├── actions/
│   │   └── experiment.ts             # Server Actions writing experiment results to Turso DB
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # NextAuth API callback routes
│   │   └── runs/
│   │       ├── route.ts              # GET (list) / POST (create) runs
│   │       ├── [id]/route.ts         # GET / DELETE individual run
│   │       └── [id]/copilot/route.ts # POST streaming AI Copilot (Gemini)
│   ├── dashboard/                    # /dashboard - PROTECTED
│   │   ├── page.tsx
│   │   └── dashboard-content.tsx
│   ├── eksperimen/                   # /eksperimen - PROTECTED
│   │   ├── page.tsx
│   │   └── experiment-client.tsx
│   ├── hasil-eksperimen/             # /hasil-eksperimen - PUBLIC
│   │   ├── page.tsx
│   │   └── results-client.tsx
│   ├── login/                        # /login - PUBLIC
│   │   ├── page.tsx
│   │   └── login-content.tsx
│   ├── zn/                           # /zn - PUBLIC
│   │   ├── page.tsx
│   │   └── zn-page-content.tsx
│   ├── test/                         # /test - PUBLIC
│   │   ├── page.tsx
│   │   └── test-page-content.tsx
│   ├── globals.css                   # Tailwind v4 theme, custom scrollbars, keyframes
│   ├── layout.tsx                    # Root layout with SessionProvider + HMIProvider
│   └── providers.tsx                 # HMIProvider wrapper (Serial, ModeRouter, KeybindingsHandler)
├── components/                       # React Components Layer
│   ├── dashboard/                    # 10 components: trajectory-tab, velocity-tab, pid-tab, feedforward-tab, metrics-tab, advanced-tab, copilot-tab, chart-card, dashboard-xy-trace, run-selector
│   ├── hmi/                          # 29 components: monitor-tab, analysis-tab, zn-analysis-tab, readme-tab, chart-panel, control-panel, xy-trace, serial-log, serial-terminal, capture-menu, capture-charts-host, command-palette, run-button, save-run-dialog, hmi-tutorial, theme-toggle, theme-provider, step-metrics, etc.
│   ├── mode-badge.tsx                # Mode indicator component
│   └── ui/                           # Radix + Tailwind primitive wrappers
├── lib/
│   ├── actions/
│   │   └── experiment.ts             # Experiment DB insert server actions
│   ├── db/                           # Turso connection configs and Drizzle models
│   │   ├── schema/experiment.ts      # Experiment schemas
│   │   ├── backup.ts                 # Server-side JSONL backup writer
│   │   ├── index.ts                  # SQL database client
│   │   ├── queries.ts                # DB queries (insert, select, delete runs)
│   │   └── schema.ts                 # Runs, users, samples tables
│   ├── ai-client.ts                  # Google Gen AI client with model fallback chain
│   ├── capture-session.ts            # Export session state
│   ├── capture-utils.ts              # ZIP/PNG/JPEG export helpers
│   ├── cloudflare-services.ts        # Cloudflare KV REST client
│   ├── cte-utils.ts                  # Cross/along tracking error computation
│   ├── hmi-context.tsx               # Reducer actions, serial read loop, parser
│   ├── hmi-types.ts                  # Data interfaces
│   ├── keybindings-store.ts          # Keyboard shortcut persistence
│   ├── localMean.ts                  # Local regression (LOESS) utility
│   ├── telemetry-types.ts            # Auto-generated telemetry field types
│   ├── trajectory-safety.ts          # Move validation rules
│   ├── tuning-advisor.ts             # Rule-based PID suggestions
│   └── utils.ts                      # Tailwind class helper (cn)
```

---

## 3. Middleware and Authentication Boundaries

To secure database writes and user-saved directories:
- **Next.js Middleware (`middleware.ts`)**: Redirects unauthorized visitors hitting `/dashboard`, `/eksperimen`, or sending REST requests to `/api/runs` back to the `/login` portal.
- **NextAuth integration**: Google Provider authentication validates credentials, returning session cookies to enable database queries.

```
┌────────────────────────────────────────────────────────┐
│                      app/layout.tsx                    │
│    SessionProvider (Auth)   &   HMIProvider (Serial)   │
└──────────────────────────┬─────────────────────────────┘
                           │
      ┌────────────────────┴────────────────────┐
      ▼                                         ▼
  [Public Routes]                        [Protected Routes]
  - / (Home Dashboard)                   (auth.js Middleware verification)
  - /zn (ZN Joint Tuner)                 - /dashboard (Saved runs comparisons)
  - /test (Params Tuner)                 - /eksperimen (Automation sequencer)
  - /hasil-eksperimen (Analytics)
```

---

## 4. Connection Lifecycles & Serial Ingestion

Because the serial connection represents a hardware state, the HMI maintains persistence across different URL routes by wrapping `HMIProvider` directly inside the root `layout.tsx` file.

### Ingestion Pipeline
1. **Initiation**: Clicking the connect button calls `navigator.serial.requestPort()`, opens a connection at **921600** baud, and caches the port descriptor in `localStorage`.
2. **Synchronization Handshake**: Immediately sends commands `getgains` and `getparams` to retrieve the current physical state of the robot.
3. **Keep-alive Heartbeat**: Pings the watchdog timer with a `ping` string every 2000 ms to prevent the ESP32 from returning to `MODE_IDLE`.
4. **Stream Ingestion**:
   ```
   [ESP32 MCU] ──(921600 baud UART)──► [Browser Web Serial Stream]
                                                │
                                       [Uint8Array Chunks]
                                                │
                                       [TextDecoder Stream]
                                                │
                                       [Splitting on '\n']
                                                │
                                        [parseLine Engine]
                                                │
                                     [Reducer State Dispatch]
   ```

---

## 5. Global State Reducer (`hmi-context.tsx`)

The React Reducer acts as the central command center for parsing and buffering data:

- **Buffer Arrays**:
  - `trajectoryBuffer` (`T`, `D`, `F`, `E` aligned samples): Capped at **2000** samples per movement to maintain performance.
  - `restAnalysisBuffer`: Capped at **10000** samples for step-response analysis.
- **Paints & Render Throttling**:
  While data updates the state at 50 Hz, chart paints (DOM updates) are throttled to **5 Hz (200 ms)** using interval tickers to prevent CPU bottlenecks when charting complex Recharts diagrams.

---

## 7. Home Page Tab Structure

| Tab | Component | Purpose |
| :--- | :--- | :--- |
| Monitor | `MonitorTab` | Live XY trace, charts, metrics, control panel |
| Analysis | `AnalysisTab` | Frozen post-run diagnostics |
| Rest Analysis | `ZNAnalysisTab` | Continuous step/rest telemetry analysis |
| README | `ReadmeTab` | In-app documentation |
