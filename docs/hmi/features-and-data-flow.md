# SCARA HMI: Features and Serial Protocol Reference
**User Interfaces | Automated Experiment Sequencer | Offline Synchronization Queue | Database & Serial Schemas**

---

This document describes the user-facing and background features of the SCARA Robot HMI and details the exact schemas for database tables, local backup logs, and serial communications.

---

## 1. Application Routing & Permissions

The HMI application features a route-dependent architecture where the expected firmware operating mode is automatically requested when navigating:

| Path | Mode Badge | Tab View | Access Level |
| :--- | :--- | :--- | :--- |
| `/` | `SCARA` | Monitor, Analysis, Rest Analysis, README | Public |
| `/zn` | `ZN` | Ziegler-Nichols Tuner Workspace | Public |
| `/test` | `TEST` | Monitor, Analysis (+ Raw Signal overlay), Rest Analysis, Parameter Tuner | Public |
| `/pcb` | — | Interactive Controller PCB details, schematics, and 3D viewer | Public |
| `/login` | — | Google OAuth Portal | Public |
| `/hasil-eksperimen` | — | Automated Comparative Analytics Spreadsheet | Public |
| `/dashboard` | — | History comparison workspace | Google OAuth Protected |
| `/eksperimen` | `TEST` | Automated experimentation controls & cooldown monitor | Google OAuth Protected |

---

## 2. Exhaustive Feature Specifications

### A. Monitor Tab & Safety Constraints
1. **3D XY Trace Visualizer (`SCARA3DCanvas`)**:
   - Visualizes the SCARA workspace envelope, joint configuration, and trajectories in interactive 3D using React Three Fiber (R3F) and OrbitControls.
   - Shows the planned path in dashed blue (`#2563EB` for both themes) and the actual tracked path in solid red (`#DC2626` for both themes).
   - Renders solid CAD link models (J1/J2) with realistic shading, using darkened values (`#3B82F6` and `#F97316` for both themes) to prevent overexposure under 3D shading, with corrected link stack-up heights (J1 at Z=35mm, J2 at Z=5mm).
   - Displays reachable workspace boundaries (`ReachableWorkspace3D`) in vibrant electric blue (`#00e5ff` in dark mode) or cyan (in light mode) for high contrast.
   - Standardizes camera orientation on initial load and reset triggers via a `CameraInitializer` using a tiny Z-offset (`-0.074999`) to prevent polar singularity/gimbal lock.
   - **Path Safety Checking**: If a proposed Cartesian straight-line path crosses $R < 70.7\text{ mm}$, goes outside $R > 170\text{ mm}$, or drops below the horizontal baseline ($Y < 0$), the HMI disables the move button, displays safety alerts in the sidebar, and overlays a red warning path.
2. **Telemetry Charts (`ChartPanel`)**:
   - **CTE (Cross-Tracking Error)**: Radial deviation perpendicular to the planned path segment.
   - **ATE (Along-Tracking Error)**: Linear deviation along the path direction.
   - Also tracks joint positions, joint speeds, J1 control effort, and J2 commanded stepper steps.
3. **Run Metrics (`MetricsPanel`)**:
   - Calculates the **Accuracy Index (AI)**: $AI = 1 - \frac{\text{Mean CTE}}{\text{Path Length}}$.
   - Measures maximum CTE ($\epsilon_{max}$), RMS Along-Tracking Error, Jitter Proxy (high-frequency motor chatter indicator), and Settling Time (time until coordinates stay within 2 mm of target).

### B. Ziegler-Nichols Tuner Page (`/zn`)
Bypasses path generation to run direct step response tests:
- Provides one-click step buttons (`t1,45` / `t2,30`) and gain adjustment inputs (`kp1`, `ki1`, etc.).
- Includes a draggable caliper overlay. By marking peak-to-peak waves of an oscillation response, the system computes Ultimate Gain ($K_u$) and Ultimate Period ($T_u$), outputting recommended PID values using ZN Tuning Rules.

