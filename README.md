# SCARA Robot Project Monorepo

Welcome to the 2-DOF Planar SCARA Robot Project. This repository is organized as a monorepo containing both the hardware control firmware and the web-based Human-Machine Interface (HMI).

## Project Structure

* **`/hmi`**: Next.js Human-Machine Interface for real-time monitoring, trajectory analysis, Ziegler-Nichols tuning, and telemetry visualizations.
* **`/firmware`**: PlatformIO ESP32 firmware utilizing Computed Torque Control (CTC) + PID loop controls.
* **`/docs`**: Centralized documentation folder.

## HMI Pages

The web dashboard is split into multiple routes sharing a single Web Serial connection and state context:

| Route | Firmware mode | Purpose / Access |
| :--- | :--- | :--- |
| **`/`** (Home) | `SCARA` | Live monitoring, post-run analysis, rest/step analysis, and in-app user guide |
| **`/zn`** | `ZN` | Dedicated Ziegler-Nichols joint tuning workspace |
| **`/test`** | `TEST` | Full parameter tuning, raw signal inspection, and advanced diagnostics |
| **`/login`** | — | Authentication portal using NextAuth (Google account login) |
| **`/dashboard`** | — | Historical run workspace: search, select, compare, and analyze saved runs (auth required) |
| **`/eksperimen`** | `TEST` | Automation suite: execute automated sequences with offline queue fallback (auth required) |
| **`/hasil-eksperimen`** | — | Automated experiment visualization, filtering, and comparative results viewer |

Open the settings menu (☰) or search the Command Palette (`Ctrl + K` or `Cmd + K`) from any page to switch between routes. The HMI automatically sends the correct `mode,<name>` command when you navigate.

## Quick Start (HMI)

1. Create a `.env` file in the root directory (copying from `.env.example` if available) with the following environment variables:
   ```env
   # Database Configuration (Turso/LibSQL)
   TURSO_DATABASE_URL="your-turso-database-url"
   TURSO_AUTH_TOKEN="your-turso-auth-token"

   # Authentication Configuration (NextAuth with Google Provider)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   AUTH_SECRET="your-random-nextauth-secret" # Run openssl rand -base64 33
   AUTH_URL="http://localhost:3000"
   ```

2. Install dependencies and run Drizzle push to synchronize the database schema:
   ```bash
   cd hmi
   npm install
   npm run db:push
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in **Chrome** or **Edge**.
5. Connect the ESP32 via USB and click **Connect** in the header.
6. Select the COM port (baud rate **921600**).
7. Sign in using the user icon/login page to save runs and view the research dashboard.
8. Use the **README** tab on the home page for a full walkthrough.

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
