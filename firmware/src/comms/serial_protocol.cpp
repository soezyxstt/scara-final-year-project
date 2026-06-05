
// ============================================================
//  comms/serial_protocol.cpp — Telemetry packet emitters
//  D-line ring buffer implementation.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "serial_protocol.h"
#include "cmd_parser.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../kinematics/kinematics.h"
#include "../sensors/sensors.h"
#include "telemetry_autogen.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

// ============================================================
//  D-line ring buffer
// ============================================================

struct DLineEntry {
  char    str[DLINE_STR_LEN];
  uint8_t len;
};

static DLineEntry       dline_buf[DLINE_BUF_SIZE];
static volatile uint8_t dline_head = 0;   // written by control tick
static volatile uint8_t dline_tail = 0;   // read by drainDLineBuffer()

// ============================================================
//  writeDLineToBuffer — called inside runControlLoop() at 500 Hz
// ============================================================

void writeDLineToBuffer() {
  uint8_t next_head = (dline_head + 1) % DLINE_BUF_SIZE;
  if (next_head == dline_tail) return;   // buffer full — skip, don't block

  DLineEntry &e = dline_buf[dline_head];

  e.len = (uint8_t)formatDSamplePacket(
    e.str, DLINE_STR_LEN,
    millis(),
    theta1,    theta2,
    theta1_d,  theta2_d,
    dTheta1_f, dTheta2_f,
    dTheta1_d, dTheta2_d,
    last_pwm1,
    theta1_raw, theta2_raw
  );

  dline_head = next_head;
}

// ============================================================
//  drainDLineBuffer — called every loop() iteration
// ============================================================

void drainDLineBuffer() {
  uint8_t drained = 0;
  while (dline_tail != dline_head && drained < 2) {
    DLineEntry &e = dline_buf[dline_tail];
    Serial.write((const uint8_t *)e.str, e.len);
    dline_tail = (dline_tail + 1) % DLINE_BUF_SIZE;
    drained++;
  }
}

// ============================================================
//  emitGains — G-packet
// ============================================================

void emitGains() {
  char buf[128];
  formatGainsPacket(buf, sizeof(buf), Kp1, Ki1, Kd1, Kp2, Ki2, Kd2, 16, FF_INERTIA, FF_CORIOLIS, FF_GRAVITY);
  Serial.print(buf);
}

// ============================================================
//  emitParams — K-packet (22 fields, index 0..21)
// ============================================================

void emitParams() {
  char buf[256];
  formatAdvParamsPacket(
    buf, sizeof(buf),
    V_MAX, A_MAX, CONTROL_FREQ, U1_MAX, FRAC_ZERO_THRESH, PWM_DEADBAND,
    TD1_R, TD2_R, td1.h, DDTH_MAX, DB_ENGAGE, DB_RELEASE, DB_VEL,
    KP_HOLD_SCALE, KD_HOLD_SCALE, INTEGRAL_DECAY, TAU_NOM_J1, M22_REF,
    alpha_tilt * (180.0f / PI), TD_ENABLED ? 1 : 0, TRAP_ENABLED ? 1 : 0, KI2_GATE_RAD,
    DB2_ENGAGE, DB2_RELEASE
  );
  Serial.print(buf);
}

// ============================================================
//  emitPosition — P-packet
// ============================================================

void emitPosition() {
  float x_now, y_now;
  FK(theta1, theta2, x_now, y_now);
  Serial.print("P,");
  Serial.print(x_now * 1000.0f, 3); Serial.print(",");
  Serial.print(y_now * 1000.0f, 3); Serial.print(",");
  Serial.print(theta1, 4);          Serial.print(",");
  Serial.println(theta2, 4);
}

// ============================================================
//  emitQueueStatus — Q-packet
// ============================================================

void emitQueueStatus() {
  Serial.print("Q,");
  Serial.print(pending_move ? 1 : 0);   Serial.print(",");
  Serial.print(pending_x * 1000.0f, 1); Serial.print(",");
  Serial.println(pending_y * 1000.0f, 1);
}

// ============================================================
//  emitFullState — G + K + P + Q + X
// ============================================================

void emitFullState() {
  emitGains();
  emitParams();
  emitPosition();
  emitQueueStatus();
  Serial.print("ESTOP,"); Serial.println(estop_active ? "1" : "0");
  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);
}

// ============================================================
//  serviceSerial — non-blocking RX
// ============================================================

void serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    last_serial_rx_ms = millis();

    if (watchdog_halted) {
      watchdog_halted = false;
      Serial.println("INFO: Serial restored.");
    }

    if (c == '\n' || c == '\r') {
      if (serial_idx > 0) {
        serial_buf[serial_idx] = '\0';
        processSerialCommand(serial_buf);
        serial_idx = 0;
      }
    } else if (serial_idx < (sizeof(serial_buf) - 1)) {
      serial_buf[serial_idx++] = c;
    }
  }
}
