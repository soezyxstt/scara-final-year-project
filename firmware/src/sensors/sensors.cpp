
// ============================================================
//  sensors/sensors.cpp — TD instances + sensor function bodies
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "sensors.h"
#include "config.h"
#include "../state/robot_state.h"
#include "../hal/hal_adc.h"

using namespace RobotState;
using namespace Params;

// Global TD instances
TD td1;
TD td2;

// ============================================================
//  sensorWithTD — default sensor function
// ============================================================

void sensorWithTD() {
  theta1_raw = mapADCtoRadJ1(readRawADC4(DC_POT_PIN));
  theta2_raw = mapADCtoRadJ2(readRawADC4(STEP_POT_PIN));

  td1.update(theta1_raw, DT);
  td2.update(theta2_raw, DT);

  theta1    = td1.v1;
  theta2    = td2.v1;
  dTheta1_f = td1.v2;
  dTheta2_f = td2.v2;
}

// ============================================================
//  sensorRawOnly — TD bypass (MODE_TEST with TD_ENABLED=false)
// ============================================================

void sensorRawOnly() {
  theta1_raw = mapADCtoRadJ1(readRawADC4(DC_POT_PIN));
  theta2_raw = mapADCtoRadJ2(readRawADC4(STEP_POT_PIN));

  theta1 = theta1_raw;
  theta2 = theta2_raw;

  dTheta1_f = constrain((theta1_raw - theta1_raw_prev) / DT,
                        -DTHETA_RAW_CLAMP, DTHETA_RAW_CLAMP);
  dTheta2_f = constrain((theta2_raw - theta2_raw_prev) / DT,
                        -DTHETA_RAW_CLAMP, DTHETA_RAW_CLAMP);

  theta1_raw_prev = theta1_raw;
  theta2_raw_prev = theta2_raw;
}
