
// ============================================================
//  control/ctc.cpp — Computed Torque Control (CTC)
//  Evaluates M·ddθ, Coriolis, and Gravity at desired state.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "ctc.h"
#include "config.h"
#include "../state/robot_state.h"

using namespace RobotState;
using namespace CtcState;
using namespace Params;

// ============================================================
//  computeCTC
//
//  Gravity formula (alpha_tilt = tilt of the Y axis about the X axis).
//  Sign convention: positive alpha_tilt raises the +Y (front) edge of the
//  plane, so height of an in-plane point is h = +sin(alpha)*y_plane. Enter a
//  NEGATIVE alpha_tilt if the rig tilts the other way — no code change needed,
//  sinf(alpha_tilt) carries the sign through. Verify direction on the bench.
//
//    G1 = (m1*d1 + m2*L1)*g*sin(alpha)*cos(θ1d) + m2*d2*g*sin(alpha)*cos(θ1d+θ2d)
//    G2 = m2*d2*g*sin(alpha)*cos(θ1d+θ2d)
//    G1=G2=0 when alpha=0 (horizontal SCARA)
// ============================================================

void computeCTC() {
  float c2 = cosf(theta2_d);
  float s2 = sinf(theta2_d);

  // Inertia matrix elements
  float M11     = m1*d1*d1 + m2*(L1*L1 + d2*d2 + 2.0f*L1*d2*c2) + Izz1 + Izz2;
  float M12     = m2*(d2*d2 + L1*d2*c2) + Izz2;
  float M22_val = m2*d2*d2 + Izz2;

  // Coriolis / centripetal
  float h_coeff = m2 * L1 * d2 * s2;
  float C1_raw  = -h_coeff * dTheta2_d * (2.0f * dTheta1_d + dTheta2_d);
  float C2_raw  =  h_coeff * dTheta1_d * dTheta1_d;

  // Gravity — only non-zero when base is tilted from horizontal (alpha_tilt != 0)
  // PE = m*g*r*sin(alpha)*sin(θ)  (height = sin(alpha)*y_plane, y_plane = r*sin θ).
  // Gravity vector G(q) = +∂PE/∂θ = m*g*r*sin(alpha)*cos(θ); the static holding
  // feedforward is τ_ff = +G(q), which is exactly what is added downstream.
  float sa     = sinf(alpha_tilt);
  float G1_raw = (m1*d1 + m2*L1) * g_accel * sa * cosf(theta1_d)
               +  m2*d2           * g_accel * sa * cosf(theta1_d + theta2_d);
  float G2_raw =  m2*d2           * g_accel * sa * cosf(theta1_d + theta2_d);

  // Inertia term: M·ddθ
  ctc_inertia1  = M11 * ddTheta1_d + M12 * ddTheta2_d;
  ctc_inertia2  = M12 * ddTheta1_d + M22_val * ddTheta2_d;

  // Coriolis term
  ctc_coriolis1 = C1_raw;
  ctc_coriolis2 = C2_raw;

  // Gravity term
  ctc_gravity1 = G1_raw;
  ctc_gravity2 = G2_raw;
}
