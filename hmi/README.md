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
| `/test` | `TEST` | Engineering test bench — adds Params Tuner (33 parameters) and Raw Signal sections |
| `/pcb` | — | Interactive ESP32 Controller PCB layout, schematic, and CAD viewer |
| `/login` | — | Google OAuth sign-in portal |
| `/dashboard` | — | Saved Runs History with comparison tabs (Trajectory, Velocity, PID, Feedforward, Metrics, Advanced, AI Copilot) — Protected |

All routes share a single `HMIProvider` serial session. Switch pages via the header menu without disconnecting.

---

## Home Page Tabs (`/`)

### 1. Monitor Tab
* **3D XY Workspace Trace (`SCARA3DCanvas`)**: Interactive 3D React Three Fiber (R3F) and OrbitControls workspace visualizer. Renders solid CAD link models (darkened to `#3B82F6` and `#F97316` to prevent blowout), ideal path (dashed blue `#2563EB`), actual path (red `#DC2626`), start point sphere, target flagpole, and previous run ghost trail. Implements a `CameraInitializer` with Z-axis offset (`-0.074999`) to prevent polar singularity/gimbal lock. Reachable boundaries are rendered in high-contrast electric blue (`#00e5ff`) in dark mode or cyan in light mode. Includes an invisible raycast floor catcher (`RaycastFloor`) for coordinate targeting.
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
* **Control Internal** — J1 integrator buffer tracking
* **Stepper Velocity** — command speeds of stepper drive
* **PID Breakdown** — P, I, D term splits for Joint 1
* **Loop Duration** — microcontroller execution time (~80 µs)
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
Engineering mode with four tabs: Monitor, Analysis (includes `RawSignalSection`), Rest Analysis, and **Params Tuner** (`AdvTunerTab`) for all 33 runtime parameters.

### PCB Page (`/pcb`)
Interactive Controller PCB page providing a 3-tab layout: **PCB Layout** (assembly/layout SVG viewer), **Schematic** (circuit diagram viewer), and **CAD** (interactive 3D CAD step viewer), alongside component specification listings and GPIO maps.

---

## Header Controls (All Pages)

* **Mode Badge** — shows current ESP32 mode (`IDLE`, `SCARA`, `ZN`, `TEST`)
* **Connect / Disconnect** — Web Serial port management with auto-reconnect
* **Serial Monitor** — toggle bottom-sheet log panel
* **E-STOP / RESUME** — emergency stop and motor re-enable
* **Theme Toggle** — switch between dark and light mode
* **Command Palette (Ctrl+K)** — quick action launcher
* **Run + Save** — capture current target coordinates, initiate a move, and save telemetry to database
* **☰ Settings Menu (`CaptureMenu`)** — display preferences, keyboard shortcuts, ghost trail opacity, angular units, graph exports, and ZIP packaging

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
* **Database**: Turso (LibSQL edge SQLite) with Drizzle ORM v0.45
* **Authentication**: NextAuth.js v5 with Google OAuth provider
* **AI Copilot**: Google Gemini API with model fallback chain, Cloudflare KV for history
* **Styling**: Tailwind CSS v4 — industrial dark mode palette (zinc bases)
* **Hardware Interface**: Web Serial API at **921600** baud
* **Graphics**: React Three Fiber & Three.js (3D workspace visualizer), Recharts v3.8.1 (telemetry charts)
* **UI Primitives**: Radix UI, Sonner toasts, react-resizable-panels
* **Packaging**: JSZip (client-side ZIP export of graphs, CSV, and SVG reports)

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

Open [http://localhost:3000](http://localhost:3000) or navigate to the live hosted site at **[tugasakhir.adihnursyam.com](https://tugasakhir.adihnursyam.com)** in Chrome or Edge.

### Connect to Microcontroller
1. Plug the ESP32 into a USB port.
2. Click **Connect** in the header.
3. Select the matching COM port in the browser popup.
4. The HMI sends `getgains` and `getparams` on connect, and `ping` every 2 seconds to keep the firmware watchdog alive.
5. On `/zn` and `/test` routes, the HMI sends `plot,1` to enable high-rate `D`-line telemetry. On `/`, it sends `plot,0` to reduce traffic.
6. Ensure firmware UART baud rate is **921600**.

For a step-by-step new-user walkthrough, open the **README** tab on the home page.
