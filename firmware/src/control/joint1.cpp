
// ============================================================
//  control/joint1.cpp — DC motor joint 1 controller
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "joint1.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../hal/hal_dc.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

void controlJoint1() {
  float e1 = theta1_d - theta1;

  // ---- Error deadzone (hold mode only) ----
  // Only active when not tracking a trajectory. During is_moving the
  // trajectory error is a real signal and must not be zeroed out.
  if (!is_moving && fabsf(e1) < ERR_DZ) e1 = 0.0f;

  // ---- Deadband hold logic ----
  if (is_moving) {
    motor1_active   = true;
    motor1_on_ticks = 0;
  } else {
    if (!motor1_active && fabsf(e1) > DB_ENGAGE) {
      motor1_active   = true;
      motor1_on_ticks = 0;
    } else if (motor1_active) {
      motor1_on_ticks++;
      if (motor1_on_ticks >= MOTOR1_MIN_TICKS
          && fabsf(e1)       < DB_RELEASE
          && fabsf(dTheta1_f) < DB_VEL) {
        motor1_active = false;
      }
    }
  }

  // ---- Dual-gain: tracking vs hold ----
  float kp_eff = is_moving ? Kp1 : Kp1 * KP_HOLD_SCALE;
  float kd_eff = is_moving ? Kd1 : Kd1 * KD_HOLD_SCALE;

  if (!motor1_active) {
    // Motor off — always decay integrator, never pre-charge it.
    // Pre-charging while off causes the I-term to be wound up the moment
    // the motor re-activates, producing an immediate aggressive kick.
    integral1 *= (1.0f - INTEGRAL_DECAY);
    // Zero all hardware outputs
    digitalWrite(DC_IN3, LOW);
    digitalWrite(DC_IN4, LOW);
    pwmWrite(0);
    last_pwm1       = 0;
    u1_total_out    = 0.0f;
    ff1_contrib_out = 0.0f;
    p1_out = i1_out = d1_out = 0.0f;
    return;
  }

  // ---- Integrator with freeze near setpoint (hold mode only) ----
  // During tracking (is_moving) the integrator always accumulates so the
  // I-term can help sustain motion against friction.
  // During hold (!is_moving) and |e1| < INTEGRAL_FREEZE_THRESH, decay
  // instead of accumulating to stop I-term winding up through the deadband.
  if (!is_moving && fabsf(e1) < INTEGRAL_FREEZE_THRESH) {
    integral1 *= (1.0f - INTEGRAL_DECAY);
  } else {
    integral1 += e1 * DT;
    integral1  = constrain(integral1, -0.5f, 0.5f);
  }

  // ---- D-term ----
  float d_term = constrain(-kd_eff * dTheta1_f, -DTERM_MAX, DTERM_MAX);

  // ---- FF from decomposed CTC components, normalised to TAU_NOM_J1 ----
  float ff_raw          = FF_INERTIA  * ctc_inertia1
                        + FF_CORIOLIS * ctc_coriolis1
                        + FF_GRAVITY  * ctc_gravity1;
  float ff_frac         = constrain(ff_raw / TAU_NOM_J1, -1.0f, 1.0f);
  float ff_contribution = ff_frac * U1_MAX;

  p1_out = kp_eff * e1;
  d1_out = d_term;
  i1_out = Ki1 * integral1;

  float u1_total = p1_out + d1_out + i1_out + ff_contribution;

  // ---- Anti-windup ----
  if (fabsf(u1_total) >= U1_MAX && (e1 * integral1) > 0.0f) {
    integral1 -= e1 * DT;
    integral1  = constrain(integral1, -0.5f, 0.5f);
    u1_total   = kp_eff * e1 + d_term + Ki1 * integral1 + ff_contribution;
  }

  ff1_contrib_out = ff_contribution;
  u1_total_out    = u1_total;

  // ---- PWM mapping with deadband ----
  float total_frac = constrain(u1_total / U1_MAX, -1.0f, 1.0f);
  float frac_abs   = fabsf(total_frac);
  int   pwm_out    = 0;

  if (frac_abs >= FRAC_ZERO_THRESH) {
    float frac_eff = (frac_abs - FRAC_ZERO_THRESH) / (1.0f - FRAC_ZERO_THRESH);
    frac_eff = constrain(frac_eff, 0.0f, 1.0f);

    // Dynamic deadband: base + 18*sin²(θ1) to compensate gravity load variation
    float db_amp = 18.0f * ((float)PWM_DEADBAND / 70.0f);
    float s = sinf(theta1);
    int dynamic_db = PWM_DEADBAND + (int)roundf(db_amp * s * s);
    dynamic_db = constrain(dynamic_db, 0, PWM_MAX);

    int mag = dynamic_db + (int)(frac_eff * (float)(PWM_MAX - dynamic_db));
    mag     = constrain(mag, dynamic_db, PWM_MAX);
    pwm_out = (total_frac >= 0.0f) ? mag : -mag;
  }

  last_pwm1 = pwm_out;
  setDCDirection(pwm_out);
}
