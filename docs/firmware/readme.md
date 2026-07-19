# SCARA Robot Firmware Manual
**2-DOF Planar SCARA | Computed Torque Control (CTC) + PID | ESP32 DevKit V1**  
*Adi Haditya Nursyam — Tugas Sarjana, ITB 2026*

---

## Table of Contents
1. [What This Is](#1-what-this-is)
2. [Actuator Kinematics & Mechanics](#2-actuator-kinematics--mechanics)
3. [Computed Torque Control (CTC) Dynamic Model](#3-computed-torque-control-ctc-dynamic-model)
4. [Tracking Differentiator (TD) Noise Filter](#4-tracking-differentiator-td-noise-filter)
5. [Hardware You Need](#5-hardware-you-need)
6. [Wiring Guide & Pinout Maps](#6-wiring-guide--pinout-maps)
7. [ADC Calibration & Position Mapping](#7-adc-calibration--position-mapping)
8. [File Structure](#8-file-structure)
9. [Software Setup](#9-software-setup)
10. [Build & Upload Scripts](#10-build--upload-scripts)
11. [First Boot Checklist](#11-first-boot-checklist)
12. [Operating State Machine & Transition Rules](#12-operating-state-machine--transition-rules)
13. [Cartesian & Joint Movement Logic](#13-cartesian--joint-movement-logic)
14. [Control Loop Architecture](#14-control-loop-architecture)
15. [Ziegler-Nichols & Deadband Tuning Workflow](#14-ziegler-nichols--deadband-tuning-workflow)
16. [All Serial Commands Reference](#16-all-serial-commands-reference)
17. [Upstream Telemetry Packet Formats](#17-upstream-telemetry-packet-formats)
18. [Troubleshooting & Diagnostics](#18-troubleshooting--diagnostics)
19. [Default Parameter Values (Quick Reference)](#19-default-parameter-values-quick-reference)

---

## 1. What This Is

This directory contains the PlatformIO-based C++ firmware targetting the ESP32 DevKit V1 microcontroller for a 2-joint planar SCARA robot arm.

```
      ┌──────────┐
      │  Joint 2 │── Link 2 (70 mm) ──► End Effector (EEF)
      │ (Stepper)│
      └──────────┘
           │
      Link 1 (100 mm)
           │
      ┌──────────┐
      │  Joint 1 │
      │ (DC Motor│
      └──────────┘
           │
          Base
```

The system coordinates trajectory execution in Cartesian space ($X, Y$ in mm) and translates them to joint space ($\theta_1, \theta_2$) utilizing Inverse Kinematics. Feedback position mapping is acquired at 500 Hz from potentiometer sensors, filtered via a Tracking Differentiator (TD), and controlled using a combination of dynamic feedforward model compensation and PID feedback.

---

## 2. Actuator Kinematics & Mechanics

The robot is driven by two different actuator types:
- **Joint 1 (Inner Link)**: Powered by a **GM25-370 DC Brushed Motor** driven by an **L298N H-bridge**.
  - Internal Gearbox: $103:1$
  - External Belt/Pulley Ratio: $2:1$
  - Effective Gear Ratio ($N_{eff1}$): $206.0$
  - Torque Constant $K_t$: $6.005 \times 10^{-3}\text{ N·m/A}$
  - Armature Resistance $R_a$: $9.23\text{ }\Omega$
  - Nominal Voltage $V_{nom}$: $12.0\text{ V}$
  - Rotor Inertia $J_{m,DC}$: $1.5 \times 10^{-7}\text{ kg·m}^2$
  - Stall Torque at J1 output: $\approx 1.608\text{ N·m}$
- **Joint 2 (Outer Link)**: Powered by a **NEMA 8 Stepper Motor** driven by an **A4988 driver**.
  - External Timing Belt/Pulley Ratio ($N_{eff2}$): $2.0$
  - Rotor Inertia $J_{m,step}$: $3.0 \times 10^{-7}\text{ kg·m}^2$
  - Step Resolution: $1.8^\circ$ per full step (200 steps/rev). Microstepping configured to **1/16** yielding an effective $3200$ steps per revolution at the motor shaft, translating to $6400$ steps per revolution of the outer link.
  - PWM frequency: 1000 Hz (LEDC channel 0, 8-bit resolution).

---

## 3. Computed Torque Control (CTC) Dynamic Model

To compensate for physical system dynamics (link inertia, Coriolis forces, and gravity loading), the firmware implements a model-based **Computed Torque Control (CTC)** feedforward algorithm.

The general dynamic equation of the planar SCARA robot is:
$$M(q)\ddot{q} + C(q, \dot{q})\dot{q} + G(q) = \tau$$

Where:
- $q = [\theta_1, \theta_2]^T$ represents the joint angle coordinates.
- $\dot{q} = [\dot{\theta}_1, \dot{\theta}_2]^T$ represents joint angular velocities.
- $\ddot{q} = [\ddot{\theta}_1, \ddot{\theta}_2]^T$ represents joint angular accelerations.
- $\tau = [\tau_1, \tau_2]^T$ represents joint torque control outputs.

### A. Inertia Matrix $M(q)$
The inertia matrix represents the configuration-dependent mass properties of the robot structure:
$$M(q) = \begin{bmatrix} M_{11} & M_{12} \\ M_{12} & M_{22} \end{bmatrix}$$

- $M_{11} = m_1 d_1^2 + m_2 (L_1^2 + d_2^2 + 2 L_1 d_2 \cos(\theta_2)) + I_{zz1} + I_{zz2}$
- $M_{12} = m_2 (d_2^2 + L_1 d_2 \cos(\theta_2)) + I_{zz2}$
- $M_{22} = m_2 d_2^2 + I_{zz2}$

Where:
- $L_1 = 0.100\text{ m}$, $L_2 = 0.070\text{ m}$ (Link lengths).
- $m_1 = 0.360\text{ kg}$, $m_2 = 0.15546\text{ kg}$ (Link masses).
- $d_1 = 0.04454\text{ m}$, $d_2 = 0.01478\text{ m}$ (Centroid positions from joints).
- $I_{zz1} = 1.357 \times 10^{-5}\text{ kg}\cdot\text{m}^2$, $I_{zz2} = 1.264 \times 10^{-6}\text{ kg}\cdot\text{m}^2$ (Mass moment of inertia about pivot axes).
- $I_{zz1}$ and $I_{zz2}$ are scaled by the square of their gear ratios to include motor rotor inertia:
  - $I_{zz1} = I_{zz1,\text{link}} + N_{eff1}^2 J_{m,\text{DC}}$
  - $I_{zz2} = I_{zz2,\text{link}} + N_{eff2}^2 J_{m,\text{step}}$

### B. Coriolis & Centrifugal Terms $C(q, \dot{q})\dot{q}$
These represent the dynamic forces acting on the joints when links are rotating:
- $C_1 = -m_2 L_1 d_2 \sin(\theta_2) \dot{\theta}_2 (2 \dot{\theta}_1 + \dot{\theta}_2)$
- $C_2 = m_2 L_1 d_2 \sin(\theta_2) \dot{\theta}_1^2$

### C. Gravity Matrix $G(q)$
For a strictly horizontal planar SCARA, gravity torque is zero. However, if the robot base is tilted by a pitch/roll angle $\alpha_{\text{tilt}}$ relative to the horizontal plane (tilt of the X axis about the Y axis — the Y axis is the pivot), gravity acts on the link centroids:
- $G_1 = -(m_1 d_1 + m_2 L_1) g \sin(\alpha_{\text{tilt}}) \sin(\theta_1) - m_2 d_2 g \sin(\alpha_{\text{tilt}}) \sin(\theta_1 + \theta_2)$
- $G_2 = -m_2 d_2 g \sin(\alpha_{\text{tilt}}) \sin(\theta_1 + \theta_2)$

### D. Control Torques
The model-based feedforward efforts are blended into the final motor outputs using parameters `ffi` (inertia), `ffc` (Coriolis), and `ffg` (gravity) spanning from $0.0$ (no model feedback, pure PID) to $1.0$ (full model-based compensation).

### E. Jacobian & End-Effector Velocity
The firmware computes a $2 \times 2$ Jacobian matrix mapping joint velocities ($\dot{\theta}_1, \dot{\theta}_2$) to Cartesian end-effector velocities ($\dot{x}, \dot{y}$):

$$J = \begin{bmatrix} -L_1\sin(\theta_1) - L_2\sin(\theta_1+\theta_2) & -L_2\sin(\theta_1+\theta_2) \\ L_1\cos(\theta_1) + L_2\cos(\theta_1+\theta_2) & L_2\cos(\theta_1+\theta_2) \end{bmatrix}$$

The Jacobian is used in `desiredSCARA()` to compute desired joint velocities from the trajectory's Cartesian velocity profile.

---

## 4. Tracking Differentiator (TD) Noise Filter

Due to high noise in analog ADC readings from the potentiometers, a second-order nonlinear **Tracking Differentiator (TD)** is used to extract clean, filtered joint angles ($v_1$) and their derivatives/velocities ($v_2$).

The discrete-time algorithm updates as follows for each joint:
1. Compute the tracking error and command parameters:
   $$d = h \cdot r$$
   $$y = v_1 - x_0 + h \cdot v_2$$
   $$a_0 = \sqrt{d^2 + 8 \cdot r \cdot |y|}$$
2. Determine the nonlinear control factor $a$:
   $$a = \begin{cases} v_2 + \frac{y}{h}, & \text{if } |y| \le d \cdot h \\ v_2 + 0.5 (a_0 - d) \text{sgn}(y), & \text{if } |y| > d \cdot h \end{cases}$$
3. Compute the output force function $fh$:
   $$fh = \begin{cases} \frac{a}{d}, & \text{if } |a| \le d \\ \text{sgn}(a), & \text{if } |a| > d \end{cases}$$
4. Integrate states:
   $$v_1 \leftarrow v_1 + dt \cdot v_2$$
   $$v_2 \leftarrow v_2 - r \cdot dt \cdot fh$$

Where:
- $x_0$ is the raw joint angle input parsed from the ADC calibration scale.
- $r$ is the filter bandwidth (runtime default: `25.0`, struct default: `50.0`). Higher values track faster but let more noise pass.
- $h$ is the filter integration step size, dynamically locked to the control loop period $dt$ ($0.002\text{ s}$) to prevent discretization instabilities.

The TD can be toggled on/off at runtime via the `tden,0/1` command (TEST mode). When disabled, the firmware falls back to finite-difference velocity estimation with clamping (`DTHETA_RAW_CLAMP = 5.0$ rad/s).

---

## 5. Hardware You Need

| Component | Specifications | Qty |
|-----------|----------------|-----|
| MCU | ESP32 DevKit V1 | 1 |
| DC motor driver | L298N H-bridge module | 1 |
| Stepper driver | A4988 module | 1 |
| DC motor | GM25-370 (with encoder, 103:1 gearbox) | 1 |
| Stepper motor | NEMA 8 (JK20HS42-0804) | 1 |
| Position sensors | B10K potentiometer | 2 |
| RC filter (J1) | $20\text{ k}\Omega$ resistor + $1\ \mu\text{F}$ capacitor | 1 set |
| Power supply | 12 V / 3 A AC-DC adapter | 1 |
| Voltage regulator | LM2596 step-down (12 V → 5 V) | 1 |
| USB cable | Micro-USB (for ESP32 data link) | 1 |

---

## 6. Wiring Guide & Pinout Maps

### ESP32 Pin Assignments

| ESP32 Pin | Connected To | Type | Description |
|-----------|-------------|------|-------------|
| **GPIO 36** | Stepper pot wiper | Analog Input (ADC1_CH0) | Joint 2 position sensor |
| **GPIO 39** | DC motor pot wiper | Analog Input (ADC1_CH3) | Joint 1 position sensor (needs RC filter) |
| **GPIO 14** | A4988 STEP pin | Digital Output | Stepper pulse trigger |
| **GPIO 12** | A4988 DIR pin | Digital Output | Stepper direction selection |
| **GPIO 16** | L298N IN3 | Digital Output | DC motor direction polarity A |
| **GPIO 17** | L298N IN4 | Digital Output | DC motor direction polarity B |
| **GPIO 18** | L298N EN | PWM Output (LEDC) | DC motor speed control (duty 0-255) |
| **GPIO 25** | Encoder channel A (ENC_A) | Digital Input | Quadrature encoder input A |
| **GPIO 26** | Encoder channel B (ENC_B) | Digital Input | Quadrature encoder input B |

> **Microstepping Pins (MS1/MS2/MS3):** On the custom PCB (`/pcb`), MS1, MS2, and MS3 are hardwired to 3.3V, fixing the A4988 at 1/16 microstep. This frees GPIO 33, 32, and 35 for other uses and avoids the GPIO 35 input-only limitation on the ESP32 DevKit V1. The firmware `config.h` still defines `MS1=33`, `MS2=32`, `MS3=35` for compatibility with breadboard builds.

### Potentiometer Filtering Circuit (Joint 1)
DC motor brush sparks introduce high electromagnetic interference (EMI). A hardware RC low-pass filter must be installed on the J1 analog line:
```
3.3V ──┬── [Pot End A]
       │
       └── [20 kΩ Resistor] ──┬──► GPIO 39 (ADC Pin)
                              │
                      [1 µF Capacitor]
                              │
GND ───── [Pot End B] ────────┴──► GND
```

---

## 7. ADC Calibration & Position Mapping

The 12-bit ADC of the ESP32 maps physical potentiometer voltages (0.0 to 3.3 V) into raw integer values (0 to 4095). Both potentiometers use ADC1: their channels are configured once during setup, then sampled directly through the ESP-IDF ADC driver to avoid Arduino's per-read pin setup overhead. The firmware averages 8 samples during boot and 4 samples during runtime. The resulting raw value $y$ is mapped to an angle in radians inside `src/hal/hal_adc.cpp` using the third-order polynomial $\hat{x}=a_3y^3+a_2y^2+a_1y+a_0$.

- **Joint 1 (DC motor)**: $a_3=-2.813562\times10^{-11}$, $a_2=1.364894\times10^{-7}$, $a_1=8.810620\times10^{-4}$, and $a_0=-0.776008$; calibration $R^2=0.999973$.
- **Joint 2 (stepper motor)**: $a_3=1.271488\times10^{-11}$, $a_2=-6.791787\times10^{-8}$, $a_1=1.192900\times10^{-3}$, and $a_0=-1.926119$; calibration $R^2=0.999991$.

The cubic model captures the potentiometer nonlinearity more accurately than a single linear map while remaining inexpensive to evaluate at the 500 Hz control rate. The calibration range must still cover all commanded joint angles; extrapolation outside that range is not treated as a validated measurement.

---

## 8. Software Setup

1. Install **Visual Studio Code**.
2. Install the **PlatformIO IDE** extension from the VS Code Extensions panel (Ctrl+Shift+X).
3. Open VS Code, select **File → Open Folder**, and open the `/firmware` directory.
4. PlatformIO will download compile toolchains and the Espressif 32 framework automatically on first run.

---

## 9. Build & Upload Scripts

Compile and flashing commands are executed using `scara.bat` in the `/firmware` folder:

```bat
# Compile code to verify compilation
scara.bat compile

# Compile and flash target ESP32 via serial link
scara.bat upload

# Flash already compiled binaries immediately
scara.bat upload-only

# Compile, flash, and launch serial monitor at 921600 baud
scara.bat all
```

---

## 10. First Boot Checklist

Upon initial upload, launch the serial monitor at **921600** baud and verify the following startup logs:
```text
==========================================
  SCARA Robot   |  Experiment Mode        
  Adi Haditya Nursyam — ITB 2026           
==========================================
INFO: Idle Mode.
P,<x_mm>,<y_mm>,<th1_rad>,<th2_rad>
X,IDLE
```

The `P` line is dynamic — it reports the actual forward-kinematics position derived from the 8-sample ADC average taken during boot. The `X,IDLE` line confirms the mode.

Ensure:
- [ ] Potentiometers read actual values. Gently rotate joints manually and verify the telemetry angles change.
- [ ] Keep the serial watchdog from resetting by sending a command or `ping`.

---

## 11. Operating State Machine & Transition Rules

The firmware transitions between 4 software modes. Unlike the simplified diagram below, **any active mode can transition directly to any other** via `mode,<name>`:

```
            ┌─────────────────┐
            │    MODE_IDLE    │ ◄─────────────────────────┐
            │ (Motors Disabled│                           │ Watchdog Timeout
            └────────┬────────┘                           │ (No Serial 8s)
                     │                                    │ or 'mode,idle'
       ┌──────────────┼──────────────┐                     │
       │ 'mode,scara' │ 'mode,zn'    │ 'mode,test'         │
       ▼              ▼              ▼                     │
 ┌───────────┐  ┌───────────┐  ┌───────────┐               │
 │MODE_SCARA │  │  MODE_ZN  │  │ MODE_TEST │ ──────────────┘
 │(Cartesian)│  │(Joint Step│  │ (Param    │
 └───────────┘  └───────────┘  └───────────┘
```

Direct transitions such as SCARA↔ZN, TEST↔SCARA, etc. are all supported via `mode,<name>`.

- **MODE_IDLE**: Safe default mode. Actuator outputs are disabled.
- **MODE_SCARA**: Standard operational mode. Trajectory planning is executed in Cartesian coordinate inputs.
- **MODE_ZN**: Ziegler-Nichols tuning mode. Bypasses Cartesian paths, enabling raw step commands to be sent directly to individual joints (`t1,angle` or `t2,angle`).
- **MODE_TEST**: Engineering mode. Same as SCARA, but unlocks live adjustments of 33+ control constants (e.g. speed, bandwidths, deadbands).

### Internal Sub-States & Flags

In addition to operating modes, the firmware tracks several runtime flags:

| Flag | Namespace | Purpose |
| :--- | :--- | :--- |
| `estop_active` | `RobotState` | Emergency stop latch — overrides all modes |
| `is_moving` | `TrajState` | Trajectory-in-progress flag |
| `is_resting` | `TrajState` | Waiting at L-shape intermediate waypoint |
| `pending_move` | `TrajState` | Queued second leg of L-shape path |
| `watchdog_halted` | `RobotState` | Serial watchdog tripped (8 s timeout) |
| `traj_time_done` | `TrajState` | Trajectory nominal time elapsed |
| `motor1_active` | `RobotState` | DC motor deadband engage state |
| `stepper2_active` | `RobotState` | J2 deadband hold state |

---

## 12. Cartesian & Joint Movement Logic

Moves are commanded in two ways depending on the mode:

1. **Cartesian Trajectory (`move,X,Y` in SCARA/TEST)**:
   - Uses Inverse Kinematics to calculate target joint angles.
   - Generates straight-line paths from coordinate $A$ to $B$ using a Trapezoidal Velocity Profile (or constant-velocity when `TRAP_ENABLED = false`).
   - Constrained by Cartesian physical limits: Outer reach $R_{max} = 170\text{ mm}$, Inner Singularity $R_{min} = 70.7\text{ mm}$.
   - Angular workspace constraint: $\phi \in [-30^\circ, 210^\circ]$ (240-degree sweep). Targets outside this range are rejected.
   - **L-Shape Path Splitting**: If a straight-line path would cross the inner singularity zone ($R < 70.7\text{ mm}$), the firmware automatically splits the move into two segments via an intermediate waypoint at a safe radius (120 mm). The first leg moves to the waypoint; the second leg completes the move. The HMI receives an `MC` packet (continuation) instead of `M` for the second leg to avoid clearing its telemetry buffers.
2. **Joint Step Command (`t1,deg` or `t2,deg` in ZN/TEST)**:
   - Drives joints directly to target angles, bypassing Cartesian path generation.

### Trapezoidal Profile Details

The trajectory generator supports both trapezoidal and triangle profiles:
- Full trapezoid: acceleration phase, constant-velocity cruise, deceleration phase.
- Triangle (degenerate): when the total path distance is too short for full acceleration to $V_{MAX}$, the peak velocity is reduced.
- Constant-velocity mode (`TRAP_ENABLED = false`): moves at $V_{MAX}$ from start to end with no acceleration/deceleration ramps.
- Settle detection: after the profile's nominal time $t_f$, the firmware checks both joint angles against `SETTLE_ERR_RAD = 0.01$ rad` for `SETTLE_TICKS_REQ = 20$ consecutive ticks (40 ms). A timeout of $2 \times t_f$ forces stop and emits a warning.

---

## 13. Control Loop Architecture

The firmware top-level `loop()` orchestrates all subsystems at 500 Hz:

```
loop():
  1. serviceSerial()               — non-blocking RX, fills serial_buf[64]
  2. serviceStepperPulse()         — free-running A4988 step generation (micros()-based)
  3. if (micros() - last_tick >= DT):
       runControlLoop()            — 500 Hz tick
  4. drainDLineBuffer()            — flush D-line ring buffer (max 2/loop)
  5. handle dbtest_active timer    — 400 ms DC pulse test
  6. emit E/F/T at 50 Hz          — every 20 ms (2 × TELEMETRY_MS)
  7. check serial watchdog         — 3 s → force MODE_IDLE
```

### runControlLoop() — 500 Hz Dispatch

Uses function-pointer dispatch for zero-overhead mode selection:

```
1. active_sensor_fn()        — sensorWithTD (default) or sensorRawOnly
2. if is_moving:
     getTrajPoint(t_traj)    → IK(x_cmd, y_cmd) → theta1_d, theta2_d
     t_traj += DT
   else:
     FK(theta_d)             — keep traj_x/y_cmd tracking desired
3. active_desired_fn(t)      — desiredSCARA (Jacobian) or desiredZN (zero)
4. computeCTC()              — M·ddθ + C + G at desired state
5. active_output_fn()        — controlJoint1() + controlJoint2()
6. checkTrajectoryDone()     — settle detect (20 ticks @ 0.01 rad) or timeout
7. writeDLineToBuffer()      — push to 8-entry ring buffer
```

### Function-Pointer Architecture

Transitioning between operating modes is atomic and avoids switch/case overhead inside the control loop. `transitionToMode()` swaps three function pointers:

| Pointer | MODE_IDLE | MODE_SCARA | MODE_ZN | MODE_TEST |
|---------|-----------|------------|---------|-----------|
| `active_sensor_fn` | sensorWithTD | sensorWithTD | sensorWithTD | configurable |
| `active_desired_fn` | desiredSCARA | desiredSCARA | desiredZN | desiredSCARA |
| `active_output_fn` | outputIdle | outputFull | outputZN | outputFull |

### Dual-Mode Joint Control

The two joints use fundamentally different control strategies:

| Aspect | Joint 1 (DC Motor) | Joint 2 (Stepper) |
|--------|-------------------|-------------------|
| Type | Torque-controlled | Velocity-controlled |
| Feedback | PID + deadband hold | PD + gated integral |
| Feedforward | CTC torque (normalised via TAU_NOM_J1) | CTC → velocity increment (via M22_REF / DT) |
| Velocity FF | KV_VEL × dTheta1_d (rate-limited) | N/A |
| Output | PWM duty (-255..255) | Step frequency (Hz) |

### D-Line Ring Buffer

D-packets are produced inside `runControlLoop()` at 500 Hz but buffered in an 8-entry ring buffer:
- **Producer**: `writeDLineToBuffer()` in the control tick — non-blocking, drops if full.
- **Consumer**: `drainDLineBuffer()` in `loop()` — drains up to 2 entries per iteration.
- **Effective rate**: ~100 Hz (at 500 Hz tick, 1 entry per 5 ticks, drained 2 at a time).
- Each entry: 256-byte C string buffer. Total buffer: 8 × 256 = 2048 bytes.

This throttling prevents the D-line from consuming 79% of the 921600 baud link (which would starve other packet types).

## 14. Ziegler-Nichols & Deadband Tuning Workflow

---

## 16. All Serial Commands Reference

All commands are plain-text ASCII strings terminated with `\n`.

### A. Global Commands (All Modes)

| Command | Action |
| :--- | :--- |
| `ping` | Resets watchdog timer (8 s timeout). |
| `estop` | Cuts all motor power immediately. Emits `ESTOP,1`. |
| `resume` | Clears E-STOP state. Emits `ESTOP,0`. |
| `mode,idle` | Switch to IDLE mode. |
| `mode,scara` | Switch to SCARA mode. |
| `mode,zn` | Switch to ZN mode. |
| `mode,test` | Switch to TEST mode. |
| `getgains` | Queries PID gains, microstep, and feedforward blend factors. Emits `G` + `X`. |
| `getparams` | Queries all 33 runtime parameters. Emits `K`. |
| `clrgraph` | Acknowledged by firmware; HMI uses this to clear chart buffers. |
| `plot,0` / `plot,1` | Disables/enables high-rate `D`-line telemetry output. |

### B. Mode-Specific Commands

#### SCARA & TEST

| Command | Action |
| :--- | :--- |
| `move,X,Y` | Cartesian end-effector move (mm). Rejected in ZN mode. |
| `kp1,val` / `ki1,val` / `kd1,val` | Sets Joint 1 PID gains. Resets integral1 on `ki1`. |
| `kp2,val` / `ki2,val` / `kd2,val` | Sets Joint 2 PID gains. |
| `ffi,val` / `ffc,val` / `ffg,val` | Feedforward blend factors (0.0 to 1.0). |

#### ZN Only

| Command | Action |
| :--- | :--- |
| `t1,deg` | Direct step drive Joint 1 (degrees). Resets integral1. |
| `t2,deg` | Direct step drive Joint 2 (degrees). |
| `dbtest` | Emits a 200-count PWM pulse to J1 for 400 ms to test wiring. |

#### TEST Only — Runtime Parameters (~33 tunable constants)

The TEST mode exposes all machine parameters for live tuning. Most parameters are guarded against changes while `is_moving` is true.

| Command | Parameter | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `t1,deg` | theta1_d | — | Any | Joint 1 target angle (deg). Resets integral1. |
| `t2,deg` | theta2_d | — | Any | Joint 2 target angle (deg). |
| `vmax,val` | V_MAX | 0.04 | > 0 | Max Cartesian velocity (m/s). |
| `amax,val` | A_MAX | 0.08 | > 0 | Max Cartesian acceleration (m/s²). |
| `u1max,val` | U1_MAX | 1.0 | > 0 | J1 effort limit (fraction of max). |
| `cfreq,val` | CONTROL_FREQ | 500 | > 0 | Control loop frequency (Hz). Also updates TD step `h`. |
| `kv1,val` | KV_VEL | 0.015 | Any | Velocity feedforward gain (fraction per rad/s). |
| `db,val` | PWM_DEADBAND | 68 | 0–255 | PWM deadband threshold. |
| `fzt,val` | FRAC_ZERO_THRESH | 0.01 | 0.0–0.5 | Fractional zero threshold. |
| `fztk,val` | FRAC_ZERO_KICK_PCT | 0.30 | 0.01–1.0 | Kickstart fraction of threshold. |
| `kspen,0/1` | KICKSTART_ENABLED | 1 | 0/1 | Enable kickstart during acceleration. |
| `vffmax,val` | VFF_MAX_FRAC | 0.3 | Any | Max velocity FF fraction. |
| `vffdv,val` | VFF_DV_MAX | 0.1 | Any | Max per-tick velocity FF change. |
| `td1r,val` | TD1_R | 25.0 | > 0 | TD filter bandwidth for Joint 1. |
| `td2r,val` | TD2_R | 25.0 | > 0 | TD filter bandwidth for Joint 2. |
| `tden,0/1` | TD_ENABLED | 1 | 0/1 | Enable/disable TD filter (falls back to finite-difference). |
| `trapen,0/1` | TRAP_ENABLED | 1 | 0/1 | Enable trapezoidal profile. 0 = constant velocity. |
| `atilt,deg` | alpha_tilt | 0.0 | Any | Base tilt angle (degrees) for gravity compensation. |
| `dben,val` | DB_ENGAGE | 0.01 | > 0 | J1 deadband engage error threshold (rad). |
| `dbrel,val` | DB_RELEASE | 0.005 | > 0 | J1 deadband release error threshold (rad). |
| `dbvel,val` | DB_VEL | 0.15 | > 0 | Velocity threshold for deadband logic (rad/s). |
| `db2en,val` | DB2_ENGAGE | 0.008 | > 0 | J2 deadband engage error threshold (rad). |
| `db2rel,val` | DB2_RELEASE | 0.005 | > 0 | J2 deadband release error threshold (rad). |
| `ddth,val` | DDTH_MAX | 2.0 | > 0 | Max delta-theta for raw derivative clamping (rad/s). |
| `hskp,val` | KP_HOLD_SCALE | 0.60 | > 0 | Proportional gain scale when settled. |
| `hskd,val` | KD_HOLD_SCALE | 2.00 | > 0 | Derivative gain scale when settled. |
| `idecay,val` | INTEGRAL_DECAY | 0.004 | > 0 | Integral term decay rate. |
| `taunom,val` | TAU_NOM_J1 | ~1.608 | > 0 | Nominal J1 torque (N·m) for FF normalisation. |
| `m22ref,val` | M22_REF | computed | > 0 | Reference M22 inertia for J2 FF scaling. |
| `ki2g,val` | KI2_GATE_RAD | 0.05 | > 0 | KI2 gate threshold (rad) — below this, Ki2 is gated. |
| `omega2rl,val` | OMEGA2_RATE_LIMIT | 4.0 | > 0 | J2 omega rate limit (rad/s²). |
| `dtclamp,val` | DTHETA_RAW_CLAMP | 5.0 | > 0 | Max raw delta-theta for finite-difference clamp (rad/s). |
| `errdz,val` | ERR_DZ | 0.005 | > 0 | Error deadzone threshold (rad) — error below this treated as zero. |
| `ifreeze,val` | INTEGRAL_FREEZE_THRESH | 0.01 | > 0 | Error threshold below which integrator decays instead of accumulating. |
| `dbmen,0/1` | DB_MOVING_ENABLED | 0 | 0/1 | Enable moving deadband scaling. |
| `dbens,val` | DB_ENGAGE_MOVING_SCALE | 0.9 | 0.1–1.0 | Deadband scale factor while moving. |

---

## 17. Upstream Telemetry Packet Formats

The firmware streams CSV telemetry packets at defined rates. All angles are in radians unless noted.

### A. Real-time Dynamics (`D`) — 500 Hz ring buffer
`D,t,th1,th2,th1d,th2d,v1,v2,v1d,v2d,pwm1,vff1,th1_raw,th2_raw,u1_total,p1_out,i1_out,d1_out,ff1_contrib[,v1_enc,enc_count]`
- `t`: Timestamp (ms).
- `th1` / `th2`: Measured joint angles (rad).
- `th1d` / `th2d`: Desired target angles (rad).
- `v1` / `v2`: Measured joint velocities (rad/s, from TD or finite-difference).
- `v1d` / `v2d`: Desired velocities (rad/s, from Jacobian-resolved rate control).
- `pwm1`: J1 PWM output (-255 to 255).
- `vff1`: J1 velocity feedforward contribution.
- `th1_raw` / `th2_raw`: Unfiltered ADC angles (rad).
- `u1_total`: Total J1 control effort (sum of PID + FF).
- `p1_out` / `i1_out` / `d1_out`: PID term contributions split (effort units).
- `ff1_contrib`: J1 CTC feedforward contribution (effort units).
- `v1_enc` / `enc_count`: Reserved for encoder-based velocity (currently always 0).

> Note: The `D` packet has **18 data fields** (19 columns including the `D` tag), plus 2 reserved fields (always 0). The firmware writes D-lines into an 8-entry ring buffer inside `runControlLoop()` and drains up to 2 per `loop()` iteration (effective rate ~100 Hz to avoid saturating the 921600 baud link). The HMI downsamples to ~50 Hz for chart rendering.

### B. Feedforward Components (`F`) — 50 Hz
`F,t,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1_contrib,u1_total,integral1,delta_omega_ff,omega2_raw,integral2`
- Per-joint inertia, Coriolis, and gravity feedforward torques (blended by `FF_INERTIA`, `FF_CORIOLIS`, `FF_GRAVITY`).
- `ff1_contrib`: Total J1 feedforward = inertia1 + coriolis1 + gravity1.
- `u1_total`: J1 total control effort (FF + PID feedback).
- `integral1` / `integral2`: Integrator windup buffers.
- `delta_omega_ff`: Feedforward delta-omega for J2.
- `omega2_raw`: J2 raw velocity.

### C. PID Diagnostics (`E`) — 50 Hz
`E,t,p1_out,i1_out,d1_out,loop_duration_us`
- `t`: Timestamp (ms).
- `p1_out` / `i1_out` / `d1_out`: PID term contributions **scaled to PWM units** ($\times 255 / U1\_MAX$), not raw controller output.
- `loop_duration_us`: Microcontroller loop execution time (microseconds, typically ~80 µs).

### D. Cartesian Path Tracking (`T`) — 50 Hz
`T,xi,yi,xa,ya`
- Coordinates in mm. `xi, yi` (desired), `xa, ya` (actual).

### E. Move Start (`M`) — once per move
`M,x0,y0,xf,yf`
- Start and target coordinates (mm). Triggers the HMI to clear buffers and enter recording state.

### F. Move Continuation (`MC`) — once per L-shape second leg
`MC,x0,y0,xf,yf`
- Same format as `M` but signals the HMI to **not** clear buffers (the first leg's data is retained).

### G. Move Done (`S`) — once when trajectory settles
`S,xf,yf`
- Emitted when the end effector reaches the target and satisfies the settle condition (20 ticks within 0.01 rad).

### H. Gains Report (`G`) — on request or update
`G,kp1,ki1,kd1,kp2,ki2,kd2,mstep,ffi,ffc,ffg`
- `mstep`: Always reports 16 (1/16 microstep).
- `ffi`, `ffc`, `ffg`: Feedforward blend factors (0–1).

### I. Advanced Parameters (`K`) — 33 fields, on request
`K,vmax,amax,cfreq,u1max,fzt,fztk,kspen,pwm_db,dbmen,dbens,td1r,td2r,td_h,ddth,dben,dbrel,dbvel,hskp,hskd,idecay,taunom,m22ref,alpha_tilt_deg,td_enabled,trap_enabled,ki2_gate_rad,db2en,db2rel,err_dz,integral_freeze_thresh,kv_vel,vff_max_frac,vff_dv_max`
- Reports all 33 runtime parameters. See the TEST-mode command table for field descriptions.

### J. Position Heartbeat (`P`) — on boot and `getgains`
`P,x_mm,y_mm,th1_rad,th2_rad`
- Current forward-kinematics Cartesian position and joint angles.

### K. Queue Status (`Q`) — on move queue change
`Q,pending_status,pending_x,pending_y`
- `pending_status`: 1 if a move is buffered, 0 otherwise.
- `pending_x`, `pending_y`: Queued trajectory destination (mm).

### L. Mode Indicator (`X`) — on mode change
`X,MODE_NAME`
- Reports current operating mode: `IDLE`, `SCARA`, `ZN`, or `TEST`.

### M. E-STOP Status (`ESTOP`) — on estop/resume
`ESTOP,0` or `ESTOP,1`
- `1` = emergency stop active, `0` = cleared.

### N. Generic Text Lines
Lines prefixed with `INFO:`, `WARN:`, `ERR:`, or `SUCCESS:` are status/debug messages. The HMI displays `ERR:`/`WARN:` lines as Sonner toast notifications.

### O. Boot Sequence (Pose Format)
`P,x_mm,y_mm,th1_rad,th2_rad`
- Emitted once during `setup()` after ADC seeding.

---

## 18. Troubleshooting & Diagnostics

- **Watcher Auto-Returns to IDLE**: The 8-second watchdog timer fired. Ensure the HMI is sending periodic `ping` commands (usually handled by the active serial tab heartbeat).
- **ADC Readings fluctuate wildly**: Potentiometer EMI noise. Confirm that the RC low-pass filter (20 kΩ + 1 µF) is wired close to the ESP32 input pin.
- **Grinding/Grating Noises on Joint 2**: Stepper motor is skipping steps. Lower the maximum velocity (`vmax`) or acceleration (`amax`) settings via the Test parameter tuner, or increase the stepper driver current limits.
- **Inverse Kinematics Failures**: Target coordinate falls outside the physical boundary (170 mm), inside the singular zone (70.7 mm), or outside the allowed angular sector (-30° to 210°). Make Cartesian movements within valid workspace boundaries.

---

## 19. Default Parameter Values (Quick Reference)

Values below reflect the runtime defaults loaded in `robot_state.cpp`. These differ from earlier firmware versions.

| Parameter | Default | Unit |
|-----------|---------|------|
| Kp1, Ki1, Kd1 | 0.3, 0.01, 0.008 | — |
| Kp2, Ki2, Kd2 | 5.5, 0.01, 0.02 | — |
| FF_INERTIA, FF_CORIOLIS, FF_GRAVITY | 0.0, 0.0, 0.0 | — |
| V_MAX | 0.04 | m/s |
| A_MAX | 0.08 | m/s² |
| Control frequency | 500 | Hz |
| U1_MAX | 1.0 | fraction of max |
| FRAC_ZERO_THRESH (fzt) | 0.01 | — |
| FRAC_ZERO_KICK_PCT (fztk) | 0.30 | fraction of fzt |
| KICKSTART_ENABLED (kspen) | 1 | 0/1 |
| PWM_DEADBAND (pwm_db) | 68 | counts (0–255) |
| DB_MOVING_ENABLED (dbmen) | 0 | 0/1 |
| DB_ENGAGE_MOVING_SCALE (dbens) | 0.9 | 0.1–1.0 |
| TD1_R, TD2_R | 25.0, 25.0 | — |
| TD_ENABLED | 1 | 0/1 |
| DDTH_MAX | 2.0 | rad/s |
| DB_ENGAGE (dben) | 0.01 | rad |
| DB_RELEASE (dbrel) | 0.005 | rad |
| DB_VEL (dbvel) | 0.15 | rad/s |
| DB2_ENGAGE (db2en) | 0.008 | rad |
| DB2_RELEASE (db2rel) | 0.005 | rad |
| ERR_DZ | 0.005 | rad |
| INTEGRAL_FREEZE_THRESH | 0.01 | rad |
| INTEGRAL_DECAY | 0.004 | — |
| KP_HOLD_SCALE | 0.60 | — |
| KD_HOLD_SCALE | 2.00 | — |
| KI2_GATE_RAD | 0.05 | rad |
| TAU_NOM_J1 | 0.32 | N·m |
| M22_REF | computed | kg·m² |
| KV_VEL | 0.015 | fraction per rad/s |
| VFF_MAX_FRAC | 0.3 | fraction of U1_MAX |
| VFF_DV_MAX | 0.1 | fraction of U1_MAX |
| OMEGA2_RATE_LIMIT | 4.0 | rad/s² |
| DTHETA_RAW_CLAMP | 5.0 | rad/s |
| alpha_tilt | 0.0 | degrees |
| TRAP_ENABLED | 1 | 0/1 |
| Settle threshold | 0.01 | rad (~0.6°) |
| Settle ticks required | 20 | ticks @ 500 Hz = 40 ms |
| Serial watchdog | 3000 | ms (3 s) |

---

*Firmware — Last updated June 2026*  
*For questions: refer to Bab IV (Implementasi) of the thesis document.*
