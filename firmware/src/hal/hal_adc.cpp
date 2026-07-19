
// ============================================================
//  hal/hal_adc.cpp — ADC reading and potentiometer mapping
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "hal_adc.h"
#include "config.h"
#include <driver/adc.h>

void setupADC() {
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC1_CHANNEL_3, ADC_ATTEN_DB_12); // GPIO39 / J1
  adc1_config_channel_atten(ADC1_CHANNEL_0, ADC_ATTEN_DB_12); // GPIO36 / J2
}

int readRawADC4(int pin) {
  const adc1_channel_t channel =
      (pin == DC_POT_PIN) ? ADC1_CHANNEL_3 : ADC1_CHANNEL_0;
  int s = 0;
  for (int i = 0; i < 4; i++) {
    s += adc1_get_raw(channel);
  }
  return s >> 2;
}

float mapADCtoRadJ1(int adc) {
  // ESP32 has hardware single-precision floating point but evaluates double
  // arithmetic in software. Horner form keeps the calibrated cubic while
  // reducing it to three float multiplies and three float additions.
  const float y = static_cast<float>(adc);
  return ((-2.813562e-11f * y + 1.364894e-07f) * y
          + 8.810620e-04f) * y - 0.776008f;
}

float mapADCtoRadJ2(int adc) {
  const float y = static_cast<float>(adc);
  return ((1.271488e-11f * y - 6.791787e-08f) * y
          + 1.192900e-03f) * y - 1.926119f;
}
