
// ============================================================
//  comms/cmd_parser.cpp — Serial command processor
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "cmd_parser.h"
#include "serial_protocol.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../sensors/sensors.h"
#include "../kinematics/kinematics.h"
#include "../trajectory/trajectory.h"
#include "../scheduler/scheduler.h"
#include "../hal/hal_dc.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

void processSerialCommand(const char *cmd_raw) {
  String input = String(cmd_raw);
  input.trim();
  if (input.length() == 0) return;

  // ----------------------------------------------------------
  // ALWAYS VALID — all modes
  // ----------------------------------------------------------

  if (input == "ping") {
    last_serial_rx_ms = millis();
    return;
  }
  if (input == "estop") {
    doEstop();
    return;
  }
  if (input == "resume") {
    estop_active = false;
    Serial.println("ESTOP,0");
    Serial.println("SUCCESS: ESTOP cleared.");
    return;
  }
  if (input == "getgains")  { emitFullState(); Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]); return; }
  if (input == "getparams") { emitParams();    return; }
  if (input == "clrgraph") {
    Serial.println("SUCCESS: clrgraph acknowledged.");
    return;
  }
  if (input.startsWith("plot,")) {
    plot_enabled = (input.substring(5).toInt() != 0);
    Serial.print("INFO: plot_enabled="); Serial.println(plot_enabled ? 1 : 0);
    return;
  }

  // ----------------------------------------------------------
  // MODE TRANSITIONS
  // ----------------------------------------------------------

  if (input == "mode,idle")  { transitionToMode(MODE_IDLE);  return; }
  if (input == "mode,scara") { transitionToMode(MODE_SCARA); return; }
  if (input == "mode,zn")    { transitionToMode(MODE_ZN);    return; }
  if (input == "mode,test")  { transitionToMode(MODE_TEST);  return; }

  // ----------------------------------------------------------
  // GUARD: reject operational commands in MODE_IDLE
  // ----------------------------------------------------------

  if (op_mode == MODE_IDLE) {
    Serial.println("ERR: MODE_IDLE — kirim mode,scara / mode,zn / mode,test dahulu.");
    return;
  }

  // ----------------------------------------------------------
  // COMMANDS EXCLUSIVE TO MODE_ZN
  // ----------------------------------------------------------

  if (op_mode == MODE_ZN) {
    if (input.startsWith("t1,")) {
      theta1_d  = input.substring(3).toFloat() * (PI / 180.0f);
      integral1 = 0.0f;
      Serial.print("INFO: ZN t1_d="); Serial.print(theta1_d, 4); Serial.println(" rad");
      return;
    }
    if (input.startsWith("t2,")) {
      theta2_d = input.substring(3).toFloat() * (PI / 180.0f);
      Serial.print("INFO: ZN t2_d="); Serial.print(theta2_d, 4); Serial.println(" rad");
      return;
    }
    if (input == "dbtest") {
      Serial.println("INFO: DB test — EN=200 selama 400ms");
      digitalWrite(DC_IN3, LOW); digitalWrite(DC_IN4, HIGH);
      pwmWrite(200); delay(400); pwmWrite(0);
      digitalWrite(DC_IN3, LOW); digitalWrite(DC_IN4, LOW);
      Serial.println("SUCCESS: dbtest selesai.");
      return;
    }
    if (input.startsWith("move,")) {
      Serial.println("ERR: 'move' tidak valid di MODE_ZN. Gunakan t1,/t2,.");
      return;
    }
  }

  // ----------------------------------------------------------
  // COMMANDS EXCLUSIVE TO MODE_TEST — physical params & toggles
  // ----------------------------------------------------------

  if (op_mode == MODE_TEST) {

    // Toggle TD filter
    if (input.startsWith("tden,")) {
      if (is_moving) { Serial.println("ERR: tden tidak bisa diubah saat bergerak."); return; }
      bool new_td = (input.substring(5).toInt() != 0);
      if (new_td && !TD_ENABLED) {
        // Re-enable: seed TD from current raw position
        td1.init(theta1_raw, TD1_R, DT);
        td2.init(theta2_raw, TD2_R, DT);
      }
      if (!new_td && TD_ENABLED) {
        // Disable: seed finite-diff prev from current raw
        theta1_raw_prev = theta1_raw;
        theta2_raw_prev = theta2_raw;
      }
      TD_ENABLED       = new_td;
      active_sensor_fn = TD_ENABLED ? sensorWithTD : sensorRawOnly;
      Serial.print("INFO: TD_ENABLED="); Serial.println(TD_ENABLED ? 1 : 0);
      emitParams();
      return;
    }

    // Toggle trapezoidal profile
    if (input.startsWith("trapen,")) {
      if (is_moving) { Serial.println("ERR: trapen tidak bisa diubah saat bergerak."); return; }
      TRAP_ENABLED = (input.substring(7).toInt() != 0);
      Serial.print("INFO: TRAP_ENABLED="); Serial.println(TRAP_ENABLED ? 1 : 0);
      emitParams();
      return;
    }

    // alpha_tilt
    if (input.startsWith("atilt,")) {
      alpha_tilt = input.substring(6).toFloat() * (PI / 180.0f);
      Serial.print("INFO: alpha_tilt="); Serial.print(alpha_tilt, 5); Serial.println(" rad");
      emitParams();
      return;
    }

    // t1, t2 — manual desired set in TEST
    if (input.startsWith("t1,")) {
      if (is_moving) { Serial.println("ERR: t1, tidak bisa diubah saat bergerak."); return; }
      theta1_d  = input.substring(3).toFloat() * (PI / 180.0f);
      integral1 = 0.0f;
      Serial.print("INFO: TEST t1_d="); Serial.print(theta1_d, 4); Serial.println(" rad");
      return;
    }
    if (input.startsWith("t2,")) {
      if (is_moving) { Serial.println("ERR: t2, tidak bisa diubah saat bergerak."); return; }
      theta2_d = input.substring(3).toFloat() * (PI / 180.0f);
      Serial.print("INFO: TEST t2_d="); Serial.print(theta2_d, 4); Serial.println(" rad");
      return;
    }

    // Physical parameters
    if (input.startsWith("vmax,")) {
      V_MAX = input.substring(5).toFloat();
      Serial.print("INFO: V_MAX="); Serial.println(V_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("amax,")) {
      A_MAX = input.substring(5).toFloat();
      Serial.print("INFO: A_MAX="); Serial.println(A_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("u1max,")) {
      U1_MAX = input.substring(6).toFloat();
      Serial.print("INFO: U1_MAX="); Serial.println(U1_MAX, 2);
      emitParams(); return;
    }
    if (input.startsWith("kv1,"))
    {
      KV_VEL = input.substring(4).toFloat();
      Serial.print("INFO: KV_VEL=");
      Serial.println(KV_VEL, 6);
      emitParams();
      return;
    }
    if (input.startsWith("db,")) {
      PWM_DEADBAND = input.substring(3).toInt();
      Serial.print("INFO: PWM_DEADBAND="); Serial.println(PWM_DEADBAND);
      emitParams(); return;
    }
    if (input.startsWith("fzt,"))
    {
      FRAC_ZERO_THRESH = constrain(input.substring(4).toFloat(), 0.0f, 0.5f);
      Serial.print("INFO: FRAC_ZERO_THRESH=");
      Serial.println(FRAC_ZERO_THRESH, 4);
      emitParams();
      return;
    }
    if (input.startsWith("fztk,"))
    {
      if (is_moving)
      {
        Serial.println("ERR: fztk tidak bisa diubah saat bergerak.");
        return;
      }
      FRAC_ZERO_KICK_PCT = constrain(input.substring(5).toFloat(), 0.01f, 1.0f);
      Serial.print("INFO: FRAC_ZERO_KICK_PCT=");
      Serial.println(FRAC_ZERO_KICK_PCT, 4);
      emitParams();
      return;
    }
    if (input.startsWith("kspen,"))
    {
      if (is_moving)
      {
        Serial.println("ERR: kspen tidak bisa diubah saat bergerak.");
        return;
      }
      KICKSTART_ENABLED = (input.substring(6).toInt() != 0);
      Serial.print("INFO: KICKSTART_ENABLED=");
      Serial.println(KICKSTART_ENABLED ? 1 : 0);
      emitParams();
      return;
    }
    if (input.startsWith("vffmax,"))
    {
      VFF_MAX_FRAC = input.substring(7).toFloat();
      Serial.print("INFO: VFF_MAX_FRAC=");
      Serial.println(VFF_MAX_FRAC, 4);
      emitParams();
      return;
    }
    if (input.startsWith("vffdv,"))
    {
      VFF_DV_MAX = input.substring(6).toFloat();
      Serial.print("INFO: VFF_DV_MAX=");
      Serial.println(VFF_DV_MAX, 4);
      emitParams();
      return;
    }
    if (input.startsWith("td1r,")) {
      TD1_R = input.substring(5).toFloat();
      td1.r = TD1_R; td1.h = 3.0f * DT;
      Serial.print("INFO: TD1_R="); Serial.println(TD1_R, 2);
      emitParams(); return;
    }
    if (input.startsWith("td2r,")) {
      TD2_R = input.substring(5).toFloat();
      td2.r = TD2_R; td2.h = 3.0f * DT;
      Serial.print("INFO: TD2_R="); Serial.println(TD2_R, 2);
      emitParams(); return;
    }
    if (input.startsWith("dben,")) {
      DB_ENGAGE = input.substring(5).toFloat();
      Serial.print("INFO: DB_ENGAGE="); Serial.println(DB_ENGAGE, 3);
      emitParams(); return;
    }
    if (input.startsWith("dbrel,")) {
      DB_RELEASE = input.substring(6).toFloat();
      Serial.print("INFO: DB_RELEASE="); Serial.println(DB_RELEASE, 3);
      emitParams(); return;
    }
    if (input.startsWith("dbmen,"))
    {
      if (is_moving)
      {
        Serial.println("ERR: dbmen tidak bisa diubah saat bergerak.");
        return;
      }
      DB_MOVING_ENABLED = (input.substring(6).toInt() != 0);
      Serial.print("INFO: DB_MOVING_ENABLED=");
      Serial.println(DB_MOVING_ENABLED ? 1 : 0);
      emitParams();
      return;
    }
    if (input.startsWith("dbens,"))
    {
      if (is_moving)
      {
        Serial.println("ERR: dbens tidak bisa diubah saat bergerak.");
        return;
      }
      DB_ENGAGE_MOVING_SCALE = constrain(input.substring(6).toFloat(), 0.1f, 1.0f);
      Serial.print("INFO: DB_ENGAGE_MOVING_SCALE=");
      Serial.println(DB_ENGAGE_MOVING_SCALE, 3);
      emitParams();
      return;
    }
    if (input.startsWith("db2en,")) {
      DB2_ENGAGE = input.substring(6).toFloat();
      Serial.print("INFO: DB2_ENGAGE="); Serial.println(DB2_ENGAGE, 3);
      emitParams(); return;
    }
    if (input.startsWith("db2rel,")) {
      DB2_RELEASE = input.substring(7).toFloat();
      Serial.print("INFO: DB2_RELEASE="); Serial.println(DB2_RELEASE, 3);
      emitParams(); return;
    }
    if (input.startsWith("dbvel,")) {
      DB_VEL = input.substring(6).toFloat();
      Serial.print("INFO: DB_VEL="); Serial.println(DB_VEL, 3);
      emitParams(); return;
    }
    if (input.startsWith("ddth,")) {
      DDTH_MAX = input.substring(5).toFloat();
      Serial.print("INFO: DDTH_MAX="); Serial.println(DDTH_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("hskp,")) {
      KP_HOLD_SCALE = input.substring(5).toFloat();
      Serial.print("INFO: KP_HOLD_SCALE="); Serial.println(KP_HOLD_SCALE, 3);
      emitParams(); return;
    }
    if (input.startsWith("hskd,")) {
      KD_HOLD_SCALE = input.substring(5).toFloat();
      Serial.print("INFO: KD_HOLD_SCALE="); Serial.println(KD_HOLD_SCALE, 3);
      emitParams(); return;
    }
    if (input.startsWith("idecay,")) {
      INTEGRAL_DECAY = input.substring(7).toFloat();
      Serial.print("INFO: INTEGRAL_DECAY="); Serial.println(INTEGRAL_DECAY, 5);
      emitParams(); return;
    }
    if (input.startsWith("taunom,")) {
      TAU_NOM_J1 = input.substring(7).toFloat();
      Serial.print("INFO: TAU_NOM_J1="); Serial.println(TAU_NOM_J1, 5);
      emitParams(); return;
    }
    if (input.startsWith("m22ref,")) {
      M22_REF = input.substring(7).toFloat();
      Serial.print("INFO: M22_REF="); Serial.println(M22_REF, 8);
      emitParams(); return;
    }
    if (input.startsWith("cfreq,")) {
      int val = input.substring(6).toInt();
      if (val > 0) {
        CONTROL_FREQ = val;
        DT = 1.0f / CONTROL_FREQ;
        td1.h = 3.0f * DT;
        td2.h = 3.0f * DT;
        Serial.print("INFO: CONTROL_FREQ="); Serial.println(CONTROL_FREQ);
        emitParams();
      }
      return;
    }
    if (input.startsWith("ki2g,")) {
      KI2_GATE_RAD = input.substring(5).toFloat();
      Serial.print("INFO: KI2_GATE_RAD="); Serial.println(KI2_GATE_RAD, 3);
      emitParams(); return;
    }
    if (input.startsWith("omega2rl,")) {
      OMEGA2_RATE_LIMIT = input.substring(9).toFloat();
      Serial.print("INFO: OMEGA2_RATE_LIMIT="); Serial.println(OMEGA2_RATE_LIMIT, 2);
      return;
    }
    if (input.startsWith("dtclamp,")) {
      DTHETA_RAW_CLAMP = input.substring(8).toFloat();
      Serial.print("INFO: DTHETA_RAW_CLAMP="); Serial.println(DTHETA_RAW_CLAMP, 2);
      return;
    }
    if (input.startsWith("errdz,")) {
      ERR_DZ = input.substring(6).toFloat();
      Serial.print("INFO: ERR_DZ="); Serial.println(ERR_DZ, 4);
      emitParams(); return;
    }
    if (input.startsWith("ifreeze,")) {
      INTEGRAL_FREEZE_THRESH = input.substring(8).toFloat();
      Serial.print("INFO: INTEGRAL_FREEZE_THRESH="); Serial.println(INTEGRAL_FREEZE_THRESH, 4);
      emitParams(); return;
    }
  }

  // ----------------------------------------------------------
  // SHARED: SCARA + TEST — move command
  // ----------------------------------------------------------

  if (input.startsWith("move,")) {
    if (op_mode == MODE_ZN) {
      Serial.println("ERR: 'move' tidak valid di MODE_ZN.");
      return;
    }
    if (estop_active) { Serial.println("ERR: E-STOP aktif. Kirim 'resume'."); return; }

    String rest = input.substring(5);
    int    c2   = rest.indexOf(',');
    if (c2 > 0) {
      float new_x = rest.substring(0, c2).toFloat() / 1000.0f;
      float new_y = rest.substring(c2 + 1).toFloat() / 1000.0f;

      // Workspace check [m]
      float r2    = new_x * new_x + new_y * new_y;
      float max_r = L1 + L2;
      float min_r = fabsf(L1 - L2);
      if (r2 > max_r * max_r || r2 < min_r * min_r) {
        Serial.print("ERR: Di luar workspace. R valid: ");
        Serial.print(min_r * 1000.0f, 1); Serial.print(" – ");
        Serial.println(max_r * 1000.0f, 1);
        return;
      }

      int   cfg = (theta2 > 0.009f) ? 1 : ((theta2 < -0.009f) ? -1 : 1);
      float th1_t, th2_t;
      if (!IK(new_x, new_y, cfg, th1_t, th2_t)) {
        Serial.println("ERR: IK failed untuk target ini.");
        return;
      }

      if (is_moving) {
        pending_move = true;
        pending_x    = new_x;
        pending_y    = new_y;
        Serial.println("SUCCESS: Move queued.");
        emitQueueStatus();
        return;
      }
      startTrajectory(new_x, new_y);
    }
    return;
  }

  // ----------------------------------------------------------
  // ALL ACTIVE MODES — gain tuning
  // ----------------------------------------------------------

  if (input.startsWith("kp1,")) { Kp1 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("ki1,")) { Ki1 = input.substring(4).toFloat(); integral1 = 0.0f; emitGains(); return; }
  if (input.startsWith("kd1,")) { Kd1 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("kp2,")) { Kp2 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("ki2,")) { Ki2 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("kd2,")) { Kd2 = input.substring(4).toFloat(); emitGains(); return; }

  // FF blend — SCARA and TEST
  if (input.startsWith("ffi,")) {
    FF_INERTIA  = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }
  if (input.startsWith("ffc,")) {
    FF_CORIOLIS = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }
  if (input.startsWith("ffg,")) {
    FF_GRAVITY  = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }

  Serial.println("ERR: Unknown command.");
}
