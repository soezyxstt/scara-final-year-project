# SCARA HMI: Features and Serial Protocol Reference

This document catalogs the operational features of the SCARA HMI dashboard and details the serial protocol used to communicate with the microcontroller.

---

## 1. Application Routes & Modes

| Route | Firmware mode | Tabs / Features | Access Control |
| :--- | :--- | :--- | :--- |
| `/` | `SCARA` | Monitor, Analysis, Rest Analysis, README | Public |
| `/zn` | `ZN` | Ziegler-Nichols tuner workspace | Public |
| `/test` | `TEST` | Monitor, Analysis (+ Raw Signal), Rest Analysis, Params Tuner | Public |
| `/login` | — | Google Authentication Portal (NextAuth login page) | Public |
| `/dashboard` | — | Saved Runs History: selector sidebar, multi-run comparison tabs | Protected |
| `/eksperimen` | `TEST` | Automation suite: run automated tests, real-time log, local queue fallback | Protected |
| `/hasil-eksperimen` | — | Completed experiment results table, metrics, comparative analytics | Public |

The `ModeRouter` component automatically sends `mode,<name>` when the serial connection is active and the current firmware mode does not match the expected mode for the active route.

Firmware modes: `IDLE`, `SCARA`, `ZN`, `TEST`. The mode badge in the header reflects the `X,<MODE>` telemetry packet.

---

## 2. Feature Specifications

### A. Monitor Tab (Live Run View)

1. **XY Trace (`XYTrace`)**
   * Workspace visualization with outer reach ($R = 170$ mm) and inner singularity zone ($r = 45$ mm).
   * Ideal path (dashed blue) vs actual path (solid red) with optional ghost trail overlay.
   * Link skeleton overlay, pick-point mode, and trajectory safety warnings.
   * Focus mode for full-screen canvas inspection.

2. **Telemetry Chart Panel (`ChartPanel`)**
   * **CTE** — Cross Tracking Error (lateral deviation from ideal path, mm).
   * **ATE** — Along Tracking Error (lead/lag along path direction, mm).
   * **Position** — $\theta_1, \theta_2$ vs desired references.
   * **Velocity** — $\dot{\theta}_1, \dot{\theta}_2$ vs desired references.
   * **PID** — Joint 1 P/I/D term breakdown.
   * **J1 Ctrl** — Combined J1 control signal components.
   * **J2 Vel** — Stepper command velocity.
   * Focus mode unlocks the `AdvancedAnalyzer` scope tools.

3. **Run Metrics (`MetricsPanel`)**
   * Accuracy Index (AI), max CTE, MCTE, RMS ATE, error bias ratio.
   * RMSE per joint and end-effector, control variance, jitter proxy, settling time.

4. **Control Panel (`ControlPanel`)**
   * Cartesian move targets with elbow configuration and safety validation.
   * J1 DC PID and J2 stepper PID gain fields with sync status LEDs.
   * Feedforward blend factors (inertia, Coriolis, gravity).
   * Microstep divisor selector.

5. **Serial Monitor (`SerialTerminalSheet`)**
   * Resizable bottom-sheet log panel toggled from the header.
   * High-frequency `T`/`D` packets filtered; status lines and badges shown.

### B. Analysis Tab (Post-Run Evaluation)

Rendered from frozen telemetry buffers after a move completes:
* Phase Portrait (joint state-space)
* EEF Cartesian Error and Velocity charts
* PWM Output and Control Effort
* CTC Feedforward Torques (inertia, Coriolis, gravity per joint)
* Loop Duration (microcontroller execution time)
* Ideal vs Actual comparison table with CSV export

### C. Rest Analysis Tab

Continuous telemetry workspace (`ZNAnalysisTab`) for step-response and rest-state study:
* Joint 1 / Joint 2 selector
* View modes: position, raw ADC, compare, velocity, FFT
* Drag caliper selection with ZN method, step response, and rest statistics analyzers
* Step target commands, freeze/scroll, and scoped CSV export

### D. ZN Tuner Page (`/zn`)

Dedicated Ziegler-Nichols tuning (`ZNTunerTab`):
* Per-joint gain increment controls and `t1`/`t2` step commands
* Live target vs actual chart (degrees)
* Caliper analyzer computing $T_u$, $f_u$, and PID recommendation table

