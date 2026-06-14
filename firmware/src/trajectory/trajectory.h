
#pragma once

// ============================================================
//  trajectory/trajectory.h — Trapezoidal / constant-velocity
//  Cartesian trajectory planning and evaluation.
//  All state lives in TrajState namespace.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Compute trajectory parameters and arm the trajectory.
// new_x, new_y in meters.
// Seeds dTheta_d_prev_acc for spike-free ddθ on tick 0.
// is_continuation: true for the second leg of an L-shape move (emits MC instead of M).
void startTrajectory(float new_x, float new_y, bool allow_split = true, bool is_continuation = false);

// Evaluate Cartesian position along trajectory at time t [s].
// Formula degenerates correctly when TRAP_ENABLED=false
// (ta=tc=0 → cruise from t=0).
void getTrajPoint(float t, float &x, float &y);

// Evaluate Cartesian speed profile at time t [s].
float getTrajVelocity(float t);

// Evaluate Cartesian acceleration profile at time t [s].
float getTrajAccel(float t);

// Check settle / timeout conditions; auto-advance pending move.
void checkTrajectoryDone();

// Emit S-packet (trajectory stop notification).
void emitStopPacket();

// Helper to check if straight path crosses inner radius.
bool checkPathCrossesInnerRadius(float x0, float y0, float xf, float yf, float rMin);

// Helper to check if angle is valid (not in forbidden sector).
bool isAngleValid(float x, float y);

// Helper to check if a path crosses the forbidden angle.
bool pathCrossesForbiddenAngle(float x0, float y0, float xf, float yf);

// Helper to compute intermediate point to bypass the inner radius.
void calculateIntermediatePoint(float x0, float y0, float xf, float yf, float rMin, float rMax, float &x_int, float &y_int);

