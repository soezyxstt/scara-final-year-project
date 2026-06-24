
// ============================================================
//  scheduler/scheduler.cpp — Control loop orchestrator
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "scheduler.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../sensors/sensors.h"
#include "../kinematics/kinematics.h"
#include "../trajectory/trajectory.h"
#include "../control/ctc.h"
#include "../control/joint1.h"
#include "../control/joint2.h"
#include "../hal/hal_dc.h"
#include "../comms/serial_protocol.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

// ============================================================
//  Function pointer instances
// ============================================================

SensorFn  active_sensor_fn  = nullptr;
DesiredFn active_desired_fn = nullptr;
OutputFn  active_output_fn  = nullptr;

// ============================================================
//  desiredSCARA
//  Jacobian-inverse velocity mapping + finite-diff acceleration.
//  Receives t = t_traj value used for current IK point (pre-advance).
// ============================================================

void desiredSCARA(float t) {
  if (!is_moving) {
    dTheta1_d  = dTheta2_d  = 0.0f;
    ddTheta1_d = ddTheta2_d = 0.0f;
    return;
  }

  float sdot      = getTrajVelocity(t);
  float xdot_cart = sdot * traj_ux;
  float ydot_cart = sdot * traj_uy;

  float J11, J12, J21, J22;
  computeJacobian(theta1_d, theta2_d, J11, J12, J21, J22);
  float det = J11 * J22 - J12 * J21;

  if (fabsf(det) < 1e-4f) {
    dTheta1_d  = dTheta2_d  = 0.0f;
    ddTheta1_d = ddTheta2_d = 0.0f;
    return;
  }

  float inv_det  = 1.0f / det;
  float new_dth1 = inv_det * ( J22 * xdot_cart - J12 * ydot_cart);
  float new_dth2 = inv_det * (-J21 * xdot_cart + J11 * ydot_cart);

  float raw_ddth1 = (new_dth1 - dTheta1_d_prev_acc) / DT;
  float raw_ddth2 = (new_dth2 - dTheta2_d_prev_acc) / DT;

  dTheta1_d_prev_acc = new_dth1;
  dTheta2_d_prev_acc = new_dth2;

  dTheta1_d  = new_dth1;
  dTheta2_d  = new_dth2;
  ddTheta1_d = constrain(raw_ddth1, -DDTH_MAX, DDTH_MAX);
  ddTheta2_d = constrain(raw_ddth2, -DDTH_MAX, DDTH_MAX);
}

// ============================================================
//  desiredZN — theta_d set externally by command; derivatives = 0
// ============================================================

void desiredZN(float t) {
  (void)t;
  dTheta1_d  = dTheta2_d  = 0.0f;
  ddTheta1_d = ddTheta2_d = 0.0f;
}

// ============================================================
//  desiredIdle — no-op
// ============================================================

void desiredIdle(float t) {
  (void)t;
}

// ============================================================
//  outputFull — SCARA & TEST: both joints
// ============================================================

void outputFull() {
  controlJoint1();
  controlJoint2();
}

// ============================================================
//  outputZN — ZN: zero CTC explicitly, then both joints
// ============================================================

void outputZN() {
  ctc_inertia1 = ctc_coriolis1 = ctc_gravity1 = 0.0f;
  ctc_inertia2 = ctc_coriolis2 = ctc_gravity2 = 0.0f;
  controlJoint1();
  controlJoint2();
}

// ============================================================
//  outputIdle — no-op
// ============================================================

void outputIdle() { /* noop */ }

// ============================================================
//  allOutputsOff
// ============================================================

void allOutputsOff() {
  step_period_us  = 0;
  integral1       = 0.0f;
  integral2       = 0.0f;
  motor1_active   = false;
  motor1_on_ticks = 0;
  stepper2_active = false;
  is_moving       = false;
  pending_move    = false;
  is_resting      = false;
  rest_ticks      = 0;
  dbtest_active   = false;

  dTheta1_d  = dTheta2_d  = 0.0f;
  ddTheta1_d = ddTheta2_d = 0.0f;

  ctc_inertia1 = ctc_coriolis1 = ctc_gravity1 = 0.0f;
  ctc_inertia2 = ctc_coriolis2 = ctc_gravity2 = 0.0f;

  p1_out = i1_out = d1_out = 0.0f;
  u1_total_out = ff1_contrib_out = 0.0f;
  omega2_raw_out = delta_omega_ff_out = 0.0f;
  omega2_prev  = 0.0f;
  last_pwm1    = 0;

  digitalWrite(DC_IN3, LOW);
  digitalWrite(DC_IN4, LOW);
  pwmWrite(0);
}

