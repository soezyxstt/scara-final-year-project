
// ============================================================
//  hal/hal_dc.cpp — DC motor H-bridge (L298N) implementation
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "hal_dc.h"
#include "config.h"

void pwmSetup() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(DC_EN, LEDC_FREQ, LEDC_RES);
#else
  ledcSetup(LEDC_CHANNEL, LEDC_FREQ, LEDC_RES);
  ledcAttachPin(DC_EN, LEDC_CHANNEL);
#endif
}

void pwmWrite(uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(DC_EN, duty);
#else
  ledcWrite(LEDC_CHANNEL, duty);
#endif
}

void setDCDirection(int pwm_signed) {
  if      (pwm_signed > 0) {
    digitalWrite(DC_IN3, HIGH);
    digitalWrite(DC_IN4, LOW);
  }
  else if (pwm_signed < 0) {
    digitalWrite(DC_IN3, LOW);
    digitalWrite(DC_IN4, HIGH);
  }
  else {
    digitalWrite(DC_IN3, LOW);
    digitalWrite(DC_IN4, LOW);
  }
  pwmWrite((uint32_t)abs(pwm_signed));
}
