# SCARA Robot Project Monorepo

Welcome to the 2-DOF Planar SCARA Robot Project. This repository is organized as a monorepo containing both the hardware control firmware and the web-based Human-Machine Interface (HMI). 

This documentation serves as a complete, self-contained overview of the codebase. By reading this and the associated documentation in `/docs`, both developers and AI assistants can fully understand and operate the system without scanning the entire source code.

---

## 1. Monorepo Overview

This monorepo integrates embedded control systems with a modern web dashboard:

```
                  ┌─────────────────────────────────────┐
                  │      HMI Web Client (Next.js)       │
                  │   Real-time plotting, ZN tuner,     │
                  │   analytics, and DB experiment runs │
                  └──────────────────┬──────────────────┘
                                     │ USB Serial Connection
                                     │ (Baud Rate: 921600)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │     ESP32 Control Firmware (C++)    │
                  │  500 Hz control loop, Computed      │
                  │  Torque Control, PID feedback       │
                  └───────┬─────────────────────┬───────┘
                          │                     │
                          ▼                     ▼
                  ┌───────────────┐     ┌───────────────┐
                  │ Joint 1 (DC)  │     │ Joint 2 (Step)│
                  │ GM25-370 motor│     │ NEMA 8 motor  │
                  └───────────────┘     └───────────────┘
```

* **`/hmi`**: Next.js v16.2.6 (App Router) & React v19.2.4 application. Manages Web Serial ingestion, telemetry state, databases, auth, and automated experiments.
* **`/firmware`**: PlatformIO C++ firmware targetting the ESP32 DevKit V1. Implements computed torque feedforward control (CTC) plus PID feedback controls.
* **`/docs`**: Centralized, highly-specific sub-system documentation.

---

## 2. Directory Layout & Key File Map

```text
/
├── README.md                 # Root directory documentation index (This file)
├── AGENTS.md                 # System instructions for AI coding agents
│
├── docs/                     # Sub-system documentation folder
│   ├── firmware/
│   │   └── readme.md         # ESP32 pinouts, modes, commands, telemetry, and parameter details
│   └── hmi/
│       ├── stack-and-architecture.md  # Tech stack, routes, nextauth boundary, serial loop
│       ├── features-and-data-flow.md  # UI specifications, experiments EXP-1..6, API endpoints, serial protocol
│       └── scara-hmi-context.md       # Deep technical details for reducer actions, components, DB schemas
│
├── firmware/                 # PlatformIO ESP32 Project
│   ├── include/config.h      # COMPILE-TIME physical constants, geometry, and pin numbers
│   ├── src/
│   │   ├── main.cpp          # Setup and loop entry points
│   │   ├── scheduler/        # 500 Hz loop scheduling & watchdog logic
│   │   ├── control/          # CTC + Joint 1/2 controller calculations
│   │   ├── sensors/          # ADC reading & Tracking Differentiator (TD) noise filter
│   │   ├── kinematics/       # Forward & Inverse Kinematics, Jacobian calculations
│   │   ├── trajectory/       # Trapezoidal/constant-velocity trajectory, L-shape path splitting, settle detection
│   │   ├── comms/            # Command parser (~40 commands), serial packet formatting, ring buffer
│   │   ├── hal/              # HAL layer: ADC mapping, DC PWM, stepper pulse generation
│   │   └── state/            # Robot state machine, param defaults, trajectory state, CTC state
│   ├── platformio.ini        # PlatformIO configuration
│   └── scara.bat             # Compile and upload scripts
│
├── hmi/                      # Next.js Web Application
│   ├── app/                  # App Router entry pages and API endpoints
│   ├── components/
│   │   ├── dashboard/        # 10 historical analytics components (Trajectory, Velocity, PID, Feedforward, Metrics, Advanced, AI Copilot tabs)
│   │   ├── hmi/              # 29 live monitoring components (Monitor, Analysis, ZN, Rest, Serial, etc.)
│   │   └── ui/               # Radix + Tailwind primitive wrappers
│   ├── lib/
│   │   ├── hmi-context.tsx   # Serial read loop, parser, global reducer state
│   │   ├── hmi-types.ts      # Telemetry interfaces
│   │   ├── db/               # Turso connection, Drizzle schemas, database queries, backup
│   │   ├── ai-client.ts      # Google Gen AI client with model fallback chain
│   │   └── ...               # capture-utils, cte-utils, trajectory-safety, tuning-advisor, etc.
│   ├── package.json          # Node dependencies list
│   └── drizzle.config.ts     # Drizzle ORM config
│
└── shared/                   # Cross-project shared artifacts
    └── telemetry/
        ├── schema.json       # Telemetry schema definition
        └── generate.mjs      # Auto-generates telemetry code from schema
```

