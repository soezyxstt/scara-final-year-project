
#pragma once

// ============================================================
//  hal/hal_adc.h — ADC reading and potentiometer mapping
//  4-sample averaging, third-order polynomial angle mapping.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Configure the two ADC1 channels once during setup. Runtime reads then bypass
// Arduino's repeated pin-attach/configuration path.
void setupADC();

// Read pin with 4 accumulated samples and arithmetic right-shift by 2.
int readRawADC4(int pin);

// Third-order polynomial ADC → angle mapping for Joint 1 [rad].
float mapADCtoRadJ1(int adc);

// Third-order polynomial ADC → angle mapping for Joint 2 [rad].
float mapADCtoRadJ2(int adc);
