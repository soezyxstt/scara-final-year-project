
#pragma once

// ============================================================
//  control/joint2.h — Stepper motor joint 2 controller
//  PD + gated Ki2 integrator + CTC FF → step frequency output.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Full stepper control for joint 2.
// Reads from RobotState, CtcState, Params.
// Sets step_period_us and DIR_PIN via hal_stepper.
void controlJoint2();
