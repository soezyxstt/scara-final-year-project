
#pragma once

// ============================================================
//  config.h — Compile-time constants only
//  No mutable state, no runtime-tunable values here.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>   // for PI, etc.

// ------------------------------------------------------------
//  PIN DEFINITIONS
// ------------------------------------------------------------

#define STEP_POT_PIN  36
#define DC_POT_PIN    39
#define STEP_PIN      14
#define DIR_PIN       12
#define DC_IN3        16
#define DC_IN4        17
#define DC_EN         18
#define MS1           33
#define MS2           32
#define MS3           35   // WARNING: GPIO35 is input-only on DevKit V1.
                           // Re-wire to GPIO 25/26/27 if MS3 must be driven.

// ------------------------------------------------------------
//  LEDC (PWM) CONFIGURATION
// ------------------------------------------------------------

#define LEDC_CHANNEL  0
#define LEDC_FREQ     1000   // Hz
#define LEDC_RES      8      // bits → duty 0–255

// ------------------------------------------------------------
//  ROBOT GEOMETRY [m]
// ------------------------------------------------------------

constexpr float L1 = 0.100f;
constexpr float L2 = 0.070f;
constexpr float L_INNER = 0.0707f; // 70.7 mm inner singularity radius

// ------------------------------------------------------------
//  DYNAMIC MODEL PARAMETERS
// ------------------------------------------------------------

constexpr float m1        = 0.360f;
constexpr float m2        = 0.15546f;
constexpr float d1        = 0.04454f;
constexpr float d2        = 0.01478f;
constexpr float Izz1_link = 1.357e-5f;
constexpr float Izz2_link = 1.264e-6f;
constexpr float g_accel   = 9.81f;

// ------------------------------------------------------------
//  MOTOR & TRANSMISSION CONSTANTS
// ------------------------------------------------------------

constexpr float Kt      = 6.005e-3f;   // N·m/A (JGA25-370: 8.2 kg·cm stall @ 1.3 A, 103:1)
constexpr float Ra      = 9.23f;        // Ω
constexpr float V_nom   = 12.0f;        // V
constexpr float DC_gear = 103.0f;       // internal gear ratio
constexpr float N1_gear = 2.0f;         // external belt/pulley
constexpr float N2_gear = 2.0f;         // stepper external
constexpr float N_eff1  = DC_gear * N1_gear;   // = 206.0
constexpr float N_eff2  = N2_gear;             // = 2.0
constexpr float Jm_DC   = 1.5e-7f;     // kg·m²
constexpr float Jm_step = 3.0e-7f;     // kg·m²

constexpr float Izz1 = Izz1_link + N_eff1 * N_eff1 * Jm_DC;
constexpr float Izz2 = Izz2_link + N_eff2 * N_eff2 * Jm_step;

// Stall torque at joint 1 output [N·m]
constexpr float TAU_STALL_J1 = Kt * (V_nom / Ra) * N_eff1;  // ≈ 1.608 Nm (0.804 @ gearbox × 2:1 belt)

// ------------------------------------------------------------
//  STEPPER CONSTANTS
// ------------------------------------------------------------

constexpr float STEPS_PER_RAD  = (200.0f * 16.0f * N_eff2) / (2.0f * PI);
constexpr float STEPPER_MAX_HZ = 500.0f;
constexpr float STEPPER_MIN_HZ = 6.0f;

// ------------------------------------------------------------
//  PWM LIMITS
// ------------------------------------------------------------

constexpr int PWM_MAX = 255;

// ------------------------------------------------------------
//  ADC CALIBRATION — potentiometer raw counts
// ------------------------------------------------------------

constexpr int J1_RAW_0   = 851;
constexpr int J1_RAW_90  = 2301;
constexpr int J1_RAW_180 = 4095;

constexpr int J2_RAW_N90 = 198;
constexpr int J2_RAW_0   = 1522;
constexpr int J2_RAW_P90 = 2852;

// ------------------------------------------------------------
//  TELEMETRY & SERIAL
// ------------------------------------------------------------

constexpr unsigned long TELEMETRY_MS        = 20UL;   // 50 Hz for E/F/T
constexpr unsigned long SERIAL_WATCHDOG_MS  = 3000UL;

// ------------------------------------------------------------
//  D-LINE RING BUFFER SIZING
// ------------------------------------------------------------

#define DLINE_BUF_SIZE  8
#define DLINE_STR_LEN   192
