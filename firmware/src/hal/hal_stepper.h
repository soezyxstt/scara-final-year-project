
#pragma once

// ============================================================
//  hal/hal_stepper.h — Stepper motor pulse generation (A4988)
//  Manages STEP_PIN / DIR_PIN logic only. No control math.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Call every loop() iteration — generates step pulses at the
// requested frequency based on step_period_us from RobotState.
void serviceStepperPulse();

// Set the inter-step period in microseconds.
// period_us = 0 → motor stopped.
void setStepPeriod(unsigned long period_us);

// Set step direction pin.
void setStepDir(bool dir);
