
// ============================================================
//  trajectory/trajectory.cpp — Trapezoidal/constant-velocity
//  Cartesian trajectory.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "trajectory.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../kinematics/kinematics.h"

using namespace RobotState;
using namespace TrajState;
using namespace Params;

// ============================================================
//  startTrajectory
// ============================================================

void startTrajectory(float new_x, float new_y) {
  // Determine elbow config from current measured theta2
  if      (theta2 >  0.009f) elbow_config =  1;
  else if (theta2 < -0.009f) elbow_config = -1;
  else                        elbow_config =  1;

  FK(theta1, theta2, traj_x0, traj_y0);
  traj_xf = new_x;
  traj_yf = new_y;

  float dx = traj_xf - traj_x0;
  float dy = traj_yf - traj_y0;
  traj_D   = sqrtf(dx * dx + dy * dy);

  if (traj_D < 0.001f) {
    is_moving = false;
    return;
  }

  traj_ux = dx / traj_D;
  traj_uy = dy / traj_D;

  if (TRAP_ENABLED) {
    // Trapezoidal velocity profile
    traj_ta = V_MAX / A_MAX;
    traj_da = 0.5f * A_MAX * traj_ta * traj_ta;

    if (2.0f * traj_da > traj_D) {
      // Triangle profile — peak velocity is reduced
      traj_ta = sqrtf(traj_D / A_MAX);
      traj_da = 0.5f * A_MAX * traj_ta * traj_ta;
      traj_tc = 0.0f;
    } else {
      traj_tc = (traj_D - 2.0f * traj_da) / V_MAX;
    }
    traj_tf = 2.0f * traj_ta + traj_tc;

    // Seed: starts from rest → ddθ_0 computed cleanly
    dTheta1_d_prev_acc = 0.0f;
    dTheta2_d_prev_acc = 0.0f;

  } else {
    // Constant velocity — trapezoidal formula degenerates (ta=tc=0)
    // getTrajPoint/Velocity/Accel need no if-check inside them.
    traj_ta = 0.0f;
    traj_da = 0.0f;
    traj_tc = 0.0f;
    traj_tf = traj_D / V_MAX;

    // Seed dTheta_d_prev_acc from Jacobian so tick-0 ddθ = 0
    float J11, J12, J21, J22;
    computeJacobian(theta1_d, theta2_d, J11, J12, J21, J22);
    float det = J11 * J22 - J12 * J21;

    if (fabsf(det) > 1e-4f) {
      float inv = 1.0f / det;
      float vx  = V_MAX * traj_ux;
      float vy  = V_MAX * traj_uy;
      dTheta1_d_prev_acc = inv * ( J22 * vx - J12 * vy);
      dTheta2_d_prev_acc = inv * (-J21 * vx + J11 * vy);
    } else {
      dTheta1_d_prev_acc = 0.0f;
      dTheta2_d_prev_acc = 0.0f;
    }
  }

  t_traj        = 0.0f;
  traj_x_cmd    = traj_x0;
  traj_y_cmd    = traj_y0;
  traj_time_done = false;
  settle_ticks   = 0;

  dTheta1_d = dTheta2_d   = 0.0f;
  ddTheta1_d = ddTheta2_d  = 0.0f;
  omega2_prev = 0.0f;
  // integral2 is frozen (not reset) when starting a move

  // Emit M-packet
  Serial.print("M,");
  Serial.print(traj_x0 * 1000.0f, 3); Serial.print(",");
  Serial.print(traj_y0 * 1000.0f, 3); Serial.print(",");
  Serial.print(traj_xf * 1000.0f, 3); Serial.print(",");
  Serial.println(traj_yf * 1000.0f, 3);

  is_moving = true;
}

// ============================================================
//  getTrajPoint
//  Trapezoidal formula: degenerates to cruise-only when ta=tc=0.
// ============================================================

void getTrajPoint(float t, float &x, float &y) {
  float S;
  if (t < traj_ta) {
    S = 0.5f * A_MAX * t * t;
  } else if (t < traj_ta + traj_tc) {
    S = traj_da + V_MAX * (t - traj_ta);
  } else if (t <= traj_tf) {
    float dt_end = traj_tf - t;
    S = traj_D - 0.5f * A_MAX * dt_end * dt_end;
  } else {
    S = traj_D;
  }
  S = constrain(S, 0.0f, traj_D);

  float ratio = (traj_D > 0.0f) ? (S / traj_D) : 0.0f;
  x = traj_x0 + ratio * (traj_xf - traj_x0);
  y = traj_y0 + ratio * (traj_yf - traj_y0);
}

// ============================================================
//  getTrajVelocity
//  Constant vel → V_MAX for all t in [0, traj_tf]. ✓
// ============================================================

float getTrajVelocity(float t) {
  if (t < 0.0f || t > traj_tf) return 0.0f;
  if (t < traj_ta)              return A_MAX * t;
  if (t < traj_ta + traj_tc)   return V_MAX;
  return A_MAX * (traj_tf - t);
}

// ============================================================
//  getTrajAccel
//  Constant vel → ta=0, every t≥0 falls into cruise → 0. ✓
// ============================================================

float getTrajAccel(float t) {
  if (t < 0.0f || t > traj_tf) return 0.0f;
  if (t < traj_ta)              return A_MAX;
  if (t < traj_ta + traj_tc)   return 0.0f;
  return -A_MAX;
}

// ============================================================
//  emitStopPacket
// ============================================================

void emitStopPacket() {
  Serial.print("S,");
  Serial.print(traj_xf * 1000.0f, 3); Serial.print(",");
  Serial.println(traj_yf * 1000.0f, 3);
}

// ============================================================
//  checkTrajectoryDone
// ============================================================

void checkTrajectoryDone() {
  if (!is_moving) return;

  if (!traj_time_done && t_traj > traj_tf) {
    traj_time_done = true;
    settle_ticks   = 0;
  }
  if (!traj_time_done) return;

  // Timeout guard
  if ((t_traj - traj_tf) > TRAJ_MAX_OVERTIME) {
    Serial.println("WARN: trajectory timeout — forcing stop");
    is_moving      = false;
    traj_time_done = false;
    emitStopPacket();
    if (pending_move) {
      pending_move = false;
      startTrajectory(pending_x, pending_y);
    }
    return;
  }

  // Settle check against target IK
  float th1_f, th2_f;
  if (!IK(traj_xf, traj_yf, elbow_config, th1_f, th2_f)) {
    is_moving = false;
    emitStopPacket();
    return;
  }

  if (fabsf(th1_f - theta1) < SETTLE_ERR_RAD &&
      fabsf(th2_f - theta2) < SETTLE_ERR_RAD) {
    settle_ticks++;
  } else {
    settle_ticks = 0;
  }

  if (settle_ticks >= SETTLE_TICKS_REQ) {
    is_moving      = false;
    traj_time_done = false;
    emitStopPacket();
    if (pending_move) {
      pending_move = false;
      startTrajectory(pending_x, pending_y);
    }
  }
}
