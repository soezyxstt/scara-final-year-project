
// ============================================================
//  state/robot_state.cpp — Global state definitions
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "robot_state.h"


// ============================================================
//  Mode name table
// ============================================================

const char *MODE_NAMES[4] = { "IDLE", "SCARA", "ZN", "TEST" };

// ============================================================
//  namespace RobotState
// ============================================================

namespace RobotState {

  float theta1     = 0.0f;
  float theta2     = 0.0f;
  float theta1_raw = 0.0f;
  float theta2_raw = 0.0f;
  float theta1_raw_prev = 0.0f;
  float theta2_raw_prev = 0.0f;
  float dTheta1_f  = 0.0f;
  float dTheta2_f  = 0.0f;

  float integral1  = 0.0f;
  float integral2  = 0.0f;

  bool  motor1_active   = false;
  int   motor1_on_ticks = 0;
  int   last_pwm1       = 0;

  float p1_out = 0.0f;
  float i1_out = 0.0f;
  float d1_out = 0.0f;

  unsigned long loop_duration_us = 0;
  unsigned long last_control_us  = 0;

  float theta1_d   = 0.0f;
  float theta2_d   = 0.0f;
  float dTheta1_d  = 0.0f;
  float dTheta2_d  = 0.0f;
  float ddTheta1_d = 0.0f;
  float ddTheta2_d = 0.0f;

  OperatingMode op_mode = MODE_IDLE;

  volatile bool estop_active    = false;
  volatile bool watchdog_halted = false;

  unsigned long last_step_us   = 0;
  unsigned long step_period_us = 0;
  float         omega2_prev    = 0.0f;
  bool          stepper2_active = true;

  float vff1_prev = 0.0f;

  unsigned long last_serial_rx_ms = 0;
  unsigned long last_telemetry_ms = 0;

  bool  plot_enabled = true;

  char    serial_buf[64] = {};
  uint8_t serial_idx     = 0;

}  // namespace RobotState

// ============================================================
//  namespace TrajState
// ============================================================

namespace TrajState {

  bool  is_moving    = false;
  float traj_x0      = 0.0f;
  float traj_y0      = 0.0f;
  float traj_xf      = 0.0f;
  float traj_yf      = 0.0f;
  float traj_D       = 0.0f;
  float traj_ta      = 0.0f;
  float traj_tc      = 0.0f;
  float traj_tf      = 0.0f;
  float traj_da      = 0.0f;
  float traj_ux      = 0.0f;
  float traj_uy      = 1.0f;
  float t_traj       = 0.0f;
  float traj_x_cmd   = 0.0f;
  float traj_y_cmd   = 0.0f;
  int   elbow_config = 1;

  bool  traj_time_done = false;
  int   settle_ticks   = 0;

  bool  pending_move = false;
  float pending_x    = 0.0f;
  float pending_y    = 0.0f;

  float dTheta1_d_prev_acc = 0.0f;
  float dTheta2_d_prev_acc = 0.0f;

}  // namespace TrajState

// ============================================================
//  namespace CtcState
// ============================================================

namespace CtcState {

  float ctc_inertia1  = 0.0f;
  float ctc_coriolis1 = 0.0f;
  float ctc_gravity1  = 0.0f;

  float ctc_inertia2  = 0.0f;
  float ctc_coriolis2 = 0.0f;
  float ctc_gravity2  = 0.0f;

  float u1_total_out      = 0.0f;
  float ff1_contrib_out   = 0.0f;
  float omega2_raw_out    = 0.0f;
  float delta_omega_ff_out = 0.0f;

  float vff1_out = 0.0f;

}  // namespace CtcState

// ============================================================
//  namespace Params — default values (match original firmware)
// ============================================================

namespace Params {

  float Kp1 = 0.3f;
  float Ki1 = 0.01f;
  float Kd1 = 0.008f;
  float Kp2 = 5.5f;
  float Ki2 = 0.01f;
  float Kd2 = 0.02f;

  float FF_INERTIA  = 0.0f;
  float FF_CORIOLIS = 0.0f;
  float FF_GRAVITY  = 0.0f;

  float V_MAX = 0.04f;
  float A_MAX       = 0.08f;
  bool  TRAP_ENABLED = true;

  float U1_MAX           = 1.0f;
  float FRAC_ZERO_THRESH = 0.01f;
  int PWM_DEADBAND = 68;
  // Kickstart: reduce fractional threshold during trajectory acceleration
  // Expressed as a percentage of `FRAC_ZERO_THRESH` (0.1 = 10%)
  bool KICKSTART_ENABLED = true;
  float FRAC_ZERO_KICK_PCT = 0.30f; // 10% of normal by default

  // Velocity feedforward parameter (normalized): units = fraction per rad/s
  // vff_contribution = KV_VEL * dTheta1_d * U1_MAX
  float KV_VEL = 0.015f;
  // Safety: maximum absolute fraction for vff (fraction of U1_MAX)
  float VFF_MAX_FRAC = 0.3f;
  // Safety: maximum per-tick change in vff (fraction of U1_MAX)
  float VFF_DV_MAX = 0.1f;

  float DB_ENGAGE       = 0.008f;
  float DB_RELEASE      = 0.004f;
  float DB_VEL          = 0.15f;
  // Dynamic deadband scaling while moving: apply this scale to the
  // computed PWM deadband when `TrajState::is_moving` is true.
  bool DB_MOVING_ENABLED = true;
  float DB_ENGAGE_MOVING_SCALE = 0.9f;
  int   MOTOR1_MIN_TICKS = 5;
  float DTERM_MAX        = 0.8f;

  float KP_HOLD_SCALE = 0.60f;
  float KD_HOLD_SCALE = 2.00f;

  float INTEGRAL_DECAY = 0.004f;

  float DDTH_MAX = 2.0f;

  // Nominal torque used to normalise feedforward → fraction of `U1_MAX`.
  // Default to the computed stall torque as a safer physical reference.
  float TAU_NOM_J1 = TAU_STALL_J1 * 2.0f; // ≈ 0.32 Nm
  // Nominal M22 reference: link mass contribution + reflected inertia
  float M22_REF = m2 * d2 * d2 + Izz2;

  float ERR_DZ               = 0.005f;  // rad — error below this treated as zero
  float INTEGRAL_FREEZE_THRESH = 0.015f; // rad — integrator decays instead of accumulating

  float KI2_GATE_RAD = 0.05f;

  float DB2_ENGAGE = 0.008f;
  float DB2_RELEASE = 0.005f;

  float TD1_R = 25.0f;
  float TD2_R = 25.0f;
  bool  TD_ENABLED = true;

  float alpha_tilt = 0.0f;

  int   CONTROL_FREQ = 500;
  float DT           = 1.0f / 500.0f;

  float DTHETA_RAW_CLAMP = 5.0f;
  float OMEGA2_RATE_LIMIT = 4.0f;

  float SETTLE_ERR_RAD   = 0.01f;
  int   SETTLE_TICKS_REQ = 20;
  float TRAJ_MAX_OVERTIME = 2.0f;

}  // namespace Params
