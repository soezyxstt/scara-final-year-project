# SCARA Robot HMI Context Document
**2-DOF Planar SCARA | Next.js 16 Client Dashboard | Turso & Drizzle Integration**  
*Adi Haditya Nursyam — Tugas Sarjana, ITB 2026 (Updated June 2026)*

---

## 1. Project Overview

### What the Project Does
This project is a web-based **Human-Machine Interface (HMI)** dashboard designed for real-time telemetry, visual trajectory mapping, performance analysis, and tuning control of a **2-Degree-of-Freedom (2-DOF) planar SCARA robot**. The HMI serves as a dynamic workspace visualizer and diagnostic toolkit for practical learning in dynamic control systems.

### Tech Stack Summary
*   **Frontend Web Shell**: Next.js v16.2.6 (App Router) & React v19.2.4.
*   **State & Hardware Ingestion**: Pure client-side React Context and Reducer.
*   **Hardware Interface Layer**: HTML5 Web Serial API (`navigator.serial`).
*   **Styling**: Tailwind CSS v4 (configured with a high-contrast industrial dark mode palette).
*   **Visualizations**:
    *   **React Three Fiber (R3F) & Three.js**: Interactive 3D rendering of physical CAD linkage models, coordinate trajectory tracking paths, and reachable workspace safety limits.
    *   **Recharts v3.8.1**: Declarative plots for telemetry streams, Discrete Fourier Transforms (DFT/FFT), and control effort curves.
*   **Interactive Hardware Viewer**:
    *   **Embedded CAD & PCB Layout**: SVG-based board placement layouts and interactive 3D step CAD viewer.
*   **UI Primitives**: Radix UI wrappers styled with Tailwind v4.
*   **Build/Package Manager**: Bun / NPM.

### High-Level Architecture & Layer Communication
```
┌────────────────────────────────────────────────────────┐
│               HMI LAYER (Web Browser Client)           │
│                                                        │
│  ┌──────────────────┐           ┌───────────────────┐  │
│  │  R3F / Three.js  │           │    useSerial      │  │
│  │ (SCARA3DCanvas)  │           │   (Read Loop)     │  │
│  └────────▲─────────┘           └────────▲──────────┘  │
│           │                              │             │
│   React Context State Dispatch           │             │
│           │                              │             │
│  ┌────────┴──────────────────────────────┴──────────┐  │
│  │                   HMI Context                    │  │
│  │       (Reducer, Buffer Management, Persist)      │  │
│  └────────────────────────────────────────▲─────────┘  │
└───────────────────────────────────────────┼────────────┘
                                            │ USB Serial
                                            │ (Baud Rate: 921600)
                                            ▼
┌────────────────────────────────────────────────────────┐
│             FIRMWARE LAYER (ESP32 MCU Robot)           │
│                                                        │
│  ┌──────────────────┐           ┌───────────────────┐  │
│  │  Servo/Stepper   │◄──────────┤   Inverse & Fwd   │  │
│  │   DC Controllers │           │    Kinematics     │  │
│  └──────────────────┘           └───────────────────┘  │
└────────────────────────────────────────────────────────┘
```
1.  **Architecture Reality (No Python Backend / WebSockets)**: The HMI is a **100% client-side serverless application**. There is no server-side API routing, no WebSocket server, and no active Python backend in this repository. All communication is established directly between the web browser and the ESP32 microcontroller over a physical USB serial connection using the browser's Web Serial API.
2.  **Downstream Commands**: The HMI sends commands as comma-separated ASCII string lines terminated with a newline (`\n`) to the serial buffer.
3.  **Upstream Telemetry**: The ESP32 writes CSV telemetry packets over the UART serial interface. The HMI opens an asynchronous stream reader, chunks the stream by newlines, parses the tokens, and dispatches them into the application's global buffers.

---

## 2. File & Folder Structure

Below is the annotated directory tree detailing the purpose of every key file in the workspace:

