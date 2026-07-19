
// ============================================================
//  src/main.cpp — setup() and loop() only
//  2-DOF Planar SCARA — CTC + PID
//  Adi Haditya Nursyam — Tugas Sarjana, ITB 2026
//  ESP32 DevKit V1  |  Arduino Core 2.x / 3.x
// ============================================================

#include <Arduino.h>

#include "config.h"
#include "state/robot_state.h"
#include "hal/hal_dc.h"
#include "hal/hal_stepper.h"
#include "hal/hal_adc.h"
#include "kinematics/kinematics.h"
#include "sensors/sensors.h"
#include "trajectory/trajectory.h"
#include "scheduler/scheduler.h"
#include "comms/serial_protocol.h"
#include "comms/telemetry_autogen.h"

using namespace RobotState;
using namespace TrajState;
using namespace CtcState;
using namespace Params;

// ============================================================
//  setup
// ============================================================

void setup() {
  Serial.setTxBufferSize(1024);
  Serial.begin(921600);
  delay(100);
  while (Serial.available()) Serial.read();   // flush boot noise

  // --- GPIO direction ---
  pinMode(DC_IN3,   OUTPUT);
  pinMode(DC_IN4,   OUTPUT);
  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN,  OUTPUT);
  pinMode(MS1,      OUTPUT);
  pinMode(MS2,      OUTPUT);
  pinMode(MS3,      OUTPUT);

  // --- Initial output states ---
  digitalWrite(MS1,      HIGH);   // MS3 (GPIO35) is input-only → stays LOW
  digitalWrite(MS2,      HIGH);   // → physical microstep is 1/8, see STEPPER_MSTEP
  digitalWrite(MS3,      HIGH);
  digitalWrite(DC_IN3,   LOW);
  digitalWrite(DC_IN4,   LOW);
  digitalWrite(STEP_PIN, LOW);
  digitalWrite(DIR_PIN,  LOW);

  pwmSetup();
  pwmWrite(0);
  setupADC();
  delay(200);

  // --- Seed TD and state from 8-sample ADC average ---
  {
    // Average two 4-sample reads per channel to retain the 8-sample boot seed.
    const int raw1 = (readRawADC4(DC_POT_PIN) + readRawADC4(DC_POT_PIN)) >> 1;
    const int raw2 = (readRawADC4(STEP_POT_PIN) + readRawADC4(STEP_POT_PIN)) >> 1;
    float seed1 = mapADCtoRadJ1(raw1);
    float seed2 = mapADCtoRadJ2(raw2);

    theta1 = theta1_raw = theta1_d = seed1;
    theta2 = theta2_raw = theta2_d = seed2;
    theta1_raw_prev = seed1;
    theta2_raw_prev = seed2;

    td1.init(seed1, TD1_R, DT);
    td2.init(seed2, TD2_R, DT);

    dTheta1_f = dTheta2_f = 0.0f;
    dTheta1_d = dTheta2_d = 0.0f;
    ddTheta1_d = ddTheta2_d = 0.0f;
    dTheta1_d_prev_acc = dTheta2_d_prev_acc = 0.0f;
  }

  // --- Runtime state init ---
  integral1     = 0.0f;
  integral2     = 0.0f;
  motor1_active = false;
  last_pwm1     = 0;
  estop_active  = false;
  pending_move  = false;

  elbow_config = (theta2 > 0.009f) ? 1 : ((theta2 < -0.009f) ? -1 : 1);

  // Set traj endpoint to current FK position
  float x_init, y_init;
  FK(theta1, theta2, x_init, y_init);
  traj_xf = traj_x_cmd = x_init;
  traj_yf = traj_y_cmd = y_init;

  // --- Boot into MODE_IDLE — assign function pointers manually ---
  // (cannot call transitionToMode here because allOutputsOff
  //  assumes hardware already initialized — it is, but the
  //  mode guard would also re-emit state before Serial is settled)
  op_mode           = MODE_IDLE;
  active_sensor_fn  = sensorWithTD;
  active_desired_fn = desiredIdle;
  active_output_fn  = outputIdle;

  // --- Boot message ---
  Serial.println("==========================================");
  Serial.println("  SCARA Robot   |  Experiment Mode        ");
  Serial.println("  Adi Haditya Nursyam — ITB 2026           ");
  Serial.println("==========================================");
  Serial.println("INFO: Idle Mode.");

  emitPosition();
  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);

  last_serial_rx_ms = millis();
  last_control_us   = micros();
  last_step_us      = micros();
}

// ============================================================
//  loop
// ============================================================

