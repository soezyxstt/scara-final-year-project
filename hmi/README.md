# 🦾 Planar 2-DOF SCARA Robot HMI Dashboard

A high-performance, industrial-grade web-based **Human-Machine Interface (HMI)** designed for real-time telemetry, trajectory mapping, controller tuning, and diagnostics of a **2-Degree-of-Freedom (2-DOF) planar SCARA robot**. 

This dashboard runs 100% client-side in the browser, communicating directly with the robot microcontroller (ESP32) over USB via the **HTML5 Web Serial API**.

---

## 📚 Technical Documentation

For in-depth developer references, check out the centralized documentation folder:
*   [**HMI Context Reference (scara-hmi-context.md)**](../docs/hmi/scara-hmi-context.md) - Global architecture, state management buffers, component APIs, and developer conventions.
*   [**Stack and Architecture Reference**](../docs/hmi/stack-and-architecture.md) - Tech stack details, folder structure, connection lifecycles, and auto-reconnect logic.
*   [**Features and Serial Protocol Reference**](../docs/hmi/features-and-data-flow.md) - ASCII protocol schemas (`M`, `S`, `T`, `D`, `G`), telemetry fields, and downstream commands.

---

## 🚀 Core Features

### 1. Live Monitoring Tab (`MonitorTab`)
*   **XY Workspace Trace (`XYTrace` Component)**: Canvas-based 2D workspace visualization plotting the robot arm link segments ($l_1 = 100\text{ mm}$, $l_2 = 70\text{ mm}$), workspace reach boundaries ($R=170\text{ mm}$), inner singularity zone ($r=45\text{ mm}$), ideal trajectory coordinates (dashed blue), and actual measured coordinate paths (solid red).
*   **Joint Space Phase Portrait (`PhasePortrait` Component)**: Plots angular position ($\theta$) vs velocity ($\dot{\theta}$) for both joints to detect limit cycles, friction slip, and backlash.
*   **Telemetry Charts (`ChartPanel` Component)**: Multi-tab real-time plots showing Euclidean end-effector tracking error, joint velocities, joint angular positions, control effort PWM, and an **Expert PID Tuning Advisor Popover** recommending gains changes.
*   **Tuning & Control Panel (`ControlPanel` Component)**: Online PID tuning fields, target coordinate Cartesian inputs, elbow configuration selector (`Right-handed` vs `Left-handed`), microstepping divisor selectors (`Full` to `1/16`), and a high-priority hardware **🛑 E-STOP** button.
*   **Terminal Log Console (`SerialLog` Component)**: Green terminal displaying raw ASCII debug strings with color-coded badges matching firmware state updates.

### 2. Post-Run Diagnostics Tab (`AnalysisTab`)
*   **Transient Step Metrics (`StepMetrics` Component)**: Auto-computes standard performance indicators—**Rise Time** ($t_r$), **Peak Time** ($t_p$), **Overshoot Percentage** ($\%OS$), **Settling Time** ($t_s$) at $\pm2\%$ and $\pm5\%$ bands, and **Steady-State Error** ($e_{ss}$)—from post-run telemetry buffers.
*   **Frequency Content Spectrum (`FFTSection` Component)**: Runs a 512-point Discrete Fourier Transform (DFT) to isolate resonant frequencies and sensor chatter noise ($>10\text{ Hz}$).
*   **Control Effort Proxy (`ControlEffortSection` Component)**: Integrates absolute control effort over time ($\int |PWM|\,dt$) to evaluate system power efficiency.
*   **Chronological Telemetry Table (`ComparisonTable` Component)**: Displays a sample-by-sample spreadsheet layout of displacement errors, angular positions, and coordinate tracking metrics.

### 3. Advanced Graph Analyzer Console (Maximize Mode)
When telemetry charts are expanded to full screen, they unlock an advanced industrial scope environment (`AdvancedAnalyzer`):
*   📐 **Measurement Calipers**: Click to set dual vertical/horizontal caliper lines (A and B) snapping to nearest telemetry points. Computes time delta ($\Delta t$), frequency ($1/\Delta t$), amplitude delta ($\Delta Y$), and individual signal metrics between cursors in real time.
*   🔍 **2D Rectangular Zooming**: Left-click and drag a box over any chart region to crop both the time axis (X) and amplitude axis (Y). Double-click to instantly reset bounds.
*   ✋ **Scrubbing & Panning**: Use the hand tool to scroll left/right across historical run timelines.
*   ⚡ **Quick Scaling Controls**: Dedicated X+, X-, Y+, Y- scaling buttons for fast zoom adjustments.
*   👁️ **Legend Signal Filtering**: Checkbox list to toggle the visibility of individual joint or path curves.
*   📈 **Regional Viewport Stats**: Dynamically computes Peak-to-Peak values, Mean, RMS, and Standard Deviation ($\sigma$) exclusively for the visible window segment.

### 4. Diagnostics & Packaging Exporters (`CaptureMenu`)
Accessible from the slide-out sidebar sheet:
*   ⚙️ **Global Preferences**: Change angular units globally between **Radians** and **Degrees**, and control the opacity slider ($0\% - 100\%$) for the previous run's workspace overlay trail (Ghost mode).
*   🖼️ **High-DPI Capture**: Export any individual chart or the XY Workspace trace at Standard ($1\text{x}$), Retina ($2\text{x}$), or Print DPI ($3\text{x}$) resolution as PNG or JPEG files.
*   📦 **All-in-One Packaging**: 
    *   **Capture All Graphs**: Packages all 6 interactive charts and traces into a single ZIP archive.
    *   **Capture All + Table CSV**: Compiles all images alongside a detailed CSV spreadsheet (`scara_telemetry_data.csv`) matching the Comparison Table dataset for external analysis (MATLAB / Excel).

---

## 🛠️ Technology Stack

*   **Framework & Language**: Next.js v16 (App Router), React v19, TypeScript v5
*   **Styling**: Tailwind CSS v4 configured with a high-contrast industrial dark mode palette
*   **Hardware Interface**: Web Serial API (`navigator.serial`) running an asynchronous read-loop
*   **Telemetry Graphics**: HTML5 Canvas (high-performance workspace plotting) & Recharts v3.8.1
*   **ZIP Compression**: JSZip (client-side compression packaging)

---

## 🏁 Getting Started

### 1. Installation
Install project dependencies using your preferred package manager (Bun or NPM):
```bash
# Using Bun (Recommended)
bun install

# Using NPM
npm install
```

### 2. Development Server
Start the client dev server:
```bash
bun dev
# or
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or any browser supporting Web Serial to run the dashboard.

### 3. Connect to Microcontroller
1. Plug your ESP32 microcontroller into a USB port.
2. Click **Connect** in the top-right corner of the HMI header.
3. Select the matching USB/UART COM port in the browser popup.
4. Ensure your firmware uses a UART Baud Rate of **921600** to align with the HMI protocol.
