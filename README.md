# 2-DOF SCARA Robot | Final Year Project

Embedded control and web software for a planar 2-DOF SCARA robot used as an educational control-system demonstrator.

The repository includes ESP32 firmware, a browser HMI, shared telemetry definitions, experiment tools, documentation, and selected datasets.

## System

- Joint 1: DC motor with closed-loop control
- Joint 2: stepper motor
- Controller: ESP32 DevKit V1
- HMI: Next.js in the browser
- Communication: Web Serial at 921600 baud

The firmware implements PID control, a tracking differentiator, trapezoidal trajectories, and switchable inertia, Coriolis, and gravity compensation.

## Highlights

- Closed-loop embedded control
- Cartesian trajectory generation and inverse kinematics
- Shared telemetry contract between firmware and HMI
- Browser-based tuning, monitoring, and experiment analysis
- Reproducible experiment export pipeline

## Architecture

```text
SCARA hardware
      │
      ▼
    ESP32
  control + trajectory
      │
   Web Serial
      │
      ▼
 Browser HMI
 operation + telemetry + analysis
```

## Structure

```text
analysis/          experiment export tools
data/experiments/  selected datasets
firmware/          PlatformIO firmware
hmi/               Next.js HMI
shared/telemetry/  shared packet schema
docs/              technical documentation
```

## Run the HMI

```bash
npm install
npm run gen
npm run dev
```

Use Chrome or Edge for Web Serial.

## Firmware

```powershell
scara.bat compile
scara.bat upload
scara.bat all
```

## Experiments

| Experiment | Comparison |
|---|---|
| EXP-1 | tracking differentiator off vs on |
| EXP-2 | dynamic compensation off vs inertia on |
| EXP-3 | inertia only vs inertia + Coriolis |
| EXP-4 | gravity compensation off vs on |
| EXP-5 | trapezoidal profile off vs on |

Recreate selected exports with:

```powershell
python analysis/export_experiment_csv.py ..\results\tugasakhir.db
```

See `data/README.md` and `docs/` for technical details.

Never commit credentials, environment files, or raw application databases. Verify workspace limits and engage the emergency stop before working on the mechanism.
