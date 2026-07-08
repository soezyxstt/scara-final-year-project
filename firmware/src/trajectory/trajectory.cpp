
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

void startTrajectory(float new_x, float new_y, bool allow_split, bool is_continuation) {
  is_resting = false;
  rest_ticks = 0;
  traj_timeout_hold = false;

  // Determine elbow config from current measured theta2
  if      (theta2 >  0.009f) elbow_config =  1;
  else if (theta2 < -0.009f) elbow_config = -1;
  else                        elbow_config =  1;

  FK(theta1, theta2, traj_x0, traj_y0);

  // Check if trajectory intersects inner singularity dead zone
  if (allow_split && checkPathCrossesInnerRadius(traj_x0, traj_y0, new_x, new_y, L_INNER)) {
    float x_int, y_int;
    calculateIntermediatePoint(traj_x0, traj_y0, new_x, new_y, L_INNER, (L1 + L2), x_int, y_int);

    // Queue final move target
    pending_move = true;
    pending_x    = new_x;
    pending_y    = new_y;

    // Direct trajectory to intermediate waypoint first
    new_x = x_int;
    new_y = y_int;

    Serial.print("INFO: Path split into L-shape via intermediate point (");
    Serial.print(x_int * 1000.0f, 1); Serial.print(", ");
    Serial.print(y_int * 1000.0f, 1); Serial.println(")");
  }

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

  // Emit M-packet (MC for L-shape second leg — continuation, no buffer reset on HMI)
  Serial.print(is_continuation ? "MC," : "M,");
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

  // Timeout guard — always cancels the L-shape and signals done (failure path)
  if ((t_traj - traj_tf) > TRAJ_MAX_OVERTIME) {
    Serial.println("WARN: trajectory timeout — forcing stop");
    is_moving      = false;
    traj_time_done = false;
    pending_move   = false;
    is_resting     = false;

    // Activate trajectory timeout hold state
    traj_timeout_hold = true;
    dTheta1_d_prev_acc = 0.0f;
    dTheta2_d_prev_acc = 0.0f;

    emitStopPacket();
    return;
  }

  // Settle check against target IK
  float th1_f, th2_f;
  if (!IK(traj_xf, traj_yf, elbow_config, th1_f, th2_f)) {
    is_moving    = false;
    pending_move = false;

    // Activate trajectory timeout hold state on IK failure
    traj_timeout_hold = true;
    dTheta1_d_prev_acc = 0.0f;
    dTheta2_d_prev_acc = 0.0f;

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
    if (pending_move) {
      // Intermediate waypoint of L-shape reached — rest, then fire second leg.
      // Do NOT emit S here; the S will come after the final leg settles.
      is_resting = true;
      rest_ticks = 0;
    } else {
      emitStopPacket();
    }
  }
}

// ============================================================
//  checkPathCrossesInnerRadius
// ============================================================
bool checkPathCrossesInnerRadius(float x0, float y0, float xf, float yf, float rMin) {
  float dx = xf - x0;
  float dy = yf - y0;
  float a = dx * dx + dy * dy;
  if (a < 1e-8f) return false;

  float b = 2.0f * (x0 * dx + y0 * dy);
  float tVertex = -b / (2.0f * a);

  float minDistanceSq;
  if (tVertex <= 0.0f) {
    minDistanceSq = x0 * x0 + y0 * y0;
  } else if (tVertex >= 1.0f) {
    minDistanceSq = xf * xf + yf * yf;
  } else {
    minDistanceSq = (x0 * x0 + y0 * y0) - (b * b) / (4.0f * a);
  }

  return (minDistanceSq < rMin * rMin);
}

// ============================================================
//  isAngleValid
// ============================================================
bool isAngleValid(float x, float y) {
  return !(y < -0.577350269f * fabsf(x));
}

// ============================================================
//  ccw / intersect helpers for line intersection
// ============================================================
static bool ccw(float Ax, float Ay, float Bx, float By, float Cx, float Cy) {
  return (Cy - Ay) * (Bx - Ax) > (By - Ay) * (Cx - Ax);
}

static bool intersect(float Ax, float Ay, float Bx, float By, float Cx, float Cy, float Dx, float Dy) {
  return (ccw(Ax, Ay, Cx, Cy, Dx, Dy) != ccw(Bx, By, Cx, Cy, Dx, Dy)) &&
         (ccw(Ax, Ay, Bx, By, Cx, Cy) != ccw(Ax, Ay, Bx, By, Dx, Dy));
}

