# SCARA HMI: Features and Serial Protocol Reference

This document catalogs the operational features of the SCARA HMI dashboard and details the serial protocol used to communicate with the microcontroller.

---

## 1. Feature Specifications

The interface is divided into two primary views accessible from the header: the **Monitor Tab** (for live runs) and the **Analysis Tab** (for deep-dive diagnostics).

### A. Monitor Tab (Real-Time Run View)
1.  **XY Trace (`XYTrace` Component)**:
    *   **Workspace visualization**: Maps out the physical SCARA workspace.
    *   **Singularity zones**: Draws the outer limit boundary at $R = 170\text{ mm}$ and a warm red shaded inner singularity zone at $r = 30\text{ mm}$.
    *   **Trajectory overlays**: Plots the **Ideal Path** (dashed blue) vs **Actual Path** (solid red).
    *   **Ghost Mode**: Overlays the previous trajectory run (low opacity) to compare changes immediately after tuning.
    *   **Interactive Focus**: Clicking the card expands the canvas to full screen for fine inspection.
2.  **Phase Portrait (`PhasePortrait` Component)**:
    *   Plots Joint 1 & Joint 2 state space: angular position ($\theta$) on the X-axis vs angular velocity ($\dot{\theta}$) on the Y-axis.
    *   Helps detect limit cycles, mechanical backlash, slip, or friction characteristics.
3.  **Telemetry Chart Panel (`ChartPanel` Component)**:
    *   **EEF Error**: Real-time Euclidean distance error between ideal and actual coordinate points.
    *   **EEF Velocity**: Derives both ideal and actual speeds of the end-effector.
    *   **PWM**: Shows joint control output effort ($[-255, 255]$).
    *   **Position**: Overlay of actual angles ($\theta_1, \theta_2$) against desired profiles ($\theta_{1d}, \theta_{2d}$).
    *   **Velocity**: Overlay of joint speeds ($\dot{\theta}_1, \dot{\theta}_2$) against desired profiles ($\dot{\theta}_{1d}, \dot{\theta}_{2d}$).
4.  **Serial Log (`SerialLog` Component)**:
    *   Tail terminal logging messages with color-coded badges matching tags (`MOVE`, `DONE`, `GAINS`).
5.  **Tuning & Control Panel (`ControlPanel` Component)**:
    *   Enables targeted coordinate movement (`Xf`, `Yf`) with kinematic elbow configuration select (`Right` ($+1$) vs `Left` ($-1$)).
    *   Dual joint PID tuning fields (inputs feature custom validation and submit buttons).
    *   Microstep divisor adjustments for Joint 2 stepper motor (`Full`, `Half`, `Quarter`, `1/8`, `1/16`).

### B. Analysis Tab (Post-Run Evaluation)
1.  **Step Response Metrics (`StepMetrics` Component)**:
    *   Calculates standard transient metrics: **Rise Time** ($t_r$), **Peak Time** ($t_p$), **Overshoot %** ($\%OS$), **Settling Time** ($t_s$) inside a $2\%$ or $5\%$ band, and **Steady-State Error** ($e_{ss}$).
    *   Configurable per signal selection (EEF error, $\theta_1$, $\theta_2$).
2.  **FFT / Frequency Content (`FFTSection` Component)**:
    *   Calculates a Discrete Fourier Transform (DFT) capped at 512 points to identify resonant frequencies.
    *   Used to isolate low-frequency controller hunting from high-frequency sensor/potentiometer noise ($>10\text{ Hz}$).
3.  **Control Effort Proxy (`ControlEffortSection` Component)**:
    *   Accumulates absolute control effort over time ($\int |PWM|\,dt$). Useful for finding energy-efficient PID coefficients.
4.  **Ideal vs. Actual Comparison Table (`ComparisonTable` Component)**:
    *   Tabulates detailed sample-by-sample numbers.
    *   Includes a **CSV Exporter** that bundles all data columns for export into external analytical toolkits (like MATLAB or Excel).

