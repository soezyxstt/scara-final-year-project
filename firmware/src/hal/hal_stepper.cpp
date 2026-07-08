
// ============================================================
//  hal/hal_stepper.cpp — Stepper motor pulse generation
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "hal_stepper.h"
#include "config.h"
#include "../state/robot_state.h"

using namespace RobotState;

void serviceStepperPulse() {
  if (estop_active || step_period_us == 0) return;

  unsigned long now_us = micros();
  if (now_us - last_step_us >= step_period_us) {
    last_step_us = now_us;
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(2);
    digitalWrite(STEP_PIN, LOW);
    step_pulse_count++;
  }
}

void setStepPeriod(unsigned long period_us) {
  step_period_us = period_us;
}

void setStepDir(bool dir) {
  digitalWrite(DIR_PIN, dir ? HIGH : LOW);
}
