
#pragma once

// ============================================================
//  scheduler/scheduler.h — Control loop orchestrator
//  Function pointer dispatch, mode transitions, allOutputsOff.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>
#include "../state/robot_state.h"

// ============================================================
//  Function pointer types
// ============================================================

typedef void (*SensorFn)();
typedef void (*DesiredFn)(float t);
typedef void (*OutputFn)();

// Active function pointers — swapped atomically in transitionToMode()
extern SensorFn  active_sensor_fn;
extern DesiredFn active_desired_fn;
extern OutputFn  active_output_fn;

// ============================================================
//  Scheduler functions
// ============================================================

// Flat control tick — called at CONTROL_FREQ from loop().
// Order: sensor → IK+t_traj advance (if moving) → desired →
//        CTC → output → checkTrajectoryDone → D-line buffer
// Zero if (op_mode == ...) checks inside this function.
void runControlLoop();

// Stream a completed FFT capture without blocking the control loop. Call on
// every loop() iteration; it writes at most one complete packet when the UART
// has enough room.
void serviceFFTDump();

// FFT capture lifecycle used by the command parser.
void startFFTRecord();
void cancelFFTRecord();
bool isFFTDumpActive();

// Transition to a new operating mode.
// Calls allOutputsOff(), seeds theta_d, assigns function pointers,
// emits X-packet and full state.
void transitionToMode(OperatingMode new_mode);

// Zero all actuator outputs, reset integrators and flags.
// Does NOT transition the mode.
void allOutputsOff();

// Trigger emergency stop: stop trajectory, zero outputs, set estop flag.
void doEstop();

// ============================================================
//  Desired-state functions (assigned via function pointer)
// ============================================================

// Jacobian-based desired velocity/acceleration for SCARA & TEST modes.
void desiredSCARA(float t);

// ZN mode: no trajectory — theta_d set by command only.
void desiredZN(float t);

// IDLE mode: no-op.
void desiredIdle(float t);

// ============================================================
//  Output functions (assigned via function pointer)
// ============================================================

// Full actuator output: joint1 + joint2 control (SCARA & TEST).
void outputFull();

// ZN output: explicitly zero CTC, then joint1 + joint2.
void outputZN();

// IDLE output: no-op.
void outputIdle();
