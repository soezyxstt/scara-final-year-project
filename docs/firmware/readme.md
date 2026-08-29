# SCARA Robot Firmware Manual

**2-DOF planar SCARA | ESP32 DevKit V1 | PID + computed torque control**

Firmware for a two-joint planar SCARA robot with Cartesian trajectory generation, joint control, sensor filtering, serial telemetry, and runtime tuning.

## System

- Joint 1: GM25-370 DC motor with L298N driver
- Joint 2: NEMA 8 stepper with A4988 driver
- Controller: ESP32 DevKit V1
- Position feedback: two B10K potentiometers
- Control loop: 500 Hz
- Serial link: 921600 baud

## Control pipeline

```text
Cartesian target
      │
      ▼
Trajectory generator
      │
      ▼
Inverse kinematics
      │
      ▼
Joint targets
      │
      ├─ PID feedback
      ├─ inertia compensation
      ├─ Coriolis compensation
      └─ gravity compensation
              │
              ▼
        motor commands
```

A tracking differentiator provides filtered position and velocity estimates.

## Main hardware

| Component | Role |
|---|---|
| ESP32 DevKit V1 | controller |
| GM25-370 DC motor | Joint 1 actuator |
| L298N | DC motor driver |
| NEMA 8 | Joint 2 actuator |
| A4988 | stepper driver |
| B10K potentiometers | joint position feedback |
| 12 V supply | actuator power |

## ESP32 pins

| Pin | Function |
|---|---|
| GPIO 36 | Joint 2 potentiometer |
| GPIO 39 | Joint 1 potentiometer |
| GPIO 14 | A4988 STEP |
| GPIO 12 | A4988 DIR |
| GPIO 16 | L298N IN3 |
| GPIO 17 | L298N IN4 |
| GPIO 18 | L298N PWM enable |
| GPIO 25 | encoder A |
| GPIO 26 | encoder B |

Joint 1 uses an RC low-pass filter on the analog feedback line to reduce motor-noise interference.

## Firmware structure

```text
firmware/
├── include/        configuration
├── src/
│   ├── comms/      commands and telemetry
│   ├── control/    PID, CTC, joints, trajectories
│   ├── hal/        ADC, motor, and stepper access
│   ├── sensors/    feedback processing
│   └── state/      operating state
└── platformio.ini
```

## Build and upload

```powershell
scara.bat compile
scara.bat upload
scara.bat all
```

`scara.bat all` builds, uploads, and opens the serial monitor.

## Operating and tuning

The firmware supports normal SCARA operation, tuning, and engineering test modes. Runtime settings include PID gains, feedforward blend factors, tracking differentiator settings, trajectory limits, stepper settings, and diagnostics.

The browser HMI is the main interface for tuning and commands.

## Telemetry

The ESP32 streams joint state, trajectory state, errors, control terms, and timing data to the HMI. Shared telemetry definitions live in `shared/telemetry/`.

Related HMI docs:

- `../hmi/stack-and-architecture.md`
- `../hmi/features-and-data-flow.md`
- `../hmi/scara-hmi-context.md`

## Safety

- Verify workspace and elbow configuration before motion.
- Use the emergency stop before touching the mechanism.
- Do not change wiring while actuator power is enabled.
- Never commit credentials or environment files used by supporting services.