// ============================================================
//  doEstop
// ============================================================

void doEstop() {
  if (is_moving) emitStopPacket();
  estop_active = true;
  allOutputsOff();
  Serial.println("ESTOP,1");
  Serial.println("WARN: ESTOP — all outputs zeroed.");
}

// ============================================================
//  transitionToMode
// ============================================================

void transitionToMode(OperatingMode new_mode) {
  if (new_mode == op_mode) {
    Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);
    return;
  }

  if (is_moving) { emitStopPacket(); is_moving = false; pending_move = false; }

  allOutputsOff();
  estop_active = false;
  Serial.println("ESTOP,0");

  // Seed desired to current measured position to avoid a step
  theta1_d = theta1;
  theta2_d = theta2;
  dTheta1_d_prev_acc = dTheta2_d_prev_acc = 0.0f;

  op_mode = new_mode;

  // Assign function pointers — once per transition, zero per tick
  switch (op_mode) {
    case MODE_IDLE:
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredIdle;
      active_output_fn  = outputIdle;
      break;

    case MODE_SCARA:
      // SCARA always uses TD (locked)
      TD_ENABLED        = true;
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredSCARA;
      active_output_fn  = outputFull;
      break;

    case MODE_ZN:
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredZN;
      active_output_fn  = outputZN;
      break;

    case MODE_TEST:
      // TEST: sensor_fn follows current TD_ENABLED state
      active_sensor_fn  = TD_ENABLED ? sensorWithTD : sensorRawOnly;
      active_desired_fn = desiredSCARA;
      active_output_fn  = outputFull;
      break;
  }

  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);

  if (op_mode == MODE_IDLE) {
    Serial.println("INFO: Mode IDLE aktif.");
  } else if (op_mode == MODE_SCARA) {
    Serial.println("INFO: Mode SCARA aktif.");
    emitFullState();
  } else if (op_mode == MODE_ZN) {
    Serial.println("INFO: Mode ZN aktif.");
    emitFullState();
  } else if (op_mode == MODE_TEST) {
    Serial.println("INFO: Mode TEST aktif.");
    emitFullState();
  }
}

// ============================================================
//  runControlLoop — flat dispatch, zero mode if-checks per tick
// ============================================================

void runControlLoop() {
  updateEncoder();

  if (estop_active) {
    // Keep reading sensors so HMI position updates during ESTOP
    active_sensor_fn();
    return;
  }

  unsigned long t_start = micros();

  // 1. Sensor
  active_sensor_fn();

  // 2. IK + t_traj advance (only while moving)
  if (is_moving) {
    float x_cmd, y_cmd;
    getTrajPoint(t_traj, x_cmd, y_cmd);
    traj_x_cmd = x_cmd;
    traj_y_cmd = y_cmd;
    bool ok = IK(x_cmd, y_cmd, elbow_config, theta1_d, theta2_d);
    if (!ok) {
      is_moving = false;
      Serial.println("ERR: IK failed mid-trajectory — stopped.");
      emitStopPacket();
    }
    t_traj += DT;
  } else {
    FK(theta1_d, theta2_d, traj_x_cmd, traj_y_cmd);
    if (is_resting) {
      rest_ticks++;
      if (rest_ticks >= CONTROL_FREQ) {
        is_resting = false;
        if (pending_move) {
          pending_move = false;
          startTrajectory(pending_x, pending_y, false, true);
        }
      }
    }
  }

  // 3. Desired state (pass pre-advanced t — same t used for IK above)
  active_desired_fn(t_traj - DT);

  // 4. CTC feedforward
  computeCTC();

  // 5. Output
  active_output_fn();

  // 6. Trajectory completion check
  if (is_moving) checkTrajectoryDone();

  loop_duration_us = micros() - t_start;

  // 7. D-line to ring buffer (TX is handled by drainDLineBuffer in loop())
  if (op_mode != MODE_IDLE && (plot_enabled || is_moving || is_resting)) writeDLineToBuffer();
}
