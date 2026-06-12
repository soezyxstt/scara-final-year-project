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
8. [Software Setup](#8-software-setup)
9. [Build & Upload Scripts](#9-build--upload-scripts)
10. [First Boot Checklist](#10-first-boot-checklist)
11. [Operating State Machine & Transition Rules](#11-operating-state-machine--transition-rules)
12. [Cartesian & Joint Movement Logic](#12-cartesian--joint-movement-logic)
13. [Ziegler-Nichols & Deadband Tuning Workflow](#13-ziegler-nichols--deadband-tuning-workflow)
14. [All Serial Commands Reference](#14-all-serial-commands-reference)
15. [Upstream Telemetry Packet Formats](#15-upstream-telemetry-packet-formats)
16. [Troubleshooting & Diagnostics](#16-troubleshooting--diagnostics)

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
- **Joint 2 (Outer Link)**: Powered by a **NEMA 8 Stepper Motor** driven by an **A4988 driver**.
  - External Timing Belt/Pulley Ratio ($N_{eff2}$): $2.0$
  - Step Resolution: $1.8^\circ$ per full step (200 steps/rev). Microstepping configured to **1/16** yielding an effective $3200$ steps per revolution at the motor shaft, translating to $6400$ steps per revolution of the outer link.

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
For a strictly horizontal planar SCARA, gravity torque is zero. However, if the robot base is tilted by a pitch/roll angle $\alpha_{\text{tilt}}$ relative to the horizontal plane, gravity acts on the link centroids:
- $G_1 = (m_1 d_1 + m_2 L_1) g \sin(\alpha_{\text{tilt}}) \cos(\theta_1) + m_2 d_2 g \sin(\alpha_{\text{tilt}}) \cos(\theta_1 + \theta_2)$
- $G_2 = m_2 d_2 g \sin(\alpha_{\text{tilt}}) \cos(\theta_1 + \theta_2)$

### D. Control Torques
The model-based feedforward efforts are blended into the final motor outputs using parameters `ffi` (inertia), `ffc` (Coriolis), and `ffg` (gravity) spanning from $0.0$ (no model feedback, pure PID) to $1.0$ (full model-based compensation).

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
- $r$ is the filter bandwidth (default: `50.0`). Higher values track faster but let more noise pass.
- $h$ is the filter integration step size, dynamically locked to the control loop period $dt$ ($0.002\text{ s}$) to prevent discretization instabilities.

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
| **GPIO 33** | A4988 MS1 | Digital Output | Microstepping state bit 1 |
| **GPIO 32** | A4988 MS2 | Digital Output | Microstepping state bit 2 |
| **GPIO 35** | A4988 MS3 | Digital Output (⚠️ Input Only) | Microstepping state bit 3 |

> ⚠️ **IMPORTANT WARNING:** GPIO 35 is input-only on the ESP32 DevKit V1. If MS3 must be driven actively during execution to dynamically adjust step configurations, rewire MS3 to a general-purpose IO such as GPIO 25, 26, or 27.

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

The 12-bit ADC of the ESP32 maps physical potentiometer voltages (0.0 to 3.3V) into raw integer values (0 to 4095). These integers are mapped to joint angles in radians inside `src/hal/hal_adc.cpp` using the following boundaries:

- **Joint 1 (DC Motor)**:
  - $0^\circ$ (0.0 rad) = `851` counts
  - $90^\circ$ ($\pi/2$ rad) = `2301` counts
  - $180^\circ$ ($\pi$ rad) = `4095` counts
- **Joint 2 (Stepper)**:
  - $-90^\circ$ ($-\pi/2$ rad) = `198` counts
  - $0^\circ$ (0.0 rad) = `1522` counts
  - $90^\circ$ ($\pi/2$ rad) = `2852` counts

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
INFO: Boot state = MODE_IDLE.
INFO: Kirim 'mode,scara', 'mode,zn', atau 'mode,test'.
P,0.000,120.000,0.000,0.000
X,IDLE
```

Ensure:
- [ ] Potentiometers read actual values. Gently rotate joints manually and verify the telemetry angles change.
- [ ] Keep the serial watchdog from resetting by sending a command or `ping`.

---

## 11. Operating State Machine & Transition Rules

The firmware transitions between 4 software modes:

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

- **MODE_IDLE**: Safe default mode. Actuator outputs are disabled.
- **MODE_SCARA**: Standard operational mode. Trajectory planning is executed in Cartesian coordinate inputs.
- **MODE_ZN**: Ziegler-Nichols tuning mode. Bypasses Cartesian paths, enabling raw step commands to be sent directly to individual joints (`t1,angle` or `t2,angle`).
- **MODE_TEST**: Engineering mode. Same as SCARA, but unlocks live adjustments of 26 control constants (e.g. speed, bandwidths, deadbands).

---

## 12. Cartesian & Joint Movement Logic

Moves are commanded in two ways depending on the mode:

1. **Cartesian Trajectory (`move,X,Y` in SCARA/TEST)**:
   - Uses Inverse Kinematics to calculate target joint angles.
   - Generates straight-line paths from coordinate $A$ to $B$ using a Trapezoidal Velocity Profile.
   - Constrained by Cartesian physical limits: Outer reach $R_{max} = 170\text{ mm}$, Inner Singularity $R_{min} = 70\text{ mm}$.
2. **Joint Step Command (`t1,deg` or `t2,deg` in ZN/TEST)**:
   - Drives joints directly to target angles, bypassing Cartesian path generation.

---

## 13. Ziegler-Nichols & Deadband Tuning Workflow

1. **Find DC Motor Deadband**: In `MODE_ZN`, type `dbtest`. Increment `db,N` (default: 70) until the motor moves smoothly without buzzing at rest.
2. **Establish Joint 1 Feedback**: Set proportional gain `kp1,0.2`. Execute steps using `t1,45`. Gradually raise `kp1` until constant oscillations appear. This defines Ultimate Gain ($K_u$).
3. **Analyze Period ($T_u$)**: Extract the oscillation period from HMI charts to calculate derivative (`kd1`) and integral (`ki1`) coefficients using Ziegler-Nichols tuning rules.

---

## 14. All Serial Commands Reference

| Command | Action | Valid Modes |
| :--- | :--- | :--- |
| `ping` | Resets watchdog timer. | All |
| `estop` | Cuts all motor power immediately. | All |
| `resume` | Clears E-STOP state. | All |
| `mode,scara` | Switch to SCARA mode. | All |
| `mode,zn` | Switch to ZN mode. | All |
| `mode,test` | Switch to TEST mode. | All |
| `mode,idle` | Switch to IDLE mode. | All |
| `move,X,Y` | Coordinates end-effector target move. | SCARA, TEST |
| `t1,deg` | Direct step drive Joint 1 (degrees). | ZN, TEST |
| `t2,deg` | Direct step drive Joint 2 (degrees). | ZN, TEST |
| `kp1,val` / `kd1,val` | Sets Joint 1 gains. | SCARA, ZN, TEST |
| `kp2,val` / `kd2,val` | Sets Joint 2 gains. | SCARA, ZN, TEST |
| `ffi,val` / `ffc,val` / `ffg,val` | Adjusts dynamic feedforward gains (0.0 to 1.0). | SCARA, TEST |
| `dbtest` | Emits a 400ms PWM pulse to test J1 wiring. | ZN |
| `getgains` | Requests current PID and feedforward states. | All |
| `getparams` | Requests parameter block parameters. | All |
| `clrgraph` | Commands HMI to erase chart plots. | All |

---

## 15. Upstream Telemetry Packet Formats

The firmware streams CSV telemetry packets at defined rates:

### A. Real-time Dynamics (`D`) — 500 Hz (Downsampled to 50 Hz on HMI)
`D,t,th1,th2,th1d,th2d,dth1,dth2,dth1d,dth2d,pwm1,th1raw,th2raw`
- `t`: Timestamp (ms).
- `th1` / `th2`: Potentiometer-measured joint angles (rad).
- `th1d` / `th2d`: Trajectory-desired target angles (rad).
- `dth1` / `dth2`: Measured joint velocities (rad/s).
- `dth1d` / `dth2d`: Desired velocities (rad/s).
- `pwm1`: Actuator output effort J1 (-255 to 255).
- `th1raw` / `th2raw`: Unfiltered raw ADC values mapped to radians.

### B. Feedforward Components (`F`) — 50 Hz
`F,t,inertia1,coriolis1,gravity1,inertia2,coriolis2,gravity2,ff1_contrib,u1_total,integral1,delta_omega_ff,omega2_raw,integral2`

### C. PID Tuning Diagnostics (`E`) — 50 Hz
`E,t,p1_out,i1_out,d1_out,loop_duration_us`
- `loop_duration_us`: Time taken to run the 500 Hz loop, typically $\sim80\ \mu\text{s}$.

### D. Cartesian Path tracking (`T`) — 50 Hz
`T,xi,yi,xa,ya`
- Coordinates in mm. `xi, yi` (desired target), `xa, ya` (actual position).

---

## 16. Troubleshooting & Diagnostics

- **Watcher Auto-Returns to IDLE**: The 8-second watchdog timer fired. Ensure the HMI is sending periodic `ping` commands (usually handled by the active serial tab heartbeat).
- **ADC Readings fluctuate wildly**: Potentiometer EMI noise. Confirm that the RC low-pass filter (20 kΩ + 1 µF) is wired close to the ESP32 input pin.
- **Grinding/Grating Noises on Joint 2**: Stepper motor is skipping steps. Lower the maximum velocity (`vmax`) or acceleration (`amax`) settings via the Test parameter tuner, or increase the stepper driver current limits.
- **Inverse Kinematics Failures**: Target coordinate falls outside the physical boundary or inside the singular zone. Make Cartesian movements within valid workspace boundaries.
 folder from Windows Defender real-time scanning.

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