### C. Saved Runs History Dashboard (`/dashboard`)
Allows side-by-side comparison of saved trajectories:
- Checkboxes in the sidebar select database runs.
- **Trajectory** tab overlays selected paths on a dedicated XY Trace canvas.
- **Velocity & Control** tab compares joint speeds and control efforts.
- **PID & CTE** tab compares PID contributions and tracking errors.
- **Feedforward** tab compares CTC feedforward torque components.
- **Metrics** tab tabulates side-by-side accuracy metrics.
- **Advanced** tab shows combined analysis with FFT and advanced metrics.
- **AI Copilot** tab: Streaming AI analysis using Google Gemini with model fallback chain (Pro → Flash → Flash Lite). Supports `explain`, `diagnose`, and `recommend` modes. Uses Cloudflare KV for historical run context and run telemetry (downsampled to 60 points) as context.

### D. Controller PCB Viewer (/pcb)
Offers an interactive interface for hardware diagnostics and schematic lookup:
- **Viewer Tabs**: Allows switching between `PCB Layout` (assembly/layout SVG viewer), `Schematic` (circuit diagram view), and `CAD` (interactive 3D CAD viewer for structural reference).
- **Component Breakdowns**: Displays interactive lookup lists of all hardware components (MCU, drivers, connectors) mapping designators to technical specs and purposes.
- **GPIO Assignment Map**: Integrates the firmware pinout assignments mapping ESP32 IO pins to hardware functions (stepper controls, DC PWM, encoder signals) directly.

### E. Automated Experiments (/eksperimen)
Runs automated sequences to evaluate specific control mechanisms.
- **EXP-1 (TD Filter)**: Moves the arm with Tracking Differentiator active (`tden,1`) vs inactive finite difference velocity (`tden,0`).
- **EXP-2 (Inertia Compensation)**: Compares CTC inertia assistance (`ffi,1.0`) vs disabled inertia feedforward (`ffi,0.0`).
- **EXP-3 (Coriolis Compensation)**: Toggles Coriolis feedforward correction (`ffc,1.0` vs `ffc,0.0`).
- **EXP-4 (Gravity Compensation)**: Evaluates gravity compensation across tilt angles (0°, 15°, 30°, 45°) with `ffg,1.0` vs `ffg,0.0`.
- **EXP-5 (Trapezoidal Profile)**: Compares trapezoidal trajectory planning (`trapen,1`) vs raw step inputs (`trapen,0`).
- **EXP-6 (PID Gain Variation)**: Tests performance at scales of 0.5x, 1.0x, and 1.5x of baseline J1/J2 gains.

#### Automation Workflow & Safety Cooldown
To protect the GM25-370 DC motor from thermal strain during sequence loops:
1. The state machine positions the arm at the experiment start point, waiting for positional settling.
2. The HMI sends configuration parameter commands (e.g. `ffi,1.0`) and triggers the trajectory move.
3. Positional telemetry is recorded at 50 Hz.
4. When `S` (move completed) is received, the run metrics are calculated and written to database.
5. The sequencer triggers a **30-second Cooldown Phase**, locking commands to allow motor windings to cool before starting the next run.

---

## 3. API Endpoints

| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/[...nextauth]` | * | Public | NextAuth.js Google OAuth callbacks |
| `/api/runs` | GET | Google OAuth | List all runs for authenticated user |
| `/api/runs` | POST | Google OAuth | Save a new run (metadata, gains, samples) |
| `/api/runs/[id]` | GET | Google OAuth | Retrieve run with samples |
| `/api/runs/[id]` | DELETE | Google OAuth | Delete a run with cascade |
| `/api/runs/[id]/copilot` | POST | Google OAuth | Streaming AI Copilot analysis (modes: `explain`, `diagnose`, `recommend`) |

The AI Copilot endpoint uses Google Gemini with a fallback chain (`gemini-2.5-flash-pro` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`), Cloudflare KV for historical run context, and streams responses as SSE.

## 4. Database Sync & Local Backup Schemas

### A. Offline Sync Queue
When saving runs offline:
1. The HMI caches the payload in an in-memory queue and writes to local backups.
2. If database queries fail, the sync engine retries up to **2 times spaced by 2 seconds**.
3. Upon detecting a browser `online` event, the queue is drained, uploading runs to Turso.

### B. Database Schema Definitions
The Turso schema consists of:
- `runs`: Stores run metadata (id, timestamp, gains `kp1..kd2`, feedforward coefficients `ffi..ffg`, trajectory targets `x0, y0, xf, yf`, and parameters).
- `metrics`: Stores calculated indices (AI, max CTE, RMSE J1/J2, settling time, control variance, jitter).
- `samples`: Stores aligned 50 Hz samples (`run_id`, timestamp, `th1, th2, th1d, th2d, dth1, dth2, pwm1`).