```text
hmi/
├── app/                              # Next.js App Router Root Shell
│   ├── actions/
│   │   └── experiment.ts             # Server actions for automated experiment DB writes
│   ├── api/                          # REST API endpoints
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── runs/route.ts             # GET (list) / POST (create) runs
│   │   ├── runs/[id]/route.ts        # GET / DELETE individual runs
│   │   └── runs/[id]/copilot/route.ts # Streaming AI Copilot (Gemini)
│   ├── dashboard/                    # Protected: /dashboard
│   │   ├── page.tsx
│   │   └── dashboard-content.tsx
│   ├── eksperimen/                   # [DEPRECATED] Protected: /eksperimen
│   │   ├── page.tsx
│   │   └── experiment-client.tsx
│   ├── hasil-eksperimen/             # [DEPRECATED] Public: /hasil-eksperimen
│   │   ├── page.tsx
│   │   └── results-client.tsx
│   ├── login/                        # Public: /login
│   │   ├── page.tsx
│   │   └── login-content.tsx
│   ├── zn/                           # Public: /zn
│   │   ├── page.tsx
│   │   └── zn-page-content.tsx
│   ├── test/                         # Public: /test
│   │   ├── page.tsx
│   │   └── test-page-content.tsx
│   ├── pcb/                          # Public: /pcb
│   │   ├── page.tsx
│   │   ├── pcb-page-content.tsx
│   │   └── pcb-data.json             # Components list and GPIO mappings
│   ├── globals.css                   # [Config] Tailwind CSS v4 Theme, Keyframes, Scrollbars
│   ├── layout.tsx                    # [Entry] Root layout + Providers wrapper
│   └── providers.tsx                 # [Entry] HMIProvider, ModeRouter, KeybindingsHandler
├── components/                       # Shared Component Layer
│   ├── dashboard/                    # Historical analytics (10 components)
│   │   ├── trajectory-tab.tsx        # XY overlay of selected runs
│   │   ├── velocity-tab.tsx          # Velocity & control comparison
│   │   ├── pid-tab.tsx               # PID & CTE comparison
│   │   ├── feedforward-tab.tsx       # Feedforward torque comparison
│   │   ├── metrics-tab.tsx           # Side-by-side metrics table
│   │   ├── advanced-tab.tsx          # Combined FFT + advanced metrics
│   │   ├── copilot-tab.tsx           # AI Copilot analysis panel
│   │   ├── chart-card.tsx            # Generic chart card wrapper
│   │   ├── dashboard-xy-trace.tsx    # Dedicated XY trace for dashboard
│   │   └── run-selector.tsx          # Run selection sidebar
│   ├── hmi/                          # Core HMI Features & Views (30 components)
│   │   ├── advanced-analysis.tsx     # FFT, control effort, CTC torques, loop diagnostics
│   │   ├── adv-tuner-tab.tsx         # 33 runtime constants tuner (Test page only)
│   │   ├── analysis-tab.tsx          # Post-run diagnostics layout
│   │   ├── capture-charts-host.tsx   # Off-screen chart render host for exports
│   │   ├── capture-menu.tsx          # Settings sidebar, exports, keybindings
│   │   ├── chart-panel.tsx           # Telemetry charts + MetricsPanel (embedded)
│   │   ├── command-palette.tsx       # Ctrl+K command palette
│   │   ├── comparison-table.tsx      # CSV exporter and sample table
│   │   ├── control-panel.tsx         # PID, moves, feedforward, microstepping
│   │   ├── header.tsx                # Legacy header (unused)
│   │   ├── hmi-root.tsx              # Home shell — inline header with mode badge, connect, ESTOP, theme, palette, run button
│   │   ├── hmi-tutorial.tsx          # Onboarding tutorial overlay
│   │   ├── keybindings-handler.tsx   # Global keyboard shortcut listeners
│   │   ├── mode-router.tsx           # Auto mode,scara|zn|test per route
│   │   ├── monitor-tab.tsx           # Live monitoring layout
│   │   ├── params-report.tsx         # SVG system parameters report
│   │   ├── phase-portrait.tsx        # Joint state-space vs plot
│   │   ├── raw-signal-section.tsx    # Raw ADC overlay (Test page)
│   │   ├── readme-tab.tsx            # In-app user guide
│   │   ├── run-button.tsx            # Run + Save button
│   │   ├── save-run-dialog.tsx       # Dialog for naming & saving runs
│   │   ├── scara-arm-3d.tsx          # R3F 3D SCARA canvas container & camera limits
│   │   ├── serial-log.tsx            # Serial log console content
│   │   ├── serial-terminal.tsx       # Bottom-sheet serial monitor shell
│   │   ├── step-metrics.tsx          # Step metrics for rest analysis
│   │   ├── theme-provider.tsx        # Theme context provider (dark/light)
│   │   ├── theme-toggle.tsx          # Theme toggle button
│   │   ├── xy-trace.tsx              # Workspace trace plotter (embeds 3D canvas)
│   │   ├── zn-analysis-tab.tsx       # Rest Analysis tab
│   │   └── zn-tuner-tab.tsx          # ZN page tuner workspace
│   ├── mode-badge.tsx                # ModeBadge component (at components/root)
│   └── ui/                           # Atomic Radix + Tailwind Primitive Wrapper Components
├── hooks/
│   └── use-heartbeat.ts              # Periodic ping to firmware watchdog
├── lib/                              # Core Logic & Utilities Layer
│   ├── actions/
│   │   └── experiment.ts             # Experiment DB insert server actions
│   ├── db/                           # Turso DB layer
│   │   ├── schema/experiment.ts      # Experiment run schemas
│   │   ├── backup.ts                 # Server-side JSONL backup writer
│   │   ├── index.ts                  # SQL database client
│   │   ├── queries.ts                # DB insertion and selection procedures
│   │   └── schema.ts                 # Runs, users, samples tables
│   ├── ai-client.ts                  # Google Gen AI client with model fallback chain
│   ├── capture-session.ts            # Export session state
│   ├── capture-utils.ts              # ZIP/PNG/JPEG export helpers
│   ├── cloudflare-services.ts        # Cloudflare KV REST client
│   ├── cte-utils.ts                  # Cross/along tracking error computation
│   ├── hmi-context.tsx               # Global reducer + Web Serial read-loop
│   ├── hmi-types.ts                  # State and sample interfaces
│   ├── keybindings-store.ts          # Keyboard shortcut persistence
│   ├── localMean.ts                  # Local regression (LOESS) utility
│   ├── telemetry-types.ts            # Auto-generated telemetry field types
│   ├── trajectory-safety.ts          # Move validation rules
│   ├── tuning-advisor.ts             # Rule-based PID suggestions
│   └── utils.ts                      # Tailwind class helper (cn)

### Core HMI Components (`components/hmi/`)

#### 1. `HMIRoot`
*   **File Path**: [hmi-root.tsx](../../hmi/components/hmi/hmi-root.tsx)
*   **Purpose**: Home page entry shell. Renders an inline header bar and manages tab state (`'monitor' | 'analysis' | 'rest' | 'readme'`). Serial connection and `HMIProvider` live in `app/providers.tsx` so they persist across route changes.
*   **Props**: None.
*   **Controls/Renders**: Tab links, `ModeBadge` (from `components/mode-badge.tsx`), Connect/Disconnect, Serial Monitor toggle, E-STOP/RESUME, `ThemeToggle`, `CommandPalette`, `RunButton`, and `CaptureMenu`.

#### 2. `MonitorTab`
*   **File Path**: [monitor-tab.tsx](../../hmi/components/hmi/monitor-tab.tsx)
*   **Purpose**: Layout organizer for the live telemetry panel.
*   **Props**: None.
*   **Controls/Renders**: Horizontal split — `XYTrace` left, `ChartPanel` + `MetricsPanel` right (vertical split). `ControlPanel` pinned to the bottom. Serial log moved to header `SerialTerminalSheet`.

#### 3. `AnalysisTab`
*   **File Path**: [analysis-tab.tsx](../../hmi/components/hmi/analysis-tab.tsx)
*   **Purpose**: Layout organizer for the post-run diagnostic panel (frozen buffers only).
*   **Props**: None.
*   **Controls/Renders**: Collapsible "Advanced Analysis" with `PhasePortrait`, EEF error/velocity charts, `PWMChart`, `ControlEffortSection`, `CTCTorqueSection`, `LoopDurationSection`. Collapsible `ComparisonTable` below.

#### 4. `XYTrace`
*   **File Path**: [xy-trace.tsx](../../hmi/components/hmi/xy-trace.tsx)
*   **Purpose**: Renders the 3D SCARA workspace visualizer client wrapper, integrating safety limits checking and coordinate path traces.
*   **Props**: None.
*   **Controls/Renders**:
1. **Three.js WebGL rendering via `SCARA3DCanvas`**: Incorporates realistic CAD models for robot links J1 and J2 with darkened colors (`#3B82F6` and `#F97316`) for shading contrast, stacked at J1 (Z=35 mm) and J2 (Z=5 mm) heights.
2. **Path Visualizations**: Draws ideal planned trajectories (dashed blue, `#2563EB`) and actual tracking results (solid red, `#DC2626`) directly in the 3D space.
3. **Workspace Boundaries**: Shows reachable boundaries in electric blue (`#00e5ff` in dark mode) or cyan (in light mode) to provide crisp contrast.
4. **Orientation and Stabilizers**: Employs a tiny camera offset (`-0.074999` in Z-axis) via `CameraInitializer` to avoid gimbal lock/polar singularities on reset.
5. **Interactive Controls**: Toggle switches for Ghost Trail rendering (opacity loaded from `localStorage`), Arm visibility, OrbitControls zoom/pan/rotate, and Focus Mode.
6. **Safety Indicators**: Integrates boundary alerts (red trajectory paths and warning cards) when proposed coordinates trigger safety violations ($R < 70.7\text{ mm}$ singularity or $R > 170\text{ mm}$ reach boundary).
*   **Events**: Listens for the custom `hmi_config_updated` window event to reactively update the ghost trail opacity.

#### 5. `ChartPanel`, `MetricsPanel` & Helper Charts
*   **File Path**: [chart-panel.tsx](../../hmi/components/hmi/chart-panel.tsx)
*   **Purpose**: Organizes and plots real-time telemetry (throttled to 5 Hz DOM updates). Switches to `AdvancedAnalyzer` in focus mode.
*   **Props**: None.
*   **Controls/Renders**:
    *   `MetricsPanel`: Post-run summary grid (AI, MCTE, RMS ATE, RMSE, jitter, settling time) — rendered below charts on Monitor tab.
    *   Chart tabs: `CTEChart`, `ATEChart`, `PositionChart`, `VelocityChart`, `PIDChart`, `J1CtrlChart`, `J2VelChart`.
    *   Focus mode unlocks caliper, zoom, pan, and viewport statistics tools.