// ============================================================
//  pathCrossesForbiddenAngle
// ============================================================
bool pathCrossesForbiddenAngle(float x0, float y0, float xf, float yf) {
  if (!isAngleValid(x0, y0) || !isAngleValid(xf, yf)) {
    return true;
  }
  // Rays at -30 deg and 210 deg (lengths scaled to 0.2 meters)
  float ray1End_x = 0.200f;  float ray1End_y = -0.1154700538f;
  float ray2End_x = -0.200f; float ray2End_y = -0.1154700538f;
  float origin_x = 0.0f;     float origin_y = 0.0f;

  return intersect(x0, y0, xf, yf, origin_x, origin_y, ray1End_x, ray1End_y) ||
         intersect(x0, y0, xf, yf, origin_x, origin_y, ray2End_x, ray2End_y);
}

// ============================================================
//  calculateIntermediatePoint
// ============================================================
void calculateIntermediatePoint(float x0, float y0, float xf, float yf, float rMin, float rMax, float &x_int, float &y_int) {
  float rSafe = 0.120f; // safe radius in meters (120 mm)

  float theta0 = atan2f(y0, x0);
  float theta1 = atan2f(yf, xf);

  float thetaDiff = theta1 - theta0;
  while (thetaDiff < -PI) thetaDiff += 2.0f * PI;
  while (thetaDiff > PI)  thetaDiff -= 2.0f * PI;

  float cand1_angle = theta0 + thetaDiff / 2.0f;
  float cand2_angle = cand1_angle + PI;

  // Normalize candidates to [-PI, PI]
  while (cand1_angle < -PI) cand1_angle += 2.0f * PI;
  while (cand1_angle > PI)  cand1_angle -= 2.0f * PI;

  while (cand2_angle < -PI) cand2_angle += 2.0f * PI;
  while (cand2_angle > PI)  cand2_angle -= 2.0f * PI;

  float cands[2] = {cand1_angle, cand2_angle};
  bool cand_valid[2] = {false, false};
  float cand_x[2], cand_y[2];

  for (int i = 0; i < 2; i++) {
    cand_x[i] = rSafe * cosf(cands[i]);
    cand_y[i] = rSafe * sinf(cands[i]);

    // Check angle validity
    if (!isAngleValid(cand_x[i], cand_y[i])) {
      continue;
    }

    // Check if both segments are safe from inner radius and forbidden angle
    bool path1_safe = !checkPathCrossesInnerRadius(x0, y0, cand_x[i], cand_y[i], rMin) &&
                      !pathCrossesForbiddenAngle(x0, y0, cand_x[i], cand_y[i]);
    bool path2_safe = !checkPathCrossesInnerRadius(cand_x[i], cand_y[i], xf, yf, rMin) &&
                      !pathCrossesForbiddenAngle(cand_x[i], cand_y[i], xf, yf);

    if (path1_safe && path2_safe) {
      cand_valid[i] = true;
    }
  }

  // Choose the best candidate
  if (cand_valid[0] && cand_valid[1]) {
    // Both are valid, choose the one with shorter path length
    float d1 = sqrtf((cand_x[0] - x0)*(cand_x[0] - x0) + (cand_y[0] - y0)*(cand_y[0] - y0)) +
               sqrtf((xf - cand_x[0])*(xf - cand_x[0]) + (yf - cand_y[0])*(yf - cand_y[0]));
    float d2 = sqrtf((cand_x[1] - x0)*(cand_x[1] - x0) + (cand_y[1] - y0)*(cand_y[1] - y0)) +
               sqrtf((xf - cand_x[1])*(xf - cand_x[1]) + (yf - cand_y[1])*(yf - cand_y[1]));
    if (d1 <= d2) {
      x_int = cand_x[0];
      y_int = cand_y[0];
    } else {
      x_int = cand_x[1];
      y_int = cand_y[1];
    }
  } else if (cand_valid[0]) {
    x_int = cand_x[0];
    y_int = cand_y[0];
  } else if (cand_valid[1]) {
    x_int = cand_x[1];
    y_int = cand_y[1];
  } else {
    // Fallback: 90 degrees at safe radius
    x_int = 0.0f;
    y_int = rSafe;
  }
}
