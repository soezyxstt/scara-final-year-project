# Planar 2-DOF SCARA Robot HMI

Browser HMI for real-time telemetry, trajectory monitoring, controller tuning, and diagnostics of a 2-DOF planar SCARA robot.

The app communicates directly with an ESP32 over Web Serial at 921600 baud.

## Documentation

- [HMI context](../docs/hmi/scara-hmi-context.md)
- [Stack and architecture](../docs/hmi/stack-and-architecture.md)
- [Features and serial protocol](../docs/hmi/features-and-data-flow.md)

## Routes

| Route | Purpose |
|---|---|
| `/` | Main monitor, analysis, rest analysis, and guide |
| `/zn` | Ziegler-Nichols tuning and step-response analysis |
| `/test` | Engineering test bench and runtime parameter tuning |
| `/pcb` | PCB, schematic, and CAD viewer |
| `/login` | Google OAuth sign-in |
| `/dashboard` | Saved-run history and comparisons |

All main pages share one `HMIProvider` serial session.

## Main capabilities

- 3D SCARA workspace and trajectory view
- Live telemetry charts
- CTE, ATE, joint, PID, velocity, and control metrics
- PID and feedforward tuning
- Step-response and rest-state analysis
- FFT and vibration-style signal inspection
- Runtime parameter tuning
- Serial monitor
- Emergency stop and resume controls
- CSV, image, and ZIP export
- Saved-run comparisons

## Stack

`Next.js 16` `React 19` `TypeScript` `Turso` `Drizzle ORM` `NextAuth.js` `Gemini` `Cloudflare KV` `Tailwind CSS` `Web Serial` `React Three Fiber` `Three.js` `Recharts` `Radix UI`

## Development

```bash
bun install
bun dev
```

or:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge.

## Connect to the ESP32

1. Connect the ESP32 by USB.
2. Select **Connect** in the HMI.
3. Choose the correct serial port.
4. Confirm the firmware uses 921600 baud.

The HMI requests controller parameters on connect and maintains the serial session with periodic commands.

**Hosted HMI:** [tugasakhir.adihnursyam.com](https://tugasakhir.adihnursyam.com)
