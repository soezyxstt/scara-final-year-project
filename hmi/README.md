# Planar 2-DOF SCARA Robot HMI Dashboard

A high-performance, industrial-grade web-based **Human-Machine Interface (HMI)** designed for real-time telemetry, trajectory mapping, controller tuning, and diagnostics of a **2-Degree-of-Freedom (2-DOF) planar SCARA robot**.

This dashboard runs 100% client-side in the browser, communicating directly with the robot microcontroller (ESP32) over USB via the **HTML5 Web Serial API**.

---

## Technical Documentation

For in-depth developer references, see the centralized documentation folder:

* [**HMI Context Reference**](../docs/hmi/scara-hmi-context.md) — Global architecture, state management, component APIs, and developer conventions.
* [**Stack and Architecture Reference**](../docs/hmi/stack-and-architecture.md) — Tech stack, folder structure, connection lifecycles, and auto-reconnect logic.
* [**Features and Serial Protocol Reference**](../docs/hmi/features-and-data-flow.md) — ASCII protocol schemas, telemetry fields, and downstream commands.

---

## Application Routes

| Route | Auto firmware mode | Description |
| :--- | :--- | :--- |
| `/` | `SCARA` | Primary dashboard — Monitor, Analysis, Rest Analysis, and README tabs |
| `/zn` | `ZN` | Ziegler-Nichols joint tuning page with step commands and caliper analyzer |
| `/test` | `TEST` | Engineering test bench — adds Params Tuner and Raw Signal sections |

All routes share a single `HMIProvider` serial session. Switch pages via the **☰ Settings** menu without disconnecting.

---

## Home Page Tabs (`/`)

### 1. Monitor Tab
* **XY Workspace Trace (`XYTrace`)**: Canvas-based 2D workspace with link segments ($l_1 = 100$ mm, $l_2 = 70$ mm), reach boundaries ($R = 170$ mm), inner singularity zone ($r = 45$ mm), ideal vs actual paths, ghost trail, and pick-point targeting.
* **Telemetry Charts (`ChartPanel`)**: Seven chart tabs — **CTE** (cross-tracking error), **ATE** (along-tracking error), joint **Position**, **Velocity**, **PID breakdown**, **J1 control**, and **J2 velocity**.
* **Run Metrics (`MetricsPanel`)**: Post-run summary grid — Accuracy Index, MCTE, RMS ATE, error bias, RMSE per joint, control variance, jitter, and settling time.
* **Tuning & Control Panel (`ControlPanel`)**: Coordinate moves, elbow configuration, dual-joint PID gains, feedforward blend factors, and microstepping.
* **Serial Monitor**: VS Code–style bottom-sheet terminal (header button) for live log streaming.

### 2. Analysis Tab
Post-run diagnostics from frozen telemetry buffers:
* **Phase Portrait** — joint state-space $\theta$ vs $\dot{\theta}$
* **EEF Cartesian Error & Velocity** — expandable chart cards
* **PWM Output & Control Effort** — actuator work metrics
* **CTC Feedforward Torques** — inertia, Coriolis, and gravity components
* **Loop Duration** — microcontroller execution time
* **Ideal vs Actual Data Table** — paginated sample table with CSV export

### 3. Rest Analysis Tab (`ZNAnalysisTab`)
Continuous high-rate telemetry workspace for step-response and rest-state analysis:
* Joint 1 / Joint 2 selector with position, raw ADC, compare, velocity, and FFT view modes
* Drag-to-select caliper analyzer with ZN method, step response, and rest statistics tabs
* Step target commands, freeze/scroll controls, and scoped CSV export

### 4. README Tab
In-app user guide with connection instructions, feature reference, serial protocol, and keyboard shortcuts.

---

## Other Pages

### ZN Tuner (`/zn`)
Dedicated Ziegler-Nichols tuning workspace (`ZNTunerTab`):
* Per-joint gain increment controls and step commands (`t1`, `t2`)
* Live target vs actual chart in degrees
* Caliper selection analyzer computing $T_u$, $f_u$, and recommended PID rules

### Test Page (`/test`)
Engineering mode with four tabs: Monitor, Analysis (includes `RawSignalSection`), Rest Analysis, and **Params Tuner** (`AdvTunerTab`) for all 26 runtime constants.

---

## Header Controls (All Pages)

* **Mode Badge** — shows current ESP32 mode (`IDLE`, `SCARA`, `ZN`, `TEST`)
* **Connect / Disconnect** — Web Serial port management with auto-reconnect
* **Serial Monitor** — toggle bottom-sheet log panel
* **E-STOP / RESUME** — emergency stop and motor re-enable
* **☰ Settings Menu (`CaptureMenu`)** — page navigation, display preferences, keyboard shortcuts, graph exports, and ZIP packaging

---

## Advanced Features

### Advanced Graph Analyzer (Chart Focus Mode)
When telemetry charts are expanded to full screen:
* Measurement calipers with $\Delta t$, $\Delta Y$, and frequency readouts
* 2D rectangular zoom and pan tools
* Signal visibility toggles and regional viewport statistics (P2P, Mean, RMS, $\sigma$)

### Capture & Export (`CaptureMenu`)
* Angular unit toggle (radians / degrees) and ghost trail opacity
* Individual graph PNG/JPEG export at 1×, 2×, or 3× DPI
* ZIP packaging of all graphs, CSV telemetry, and system parameters SVG report

### Keyboard Shortcuts
Configurable via the settings menu. Defaults include tab switching (`1`/`2`/`3`), E-STOP (`Backspace`), ghost toggle (`g`), serial connect (`s`), and more.

---

## Technology Stack

* **Framework**: Next.js v16 (App Router), React v19, TypeScript v5
* **Styling**: Tailwind CSS v4 — industrial dark mode palette
* **Hardware Interface**: Web Serial API at **921600** baud
* **Graphics**: HTML5 Canvas (workspace) and Recharts v3.8.1 (telemetry)
* **UI Primitives**: Radix UI, Sonner toasts, react-resizable-panels
* **Packaging**: JSZip (client-side ZIP export)

---

## Getting Started

### Installation
```bash
# Using Bun (recommended)
bun install

# Using NPM
npm install
```

### Development Server
```bash
bun dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge.

### Connect to Microcontroller
1. Plug the ESP32 into a USB port.
2. Click **Connect** in the header.
3. Select the matching COM port in the browser popup.
4. The HMI sends `getgains` and `getparams` on connect, and `ping` every few seconds to keep the firmware watchdog alive.
5. Ensure firmware UART baud rate is **921600**.

For a step-by-step new-user walkthrough, open the **README** tab on the home page.