#### 6. `ControlPanel` & `GainField`
*   **File Path**: [control-panel.tsx](../../hmi/components/hmi/control-panel.tsx)
*   **Purpose**: User input console to send commands to the microcontroller.
*   **Props**: None.
*   **Controls/Renders**:
    *   Move target: Coordinates $X_f$ and $Y_f$ input fields, Elbow configuration select dropdown (Right $+1$ / Left $-1$), and "Send Move" button. Includes real-time straight-line trajectory safety checking, displaying validation warnings before sending commands.
    *   J1 DC PID Gains: $K_{p1}, K_{i1}, K_{d1}$ forms and submit.
    *   J2 Stepper PID Gains: $K_{p2}, K_{i2}, K_{d2}$ forms and submit (Ki2 has been restored).
    *   Microstep: Dropdown menu selector (`Full`, `Half`, `Quarter`, `1/8`, `1/16`).
    *   PID field state machine: Typing locks prevents incoming gains sync from overwriting active typing fields (with blur to submit).

#### 7. `ZNAnalysisTab` (Rest Analysis)
*   **File Path**: [zn-analysis-tab.tsx](../../hmi/components/hmi/zn-analysis-tab.tsx)
*   **Purpose**: Continuous high-rate telemetry workspace for step-response and rest-state analysis on the Home and Test pages.
*   **Props**: `isActive: boolean`.
*   **Controls/Renders**: Joint selector, view modes (pos/raw/compare/vel/fft), drag caliper analyzer, step commands, freeze/scroll, scoped CSV export.

#### 8. `PhasePortrait`
*   **File Path**: [phase-portrait.tsx](../../hmi/components/hmi/phase-portrait.tsx)
*   **Purpose**: Graphing panel for state-space dynamics.
*   **Props**: `PhasePortraitProps` accepting optional `frozenD?: DSample[]`.
*   **Controls/Renders**: Plots angular position ($\theta$) on the X-axis vs angular velocity ($\dot{\theta}$) on the Y-axis for both Joint 1 (Blue) and Joint 2 (Orange) simultaneously using Recharts.

#### 9. `FFTSection`, `ControlEffortSection` & Specialized Diagnostic Charts
*   **File Path**: [advanced-analysis.tsx](../../hmi/components/hmi/advanced-analysis.tsx)
*   **Purpose**: Advanced analytical sections for signal processing, work metrics, torque components, and execution diagnostics.
*   **Props**: None.
*   **Controls/Renders**:
    *   `FFTSection`: Amplitude frequency spectrum after computing a Discrete Fourier Transform (DFT) capped at 512 samples. Supports signal switching (`eef`, `th1`, `th2`).
    *   `ControlEffortSection`: Running integral of absolute PWM signals: $\int |PWM|\,dt$ over time.
    *   `CTCTorqueSection`: Feedforward torque compensation vs feedback controller outputs (Computed Torque Control torque variables).
    *   `ControlInternalSection`: J1 integrator buffer tracking.
    *   `StepperVelocitySection`: Command speeds of the stepper drive.
    *   `PIDBreakdownSection`: Proportional, Integral, and Derivative term splits for Joint 1.
    *   `LoopDurationSection`: Real-time loop execution duration on the microcontroller (microseconds).

#### 10. `ComparisonTable`
*   **File Path**: [comparison-table.tsx](../../hmi/components/hmi/comparison-table.tsx)
*   **Purpose**: Tabulates telemetry points chronologically and provides CSV export capabilities.
*   **Props**: None.
*   **Controls/Renders**: Renders a paginated table of raw data columns (Sample Index, Timestamp, Desired/Actual angles and errors, and Euclidean tooltip error) and an "Export CSV" trigger.

### Additional Components

#### `SerialLog` & `SerialTerminalSheet`
*   **File Paths**: [serial-log.tsx](../../hmi/components/hmi/serial-log.tsx), [serial-terminal.tsx](../../hmi/components/hmi/serial-terminal.tsx)
*   **Purpose**: Resizable bottom-sheet serial monitor toggled from the header.
*   **Controls/Renders**: Filters high-frequency `D`, `T`, `F`, `E`, `B` packets. Badges for `MOVE` (`M`), `DONE` (`S`), `GAINS` (`G`), MODE (`X`). Clear Log and Clear Graph (`clrgraph` + `FLUSH_BUFFERS` dispatch). Filter toggle, expand-to-fullscreen.

#### `ReadmeTab`
*   **File Path**: [readme-tab.tsx](../../hmi/components/hmi/readme-tab.tsx)
*   **Purpose**: In-app user guide with connection instructions, kinematics, ZN methodology.
*   **Props**: None.

#### `AdvTunerTab` (Test Page Only)
*   **File Path**: [adv-tuner-tab.tsx](../../hmi/components/hmi/adv-tuner-tab.tsx)
*   **Purpose**: Engineering params tuner on `/test` — syncs and tunes **33** runtime constants with inline status LEDs and trajectory queue panel (vmax, amax, cfreq, u1max, td1r, td2r, dben, dbrel, db2en, db2rel, kv1, vffmax, vffdv, etc.).
*   **Props**: None.

#### `ZNTunerTab` (`/zn` Page)
*   **File Path**: [zn-tuner-tab.tsx](../../hmi/components/hmi/zn-tuner-tab.tsx)
*   **Purpose**: Dedicated Ziegler-Nichols tuning workspace on the `/zn` route.
*   **Props**: `isActive: boolean`.

#### 12. `ReadmeTab`
*   **File Path**: [readme-tab.tsx](../../hmi/components/hmi/readme-tab.tsx)
*   **Purpose**: A local documentation tab containing user instructions, connection guides, mathematical explanations of the SCARA kinematics, ZN tuning methodology, and an example Arduino integration sketch.
*   **Props**: None.

#### `AdvTunerTab` (Test Page Only)
*   **File Path**: [adv-tuner-tab.tsx](../../hmi/components/hmi/adv-tuner-tab.tsx)
*   **Purpose**: Engineering params tuner on `/test` — syncs and tunes **33** runtime parameters with inline status LEDs and trajectory queue panel.
*   **Props**: None.

#### 14. `ZNTunerTab` (`/zn` Page)
*   **File Path**: [zn-tuner-tab.tsx](../../hmi/components/hmi/zn-tuner-tab.tsx)
*   **Purpose**: Dedicated Ziegler-Nichols tuning workspace on the `/zn` route.
*   **Props**: `isActive: boolean`.
*   **Controls/Renders**:
    *   Gain Increment Controllers: Caliper buttons to bump gains and deadbands by custom step sizes.
    *   Step Command Dispatcher: Command stepper increments or custom serial updates.
    *   Decoupled Telemetry Graph: View targets vs actuals in degrees, with freeze and viewport scroll locking.
    *   Caliper selection analyzer: Drag on graphs to isolate samples and compute Ultimate Period ($T_u$), ultimate frequency ($f_u$), transient step response metrics (Rise, Settling, OS%, Damping Ratio, Natural Frequencies) or rest statistics (mean, std deviation, P2P, SNR).
    *   Tuning configuration rules table: classical PID, P, PI, Some Overshoot, or No Overshoot recommendation matrix.

