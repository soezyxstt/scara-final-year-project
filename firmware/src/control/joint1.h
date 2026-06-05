
#pragma once

// ============================================================
//  control/joint1.h — DC motor joint 1 controller
//  Deadband hold, dual-gain PID, decomposed CTC FF, anti-windup.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Full DC motor control for joint 1.
// Reads from RobotState, CtcState, Params.
// Writes PWM via hal_dc.
void controlJoint1();
