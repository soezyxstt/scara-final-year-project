
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
  if (adc <= J1_RAW_45) {
    return (float)(adc - J1_RAW_0) * (PI / 4.0f)
           / (float)(J1_RAW_45 - J1_RAW_0);
  } else if (adc <= J1_RAW_90) {
    return (PI / 4.0f)
           + (float)(adc - J1_RAW_45) * (PI / 4.0f)
             / (float)(J1_RAW_90 - J1_RAW_45);
  } else if (adc <= J1_RAW_135) {
    return (PI / 2.0f)
           + (float)(adc - J1_RAW_90) * (PI / 4.0f)
             / (float)(J1_RAW_135 - J1_RAW_90);
  } else {
    return (3.0f * PI / 4.0f)
           + (float)(adc - J1_RAW_135) * (PI / 4.0f)
             / (float)(J1_RAW_180 - J1_RAW_135);
  }
}

float mapADCtoRadJ2(int adc) {
  if (adc <= J2_RAW_N45) {
    return (-PI / 2.0f)
           + (float)(adc - J2_RAW_N90) * (PI / 4.0f)
             / (float)(J2_RAW_N45 - J2_RAW_N90);
  } else if (adc <= J2_RAW_0) {
    return (-PI / 4.0f)
           + (float)(adc - J2_RAW_N45) * (PI / 4.0f)
             / (float)(J2_RAW_0 - J2_RAW_N45);
  } else if (adc <= J2_RAW_P45) {
    return (float)(adc - J2_RAW_0) * (PI / 4.0f)
           / (float)(J2_RAW_P45 - J2_RAW_0);
  } else {
    return (PI / 4.0f)
           + (float)(adc - J2_RAW_P45) * (PI / 4.0f)
             / (float)(J2_RAW_P90 - J2_RAW_P45);
  }
}
