
#pragma once

// ============================================================
//  sensors/sensors.h — Tracking Differentiator + sensor functions
//  TD struct lives here. sensorWithTD / sensorRawOnly are the
//  two interchangeable sensor function implementations.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// ============================================================
//  Tracking Differentiator
//  v1 = filtered position, v2 = estimated velocity
//  r  = bandwidth (higher → faster tracking, more noise)
//  h  = 3*DT (set on init; do not modify manually)
// ============================================================

struct TD {
  float v1 = 0.0f;
  float v2 = 0.0f;
  float r  = 50.0f;
  float h  = 0.002f;

  void init(float pos, float bandwidth, float dt) {
    v1 = pos;
    v2 = 0.0f;
    r  = bandwidth;
    h  = dt;
  }

  void update(float x0, float dt) {
    float d  = h * r;
    float y  = v1 - x0 + h * v2;
    float a0 = sqrtf(d * d + 8.0f * r * fabsf(y));
    float a  = (fabsf(y) <= (d * h))
               ? (v2 + y / h)
               : (v2 + 0.5f * (a0 - d) * (y > 0.0f ? 1.0f : -1.0f));
    float fh = (fabsf(a) <= d) ? (a / d) : (a > 0.0f ? 1.0f : -1.0f);
    v1 += dt * v2;
    v2 -= r * dt * fh;
  }
};

// Global TD instances (accessed by cmd_parser for re-init on tden command)
extern TD td1;
extern TD td2;

// ============================================================
//  Sensor function variants (match SensorFn typedef in scheduler.h)
// ============================================================

// 4-sample ADC + TD update. theta/dTheta from TD outputs.
void sensorWithTD();

// 4-sample ADC, theta = raw, dTheta = finite-difference with clamp.
void sensorRawOnly();

// Compute J1 velocity from encoder
void updateEncoder();