void loop() {
  unsigned long now_us = micros();
  unsigned long now_ms = millis();

  // --- Serial watchdog ---
  if (op_mode != MODE_IDLE
      && (now_ms - last_serial_rx_ms) > SERIAL_WATCHDOG_MS) {
    watchdog_halted = true;
    Serial.println("WARN: Serial watchdog timeout — masuk MODE_IDLE.");
    transitionToMode(MODE_IDLE);
  }

  // --- Control tick at CONTROL_FREQ ---
  if (now_us - last_control_us >= (1000000UL / (unsigned long)CONTROL_FREQ)) {
    last_control_us = now_us;
    runControlLoop();
  }

  // --- Stepper pulse (free-running, micros resolution) ---
  serviceStepperPulse();

  // --- Non-blocking FFT transfer has UART priority while active ---
  serviceFFTDump();

  // Do not interleave ordinary telemetry with an FFT frame sequence. The
  // control loop still runs; only non-essential serial output is deferred.
  if (!isFFTDumpActive()) {
    drainDLineBuffer();
  }

  // --- Serial RX ---
  serviceSerial();

  // --- Non-blocking dbtest timer ---
  if (dbtest_active && (now_ms - dbtest_start_ms >= 400)) {
    pwmWrite(0);
    digitalWrite(DC_IN3, LOW); digitalWrite(DC_IN4, LOW);
    dbtest_active = false;
    Serial.println("SUCCESS: dbtest selesai.");
  }

  // --- Telemetry E / F / T at 50 Hz ---
  // Suppressed in ZN mode: the ZN tuner/analysis views read everything they
  // need from the D-line (position, raw ADC, velocity). E (J1 PID effort),
  // F (CTC terms) and T (cartesian trace) are SCARA-oriented and unused during
  // ZN tuning. Streaming them there ~2.5x's the serial LINE rate the browser
  // must parse; the parser falls behind, telemetry backs up in the OS/UART
  // buffer, and the plot plays old samples in slow motion ("stretched time").
  // availableForWrite guard: the E/F/T burst is ~210 bytes of Serial.print
  // calls. If the UART TX buffer can't take it, those calls BLOCK until the
  // (slow) HMI drains the link — stalling loop() and the fixed-rate control
  // tick, which undersamples motion and stretches the plotted timeline. Skip
  // this telemetry cycle instead; control timing must never wait on the HMI.
  if (!isFFTDumpActive()
      && op_mode != MODE_IDLE && op_mode != MODE_ZN && !estop_active
      && (now_ms - last_telemetry_ms >= TELEMETRY_MS)
      && Serial.availableForWrite() >= 256) {
    last_telemetry_ms = now_ms;

    float x_act, y_act;
    FK(theta1, theta2, x_act, y_act);

    // [E] PID effort + loop duration
    float effort_to_pwm = (float)PWM_MAX / U1_MAX;
    Serial.print("E,");
    Serial.print(now_ms);                          Serial.print(",");
    Serial.print(p1_out * effort_to_pwm, 1);       Serial.print(",");
    Serial.print(i1_out * effort_to_pwm, 1);       Serial.print(",");
    Serial.print(d1_out * effort_to_pwm, 1);       Serial.print(",");
    Serial.println(loop_duration_us);

    // [F] CTC components + integral2
    Serial.print("F,");
    Serial.print(now_ms);                          Serial.print(",");
    const float BLEND_EPS = 1e-6f;
    float ctc_inertia1_blend = (fabsf(FF_INERTIA) < BLEND_EPS) ? 0.0f : FF_INERTIA * ctc_inertia1;
    float ctc_coriolis1_blend = (fabsf(FF_CORIOLIS) < BLEND_EPS) ? 0.0f : FF_CORIOLIS * ctc_coriolis1;
    float ctc_gravity1_blend = (fabsf(FF_GRAVITY) < BLEND_EPS) ? 0.0f : FF_GRAVITY * ctc_gravity1;
    float ctc_inertia2_blend = (fabsf(FF_INERTIA) < BLEND_EPS) ? 0.0f : FF_INERTIA * ctc_inertia2;
    float ctc_coriolis2_blend = (fabsf(FF_CORIOLIS) < BLEND_EPS) ? 0.0f : FF_CORIOLIS * ctc_coriolis2;
    float ctc_gravity2_blend = (fabsf(FF_GRAVITY) < BLEND_EPS) ? 0.0f : FF_GRAVITY * ctc_gravity2;

    Serial.print(ctc_inertia1_blend, 5);
    Serial.print(",");
    Serial.print(ctc_coriolis1_blend, 5);
    Serial.print(",");
    Serial.print(ctc_gravity1_blend, 5);
    Serial.print(",");
    Serial.print(ctc_inertia2_blend, 5);
    Serial.print(",");
    Serial.print(ctc_coriolis2_blend, 5);
    Serial.print(",");
    Serial.print(ctc_gravity2_blend, 5);
    Serial.print(",");
    Serial.print(ff1_contrib_out, 4);              Serial.print(",");
    Serial.print(u1_total_out,    4);              Serial.print(",");
    Serial.print(integral1,       4);              Serial.print(",");
    Serial.print(delta_omega_ff_out, 4);           Serial.print(",");
    Serial.print(omega2_raw_out,  4);              Serial.print(",");
    Serial.println(integral2,     4);

    // [T] Cartesian tracking — schema-generated format (shared/telemetry).
    // Carries the same now_ms timebase as E/F so the HMI can detect
    // dropped/delayed frames and time-align against D samples.
    char tline[80];
    int tlen = formatTPointPacket(tline, sizeof(tline),
                                  now_ms,
                                  traj_x_cmd * 1000.0f, traj_y_cmd * 1000.0f,
                                  x_act * 1000.0f,      y_act * 1000.0f);
    if (tlen > 0) Serial.write((const uint8_t *)tline, tlen);
  }
}
