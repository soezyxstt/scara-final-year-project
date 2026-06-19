# SCARA Robot Firmware

**2-DOF Planar SCARA | CTC + PID | ESP32 DevKit V1**

This is the embedded firmware for a 2-joint planar SCARA robot arm, built with PlatformIO for the ESP32.

## Detailed Documentation
The full, detailed documentation has been moved to the central documentation folder. Please refer to:
* **[Detailed Firmware README](../docs/firmware/readme.md)**

## Quick Start
1. Ensure you have VS Code and the **PlatformIO IDE** extension installed.
2. Open the `firmware/` folder in VS Code.
3. Build and upload utilizing PlatformIO:
   - **Compile**: Run PlatformIO Build
   - **Upload**: Run PlatformIO Upload (robot must be connected via USB)
   - **Serial Monitor**: Connect at **921600** baud rate.

For wiring guides, pin assignments, operating modes, tuning procedures, and command references, see the [Full Firmware README](../docs/firmware/readme.md).

## HMI Integration

The web dashboard (`/hmi`) connects at **921600** baud and auto-switches firmware modes per page:

| HMI route | Sends | Purpose |
| :--- | :--- | :--- |
| `/` | `mode,scara` | Cartesian moves and trajectory monitoring |
| `/zn` | `mode,zn` | Joint-level Ziegler-Nichols tuning |
| `/test` | `mode,test` | Live parameter tuning (33 runtime constants) and raw signal diagnostics |
| `/eksperimen` | `mode,test` | Automated experiment sequences (EXP-1 through EXP-6) |

## Commands & Telemetry

For the full command reference (~40 commands), see the [Full Firmware README](../docs/firmware/readme.md). Key categories:
- **Global**: `ping`, `estop`, `resume`, `mode,<name>`, `getgains`, `getparams`, `clrgraph`, `plot,0/1`
- **SCARA/TEST**: `move,X,Y`, PID gains (`kp1,ki1,kd1,kp2,ki2,kd2`), feedforward (`ffi,ffc,ffg`)
- **ZN**: `t1,deg`, `t2,deg`, `dbtest`
- **TEST only**: ~33 runtime parameter commands (`vmax`, `amax`, `td1r`, `td2r`, `tden`, `trapen`, `dben`, `dbrel`, `db2en`, `db2rel`, `kv1`, `vffmax`, `vffdv`, etc.)

See the [HMI README](../hmi/README.md) or the in-app **README** tab for the full user guide.
