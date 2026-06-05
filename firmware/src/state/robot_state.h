
#pragma once

// ============================================================
//  state/robot_state.h — All mutable global state (extern declarations)
//  Grouped by namespace. Use "using namespace X;" only in .cpp files.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>
#include "config.h"

// ============================================================
//  OPERATING MODE ENUM
// ============================================================

enum OperatingMode {
  MODE_IDLE  = 0,
  MODE_SCARA = 1,
  MODE_ZN    = 2,
  MODE_TEST  = 3
};

extern const char *MODE_NAMES[4];

// ============================================================
//  namespace RobotState
//  Measured angles, velocities, integrators, mode, safety, timing
// ============================================================

namespace RobotState {

  // Measured joint positions (from TD or raw ADC)
  extern float theta1;
  extern float theta2;

  // Raw ADC-derived positions (pre-TD)
  extern float theta1_raw;
  extern float theta2_raw;

  // Previous raw for finite-difference when TD is off
  extern float theta1_raw_prev;
  extern float theta2_raw_prev;

  // Filtered velocities (from TD or finite-diff)
  extern float dTheta1_f;
  extern float dTheta2_f;

  // Integrators
  extern float integral1;
  extern float integral2;

  // DC motor state
  extern bool  motor1_active;
  extern int   motor1_on_ticks;
  extern int   last_pwm1;

  // PID component outputs (for telemetry)
  extern float p1_out;
  extern float i1_out;
  extern float d1_out;

  // Loop timing
  extern unsigned long loop_duration_us;
  extern unsigned long last_control_us;

  // Desired joint states
  extern float theta1_d;
  extern float theta2_d;
  extern float dTheta1_d;
  extern float dTheta2_d;
  extern float ddTheta1_d;
  extern float ddTheta2_d;

  // Operating mode
  extern OperatingMode op_mode;

  // Safety flags
  extern volatile bool estop_active;
  extern volatile bool watchdog_halted;

  // Stepper state
  extern unsigned long last_step_us;
  extern unsigned long step_period_us;
  extern float         omega2_prev;
  extern bool          stepper2_active;

  // Serial watchdog
  extern unsigned long last_serial_rx_ms;
  extern unsigned long last_telemetry_ms;

  // Serial RX buffer
  extern char    serial_buf[64];
  extern uint8_t serial_idx;

}  // namespace RobotState

// ============================================================
//  namespace TrajState
//  Trajectory geometry and execution state
// ============================================================

namespace TrajState {

  extern bool  is_moving;
  extern float traj_x0;
  extern float traj_y0;
  extern float traj_xf;
  extern float traj_yf;
  extern float traj_D;
  extern float traj_ta;
  extern float traj_tc;
  extern float traj_tf;
  extern float traj_da;
  extern float traj_ux;
  extern float traj_uy;
  extern float t_traj;
  extern float traj_x_cmd;
  extern float traj_y_cmd;
  extern int   elbow_config;

  extern bool  traj_time_done;
  extern int   settle_ticks;

  extern bool  pending_move;
  extern float pending_x;
  extern float pending_y;

  // dTheta_d_prev_acc: used inside trajectory/scheduler for ddTheta seeding
  extern float dTheta1_d_prev_acc;
  extern float dTheta2_d_prev_acc;

}  // namespace TrajState

// ============================================================
//  namespace CtcState
//  CTC component outputs (for FF injection and telemetry)
// ============================================================

namespace CtcState {

  extern float ctc_inertia1;
  extern float ctc_coriolis1;
  extern float ctc_gravity1;

  extern float ctc_inertia2;
  extern float ctc_coriolis2;
  extern float ctc_gravity2;

  // Telemetry outputs
  extern float u1_total_out;
  extern float ff1_contrib_out;
  extern float omega2_raw_out;
  extern float delta_omega_ff_out;

}  // namespace CtcState

// ============================================================
//  namespace Params
//  Runtime-tunable parameters
// ============================================================

namespace Params {

  // PID gains
  extern float Kp1, Ki1, Kd1;
  extern float Kp2, Ki2, Kd2;

  // FF blend factors [0.0–1.0]
  extern float FF_INERTIA;
  extern float FF_CORIOLIS;
  extern float FF_GRAVITY;

  // Trajectory
  extern float V_MAX;
  extern float A_MAX;
  extern bool  TRAP_ENABLED;

  // DC motor PWM
  extern float U1_MAX;
  extern float FRAC_ZERO_THRESH;
  extern int   PWM_DEADBAND;

  // Deadband hold J1
  extern float DB_ENGAGE;
  extern float DB_RELEASE;
  extern float DB_VEL;
  extern int   MOTOR1_MIN_TICKS;
  extern float DTERM_MAX;

  // Dual-gain scaling
  extern float KP_HOLD_SCALE;
  extern float KD_HOLD_SCALE;

  // Integrator decay
  extern float INTEGRAL_DECAY;

  // Desired derivative clamp
  extern float DDTH_MAX;

  // CTC normalization references
  extern float TAU_NOM_J1;
  extern float M22_REF;

  // Ki2 gate
  extern float KI2_GATE_RAD;

  // Deadband hold J2
  extern float DB2_ENGAGE;
  extern float DB2_RELEASE;

  // Tracking Differentiator
  extern float TD1_R;
  extern float TD2_R;
  extern bool  TD_ENABLED;

  // Tilt compensation [rad]
  extern float alpha_tilt;

  // Control loop timing
  extern int   CONTROL_FREQ;
  extern float DT;

  // Raw velocity clamp (when TD disabled)
  extern float DTHETA_RAW_CLAMP;

  // Stepper rate limiter
  extern float OMEGA2_RATE_LIMIT;

  // Settle detection
  extern float SETTLE_ERR_RAD;
  extern int   SETTLE_TICKS_REQ;
  extern float TRAJ_MAX_OVERTIME;

}  // namespace Params