#### 15. `ParamsReportChart`
*   **File Path**: [params-report.tsx](../../hmi/components/hmi/params-report.tsx)
*   **Purpose**: Renders an industrial vector SVG diagnostic report containing all current controller constants, gains, loop parameters, and limits. Used for captures.
*   **Props**: `width?: number`, `height?: number`.

#### `CommandPalette`
*   **File Path**: [command-palette.tsx](../../hmi/components/hmi/command-palette.tsx)
*   **Purpose**: Ctrl+K command palette for quick actions (connect, disconnect, mode switch, tab switch).
*   **Props**: None.

#### `RunButton` & `SaveRunDialog`
*   **File Paths**: [run-button.tsx](../../hmi/components/hmi/run-button.tsx), [save-run-dialog.tsx](../../hmi/components/hmi/save-run-dialog.tsx)
*   **Purpose**: `RunButton` captures target coordinates from the control panel and initiates a trajectory move + DB save. `SaveRunDialog` prompts for a run name before saving to Turso.
*   **Props**: None.

#### `HmiTutorial`
*   **File Path**: [hmi-tutorial.tsx](../../hmi/components/hmi/hmi-tutorial.tsx)
*   **Purpose**: Onboarding tutorial overlay displayed on first visit. Steps through connecting, moving, and saving a run.
*   **Props**: None.

#### `ThemeToggle` & `ThemeProvider`
*   **File Paths**: [theme-toggle.tsx](../../hmi/components/hmi/theme-toggle.tsx), [theme-provider.tsx](../../hmi/components/hmi/theme-provider.tsx)
*   **Purpose**: Dark/light mode toggle and context provider using Tailwind `class` strategy. Persisted in `localStorage`.
*   **Props**: None.

#### `StepMetrics`
*   **File Path**: [step-metrics.tsx](../../hmi/components/hmi/step-metrics.tsx)
*   **Purpose**: Step response metrics calculator for rest analysis (rise time, settling time, overshoot, damping ratio, SNR).
*   **Props**: None.

#### `CaptureMenu`
*   **File Path**: [capture-menu.tsx](../../hmi/components/hmi/capture-menu.tsx)
*   **Purpose**: Slide-out configuration sidebar. Manages angular units preferences, workspace transparency settings, and exposes full diagnostics package bundling.
*   **Props**: None.
*   **Controls/Renders**: Toggle buttons for radians/degrees, slider for ghost trail opacity, collapsibles for specific graph exports (PNG/JPEG), and ZIP generation buttons for all graphs or all graphs + table CSV + system parameters report SVG.

#### 17. `KeybindingsHandler`
*   **File Path**: [keybindings-handler.tsx](../../hmi/components/hmi/keybindings-handler.tsx)
*   **Purpose**: Registers global keyboard shortcuts to toggle views and trigger common interactions (Emergency Stop, tab switching).
*   **Props**: None.

#### 18. `AdvancedAnalyzer`
*   **File Path**: Inside [chart-panel.tsx](../../hmi/components/hmi/chart-panel.tsx)
*   **Purpose**: Industrial-grade analysis console embedded in the focused chart panel view.
*   **Props**: `activeTab: 'eef' | 'eef_vel' | 'pwm' | 'pos' | 'vel'`, `dBuf: DSample[]`, `tBuf: TPoint[]`, `angularUnit: string`.
*   **Controls/Renders**:
    *   Caliper tool (📐): Interactive measurement calipers placing vertical and horizontal reference markers to compute deltas ($\Delta t$, $\Delta y$) and frequencies ($1/\Delta t$).
    *   Zoom tool: Click and drag bounding boxes to crop time (X) and amplitude (Y) bounds. Double-click resets zoom.
    *   Pan tool: Horizontal timeline scrolling.
    *   Grid opacity controller: Slider adjusting Cartesian grids.
    *   Signal visibility checklists: Enables toggling individual telemetry line curves.
    *   Dynamic window stats block: Auto-computes Peak-to-Peak, Mean, RMS, and Standard Deviation ($\sigma$) of visible data frames.

---

### Atomic UI Components (`components/ui/`)

These are design primitives styled for the dark theme grid layout.

| Component | File Path | Props Accepted | Purpose |
| :--- | :--- | :--- | :--- |
| `Badge` | [badge.tsx](../../hmi/components/ui/badge.tsx) | `React.HTMLAttributes<HTMLDivElement>`, `VariantProps<typeof badgeVariants>` | Renders status tags and badges (e.g. Online, Connected). |
| `Button` | [button.tsx](../../hmi/components/ui/button.tsx) | `ButtonProps` (extends `React.ButtonHTMLAttributes<HTMLButtonElement>` + CVA variants: `default`, `outline`, `ghost`, `estop`) | Customized clickable button action. |
| `Card` | [card.tsx](../../hmi/components/ui/card.tsx) | `React.HTMLAttributes<HTMLDivElement>` | Structural containers with background borders. |
| `Collapsible` | [collapsible.tsx](../../hmi/components/ui/collapsible.tsx) | Radix `CollapsibleProps` | Slide-down container wrapper for Advanced Analysis toggles. |
| `Input` | [input.tsx](../../hmi/components/ui/input.tsx) | `React.InputHTMLAttributes<HTMLInputElement>` | Input text fields. |
| `Resizable` | [resizable.tsx](../../hmi/components/ui/resizable.tsx) | `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` (React-Resizable-Panels wrappers) | Implements custom drag-resize handle dividers. |
| `Select` | [select.tsx](../../hmi/components/ui/select.tsx) | Radix Select Primitive wrappers | Handles drop-down menu selectors (gains configuration, microsteps). |
| `Sheet` | [sheet.tsx](../../hmi/components/ui/sheet.tsx) | Radix Sheet Primitive components | Handles sidebar slide-out layouts (e.g. Capture menu sheet). |
| `Table` | [table.tsx](../../hmi/components/ui/table.tsx) | standard HTML table tag properties | Formats the CSV tabular data rows. |
| `Tabs` | [tabs.tsx](../../hmi/components/ui/tabs.tsx) | Radix Tabs Primitive wrappers | Switches between telemetry chart graphs. |
| `Tooltip` | [tooltip.tsx](../../hmi/components/ui/tooltip.tsx) | Custom helper props wrapping Radix Tooltip | Shows inline description guides with custom animations on hover. |

---

## 4. API & Data Flow

As the codebase features **no server API layers**, all data operations flow over the direct Web Serial channel as newline-delimited, comma-separated values (CSV ASCII strings).

