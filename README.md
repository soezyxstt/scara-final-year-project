# SCARA Robot Project Monorepo

Welcome to the 2-DOF Planar SCARA Robot Project. This repository is organized as a monorepo containing both the hardware control firmware and the web-based Human-Machine Interface (HMI).

## Project Structure

* **`/hmi`**: Next.js Human-Machine Interface for real-time monitoring, Ziegler-Nichols tuning, and telemetry visualizations.
* **`/firmware`**: PlatformIO ESP32 firmware utilizing Computed Torque Control (CTC) + PID loop controls.
* **`/docs`**: Centralized documentation folder.

## Documentation Index

Detailed documentation is organized under the **[`/docs`](./docs)** directory:

### 🖥️ Human-Machine Interface (HMI)
* **[HMI Context Guide](./docs/hmi/scara-hmi-context.md)**: File layout, state management details, and component map.
* **[Features and Data Flow](./docs/hmi/features-and-data-flow.md)**: Web Serial integration, plotting, and layout flows.
* **[Stack and Architecture](./docs/hmi/stack-and-architecture.md)**: Tech stack details and rendering optimization strategies.

### ⚙️ ESP32 Control Firmware
* **[Firmware Manual](./docs/firmware/readme.md)**: Wiring guides, pinout maps, operating modes, tuning, and full serial command references.

---
*Adi Haditya Nursyam — Tugas Sarjana, ITB 2026*
