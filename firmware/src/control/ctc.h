
#pragma once

// ============================================================
//  control/ctc.h — Computed Torque Control (CTC) feedforward
//  Evaluates at desired state. Writes to CtcState namespace.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Compute all CTC components from current desired state.
// Results stored in CtcState::{ctc_inertia1/2, ctc_coriolis1/2, ctc_gravity1/2}
// Gravity uses alpha_tilt from Params namespace.
void computeCTC();