```
┌────────────────────────────────────────────────────────┐
│                   DOWNSTREAM FLOW                      │
│                                                        │
│  [ControlPanel] ───►  serial.sendCommand(string)       │
│                                │                       │
│                                ▼                       │
│                         Web Serial Write               │
│                                │                       │
│                                ▼                       │
│                       ESP32 parses commands            │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                    UPSTREAM FLOW                       │
│                                                        │
│  ESP32 prints telemetry over serial                    │
│                                │                       │
│                                ▼                       │
│  [hmi-context] ───►  readLoop chunks by '\n'           │
│                                │                       │
│                                ▼                       │
│                      parseLine checks Prefix           │
│                                │                       │
│                                ▼                       │
│                  dispatch({ type, payload })           │
└────────────────────────────────────────────────────────┘
```

### Downstream Command Directory (HMI ➔ ESP32)

Commands are written to the port's stream writer as raw strings terminated with `\n` via the `sendCommand` callback in `useSerial`:

| Target Payload Format | Triggering Frontend Source Component | Description / Functionality |
| :--- | :--- | :--- |
| `move,<x>,<y>` | `ControlPanel` (Submit Coordinate Move Form) | Requests linear movement of end-effector to target coordinate location $(x,y)$ in millimeters. |
| `elbow,<val>` | `ControlPanel` (Elbow config dropdown switch) | Instructs inverse kinematics logic to configure joints for Right-handed (`1`) or Left-handed (`-1`) kinematic solutions. |
| `kp1,<val>` | `ControlPanel` (Submit J1 Proportional Gain) | Updates Joint 1 Proportional Gain ($K_{p1}$) in active RAM on microcontroller. |
| `ki1,<val>` | `ControlPanel` (Submit J1 Integral Gain) | Updates Joint 1 Integral Gain ($K_{i1}$) in active RAM on microcontroller. |
| `kd1,<val>` | `ControlPanel` (Submit J1 Derivative Gain) | Updates Joint 1 Derivative Gain ($K_{d1}$) in active RAM on microcontroller. |
| `kp2,<val>` | `ControlPanel` (Submit J2 Proportional Gain) | Updates Joint 2 Proportional Gain ($K_{p2}$) in active RAM on microcontroller. |
| `ki2,<val>` | `ControlPanel` (Submit J2 Integral Gain) | Updates Joint 2 Integral Gain ($K_{i2}$) in active RAM on microcontroller. |
| `kd2,<val>` | `ControlPanel` (Submit J2 Derivative Gain) | Updates Joint 2 Derivative Gain ($K_{d2}$) in active RAM on microcontroller. |
| `mstep,<val>` | `ControlPanel` (Microstepping select dropdown) | Subdivides physical stepper resolution. Valid arguments: `1`, `2`, `4`, `8`, or `16`. |
| `getgains` | `useSerial` (Mount handshake), `ControlPanel` | Queries active PID parameter values and microstepping dividers. |
| `getparams` | `AdvTunerTab` (Sync button), connect handshake | Queries parameter block `K`. |
| `ping` | `useHeartbeat` hook | Resets firmware serial watchdog (8 s timeout). |
| `mode,<name>` | `ModeRouter` | Auto-sends `mode,scara|zn|test` when route changes. |
| `plot,<0\|1>` | `HMIProvider` pathname effect | Enables high-rate D logging on `/zn` and `/test`. |
| `resume` | Header RESUME button | Clears E-STOP state. |
| `clrgraph` | `SerialLog` (Clear Graph button) | Purges trajectory buffers. |
| `estop` | Header E-STOP button | Emergency stop — cuts motor outputs. |
| `ffi,<val>` / `ffc,<val>` / `ffg,<val>` | `ControlPanel` | Feedforward blend factors (0–1). |
| `<param>,<val>` | `AdvTunerTab` (Test page) | Sets any of 33 runtime parameters (`vmax`, `amax`, `cfreq`, `td1r`, `td2r`, `kv1`, `vffmax`, `vffdv`, etc.). |

---

## 5. Web Serial Protocol Details

All client-microcontroller bindings are initialized in [hmi-context.tsx](../../hmi/lib/hmi-context.tsx).

### Web Serial Lifecycle & Read-Loop
1.  **Request & Open**:
    Clicking "Connect" calls `navigator.serial.requestPort()`. The system reads properties via `port.getInfo()`, registers the selected port string descriptor in `localStorage` under key `hmi_lastPort`, opens the connection at **921600 baud**, and saves the writer reference in a React useRef variable.
2.  **Handshake**:
    Upon successful connection, the HMI sends `getgains` and `getparams`. The `useHeartbeat` hook sends `ping` periodically. `ModeRouter` sends the correct `mode,<name>` for the active route.
3.  **Read-Loop**:
    An asynchronous loops starts:
    ```typescript
    const reader = port.readable!.getReader();
    let buf = '';
    while (activeRef.current) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // keep incomplete line segment in buffer
      for (const ln of lines) parseLine(ln);
    }
    ```
4.  **Disconnect Cleanup**:
    Clicking "Disconnect" sets the reader's active state variable to false, cancels reader locks, and closes the port connection.
5.  **Automatic Reconnect Poll**:
    If a connection drops unexpectedly, the HMI updates its connection status to `'reconnecting'`. A background timer (`setInterval`) checks `navigator.serial.getPorts()` every 2000ms. If the disconnected port matches one in the list, the HMI automatically opens the port and sends the handshake command.

---

### Upstream Telemetry Message Schema (ESP32 ➔ HMI)

Telemetry packets are ASCII lines written over serial. They start with a single-letter header tag, followed by comma-separated values:

#### 1. Move Started (`M`)
Fires once when a new path calculation begins. Triggers the frontend to clear previous arrays and enter recording state (`REC`).
```text
M,x0,y0,xf,yf
```
*   `x0`: Float. Initial X position (mm).
*   `y0`: Float. Initial Y position (mm).
*   `xf`: Float. Target destination X position (mm).
*   `yf`: Float. Target destination Y position (mm).

#### 2. Move Completed (`S`)
Fires when the robot reaches the target and settles. Triggers the frontend to switch to `IDLE` state, which freezes data buffers, computes statistics, and runs the PID tuning advisor rules.
```text
S
```

#### 3. Spatial Path Sample (`T`)
Fires periodically to populate the Cartesian trajectories shown in the 3D workspace viewer.
```text
T,xi,yi,xa,ya
```
*   `xi`: Float. Desired/planned X coordinate (mm).
*   `yi`: Float. Desired/planned Y coordinate (mm).
*   `xa`: Float. Actual measured X coordinate (mm).
*   `ya`: Float. Actual measured Y coordinate (mm).

#### 4. Detailed Joint Telemetry Sample (`D`)
High-frequency payload (500 Hz ring buffer in firmware, drained at ~100 Hz, downsampled to 50 Hz for main charts). Angles in radians:
```text
D,t,th1,th2,th1d,th2d,v1,v2,v1d,v2d,pwm1,vff1,th1_raw,th2_raw,u1_total,p1_out,i1_out,d1_out,ff1_contrib
```
*   `t`: Timestamp (ms).
*   `th1`, `th2`: Measured joint angles (rad).
*   `th1d`, `th2d`: Desired joint angles (rad).
*   `v1`, `v2`: Actual angular velocities (rad/s) — from TD or finite-difference.
*   `v1d`, `v2d`: Desired angular velocities (rad/s) — from Jacobian-resolved rate control.
*   `pwm1`: J1 control output ($[-255, 255]$).
*   `vff1`: Velocity feedforward contribution (fraction of U1_MAX).
*   `th1_raw`, `th2_raw`: Unfiltered ADC angles (rad).
*   `u1_total`: Total J1 control effort before PWM mapping (U1_MAX scale).
*   `p1_out`, `i1_out`, `d1_out`: J1 PID term splits (effort units).
*   `ff1_contrib`: J1 CTC feedforward contribution (effort units).
*   Joint errors `e1`, `e2` are computed by the HMI as `th1d - th1`, `th2d - th2`.
*   On `/zn` and `/test` routes, every D sample is also dispatched as a `zn_sample` window event (converted to degrees) for Rest Analysis / ZN charts.

