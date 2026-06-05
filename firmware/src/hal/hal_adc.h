
#pragma once

// ============================================================
//  hal/hal_adc.h — ADC reading and potentiometer mapping
//  4-sample averaging, piecewise-linear angle mapping.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Read pin with 4 accumulated samples and arithmetic right-shift by 2.
int readRawADC4(int pin);

// Piecewise-linear ADC → angle mapping for Joint 1 [rad].
float mapADCtoRadJ1(int adc);

// Piecewise-linear ADC → angle mapping for Joint 2 [rad].
float mapADCtoRadJ2(int adc);
