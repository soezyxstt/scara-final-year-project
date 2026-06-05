
#pragma once

// ============================================================
//  hal/hal_dc.h — DC motor H-bridge (L298N) interface
//  LEDC PWM setup and signed-PWM output. No control math.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Setup LEDC channel for DC_EN pin.
void pwmSetup();

// Write raw duty cycle [0–255] to LEDC.
void pwmWrite(uint32_t duty);

// Decompose signed PWM into direction + magnitude.
// pwm_signed > 0 → forward, < 0 → reverse, 0 → coast (both LOW).
void setDCDirection(int pwm_signed);