### C. Local Backup File Structures (`hmi/local-backup/`)
- `runs.jsonl`: Appends meta-information JSON strings.
- `metrics.jsonl`: Appends run analysis statistics.
- `samples-{runId}.jsonl`: Contains the full list of 50 Hz samples for that run.

---

## 5. Serial Protocol Specifications

### A. Downstream Commands (HMI → MCU)
All commands are plain-text ASCII strings terminated with a newline (`\n`). See the [Firmware Manual](../firmware/readme.md) for the complete list of ~40 TEST-mode runtime parameter commands.

| String | Description | Example |
| :--- | :--- | :--- |
| `move,X,Y` | Request Cartesian end-effector move (mm). | `move,125.0,80.0` |
| `elbow,N` | Select elbow configuration: `1` (right) or `-1` (left). | `elbow,1` |
| `kp1,val` / `ki1,val` / `kd1,val` | Set Joint 1 PID gains. | `kp1,0.8` |
| `kp2,val` / `ki2,val` / `kd2,val` | Set Joint 2 PID gains. | `kp2,5.0` |
| `ffi,val` / `ffc,val` / `ffg,val` | Set dynamic feedforward blend factor (0.0 to 1.0). | `ffi,1.0` |
| `mstep,N` | Configure stepper microstep divisor: 1, 2, 4, 8, 16. | `mstep,16` |
| `mode,name` | Switch operating mode: `idle`, `scara`, `zn`, `test`. | `mode,scara` |
| `plot,0` / `plot,1` | Disable/enable high-frequency telemetry. | `plot,1` |
| `t1,deg` / `t2,deg` | Request joint step angle (degrees). | `t1,45.0` |
| `estop` / `resume` | Emergency stop / Clear emergency lock. | `estop` |
| `ping` | Reset watchdog timer. | `ping` |
| `getgains` / `getparams` | Query runtime constants. | `getgains` |
| `clrgraph` | Purge trajectory buffers on HMI. | `clrgraph` |

### B. Upstream Telemetry (MCU → HMI)
Packets are sent as CSV lines. See the [Firmware Manual](../firmware/readme.md) for complete field documentation.

- **Move Start (`M`)**: `M,x0,y0,xf,yf` (Emitted once when trajectory begins).
- **Move Continuation (`MC`)**: `MC,x0,y0,xf,yf` (Emitted for L-shape second leg — does not reset HMI buffers).
- **Move Done (`S`)**: `S,xf,yf` (Emitted once when motion settles).
- **Cartesian Path (`T`)**: `T,xi,yi,xa,ya` (Desired vs actual, 50 Hz).
- **Joint Dynamics (`D`)**: `D,t,th1,th2,th1d,th2d,dth1,dth2,dth1d,dth2d,pwm1,vff1,th1raw,th2raw,u1_total` (14 fields, 500 Hz ring buffer).
- **Feedforward breakdown (`F`)**: `F,t,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1_contrib,u1_total,integral1,delta_omega_ff,omega2_raw,integral2` (50 Hz).
- **PID Effort (`E`)**: `E,t,p1_out,i1_out,d1_out,loop_duration_us` (PWM-scaled values, 50 Hz).
- **Gains Report (`G`)**: `G,kp1,ki1,kd1,kp2,ki2,kd2,mstep,ffi,ffc,ffg` (On request/update).
- **Parameters (`K`)**: `K,vmax,amax,cfreq,u1max,fzt,...` (33 fields, sent on request).
- **Position Heartbeat (`P`)**: `P,x_mm,y_mm,th1_rad,th2_rad` (Boot + on `getgains`).
- **Queue Status (`Q`)**: `Q,pending,pending_x,pending_y` (On queue change).
- **Operating Mode (`X`)**: `X,MODENAME` (Sent on mode change).
- **E-STOP (`ESTOP`)**: `ESTOP,0` or `ESTOP,1` (On estop/resume).
Lines prefixed with `INFO:`, `WARN:`, `ERR:`, or `SUCCESS:` also trigger Sonner toast notifications.
