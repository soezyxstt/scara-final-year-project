# 2-DOF SCARA Robot — Final Year Project

A complete embedded-control and web-software stack for a planar **2-DOF SCARA robot** used as an educational control-system demonstrator.

The repository contains ESP32 firmware, a browser-based HMI, shared telemetry definitions, experiment tooling, technical documentation, and selected datasets used to reproduce the project analysis.

## System overview

- **Joint 1:** DC motor with closed-loop control
- **Joint 2:** stepper motor
- **Controller:** ESP32 DevKit V1
- **HMI:** Next.js application running in the browser
- **Communication:** Web Serial at 921600 baud

The firmware implements PID control, a tracking differentiator, trapezoidal trajectory generation, and independently switchable inertia, Coriolis, and gravity compensation.

## Engineering highlights

- Closed-loop joint control on embedded hardware
- Cartesian trajectory generation for planar SCARA motion
- Inverse-kinematics-driven motion workflow
- Trapezoidal motion profiles
- Tracking differentiator for signal processing
- Dynamic-model compensation terms
- Shared telemetry contract between firmware and web HMI
- Browser-based control, tuning, monitoring, and experiment analysis
- Reproducible experiment export pipeline

## Architecture

```text
SCARA hardware
 ├─ DC motor / Joint 1
 ├─ Stepper / Joint 2
 └─ Sensors
       │
       ▼
     ESP32
 ├─ PID control
 ├─ trajectory generation
 ├─ filtering / TD
 └─ dynamic compensation
       │
       │ Web Serial
       ▼
   Browser HMI
 ├─ operation
 ├─ parameter tuning
 ├─ live telemetry
 ├─ experiment storage
 └─ analysis / comparison
```

## Repository structure

```text
code/
├── analysis/                 # Experiment export utilities
├── data/experiments/         # Selected CSV datasets for EXP-1 ... EXP-5
├── docs/                     # Firmware and HMI documentation
├── firmware/                 # PlatformIO firmware for ESP32 DevKit V1
├── hmi/                      # Next.js operation and analysis interface
├── shared/telemetry/         # Shared serial-packet schema and type generation
├── .env.example              # Non-secret environment template
├── package-lock.json
└── package.json
```

PCB design files are intentionally kept outside the public software repository.

## Requirements

- Node.js 20+
- npm
- Google Chrome or Microsoft Edge with Web Serial support
- Python 3.10+ for experiment export tooling
- PlatformIO for ESP32 firmware build/upload
- ESP32 DevKit V1 and the SCARA hardware for physical operation

## Run the HMI

From the project directory:

```bash
npm install
npm run gen
npm run dev
```

Copy `.env.example` to the HMI environment file when optional online services are needed. Core serial connectivity and the main HMI can still be inspected without enabling every external service.

Open the local application in Chrome or Edge, select **Connect**, and choose the ESP32 serial port.

### Main HMI routes

| Route | Purpose |
|---|---|
| `/` | SCARA operation, trajectory monitoring, and motion analysis |
| `/test` | Parameter changes, raw-signal inspection, and diagnostics |
| `/zn` | Step-response testing and PID-tuning support |
| `/dashboard` | Comparison of stored experiment runs |

## Build and upload firmware

The firmware lives in `firmware/` and can be built or uploaded with PlatformIO.

Windows helper commands:

```powershell
scara.bat compile
scara.bat upload
scara.bat all
```

`scara.bat all` builds the firmware, uploads it, and opens a serial monitor at 921600 baud.

## Experiment design

The selected datasets reproduce five controlled comparisons:

| Experiment | Baseline | Test condition |
|---|---|---|
| EXP-1 | Tracking differentiator off | Tracking differentiator on |
| EXP-2 | Dynamic compensation off | Inertia compensation on |
| EXP-3 | Inertia on, Coriolis off | Inertia + Coriolis on |
| EXP-4 | Gravity compensation off | Gravity compensation on |
| EXP-5 | Trapezoidal profile off | Trapezoidal profile on |

A shared baseline is reused where appropriate so only the intended factor changes between experiment conditions.

## Reproduce experiment exports

Selected CSV files live in `data/experiments`. The original application database is excluded because it contains internal HMI data beyond the public experiment subset.

To recreate the export:

```powershell
python analysis/export_experiment_csv.py ..\results\tugasakhir.db
```

See `data/README.md` for dataset fields and experiment mapping.

## Technical documentation

- `docs/firmware/readme.md` — pins, parameters, modes, commands, and telemetry
- `docs/hmi/stack-and-architecture.md` — application architecture and serial flow
- `docs/hmi/features-and-data-flow.md` — HMI features, data flow, and protocol
- `docs/hmi/scara-hmi-context.md` — HMI component and internal-state context

## Safety

- Never commit `.env`, `.env.local`, tokens, database credentials, or API keys.
- Engage the hardware emergency stop before touching the mechanism or changing electrical connections.
- Verify elbow direction and workspace limits before commanding motion.
- Keep raw application databases outside the public repository.

## Context

This project was developed as a final-year engineering project combining control systems, embedded software, robotics, data acquisition, and full-stack web development.