#### 5. Feedforward Breakdown (`F`) — 50 Hz
```text
F,t,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1_contrib,u1_total,integral1,delta_omega_ff,omega2_raw,integral2
```
*   Per-joint inertia, Coriolis, and gravity feedforward torques plus combined control signals and integrator states.

#### 6. Controller Gains Report (`G`)
```text
G,kp1,ki1,kd1,kp2,ki2,kd2,mstep,ffi,ffc,ffg
```
*   PID gains, microstep divisor, and feedforward blend factors (inertia, Coriolis, gravity).

#### 7. Runtime Parameters Report (`K`) — 26 fields
```text
K,vmax,amax,cfreq,u1max,fzt,pwm_db,td1r,td2r,td_h,ddth,dben,dbrel,dbvel,hskp,hskd,idecay,taunom,m22ref,alpha_tilt_deg,td_enabled,trap_enabled,ki2_gate_rad,db2en,db2rel,err_dz,integral_freeze_thresh
```
*   Velocity/acceleration limits, filter bandwidths, deadbands, hold mode, trajectory flags. See `AdvTunerTab` on the Test page for field details.

#### 8. Trajectory Queue Status (`Q`)
Fired when moves are queued or executed.
```text
Q,pending_status,pending_x,pending_y
```
*   `pending_status`: 1 if a coordinate move is currently buffered/pending, 0 otherwise.
*   `pending_x`, `pending_y`: Millimeter coordinates of the queued trajectory destination.

#### 9. Joint 1 PID Effort & Loop Duration telemetry (`E`)
Fires at 10 Hz containing control effort split by term (P, I, D) and loop execution times.
```text
E,t,p1_out,i1_out,d1_out,loop_duration_us
```
*   `t`: Float. System timestamp (ms).
*   `p1_out`: Float. Joint 1 Proportional action effort contribution.
*   `i1_out`: Float. Joint 1 Integral action effort contribution.
*   `d1_out`: Float. Joint 1 Derivative action effort contribution.
*   `loop_duration_us`: Integer. Microcontroller loop execution time (microseconds).

