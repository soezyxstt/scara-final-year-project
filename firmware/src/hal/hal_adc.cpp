
// ============================================================
//  hal/hal_adc.cpp — ADC reading and potentiometer mapping
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "hal_adc.h"
#include "config.h"

int readRawADC4(int pin) {
  int s = 0;
  for (int i = 0; i < 4; i++) {
    s += analogRead(pin);
  }
  return s >> 2;
}

float mapADCtoRadJ1(int adc) {
  if (adc <= J1_RAW_90)
    return (float)(adc - J1_RAW_0) * (PI / 2.0f)
           / (float)(J1_RAW_90 - J1_RAW_0);
  return (PI / 2.0f)
       + (float)(adc - J1_RAW_90) * (PI / 2.0f)
         / (float)(J1_RAW_180 - J1_RAW_90);
}

float mapADCtoRadJ2(int adc) {
  if (adc <= J2_RAW_0)
    return (-PI / 2.0f)
         + (float)(adc - J2_RAW_N90) * (PI / 2.0f)
           / (float)(J2_RAW_0 - J2_RAW_N90);
  return (float)(adc - J2_RAW_0) * (PI / 2.0f)
         / (float)(J2_RAW_P90 - J2_RAW_0);
}