---

## 3. Web HMI Features & Routes

The web interface is split into public and protected (Google OAuth required) routes. They share a single Web Serial connection held in the global client context:

| Path | Firmware Mode | Purpose / Access Control |
| :--- | :--- | :--- |
| **`/`** (Home) | `SCARA` | Live trajectory tracking (3D visualizer), post-run diagnostics, rest analysis, and user guide. (Public) |
| **`/zn`** | `ZN` | Joint-level Ziegler-Nichols auto-recommendation tuning workspace. (Public) |
| **`/test`** | `TEST` | 33 runtime parameter editor, raw unfiltered sensor ADC visualizer, and params tuner. (Public) |
| **`/pcb`** | — | Interactive ESP32 Controller PCB layout, schematic, and CAD viewer. (Public) |
| **`/login`** | — | NextAuth Google sign-in portal. (Public) |
| **`/hasil-eksperimen`**| — | Comparative data analytics table for completed sequences. (Public) |
| **`/dashboard`** | — | Saved Runs History: overlay multiple trajectories, compare metrics, velocity, PID, feedforward, and AI Copilot analysis. (Protected) |
| **`/eksperimen`** | `TEST` | Automation Suite: execute pre-coded EXP-1 to EXP-6 scripts. (Protected) |

---

## 4. Environment & Database Configuration

To unlock historical run visualization, authentication, and automated experiments, configure the database and auth client.

### Step 1: Set Up Environment Variables
Create a file named `.env` in the root workspace directory:

```env
# Database Configuration (Turso/LibSQL)
TURSO_DATABASE_URL="libsql://your-database-name.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"

# Authentication Configuration (Google OAuth + NextAuth)
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
AUTH_SECRET="your-32-character-random-secret" # Generate via: openssl rand -base64 33
AUTH_URL="http://localhost:3000"
```

### Step 2: Sync Schema using Drizzle
The DB tables are declared in `hmi/lib/db/schema.ts` and `experiment.ts`. Push the schemas to Turso:
```bash
cd hmi
npm install
npm run db:push
```

---

## 5. Quick Start Developer Guide

### HMI Launch
The HMI dashboard is hosted live at **[tugasakhir.adihnursyam.com](https://tugasakhir.adihnursyam.com)** for direct access by students. Alternatively, to run the HMI locally:
1. Ensure Node.js and npm are installed.
2. In the `hmi/` directory, start the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) or the hosted live link using **Google Chrome** or **Microsoft Edge**.
4. Connect the robot using the **Connect** button in the header (Baud: **921600**).
5. Open the user menu (user avatar) to authenticate and access `/dashboard` or `/eksperimen`.

### Firmware Compilation & Upload
1. Ensure VS Code and the **PlatformIO IDE** extension are installed.
2. Open the `/firmware` directory in VS Code.
3. Connect the ESP32 to the PC.
4. Execute building scripts via terminal:
   ```bat
   # Compile only
   scara.bat compile
   
   # Compile and upload to ESP32
   scara.bat upload
   
   # Upload and open serial monitor
   scara.bat all
   ```

---

## 6. Offline Support & Sync Lifecycles

If the network connection drops during telemetry recording or automated experiments:
1. **Local Backup**: The Next.js server caches data in `hmi/local-backup/` as `.jsonl` files (e.g. `runs.jsonl`, `samples-{id}.jsonl`).
2. **Client Offline Queue**: In-progress runs are cached in the browser's memory queue.
3. **Automatic Synchronization**: Once the window `online` event fires, the HMI automatically uploads cached items to Turso.

---

## 7. Documentation Index

To modify or study specific mechanisms, consult the sub-system guides under `/docs`:
- **[Firmware Manual](./docs/firmware/readme.md)**: Physical calculations, pinouts, wiring diagrams, commands, and telemetry layouts.
- **[HMI Context Guide](./docs/hmi/scara-hmi-context.md)**: Reducer state actions, file layouts, component map, and developer conventions.
- **[HMI Features and Data Flow](./docs/hmi/features-and-data-flow.md)**: Web Serial lifecycles, automated experiment procedures, database schema mapping, and serialization protocols.
- **[Stack and Architecture](./docs/hmi/stack-and-architecture.md)**: App routes, middleware boundaries, chart downsampling, and styling tokens.

---
*Adi Haditya Nursyam — Tugas Sarjana, ITB 2026*