---

## 2. Serial Protocol Specification

Data is exchanged as comma-separated values (CSV) ended by a newline (`\n`).

### A. Downstream Commands (HMI ➔ Microcontroller)

| Command String | Description | Example |
| :--- | :--- | :--- |
| `move,<x>,<y>` | Command the end-effector to linear coordinate target $(x, y)$ in mm | `move,120.5,45.0` |
| `elbow,<val>` | Set elbow configuration: `1` (Right-handed) or `-1` (Left-handed) | `elbow,1` |
| `kp1,<val>` | Apply Joint 1 Proportional Gain ($K_{p1}$) | `kp1,4.5` |
| `ki1,<val>` | Apply Joint 1 Integral Gain ($K_{i1}$) | `ki1,0.2` |
| `kd1,<val>` | Apply Joint 1 Derivative Gain ($K_{d1}$) | `kd1,1.1` |
| `kp2,<val>` | Apply Joint 2 Proportional Gain ($K_{p2}$) | `kp2,3.0` |
| `ki2,<val>` | Apply Joint 2 Integral Gain ($K_{i2}$) | `ki2,0.1` |
| `kd2,<val>` | Apply Joint 2 Derivative Gain ($K_{d2}$) | `kd2,0.5` |
| `mstep,<val>` | Configure microstepping divisor: `1`, `2`, `4`, `8`, or `16` | `mstep,8` |
| `getgains` | Query device parameters. Returns a gain report sequence `G,...` | `getgains` |
| `clrgraph` | Command the controller to reset its path arrays | `clrgraph` |
| `estop` | **Emergency Stop**: Instantly disable motor drivers and halt operations | `estop` |

### B. Upstream Telemetry (Microcontroller ➔ HMI)

Telemetry messages start with a prefix character indicating payload content:

#### 1. Move Start Marker (`M`)
Fired when a trajectory command is received and inverse kinematics starts tracking.
```text
M,x0,y0,xf,yf
```
*   `x0`, `y0`: Starting end-effector position coordinates (mm).
*   `xf`, `yf`: Target end-effector destination coordinates (mm).

#### 2. Move Completed Marker (`S`)
Fired when the trajectory run completes and the robot settles.
```text
S
```

#### 3. Trajectory Spatial Point (`T`)
Fired periodically during a run to feed the workspace XY trace canvas.
```text
T,xi,yi,xa,ya
```
*   `xi`, `yi`: Desired / Ideal position (mm).
*   `xa`, `ya`: Current / Actual position (mm).

#### 4. Detailed Joint Sample (`D`)
High-frequency joint-level sensor payload for the main charts, phase portraits, and metrics calculation.
```text
D,t,th1,th2,th1d,th2d,e1,e2,v1,v2,v1d,v2d,pwm1
```
*   `t`: Timestamp (ms).
*   `th1`, `th2`: Actual Joint 1 and Joint 2 angles (radians).
*   `th1d`, `th2d`: Target / Desired Joint 1 and Joint 2 angles (radians).
*   `e1`, `e2`: Joint error values (radians).
*   `v1`, `v2`: Actual joint angular velocities (rad/s).
*   `v1d`, `v2d`: Desired joint angular velocities (rad/s).
*   `pwm1`: Control output value for Joint 1 ($[-255, 255]$).

#### 5. Gains Report (`G`)
Fired as response to `getgains` or after online parameters change.
```text
G,kp1,ki1,kd1,kp2,ki2,kd2,mstep
```
*   `kp1`, `ki1`, `kd1`: PID values for Joint 1.
*   `kp2`, `ki2`, `kd2`: PID values for Joint 2.
*   `mstep`: Active stepper microstepping denominator (`1` to `16`).

#### 6. Text Log Lines
Any serial line that does not match one of the tags above is treated as a text log line. It is displayed in the green serial terminal console wrapper in the Monitor Tab.
