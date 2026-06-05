
// ============================================================
//  control/joint2.cpp — Stepper motor joint 2 controller
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "joint2.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../hal/hal_stepper.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

void controlJoint2() {
  float e2 = theta2_d - theta2;

  // ---- Deadband hold logic ----
  if (is_moving) {
    stepper2_active = true;
  } else {
    if (!stepper2_active && fabsf(e2) > DB2_ENGAGE) {
      stepper2_active = true;
    } else if (stepper2_active && fabsf(e2) < DB2_RELEASE) {
      stepper2_active = false;
    }
  }

  if (!stepper2_active) {
    step_period_us = 0;
    omega2_prev = 0.0f;
    // Decay integrator to avoid windup while holding inside deadband
    integral2 *= (1.0f - INTEGRAL_DECAY);
    return;
  }

  float u2_pd = Kp2 * e2 - Kd2 * dTheta2_f;

  // ---- Ki2 gated integrator ----
  // Active only during hold (!is_moving) and within gate radius.
  // During motion: freeze (do not accumulate, do not reset).
  if (!is_moving && fabsf(e2) < KI2_GATE_RAD) {
    integral2 += Ki2 * e2 * DT;
    integral2  = constrain(integral2, -0.3f, 0.3f);

    // Anti-windup J2
    float u2_test = u2_pd + integral2;
    if (fabsf(u2_test) > 10.0f && (e2 * integral2) > 0.0f) {
      integral2 -= Ki2 * e2 * DT;
    }
  }

  // ---- FF from decomposed CTC components, normalised to M22_REF ----
  // Output is a velocity increment [rad/s * DT] added to PD output.
  float ff_raw2      = FF_INERTIA  * ctc_inertia2
                     + FF_CORIOLIS * ctc_coriolis2
                     + FF_GRAVITY  * ctc_gravity2;
  float delta_omega_ff = (ff_raw2 / M22_REF) * DT;

  float omega2_raw   = u2_pd + integral2 + delta_omega_ff;
  delta_omega_ff_out = delta_omega_ff;
  omega2_raw_out     = omega2_raw;

  // ---- Rate limiter on omega2 ----
  float max_delta = OMEGA2_RATE_LIMIT * DT;
  float omega2    = omega2_prev
                  + constrain(omega2_raw - omega2_prev, -max_delta, max_delta);
  omega2_prev = omega2;

  // ---- Convert angular velocity → step frequency ----
  float freq = constrain(fabsf(omega2) * STEPS_PER_RAD, 0.0f, STEPPER_MAX_HZ);
  if (freq < STEPPER_MIN_HZ) {
    step_period_us = 0;
    return;
  }

  step_period_us = (unsigned long)(1000000.0f / freq);
  setStepDir(omega2 > 0.0f);
}
