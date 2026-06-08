# SCARA Robot Firmware
**2-DOF Planar SCARA | CTC + PID | ESP32 DevKit V1**  
Adi Haditya Nursyam — Tugas Sarjana, ITB 2026

---

## Table of Contents
1. [What This Is](#1-what-this-is)
2. [Hardware You Need](#2-hardware-you-need)
3. [Wiring Guide](#3-wiring-guide)
4. [Software Setup](#4-software-setup)
5. [Build & Upload](#5-build--upload)
6. [First Boot Checklist](#6-first-boot-checklist)
7. [Operating Modes](#7-operating-modes)
8. [Moving the Robot](#8-moving-the-robot)
9. [All Serial Commands](#9-all-serial-commands)
10. [Tuning the Robot (Non-control Version)](#10-tuning-the-robot-non-control-version)
11. [Reading the Telemetry](#11-reading-the-telemetry)
12. [Project File Structure](#12-project-file-structure)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What This Is

This is the embedded firmware for a 2-joint planar SCARA robot arm.

```
      ┌──────────┐
      │  Joint 2 │── Link 2 (70 mm) ──► End Effector
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

**Joint 1** — driven by a GM25-370 DC motor + L298N H-bridge  
**Joint 2** — driven by a NEMA 8 stepper + A4988 driver  
Both joints use B10K potentiometers as position sensors.

The robot can move its end-effector in a straight line from point A to point B in 2D space. You send it a target coordinate (X, Y in mm) over USB serial and it goes there.

---

## 2. Hardware You Need

| Component | Part | Qty |
|-----------|------|-----|
| Microcontroller | ESP32 DevKit V1 | 1 |
| DC motor driver | L298N H-bridge module | 1 |
| Stepper driver | A4988 module | 1 |
| DC motor | GM25-370 (with encoder, 103:1 gearbox) | 1 |
| Stepper motor | NEMA 8 (JK20HS42-0804) | 1 |
| Position sensors | B10K potentiometer | 2 |
| RC filter (J1) | 20 kΩ resistor + 1 µF capacitor | 1 set |
| Power supply | 12 V / 3 A adapter | 1 |
| Voltage regulator | LM2596 step-down (12 V → 5 V) | 1 |
| USB cable | Micro-USB (for ESP32) | 1 |
| PC | Any OS, with USB port | 1 |

---

## 3. Wiring Guide

### ESP32 Pin Assignments

| ESP32 GPIO | Connected To | Description |
|-----------|-------------|-------------|
| **GPIO 36** | Stepper pot (wiper) | Joint 2 position sensor |
| **GPIO 39** | DC motor pot (wiper, through RC filter) | Joint 1 position sensor |
| **GPIO 14** | A4988 STEP pin | Stepper step pulses |
| **GPIO 12** | A4988 DIR pin | Stepper direction |
| **GPIO 16** | L298N IN3 | DC motor direction A |
| **GPIO 17** | L298N IN4 | DC motor direction B |
| **GPIO 18** | L298N EN (PWM) | DC motor speed |
| **GPIO 33** | A4988 MS1 | Microstepping bit 1 |
| **GPIO 32** | A4988 MS2 | Microstepping bit 2 |
| **GPIO 35** | A4988 MS3 | Microstepping bit 3 ⚠️ |

> ⚠️ **GPIO 35 is input-only** on DevKit V1. MS3 is set HIGH at boot via software but if A4988 needs active drive during operation, rewire MS3 to GPIO 25, 26, or 27.

### Microstepping (A4988)
MS1=HIGH, MS2=HIGH, MS3=HIGH → **1/16 microstep** (set automatically at boot).

### Potentiometer Wiring
```
3.3V ──┬── [Pot end A]
       │
       └── [RC filter: 20kΩ + 1µF] ──► GPIO 39  (Joint 1 only)
                                        GPIO 36  (Joint 2, no filter needed)
GND ───── [Pot end B]
```
Both pot wipers go to their GPIO with a 3.3 V reference. **Do not use 5 V** — the ESP32 ADC is 3.3 V max.

### Power Distribution
```
12V adapter ──► L298N VCC (motors)
            └──► LM2596 IN ──► LM2596 OUT (5V) ──► ESP32 VIN
```

---

## 4. Software Setup

You only need to do this once.

### Step 1 — Install VS Code
Download from [code.visualstudio.com](https://code.visualstudio.com)

### Step 2 — Install PlatformIO Extension
In VS Code: Extensions (Ctrl+Shift+X) → search **PlatformIO IDE** → Install.

### Step 3 — Open This Project
File → Open Folder → select the `code/` folder (the one containing `platformio.ini`).

PlatformIO will automatically download the ESP32 Arduino core and toolchain on first build (~500 MB, one-time).

### Step 4 — Install a Serial Terminal (optional but recommended)
- **CoolTerm** (Windows/Mac/Linux) — simple, reliable
- **PuTTY** (Windows) — lightweight
- Or use PlatformIO's built-in monitor: `scara.bat monitor`

Set baud rate to **921600** in whichever terminal you use.

---

## 5. Build & Upload

Open a **Command Prompt** (not PowerShell) in the `code/` folder, or use the VS Code terminal.

```bat
REM Compile only — check for errors without touching the robot
scara.bat compile

REM Compile + upload to ESP32 (robot must be connected via USB)
scara.bat upload

REM Upload last compiled binary immediately (fastest, skips file checks)
scara.bat upload-only

REM Compile + upload + open serial monitor in one command
scara.bat all
```

> **First upload takes ~2 minutes** because PlatformIO compiles the Arduino framework from source. Subsequent builds take ~6 seconds (only changed files recompile).

### What "success" looks like
```
RAM:   [=         ]   7.0% (used 22996 bytes from 327680 bytes)
Flash: [==        ]  23.4% (used 306721 bytes from 1310720 bytes)
========================= [SUCCESS] Took 6.12 seconds =========================
```

---

## 6. First Boot Checklist

After uploading, open the serial monitor (921600 baud) and you should see:

```
==========================================
  SCARA Robot   |  Experiment Mode        
  Adi Haditya Nursyam — ITB 2026           
==========================================
INFO: Boot state = MODE_IDLE.
INFO: Kirim 'mode,scara', 'mode,zn', atau 'mode,test'.
P,<x_mm>,<y_mm>,<th1>,<th2>
X,IDLE
```

**Before doing anything else, verify:**

- [ ] `P,` shows reasonable X/Y values (not `nan` or `0.000,0.000` constantly)
- [ ] Both potentiometers physically move joints and the `P,` values change
- [ ] No smoke from the L298N or A4988 🙂
- [ ] Power LED on ESP32 is solid (not blinking rapidly)

---

## 7. Operating Modes

The robot has 4 modes. You switch between them by typing commands in the serial terminal.

| Mode | Command | What it does |
|------|---------|-------------|
| **IDLE** | `mode,idle` | All motors off. Safe default. Boot state. |
| **SCARA** | `mode,scara` | Full operation. Send `move,X,Y` to drive the robot. |
| **ZN** | `mode,zn` | Ziegler-Nichols tuning. Move joints individually to find PID gains. |
| **TEST** | `mode,test` | Like SCARA but all internal parameters are adjustable live. |

### Mode transition rules
- You can always go back to `mode,idle` — it cuts all motor power.
- SCARA → TEST or TEST → SCARA is allowed.
- Any active movement is stopped safely when you change modes.
- The robot **auto-returns to IDLE** after 8 seconds of serial silence (watchdog). Just send `ping` to keep it alive.

---

## 8. Moving the Robot

### Basic move (SCARA or TEST mode)
```
mode,scara
move,120,50
```
This moves the end-effector to X=120 mm, Y=50 mm from the robot's base origin.

### Workspace limits
The reachable area is a ring (not a full circle):

```
Minimum reach: |L1 - L2| = |100 - 70| = 30 mm from center
Maximum reach: L1 + L2   = 100 + 70   = 170 mm from center
```

If your target is outside this ring you'll get:
```
ERR: Di luar workspace. R valid: 30.0 – 170.0
```

### Queuing a second move
You can send a second `move,` while the robot is still moving. It will be queued and executed automatically when the first move finishes:
```
move,150,0
move,100,80      ← queued, starts after first move settles
```

### Stop immediately
```
estop            ← cuts all motor power, keeps position in memory
resume           ← re-enables motor output (does NOT move)
```

---

## 9. All Serial Commands

Type these exactly (lowercase, no spaces) into the serial terminal and press Enter.

### Always available (any mode)
| Command | Effect |
|---------|--------|
| `ping` | Resets the 8-second watchdog timer. Send periodically to keep the robot active. |
| `estop` | Emergency stop — cuts all motor outputs immediately. |
| `resume` | Clears the ESTOP flag. Motors re-engage but robot does not move. |
| `getgains` | Prints all current PID gains and FF settings. |
| `getparams` | Prints all current runtime parameters. |
| `clrgraph` | Tells the HMI to clear its graph (acknowledged only). |

### Mode switching
```
mode,idle    mode,scara    mode,zn    mode,test
```

### Movement (SCARA and TEST modes)
| Command | Example | Effect |
|---------|---------|--------|
| `move,X,Y` | `move,130,60` | Move end-effector to (X, Y) in mm |

### PID gains (SCARA, TEST, and ZN modes)
| Command | Example | What it adjusts |
|---------|---------|-----------------|
| `kp1,value` | `kp1,0.8` | Joint 1 proportional gain |
| `ki1,value` | `ki1,0.02` | Joint 1 integral gain |
| `kd1,value` | `kd1,0.03` | Joint 1 derivative gain |
| `kp2,value` | `kp2,5.0` | Joint 2 proportional gain |
| `ki2,value` | `ki2,0.01` | Joint 2 integral gain |
| `kd2,value` | `kd2,0.15` | Joint 2 derivative gain |

### Feedforward blend (SCARA and TEST modes)
These scale how much model-based prediction helps each motor. `0.0` = pure PID, `1.0` = full model assist.
| Command | Example | Effect |
|---------|---------|--------|
| `ffi,value` | `ffi,0.5` | Inertia feedforward blend (0.0–1.0) |
| `ffc,value` | `ffc,0.3` | Coriolis feedforward blend (0.0–1.0) |
| `ffg,value` | `ffg,0.8` | Gravity feedforward blend (0.0–1.0) |

### ZN mode only
| Command | Example | Effect |
|---------|---------|--------|
| `t1,degrees` | `t1,45` | Set Joint 1 target angle directly |
| `t2,degrees` | `t2,30` | Set Joint 2 target angle directly |
| `dbtest` | | Pulse DC motor at PWM=200 for 400 ms (tests wiring) |

### TEST mode only (physical parameter tuning)
| Command | Example | What it changes |
|---------|---------|-----------------|
| `vmax,value` | `vmax,0.05` | Max Cartesian speed [m/s] |
| `amax,value` | `amax,0.08` | Max Cartesian acceleration [m/s²] |
| `tden,0` or `tden,1` | `tden,0` | Disable/enable noise filter (TD). Off = raw ADC. |
| `trapen,0` or `trapen,1` | `trapen,0` | Disable/enable trapezoidal profile. Off = constant velocity. |
| `atilt,degrees` | `atilt,5.0` | Base tilt angle correction for gravity compensation |
| `t1,degrees` | `t1,60` | Manually set Joint 1 desired angle (no trajectory) |
| `t2,degrees` | `t2,-20` | Manually set Joint 2 desired angle (no trajectory) |
| `u1max,value` | `u1max,0.9` | DC motor maximum effort (0.0–1.0) |
| `db,value` | `db,65` | DC motor PWM deadband (integer, 0–255) |
| `td1r,value` | `td1r,50.0` | Joint 1 filter bandwidth (higher = faster but noisier) |
| `td2r,value` | `td2r,50.0` | Joint 2 filter bandwidth |
| `cfreq,value` | `cfreq,500` | Control loop frequency [Hz] |

---

## 10. Tuning the Robot (Non-control Version)

You don't need to understand control theory to get the robot working. Follow this sequence.

### Step 1 — Verify sensors first
```
mode,zn
t1,0
t1,45
t1,90
```
Watch the `P,` telemetry line. The `th1` value should increase roughly as you send increasing angles. If it goes the wrong way, your potentiometer wiring is reversed.

### Step 2 — Find the DC motor deadband
```
mode,zn
dbtest
```
If the DC motor twitches, it's wired. If nothing happens, check IN3/IN4/EN connections.

Now increase `db,` until the motor just barely moves:
```
db,50    db,60    db,70    db,80
```
Send `t1,45` and observe. The right deadband value is the lowest number where the motor responds without buzzing at rest.

### Step 3 — Basic Joint 1 PID (start low, go slow)
```
mode,zn
kp1,0.3
t1,0
t1,45
```
Watch if it reaches 45°. If it overshoots and oscillates, lower `kp1`. If it moves too slowly or doesn't reach the target, raise `kp1`. Once it reaches the target without oscillation, add a little derivative:
```
kd1,0.015
```

### Step 4 — Basic Joint 2 PID
```
mode,zn
kp2,3.0
t2,0
t2,30
```
Same process. Joint 2 is a stepper — it tends to be more stable, so you can use higher `kp2`.

### Step 5 — Try a Cartesian move
```
mode,scara
move,130,0
```
If it reaches the target smoothly, try:
```
move,100,80
move,130,0
```
If it oscillates during the move, reduce `vmax,` and `amax,`.

### Step 6 — Enable gravity compensation (optional)
If the arm drifts when holding a pose (especially with the arm extended horizontally), try:
```
ffg,0.5
```
Increase gradually until drift reduces. If the robot becomes unstable, reduce it back.

---

## 11. Reading the Telemetry

The robot continuously sends data packets over serial. Here's what they mean:

| Packet | Rate | Format | Meaning |
|--------|------|--------|---------|
| `D` | 500 Hz | `D,ms,th1,th2,th1d,th2d,dth1,dth2,dth1d,dth2d,pwm1,th1raw,th2raw` | Full real-time state (HMI downsamples to 50 Hz) |
| `E` | 50 Hz | `E,ms,P_pwm,I_pwm,D_pwm,loop_us` | Joint 1 PID components + loop time |
| `F` | 50 Hz | `F,ms,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1,u1,integral1,dω_ff,ω2_raw,integral2` | Feedforward component breakdown |
| `T` | 50 Hz | `T,x_cmd,y_cmd,x_act,y_act` | Cartesian command vs actual position |
| `P` | On request | `P,x_mm,y_mm,th1,th2` | Current end-effector position |
| `M` | On move start | `M,x0,y0,xf,yf` | Trajectory start point and target |
| `S` | On move end | `S,xf,yf` | Trajectory finished |
| `G` | On request | `G,Kp1,Ki1,Kd1,Kp2,Ki2,Kd2,mstep,ffi,ffc,ffg` | Current gains and feedforward blends |
| `K` | On request | 26 parameters | All runtime settings |
| `X` | On mode change | `X,MODENAME` | Current operating mode |
| `Q` | On queue change | `Q,pending,px,py` | Move queue status |

**Quick sanity check** — in your serial terminal, look for the `T,` line during a move:
```
T,130.000,0.000,128.431,1.203
```
`x_cmd`=130, `y_cmd`=0 is where you asked it to go. `x_act`=128.4, `y_act`=1.2 means it's almost there (2 mm short — good!).

---

## 12. Project File Structure

```
code/
├── include/
│   └── config.h              ← Physical constants, pin numbers (edit if you change hardware)
│
├── src/
│   ├── main.cpp              ← setup() and loop() only
│   │
│   ├── state/
│   │   └── robot_state.*     ← All shared variables (angles, gains, flags)
│   │
│   ├── hal/
│   │   ├── hal_dc.*          ← DC motor PWM output
│   │   ├── hal_stepper.*     ← Stepper pulse generation
│   │   └── hal_adc.*         ← Potentiometer reading + angle mapping
│   │
│   ├── kinematics/
│   │   └── kinematics.*      ← FK, IK, Jacobian (pure math, no hardware)
│   │
│   ├── sensors/
│   │   └── sensors.*         ← Noise filter (Tracking Differentiator)
│   │
│   ├── trajectory/
│   │   └── trajectory.*      ← Trapezoidal path planning
│   │
│   ├── control/
│   │   ├── ctc.*             ← Computed Torque Control (feedforward model)
│   │   ├── joint1.*          ← DC motor PID + feedforward
│   │   └── joint2.*          ← Stepper PID + feedforward
│   │
│   ├── comms/
│   │   ├── serial_protocol.* ← Telemetry packet emitters
│   │   └── cmd_parser.*      ← Serial command handler
│   │
│   └── scheduler/
│       └── scheduler.*       ← Control loop orchestrator, mode transitions
│
├── platformio.ini            ← Build configuration
├── scara.bat                 ← Build/upload shortcuts
└── old_integrated_program.ino ← Original monolithic source (reference only)
```

### "I want to change X" — where to look

| What you want to change | File |
|------------------------|------|
| Pin numbers | `include/config.h` |
| Link lengths, masses | `include/config.h` |
| ADC calibration values | `include/config.h` |
| Default PID gains | `src/state/robot_state.cpp` (namespace Params) |
| Default speed/acceleration | `src/state/robot_state.cpp` (V_MAX, A_MAX) |
| DC motor control logic | `src/control/joint1.cpp` |
| Stepper control logic | `src/control/joint2.cpp` |
| Trajectory shape | `src/trajectory/trajectory.cpp` |
| Add a new serial command | `src/comms/cmd_parser.cpp` |
| Change telemetry format | `src/comms/serial_protocol.cpp` |

---

## 13. Troubleshooting

### Robot doesn't respond to serial commands
- Check baud rate is **921600** (not 9600 or 115200)
- Check `monitor_filters = direct` in `platformio.ini` (no line ending conversion)
- Send `ping` — if you get no response at all, try re-uploading

### `ERR: IK failed` during movement
The arm hit a singular configuration (fully extended or folded). Try:
1. Move to a position closer to the center of the workspace
2. Lower `vmax,` — the arm may be going too fast through a singular point

### DC motor oscillates / buzzes at rest
- Increase `db,` by 5 at a time until buzzing stops
- Lower `kp1,` slightly
- Increase `kd1,` slightly

### Stepper motor skips steps or makes grinding noise
- Lower `vmax,` — you're exceeding the motor's torque at speed
- Check A4988 current limit potentiometer (should be set for ~0.8 A)
- Check 12 V power supply is rated for ≥ 3 A

### Robot auto-returns to IDLE unexpectedly
The **serial watchdog** fired (no data received for 8 seconds). Keep the serial terminal open, or send `ping` periodically from your HMI script. To disable the watchdog temporarily, you can increase `SERIAL_WATCHDOG_MS` in `src/state/robot_state.cpp` and rebuild.

### Position sensor reads wrong / jumpy values
- Check potentiometer wiper is connected to the correct GPIO
- Verify 3.3 V (not 5 V) on pot ends
- For Joint 1: verify the RC filter (20 kΩ + 1 µF) is present between wiper and GPIO 39
- Run `tden,0` in TEST mode to see raw ADC — if it's stable raw but jumpy with TD, re-tune `td1r,`

### `build` fails with permission error
Run VS Code or Command Prompt as Administrator, or exclude the `code/` folder from Windows Defender real-time scanning.

---

## Default Parameter Values (Quick Reference)

| Parameter | Default | Unit |
|-----------|---------|------|
| Kp1, Ki1, Kd1 | 0.6, 0.03, 0.02 | — |
| Kp2, Ki2, Kd2 | 4.0, 0.005, 0.1 | — |
| V_MAX | 0.035 | m/s |
| A_MAX | 0.060 | m/s² |
| Control frequency | 500 | Hz |
| PWM deadband | 70 | counts (0–255) |
| Settle threshold | 0.01 | rad (~0.6°) |
| Settle ticks required | 20 | ticks @ 500 Hz = 40 ms |
| Serial watchdog | 8000 | ms |

---

*Firmware — Last updated June 2026*  
*For questions: refer to Bab IV (Implementasi) of the thesis document.*
