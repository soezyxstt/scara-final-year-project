# SCARA Robot Project Monorepo

Welcome to the 2-DOF Planar SCARA Robot Project. This repository is organized as a monorepo containing both the hardware control firmware and the web-based Human-Machine Interface (HMI).

## Project Structure

* **`/hmi`**: Next.js Human-Machine Interface for real-time monitoring, trajectory analysis, Ziegler-Nichols tuning, and telemetry visualizations.
* **`/firmware`**: PlatformIO ESP32 firmware utilizing Computed Torque Control (CTC) + PID loop controls.
* **`/docs`**: Centralized documentation folder.

## HMI Pages

The web dashboard is split into three routes that share one serial connection:

| Route | Firmware mode | Purpose |
| :--- | :--- | :--- |
| **`/`** (Home) | `SCARA` | Live monitoring, post-run analysis, rest/step analysis, and in-app user guide |
| **`/zn`** | `ZN` | Dedicated Ziegler-Nichols joint tuning workspace |
| **`/test`** | `TEST` | Full parameter tuning, raw signal inspection, and advanced diagnostics |

Open the settings menu (☰) from any page to switch between routes. The HMI automatically sends the correct `mode,<name>` command when you navigate.

## Quick Start (HMI)

```bash
cd hmi
npm install
npm run dev
```

1. Open [http://localhost:3000](http://localhost:3000) in **Chrome** or **Edge**.
2. Connect the ESP32 via USB and click **Connect** in the header.
3. Select the COM port (baud rate **921600**).
4. Use the **README** tab on the home page for a full walkthrough.

## Documentation Index

Detailed documentation is organized under the **[`/docs`](./docs)** directory:

### Human-Machine Interface (HMI)
* **[HMI Context Guide](./docs/hmi/scara-hmi-context.md)**: File layout, state management, component map, and developer conventions.
* **[Features and Data Flow](./docs/hmi/features-and-data-flow.md)**: Web Serial integration, tabs, plotting, and serial protocol.
* **[Stack and Architecture](./docs/hmi/stack-and-architecture.md)**: Tech stack, directory layout, and connection lifecycle.

### ESP32 Control Firmware
* **[Firmware Manual](./docs/firmware/readme.md)**: Wiring guides, pinout maps, operating modes, tuning, and full serial command references.

---
*Adi Haditya Nursyam — Tugas Sarjana, ITB 2026*