### E. Test Page (`/test`)

Adds engineering tools on top of the home feature set:
* **Params Tuner (`AdvTunerTab`)** — all 26 runtime constants with sync LEDs
* **Raw Signal Section** — unfiltered ADC overlay for noise diagnosis

### F. Settings & Export (`CaptureMenu`)

* Page navigation (Home / ZN / Test / Login / Dashboard / Hasil Eksperimen)
* Angular unit toggle (Radians vs Degrees) and ghost trail opacity slider
* Custom keyboard shortcuts re-binding controls
* DPI Export Resolution multipliers (1x, 2x, 3x) and custom filename prefix settings
* Diagnostics package bundling (ZIP container with 20 charts + CSV data sheet + parameters SVG)

### G. Login Page (`/login`)

* NextAuth.js Google Authentication integration.
* Google Account sign-in required to unlock telemetry database features (saving runs and opening history dashboard).

### H. Saved Runs Dashboard (`/dashboard`)

Accesses the historic workspace for comparative analysis. Features include:
1. **Runs Selection Sidebar (`RunSelector`)**:
   * Lists all saved runs for the authenticated user, sorted in reverse chronological order.
   * Multi-run checkbox toggles to overlay up to 4 runs simultaneously.
   * Single-click deletion clears the run and all aligned samples from database.
2. **Dashboard XY Workspace Trace (`DashboardXYTrace`)**:
   * HTML5 canvas workspace drawing ideal vs actual coordinate paths for all selected runs using distinct colors.
3. **Telemetry Comparison Tabs**:
   * **Trajectory Tab**: Displays the multi-run XY Trace canvas.
   * **Velocity Tab**: Desired vs actual joint velocities.
   * **PID Tab**: Joint 1 tracking errors and cross-track error comparison charts.
   * **Feedforward Tab**: Comparative CTC feedforward torque components.
   * **Metrics Tab**: Full comparative table of accuracy indices, settling times, RMS, and loop durations.
   * **Advanced Tab**: Loop execution time plots and feedback effort curves.

### I. Automated Experiments (`/eksperimen`)

Provides an automated sequencer to test robot control characteristics across 6 experiments:
* **EXP-1 (TD Filter)**: Joint 1/2 tracking differentiator filter toggling (`tden,1` vs `tden,0`).
* **EXP-2 (Inertia Comp)**: Inertia torque feedforward toggling (`ffi,1.0` vs `ffi,0.0`).
* **EXP-3 (Coriolis Comp)**: Coriolis force feedforward toggling (`ffc,1.0` vs `ffc,0.0`).
* **EXP-4 (Gravity Comp)**: Gravity compensation testing across tilt angles (0°, 15°, 30°, 45°) with (`ffg,1.0` vs `ffg,0.0`).
* **EXP-5 (Trap Profile)**: Trapezoidal speed profile toggling (`trapen,1` vs `trapen,0`).
* **EXP-6 (PID Variation)**: Joint 1 PID gain variation (testing scaling levels 0.5x, 1.0x, 1.5x of baseline values).

**Automation Sequence Workflow**:
1. Select experiment, enter optional variables (tilt angle or baseline level).
2. Press **Mulai Eksperimen**. The state machine handles positioning (Linear move from coordinate starting point), waits for echo confirmation, initiates the trajectory move, logs telemetry samples, and handles save actions.
3. Integrates a **30s cooldown phase** between runs to allow DC motor armatures to rest and prevent overheating.
4. Auto-saves completed run parameters, metrics, and aligned samples database tables.

### J. Database Operations & Sync Lifecycle

* **Offline Queue Fallback**: If internet connectivity is interrupted during automation sequences, the system registers runs to local backup and caches data payloads in an in-memory queue.
* **Online Synchronization**: When the workstation connection is restored, a background listener captures the window `online` event, loops through queued items, and pushes them to Turso.
* **Automated Retry Logic**: If writing to the remote database fails, the application prints `retrying` to the status logs and schedules up to 2 attempts spaced by 2 seconds before writing to a local backup file and resuming sequence.

### K. Local JSONL Backup