#### 10. Generic Text Lines
Any message that does not start with one of the tags above (`M`, `S`, `T`, `D`, `F`, `G`, `K`, `Q`, `E`, `P`) is captured as a debug or status line. If it starts with `INFO: `, `WARN: `, or `ERR: `, the HMI parses it and displays a corresponding Sonner toast notification. (Note: `P` is the microcontroller's boot pose feedback `P,x,y,th1,th2`).

---

## 6. State Management

The application manages global state using React's built-in **Context API** combined with a state reducer.

### Global State (`lib/hmi-context.tsx`)
The global state context is defined by the `HMIState` interface:

```typescript
export interface HMIState {
  serialStatus: 'connected' | 'reconnecting' | 'disconnected'
  portName: string | null                   // USB device COM port info
  online: boolean                           // Window navigator offline indicator
  currentMode: ESPMode | null               // Active firmware mode (IDLE/SCARA/ZN/TEST) from X packet
  recordingState: 'REC' | 'IDLE' | 'WAITING' // Telemetry logging mode
  moveCount: number                         // Index tracking total coordinate moves
  currentMove: MoveInfo | null              // Start / target values of active run
  dBuffer: DSample[]                        // Dynamic list of joint samples for active run
  tBuffer: TPoint[]                         // Dynamic list of coordinate traces for active run
  fBuffer: FSample[]                        // Dynamic forces telemetry samples for active run
  eBuffer: ESample[]                        // Dynamic controller effort/duration samples for active run
  prevTBuffer: TPoint[]                     // Previous run trace data (ghost overlay)
  showGhost: boolean                        // Ghost overlay display toggle
  frozenD: DSample[]                        // Retained samples snapshot after move ends
  frozenT: TPoint[]                         // Retained coordinate snap after move ends
  frozenF: FSample[]                        // Retained forces telemetry snap after move ends
  frozenE: ESample[]                        // Retained controller effort/duration snap after move ends
  stats: Stats | null                       // Computed metrics (accuracy index, errors, etc.)
  gains: Gains | null                       // PID values reported from the device
  params: AdvParams | null                  // 33 runtime constants reported from the device
  hasSyncedParams: boolean                  // Sync state flag indicating device params synced
  queueStatus: { pendingStatus: number; pendingX: number; pendingY: number } | null
  logLines: string[]                        // Terminal line logs list
  previewTarget: { x: number; y: number } | null  // 3D workspace hover target coordinates
  bootPose: { x: number; y: number; th1: number; th2: number } | null  // Initial boot FK pose
  pickedTarget: { x: number; y: number } | null   // Coordinates selected on 3D workspace viewer
  estopped: boolean                         // E-STOP latch state from ESTOP packet
  targetInputX: number | null               // Current X target from control panel (for save)
  targetInputY: number | null               // Current Y target from control panel (for save)
  pendingSave: { name: string; startedAt: number } | null  // Pending DB save after move ends
  lastSavedRunId: string | null             // Most recent saved run ID
}
```

#### Key State Action Types
*   `MOVE_START`: Fired by the `M` telemetry packet. Resets the `tBuffer` and `dBuffer` lists, sets the state's `recordingState` to `'REC'`, increments `moveCount`, and copies the previous `tBuffer` data to `prevTBuffer` to show the ghost trail.
*   `MOVE_END`: Fired by the `S` telemetry packet. Sets `recordingState` to `'IDLE'`, freezes the current data buffers into `frozenT` and `frozenD`, and computes path statistics.
*   `T_SAMPLE` & `D_SAMPLE`: Appends incoming coordinates and telemetry packets to `tBuffer` and `dBuffer` during the active `'REC'` state.
*   `GAINS`: Updates the dashboard configuration fields with the gains values parsed from the device.
*   `FLUSH_BUFFERS`: Clears all data buffers and resets the tracking state to `'WAITING'`.

#### State Persistence
Except for status states like `serialStatus` and `online`, the global state is automatically serialized to `localStorage` under the key `hmi_state_v1` on every state change. This prevents losing telemetry data when the page is refreshed.

#### HMI Configuration & Exporter Settings
Multiple local configurations and exporter preferences are stored in the browser's `localStorage` and kept synchronized across reactive components using a custom window event:
*   `hmi_angular_unit` (`'radians' | 'degrees'`): Dictates the angular units displayed on all chart series, legends, tooltips, axis labels, and analysis inputs.
*   `hmi_ghost_opacity` (decimal float value string, e.g. `'0.20'`): Regulates the transparency/opacity of the previous run trace overlay in the 3D workspace.
*   `hmi_export_format` (`'image/png' | 'image/jpeg'`): Selects the output file format when exporting graphs via the Capture Menu.
*   `hmi_export_scale` (integer multiplier value, `1` | `2` | `3`): Represents standard, retina, or print DPI scaling for rendering sharp charts.
*   `hmi_filename_prefix` (string, e.g. `'scara_hmi'`): Prefix used to label generated image and zip diagnostics files.

#### Custom Configuration Sync Event
*   `hmi_config_updated`: A custom `Event` dispatched on the global `window` object. Component subscribers (like `XYTrace` or `ChartPanel` subcharts) listen to this event to refresh their display units, multipliers, and overlay opacities immediately when changed via the `CaptureMenu`.

---

### Local Component State

Some UI components manage their own local state:
*   **`XYTrace`**:
    *   `isFocused`: Boolean. Toggles the full-screen 3D visualizer view.
    *   `showArm`: Boolean. Toggles rendering of physical SCARA arm link segments.
*   **`ChartPanel`**:
    *   `isFocused`: Boolean. Toggles full-screen chart display.
    *   `openForMoveCount`: Tracks if the PID Tuning Advisor popover is open.
*   **`StepMetrics`**:
    *   `signal`: Selected signal to calculate metrics for (`'eef' | 'th1' | 'th2'`).
    *   `bandPct`: Settling threshold percentage (`'2' | '5'`).
*   **`ComparisonTable`**:
    *   `page`: Active page index in the telemetry table.
*   **`ControlPanel`**:
    *   `xf`, `yf`, `elbow`: Controlled input variables for planning target moves.
    *   `kp1`, `ki1`, `kd1`, `kp2`, `ki2`, `kd2`: Input values for PID gains before applying them.
    *   `moveStatus`, `j1Status`, `j2Status`: Form indicators (`'idle' | 'sending' | 'success'`) showing if commands have been sent.

---

## 7. Known Constraints & Conventions

### Coding Conventions
*   **Tailwind CSS Theme Variables**: Color styles use the Tailwind `@theme` custom design system variables defined in [globals.css](../../hmi/app/globals.css) (such as `bg-hmi-bg`, `text-hmi-muted`, `border-hmi-grid`, `bg-hmi-ideal`, `bg-hmi-actual`). Avoid using hardcoded colors (like `#ffffff` or `red-500`) directly in new components.
*   **TypeScript Contract Alignment**: Telemetry components, parsing rules, and advisor algorithms must implement and align with the interfaces defined in [hmi-types.ts](../../hmi/lib/hmi-types.ts).

### Hardcoded Constants
*   **Workspace Boundary Limits**: In [xy-trace.tsx](../../hmi/components/hmi/xy-trace.tsx#L12-L15):
    *   `L_OUTER = 170`: Outer reach boundary radius in millimeters.
    *   `L_INNER = 70`: Inner workspace boundary radius (dead-zone/singularity limit) in millimeters.
*   **Physical SCARA Link Dimensions**:
    *   Link 1 Length ($l_1$) is assumed to be **$100\text{ mm}$**.
    *   Link 2 Length ($l_2$) is assumed to be **$70\text{ mm}$**.
*   **Serial Interface Baud Rate**: Hardcoded to **$921600$** baud. Your firmware must use `Serial.begin(921600)` to match this rate.
*   **Telemetry Buffer Boundaries**:
    *   `MAX_BUFFER = 2000`: Maximum sample points stored in memory during a single trajectory run.
    *   `MAX_LOG_LINES = 100`: Maximum log entries retained in the console buffer.
*   **Baud Rate Reconnect Timer**: **$2000\text{ ms}$** polling interval to auto-reconnect dropped ports.

---

### Core Rules for Developers (Do NOT Change Lightly)

1.  **Telemetry Unit Contracts**:
    The tuning advisor calculations in [tuning-advisor.ts](../../hmi/lib/tuning-advisor.ts) depend on strict units:
    *   Timestamp values must be in **milliseconds** (firmware scales these to seconds before computing integrals).
    *   Displacement errors must be in **radians** ($\theta_d - \theta_a$).
    *   Velocity errors must be in **rad/s** ($\dot{\theta}_d - \dot{\theta}_a$).
    *   Modifying these units will break the advisor thresholds, causing incorrect PID tuning suggestions.
2.  **Tuning Advisor Decision Thresholds**:
    Tuning advice rules are based on specific thresholds:
    *   `CHATTER_VARIANCE_THRESHOLD = 500` $(\text{rad/s}^2)^2$: Filter trigger for high-frequency noise.
    *   `SETTLING_ERROR_THRESHOLD = 0.0035` rad (approx. $0.20^\circ$): Settling offset criteria.
    *   `IAE_THRESHOLD = 0.05` $\text{rad}\cdot\text{s}$: Cumulative tracking error threshold.
3.  **Timestamp Monotonic Correction**:
    If the microcontroller sends out duplicate timestamps, the state reducer automatically corrects them to prevent issues with derivative and integral calculations:
    ```typescript
    if (prevSample && correctedSample.t <= prevSample.t) {
      // automatically shifts timestamp to guarantee it is monotonic
      correctedSample.t = prevSample.t + delta;
    }
    ```
    Removing this correction will cause Recharts errors and produce negative time steps, breaking velocity estimates and integrals.
4.  **Canvas Drawing Transforms**:
    The workspace mapping relies on coordinate transforms to map millimeters to screen pixels:
    ```typescript
    const scale = Math.min(plotH / (YMAX - YMIN), plotW / (2 * (L_OUTER + 25)));
    const originPx = LM + plotW / 2;
    const originPy = H - BM + YMIN * scale;
    ```
    Take care when modifying margins (`LM`, `RM`, `TM`, `BM`) or dimensions (`YMIN`, `YMAX`, `L_OUTER`), as incorrect adjustments will warp the workspace boundaries and render paths incorrectly.

---

## 8. Trajectory Safety & Validation Layer

To prevent mechanical damage and inverse kinematics failure modes (resulting from trying to compute joint angles for unreachable target points or crossing singular configurations), the HMI implements a real-time **Trajectory Safety Layer** in [trajectory-safety.ts](../../hmi/lib/trajectory-safety.ts).

### Checked Safety Rules
Every straight-line trajectory planned from the robot's current Cartesian position $P_1(x_1, y_1)$ to target position $P_2(x_2, y_2)$ is checked for the following violations:
1.  **Angular Sector Limit**: Target coordinate endpoint and straight-line path must lie within the valid angular workspace sector ($-30^\circ \le \phi \le 210^\circ$). Violating this yields an `angle_violation`.
2.  **Outer Reach Limit**: Target coordinate endpoint must lie within the maximum physical reach radius of the linkages:
    $$\sqrt{x_2^2 + y_2^2} \le 170\text{ mm}$$
    Violating this yields an `outer_violation`.
3.  **Inner Singularity Dead Zone Limit**: The trajectory line segment between $P_1$ and $P_2$ must not cross or enter the inner singularity circle of radius $r_{min} = 70.7\text{ mm}$. The minimum distance $d_{min}$ of the segment to the origin is computed analytically. If $d_{min} < 70.7\text{ mm}$, the move yields an `inner_violation`.

### Frontend Integration & Previews
*   **Coordinate Move Input Fields**: In `ControlPanel`, when typing or updating $X_f$ or $Y_f$, the validation function `checkStraightLineTrajectory` runs reactively. If invalid, the "Send Move" button is disabled and a warning card displays the violation details.
*   **3D Workspace Hover Previews**: In `XYTrace`, when hovering or clicking to select a target on the workspace plot, the safety path is calculated. If a violation is found, the planned path line glows bright red and safety indicator flags are rendered into the 3D scene and interface.

---

## 9. Database, Authentication & Server-Side Integration

While the core HMI telemetry runs fully client-side in the browser to maintain the hard realtime serial read loops, saving runs, viewing comparison histories, and automating experimentation sequences uses server-side components.

### Google OAuth Authentication (NextAuth.js)
The HMI restricts database write permissions and the history workspace dashboard to authenticated users via NextAuth.js.
*   **Authentication Portal**: Located on `/login`.
*   **Provider**: Google Client OAuth provider configured in `hmi/lib/auth.ts`.
*   **Session Extension**: The default NextAuth token type is extended to store the user's `googleId` and custom `id` UUID across sessions:
    ```typescript
    interface Session {
      user: {
        id: string
        googleId: string
        name?: string | null
        email?: string | null
        image?: string | null
      }
    }
    ```
*   **Middleware**: Protection matcher located in `hmi/middleware.ts` intercepting `/dashboard/:path*` and `/api/runs/:path*` to verify active JWT sessions.

### Database Schema (Turso / LibSQL SQLite)
The application defines two database schemas mapped using Drizzle ORM: the core runs schema (`schema.ts`) and the automated experiments schema (`schema/experiment.ts`).

#### 1. Core Runs Schema (`lib/db/schema.ts`)
*   **`users`**: Stores user profiles created on their initial Google sign-in.
    *   `id` (Text Primary Key UUID)
    *   `googleId` (Text unique)
    *   `email` (Text), `name` (Text), `picture` (Text)
    *   `createdAt` (Integer timestamp)
*   **`runs`**: Stores individual trajectory records saved via the HMI's **Run + Save** button.
    *   `id` (Text Primary Key UUID)
    *   `userId` (Text foreign key referencing `users.id`)
    *   `name` (Text)
    *   `startedAt` (Integer), `endedAt` (Integer)
    *   `x0`, `y0`, `xf`, `yf` (Real coordinates)
    *   `accuracyIdx`, `maxErr`, `meanErr`, `finalErr`, `mate`, `mcte`, `rmsAte`, `errorRatio` (Real metrics)
    *   `pwmMax`, `elapsedTime`, `rmseJ1`, `rmseJ2`, `rmseEef` (Real performance)
    *   `gainsJson`, `paramsJson` (Text strings of Gains & Parameters reports)
    *   `sampleCount` (Integer)
*   **`samples`**: Stores the high-frequency joint telemetry samples aligned for each run.
    *   `id` (Integer Auto-Increment Primary Key)
    *   `runId` (Text foreign key referencing `runs.id`)
    *   `t` (Integer timestamp ms)
    *   `th1`, `th2`, `th1d`, `th2d`, `dth1`, `dth2`, `dth1d`, `dth2d` (Real joint angles and speeds)
    *   `pwm1` (Integer control signal), `u1Total` (Real total J1 effort)
    *   `th1Raw`, `th2Raw` (Real unfiltered ADC signals)
    *   `p1Out`, `i1Out`, `d1Out` (Real feedback splits)
    *   `inertia1`, `coriolis1`, `gravity1`, `inertia2`, `coriolis2`, `gravity2` (Real CTC components)
*   **`trajectory_points`**: Stores the spatial path coordinates plotted on the workspace trace.
    *   `id` (Integer Auto-Increment Primary Key)
    *   `runId` (Text foreign key referencing `runs.id`)
    *   `seq` (Integer sequence order index)
    *   `xi`, `yi` (Real desired coordinate point)
    *   `xa`, `ya` (Real actual coordinate point)

#### 2. Experiment Automation Schema (`lib/db/schema/experiment.ts`)
*   **`experiment_runs`**: Logs automation sequence conditions.
    *   `id` (Text Primary Key generated via custom NanoID builder)
    *   `experimentId` (Text, e.g. `EXP-1` or `EXP-6`)
    *   `experimentName` (Text, e.g. `TD Filter` or `PID Variation`)
    *   `runNumber` (Integer index)
    *   `direction` (Text: `forward` or `return`)
    *   `alphaDeg` (Real tilt angle)
    *   `ffgEnabled`, `ffiEnabled`, `ffcEnabled`, `tdEnabled`, `trapEnabled` (Integer booleans: `0` or `1`)
    *   `kp1`, `ki1`, `kd1`, `kp2`, `ki2`, `kd2` (Real joint gains applied for the run)
    *   `p0X`, `p0Y`, `pfX`, `pfY` (Real start/end coordinates)
    *   `status` (Text: `ok`, `retrying`, or `failed`)
*   **`experiment_metrics`**: Logs summary error statistics computed on sequence end.
    *   `id` (Text Primary Key)
    *   `runId` (Text foreign key referencing `experiment_runs.id`)
    *   `mateMean`, `mateMax`, `mateRms`, `mcteMean`, `mcteMax`, `mcteRms` (Real path errors)
    *   `eefErrorMean`, `eefErrorMax`, `eefErrorRms` (Real end-effector errors)
    *   `joint1ErrorMax`, `joint1ErrorRms`, `joint2ErrorMax`, `joint2ErrorRms` (Real joint-level errors)
    *   `settleTimeMs` (Real settling duration)
    *   `finalEefError` (Real steady state error offset)
*   **`experiment_samples`**: Logs high-frequency aligned sequence samples.
    *   `id` (Integer Auto-Increment Primary Key)
    *   `runId` (Text foreign key referencing `experiment_runs.id`)
    *   `tMs` (Real timestamp)
    *   `theta1`, `theta2`, `theta1D`, `theta2D` (Real joint angles)
    *   `dtheta1`, `dtheta2`, `dtheta1D`, `dtheta2D` (Real joint velocities)
    *   `xActual`, `yActual`, `xDesired`, `yDesired` (Real spatial coordinates)
    *   `u1Total`, `ff1Contrib`, `p1Out`, `i1Out`, `d1Out` (Real control effort splits)
    *   `ctcInertia1`, `ctcCoriolis1`, `ctcGravity1`, `ctcInertia2`, `ctcCoriolis2`, `ctcGravity2` (Real CTC forces)

### Local JSONL Backups
Every save run is written to local filesystem files in `hmi/local-backup/` to ensure offline durability.
*   Runs are written line-by-line using `appendFile` to `runs.jsonl`.
*   Metrics are written line-by-line to `metrics.jsonl`.
*   Samples are written to individual run files: `samples-{runId}.jsonl`.

### Drizzle CLI Schema Synchronization
To apply updates or create local database tables, run drizzle push:
```bash
npm run db:push
```
This commands runs `drizzle-kit push` which compares schema files with the Turso DB state and performs SQL schema updates automatically. Use `npm run db:studio` to query raw tables in Drizzle Studio.