Every completed run is automatically saved to the Next.js server's filesystem under the `hmi/local-backup/` directory as a fire-and-forget fallback.
* `runs.jsonl`: Appends meta-information, gains, and parameters JSON strings.
* `metrics.jsonl`: Appends computed tracking errors and settle times.
* `samples-{runId}.jsonl`: Appends the aligned 50 Hz telemetry samples list.

---

## 3. Serial Protocol Specification

Data is exchanged as comma-separated values (CSV) terminated by a newline (`\n`).

### A. Downstream Commands (HMI → Microcontroller)

| Command | Description | Example |
| :--- | :--- | :--- |
| `move,<x>,<y>` | Linear end-effector move (mm) | `move,120.5,45.0` |
| `elbow,<val>` | Elbow config: `1` (right) or `-1` (left) | `elbow,1` |
| `kp1,<val>` … `kd2,<val>` | Per-gain PID updates | `kp1,0.8` |
| `ffi,<val>` | Inertia feedforward blend (0–1) | `ffi,0.5` |
| `ffc,<val>` | Coriolis feedforward blend (0–1) | `ffc,0.3` |
| `ffg,<val>` | Gravity feedforward blend (0–1) | `ffg,0.8` |
| `mstep,<val>` | Microstep divisor: `1`, `2`, `4`, `8`, `16` | `mstep,8` |
| `getgains` | Query PID and feedforward settings | `getgains` |
| `getparams` | Query runtime parameter block | `getparams` |
| `clrgraph` | Clear trajectory buffers | `clrgraph` |
| `estop` | Emergency stop — cut motor outputs | `estop` |
| `resume` | Clear E-STOP, re-enable outputs | `resume` |
| `ping` | Reset serial watchdog timer | `ping` |
| `mode,<name>` | Switch mode: `idle`, `scara`, `zn`, `test` | `mode,scara` |
| `plot,<0\|1>` | Enable/disable high-rate D logging | `plot,1` |
| `t1,<deg>` / `t2,<deg>` | ZN mode joint angle step (degrees) | `t1,45` |
| `<param>,<val>` | Set any runtime constant (TEST mode) | `vmax,0.05` |

### B. Upstream Telemetry (Microcontroller → HMI)

#### Move Start (`M`)
```text
M,x0,y0,xf,yf
```

#### Move Completed (`S`)
```text
S
```

#### Spatial Path Sample (`T`) — 50 Hz
```text
T,xi,yi,xa,ya
```

#### Detailed Joint Sample (`D`) — 500 Hz (downsampled to 50 Hz in HMI)
```text
D,t,th1,th2,th1d,th2d,dth1,dth2,dth1d,dth2d,pwm1,th1raw,th2raw
```
* Angles in radians; velocities in rad/s; `th1raw`/`th2raw` are unfiltered ADC values.

#### Feedforward Breakdown (`F`) — 50 Hz
```text
F,t,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1_contrib,u1_total,integral1,delta_omega_ff,omega2_raw,integral2
```

#### PID Effort & Loop Time (`E`) — 50 Hz
```text
E,t,p1_out,i1_out,d1_out,loop_duration_us
```

#### Gains Report (`G`)
```text
G,kp1,ki1,kd1,kp2,ki2,kd2,mstep,ffi,ffc,ffg
```

#### Runtime Parameters (`K`)
```text
K,vmax,amax,cfreq,u1max,fzt,pwm_db,td1r,td2r,td_h,ddth,dben,dbrel,dbvel,hskp,hskd,idecay,taunom,m22ref,alpha_tilt_deg,td_enabled,trap_enabled,ki2_gate_rad,db2en,db2rel,err_dz,integral_freeze_thresh
```

#### Trajectory Queue (`Q`)
```text
Q,pending_status,pending_x,pending_y
```

#### Boot Pose (`P`)
```text
P,x,y,th1,th2
```

#### Mode Change (`X`)
```text
X,SCARA
```

#### E-STOP State (`ESTOP`)
```text
ESTOP,1
```

#### Text Log Lines
Any line not matching the tags above is displayed in the serial monitor. Lines prefixed with `INFO:`, `WARN:`, or `ERR:` also trigger Sonner toast notifications.
