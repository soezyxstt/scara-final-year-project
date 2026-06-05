// ============================================================
//  2-DOF PLANAR SCARA — CTC + PID
//  Adi Haditya Nursyam — Tugas Sarjana, ITB 2026
//  ESP32 DevKit V1  |  Arduino Core 2.x / 3.x
// ============================================================
//
// CHANGELOG Rev15 → Rev16
// ----------------------------------------------------------
//  [ARCH] Tambah MODE_TEST (enum index 3) — identik eksekusi
//         dengan MODE_SCARA tetapi semua parameter terbuka
//         via serial. MODE_SCARA dikunci ke gains + ff + move.
//  [ARCH] Function pointer tiga slot (sensor_fn, desired_fn,
//         output_fn) di-assign saat transitionToMode() sehingga
//         runControlLoop() bebas if-check per-tick.
//  [FEAT] FF decomposition: FF_INERTIA, FF_CORIOLIS, FF_GRAVITY
//         menggantikan FF1_BLEND / FF2_BLEND (deprecated).
//         Command: ffi,  ffc,  ffg,
//  [FEAT] alpha_tilt diubah dari const → float, runtime-tunable.
//         Command: atilt,<deg>
//  [FEAT] G term ditambahkan ke computeCTC() dengan alpha_tilt.
//         ctc_inertia1/2, ctc_coriolis1/2, ctc_gravity1/2
//         sebagai output terpisah untuk telemetri.
//  [FEAT] TD toggle (MODE_TEST only): tden,1/0
//         Off = total bypass TD, posisi dari raw ADC,
//         velocity dari finite difference dengan clamp.
//         Re-enable otomatis seed TD dari raw.
//  [FEAT] Trajectory profile toggle (MODE_TEST only): trapen,1/0
//         Off = constant velocity Cartesian lerp (traj_ta=traj_tc=0,
//         traj_tf=D/V_MAX). getTrajPoint/Velocity/Accel otomatis
//         degenerasi — tidak ada if-check di dalam fungsi.
//  [FEAT] Ki2 gated untuk stepper: aktif hanya saat !is_moving
//         dan |e2| < KI2_GATE_RAD. Freeze (bukan reset) saat moving.
//         Command: ki2,  ki2g,
//  [FIX]  Seed dTheta_d_prev_acc di startTrajectory() sebelum
//         tick pertama — menghilangkan spike ddθ pada t=0.
//         Trapesium: seed = 0 (mulai diam).
//         Constant vel: seed dari Jacobian di posisi start × V_MAX.
//  [FIX]  D-line 500 Hz via ring buffer 8 entry — Serial.print
//         dipindah ke drainDLineBuffer() di loop(), bukan di
//         runControlLoop(). Timestamp di-capture saat control tick.
//  [TELEM] F-packet diperluas: 6 CTC komponen + integral2
//  [TELEM] G-packet: FF_INERTIA, FF_CORIOLIS, FF_GRAVITY + Ki2
//  [TELEM] K-packet: tambah alpha_tilt_deg, TD_ENABLED,
//          TRAP_ENABLED, KI2_GATE_RAD
//  [SAFE]  Guard tden, dan trapen, hanya di MODE_TEST dan
//          hanya saat !is_moving.
// ============================================================

// ============================================================
//  SECTION 1 — PIN & HARDWARE
// ============================================================

#define STEP_POT_PIN 36
#define DC_POT_PIN   39
#define STEP_PIN     14
#define DIR_PIN      12
#define DC_IN3       16
#define DC_IN4       17
#define DC_EN        18
#define MS1          33
#define MS2          32
#define MS3          35  // WARNING: GPIO35 input-only pada DevKit V1.
                         // Re-wire ke GPIO 25/26/27 jika MS3 harus di-drive.

#define LEDC_CHANNEL 0
#define LEDC_FREQ    1000  // Hz
#define LEDC_RES     8     // bit → duty 0–255

// ============================================================
//  SECTION 2 — OPERATING MODE STATE MACHINE
// ============================================================

enum OperatingMode {
  MODE_IDLE  = 0,  // Boot state. Semua output zero.
  MODE_SCARA = 1,  // Trajectory + CTC + PID. Hanya gains/ff/move.
  MODE_ZN    = 2,  // Joint-space step + PID only. ZN tuning.
  MODE_TEST  = 3   // Identik SCARA secara eksekusi, semua param terbuka.
};

OperatingMode op_mode = MODE_IDLE;

const char *MODE_NAMES[] = { "IDLE", "SCARA", "ZN", "TEST" };

// ============================================================
//  SECTION 3 — LEDC WRAPPER
// ============================================================

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

// ============================================================
//  SECTION 4 — GEOMETRI ROBOT
// ============================================================

const float L1 = 0.100f;  // m
const float L2 = 0.070f;  // m

// ============================================================
//  SECTION 5 — PARAMETER MODEL DINAMIK
// ============================================================

const float m1       = 0.360f;
const float m2       = 0.15546f;
const float d1       = 0.04454f;
const float d2       = 0.01478f;
const float Izz1_link = 1.357e-5f;
const float Izz2_link = 1.264e-6f;
const float g_accel  = 9.81f;

// alpha_tilt: kemiringan base dari horizontal [rad]
// Runtime-tunable via "atilt,<deg>". Hanya masuk ke G term.
float alpha_tilt = 0.0f;

// ============================================================
//  SECTION 6 — PARAMETER MOTOR & TRANSMISI
// ============================================================

const float Kt      = 6.005e-4f;   // N·m/A
const float Ra      = 9.23f;        // Ω
const float V_nom   = 12.0f;        // V
const float DC_gear = 103.0f;       // gear ratio internal motor
const float N1_gear = 2.0f;         // belt/pulley eksternal — konfirmasi fisik
const float N2_gear = 2.0f;         // stepper eksternal
const float N_eff1  = DC_gear * N1_gear;   // = 206.0
const float N_eff2  = N2_gear;             // = 2.0
const float Jm_DC   = 1.5e-7f;     // kg·m² — asumsi sementara
const float Jm_step = 3.0e-7f;
const float Izz1    = Izz1_link + N_eff1 * N_eff1 * Jm_DC;
const float Izz2    = Izz2_link + N_eff2 * N_eff2 * Jm_step;
const float TAU_STALL_J1 = Kt * (V_nom / Ra) * N_eff1;  // ≈ 0.1607 N·m

float TAU_NOM_J1 = 0.03f;
float M22_REF    = 2.464e-6f;

// ============================================================
//  SECTION 7 — PARAMETER STEPPER
// ============================================================

const float STEPS_PER_RAD  = (200.0f * 16.0f * N_eff2) / (2.0f * PI);
const float STEPPER_MAX_HZ = 500.0f;
const float STEPPER_MIN_HZ = 6.0f;

// ============================================================
//  SECTION 8 — TIMING LOOP KONTROL
// ============================================================

int   CONTROL_FREQ    = 500;
float DT              = 1.0f / 500;
unsigned long last_control_us = 0;

// ============================================================
//  SECTION 9 — PARAMETER TRAJEKTORI
// ============================================================

float V_MAX = 0.035f;  // m/s
float A_MAX = 0.06f;   // m/s²

// TRAP_ENABLED: true = trapesium, false = constant velocity lerp
// Constant vel: traj_ta=0, traj_tc=0, traj_tf=D/V_MAX
// getTrajPoint/Velocity/Accel degenerasi otomatis — tidak ada if di dalamnya
bool TRAP_ENABLED = true;

// ============================================================
//  SECTION 10 — PARAMETER PWM DC MOTOR
// ============================================================

int   PWM_DEADBAND    = 70;
float FRAC_ZERO_THRESH = 0.01f;
const int PWM_MAX     = 255;
float U1_MAX          = 1.0f;

// ============================================================
//  SECTION 11 — CTC FF BLEND (decomposed)
// ============================================================
//
// FF_INERTIA  → skala M·ddθ  (kedua joint)
// FF_CORIOLIS → skala C term (kedua joint)
// FF_GRAVITY  → skala G term (kedua joint)
//
// FF1_BLEND / FF2_BLEND lama → DEPRECATED, dihapus.
// Command: ffi,<0-1>  ffc,<0-1>  ffg,<0-1>

float FF_INERTIA  = 0.0f;
float FF_CORIOLIS = 0.0f;
float FF_GRAVITY  = 0.0f;

// ============================================================
//  SECTION 12 — GAIN PID
// ============================================================

float Kp1 = 0.6f;
float Ki1 = 0.03f;
float Kd1 = 0.02f;
float Kp2 = 4.0f;
float Ki2 = 0.005f;
float Kd2 = 0.1f;

// Ki2 gate: integrator J2 hanya aktif saat hold dan |e2| < gate
float KI2_GATE_RAD = 0.05f;

// ============================================================
//  SECTION 13 — TRACKING DIFFERENTIATOR
// ============================================================
//
// v1 = posisi smooth,  v2 = kecepatan
// r  = bandwidth (tunable), h = 3×DT (jangan diubah manual)
//
// TD_ENABLED: true = aktif (default)
//             false = total bypass (TEST only)
//             Bypass: theta = raw ADC, dTheta = finite diff + clamp

struct TD {
  float v1 = 0.0f;
  float v2 = 0.0f;
  float r  = 50.0f;
  float h  = 0.006f;

  void init(float pos, float bandwidth, float dt) {
    v1 = pos;
    v2 = 0.0f;
    r  = bandwidth;
    h  = 3.0f * dt;
  }

  void update(float x0, float dt) {
    float d  = h * r;
    float e  = v1 - x0;
    float a0 = sqrtf(d * d + 8.0f * r * fabsf(e));
    float a  = (fabsf(e) <= (d * h))
               ? (v2 + e / h)
               : (v2 + 0.5f * (a0 - d) * (e > 0.0f ? 1.0f : -1.0f));
    float fh = (fabsf(a) <= d) ? (a / d) : (a > 0.0f ? 1.0f : -1.0f);
    v1 += dt * v2;
    v2 -= r * dt * fh;
  }
};

TD td1;
TD td2;

float TD1_R = 30.0f;
float TD2_R = 30.0f;

bool  TD_ENABLED        = true;
float theta1_raw_prev   = 0.0f;
float theta2_raw_prev   = 0.0f;
float DTHETA_RAW_CLAMP  = 5.0f;  // rad/s — clamp FD velocity saat TD off

// ============================================================
//  SECTION 14 — DEADBAND HOLD MODE J1
// ============================================================

float DB_ENGAGE      = 0.008f;
float DB_RELEASE     = 0.004f;
float DB_VEL         = 0.15f;
int   MOTOR1_MIN_TICKS = 5;
float DTERM_MAX      = 1.0f;

// ============================================================
//  SECTION 15 — DUAL GAIN (tracking vs hold)
// ============================================================

float KP_HOLD_SCALE = 0.60f;
float KD_HOLD_SCALE = 1.80f;

// ============================================================
//  SECTION 16 — INTEGRATOR DECAY
// ============================================================

float INTEGRAL_DECAY = 0.004f;

// ============================================================
//  SECTION 17 — CLAMP TURUNAN DESIRED
// ============================================================

float DDTH_MAX = 10.0f;

// ============================================================
//  SECTION 18 — KALIBRASI ADC POTENTIOMETER
// ============================================================

static const int J1_RAW_0   = 851;
static const int J1_RAW_90  = 2301;
static const int J1_RAW_180 = 4095;
static const int J2_RAW_N90 = 198;
static const int J2_RAW_0   = 1522;
static const int J2_RAW_P90 = 2852;

// ============================================================
//  SECTION 19 — STATE TERUKUR
// ============================================================

float theta1     = 0.0f, theta2     = 0.0f;
float theta1_raw = 0.0f, theta2_raw = 0.0f;
float dTheta1_f  = 0.0f, dTheta2_f  = 0.0f;

float integral1  = 0.0f;
float integral2  = 0.0f;

bool  motor1_active   = false;
int   motor1_on_ticks = 0;
int   last_pwm1       = 0;

float p1_out = 0.0f, i1_out = 0.0f, d1_out = 0.0f;
unsigned long loop_duration_us = 0;

// ============================================================
//  SECTION 20 — STATE DESIRED & TELEMETRI CTC
// ============================================================

float theta1_d   = 0.0f, theta2_d   = 0.0f;
float dTheta1_d  = 0.0f, dTheta2_d  = 0.0f;
float ddTheta1_d = 0.0f, ddTheta2_d = 0.0f;

// CTC komponen terpisah — untuk telemetri dan perhitungan FF
float ctc_inertia1  = 0.0f, ctc_coriolis1  = 0.0f, ctc_gravity1  = 0.0f;
float ctc_inertia2  = 0.0f, ctc_coriolis2  = 0.0f, ctc_gravity2  = 0.0f;

// Output telemetri
float u1_total_out     = 0.0f;
float ff1_contrib_out  = 0.0f;
float omega2_raw_out   = 0.0f;
float delta_omega_ff_out = 0.0f;

// ============================================================
//  SECTION 21 — STATE TRAJEKTORI
// ============================================================

bool  is_moving      = false;
float traj_x0        = 0.0f, traj_y0 = 0.0f;
float traj_xf        = 0.0f, traj_yf = 0.0f;
float traj_D         = 0.0f;
float traj_ta        = 0.0f;  // 0 saat constant vel
float traj_tc        = 0.0f;  // 0 saat constant vel
float traj_tf        = 0.0f;
float traj_da        = 0.0f;
float traj_ux        = 0.0f, traj_uy = 1.0f;
float t_traj         = 0.0f;
float traj_x_cmd     = 0.0f, traj_y_cmd = 0.0f;
int   elbow_config   = 1;

bool  traj_time_done  = false;

float SETTLE_ERR_RAD   = 0.01f;
int   settle_ticks     = 0;
int   SETTLE_TICKS_REQ = 20;
float TRAJ_MAX_OVERTIME = 5.0f;

// ============================================================
//  SECTION 22 — MOVE QUEUE
// ============================================================

bool  pending_move = false;
float pending_x    = 0.0f;
float pending_y    = 0.0f;

// ============================================================
//  SECTION 23 — STEPPER STATE
// ============================================================

unsigned long last_step_us    = 0;
unsigned long step_period_us  = 0;
float omega2_prev             = 0.0f;
float OMEGA2_RATE_LIMIT       = 4.0f;

// ============================================================
//  SECTION 24 — D-LINE RING BUFFER (500 Hz, non-blocking TX)
// ============================================================
//
// Control tick menulis snapshot ke ring buffer.
// loop() drain buffer ke UART via drainDLineBuffer().
// Ini memisahkan timing control dari latency Serial TX.

#define DLINE_BUF_SIZE 8
#define DLINE_STR_LEN  96

struct DLineEntry {
  char  str[DLINE_STR_LEN];
  uint8_t len;
};

static DLineEntry dline_buf[DLINE_BUF_SIZE];
static volatile uint8_t dline_head = 0;  // ditulis oleh control tick
static volatile uint8_t dline_tail = 0;  // dibaca oleh drainDLineBuffer

// ============================================================
//  SECTION 25 — TELEMETRI TIMING
// ============================================================

unsigned long last_telemetry_ms = 0;
const unsigned long TELEMETRY_MS = 20;  // 50 Hz untuk E/F/T

// ============================================================
//  SECTION 26 — SERIAL BUFFER & SAFETY
// ============================================================

static char    serial_buf[64];
static uint8_t serial_idx = 0;

volatile bool estop_active    = false;
volatile bool watchdog_halted = false;

unsigned long last_serial_rx_ms    = 0;
const unsigned long SERIAL_WATCHDOG_MS = 8000UL;

// ============================================================
//  SECTION 27 — FUNCTION POINTERS (zero if-check per tick)
// ============================================================

typedef void (*SensorFn)();
typedef void (*DesiredFn)(float t);
typedef void (*OutputFn)();

SensorFn  active_sensor_fn  = nullptr;
DesiredFn active_desired_fn = nullptr;
OutputFn  active_output_fn  = nullptr;

// ============================================================
//  FORWARD DECLARATIONS
// ============================================================

void sensorWithTD();
void sensorRawOnly();
void desiredSCARA(float t);
void desiredZN(float t);
void desiredIdle(float t);
void outputFull();
void outputZN();
void outputIdle();
void transitionToMode(OperatingMode new_mode);
void emitFullState();
void emitGains();
void emitParams();
void emitPosition();
void emitQueueStatus();
void emitStopPacket();
void checkTrajectoryDone();
void startTrajectory(float new_x, float new_y);
void allOutputsOff();
void doEstop();
void processSerialCommand(const char *cmd_raw);
void serviceSerial();
void serviceStepperPulse();
void drainDLineBuffer();

// ============================================================
//  LEDC & ADC MAP
// ============================================================

float mapADCtoRadJ1(int adc) {
  if (adc <= J1_RAW_90)
    return (float)(adc - J1_RAW_0) * (PI / 2.0f) / (float)(J1_RAW_90 - J1_RAW_0);
  return (PI / 2.0f) + (float)(adc - J1_RAW_90) * (PI / 2.0f) / (float)(J1_RAW_180 - J1_RAW_90);
}

float mapADCtoRadJ2(int adc) {
  if (adc <= J2_RAW_0)
    return (-PI / 2.0f) + (float)(adc - J2_RAW_N90) * (PI / 2.0f) / (float)(J2_RAW_0 - J2_RAW_N90);
  return (float)(adc - J2_RAW_0) * (PI / 2.0f) / (float)(J2_RAW_P90 - J2_RAW_0);
}

// ============================================================
//  KINEMATICS
// ============================================================

void FK(float th1, float th2, float &x, float &y) {
  x = L1 * cosf(th1) + L2 * cosf(th1 + th2);
  y = L1 * sinf(th1) + L2 * sinf(th1 + th2);
}

bool IK(float x, float y, int config, float &th1, float &th2) {
  float r2 = x * x + y * y;
  float c2 = (r2 - L1 * L1 - L2 * L2) / (2.0f * L1 * L2);
  if (c2 < -1.0f || c2 > 1.0f) return false;
  th2 = (float)config * acosf(c2);
  th1 = atan2f(y, x) - atan2f(L2 * sinf(th2), L1 + L2 * cosf(th2));
  return true;
}

// ============================================================
//  TRAJECTORY
// ============================================================

// startTrajectory: menghitung parameter timing berdasarkan TRAP_ENABLED.
// Constant velocity: traj_ta=0, traj_tc=0, traj_tf=D/V_MAX.
// getTrajPoint/Velocity/Accel akan degenerasi otomatis tanpa if-check.
// Seed dTheta_d_prev_acc dilakukan di sini untuk eliminasi spike ddθ.

static float dTheta1_d_prev_acc = 0.0f;
static float dTheta2_d_prev_acc = 0.0f;

void startTrajectory(float new_x, float new_y) {
  if (theta2 > 0.009f)       elbow_config = 1;
  else if (theta2 < -0.009f) elbow_config = -1;
  else                        elbow_config = 1;

  FK(theta1, theta2, traj_x0, traj_y0);
  traj_xf = new_x;
  traj_yf = new_y;

  float dx = traj_xf - traj_x0;
  float dy = traj_yf - traj_y0;
  traj_D   = sqrtf(dx * dx + dy * dy);
  if (traj_D < 0.001f) { is_moving = false; return; }

  traj_ux = dx / traj_D;
  traj_uy = dy / traj_D;

  if (TRAP_ENABLED) {
    // Profil trapesium — existing logic
    traj_ta = V_MAX / A_MAX;
    traj_da = 0.5f * A_MAX * traj_ta * traj_ta;
    if (2.0f * traj_da > traj_D) {
      traj_ta = sqrtf(traj_D / A_MAX);
      traj_da = 0.5f * A_MAX * traj_ta * traj_ta;
      traj_tc = 0.0f;
    } else {
      traj_tc = (traj_D - 2.0f * traj_da) / V_MAX;
    }
    traj_tf = 2.0f * traj_ta + traj_tc;
    // Seed: velocity awal = 0 → dTheta_d_prev_acc = 0
    dTheta1_d_prev_acc = 0.0f;
    dTheta2_d_prev_acc = 0.0f;
  } else {
    // Constant velocity — degenerasi trapesium
    traj_ta = 0.0f;
    traj_da = 0.0f;
    traj_tc = 0.0f;
    traj_tf = traj_D / V_MAX;
    // Seed: velocity awal = V_MAX → hitung via Jacobian di posisi start
    // agar ddθ tick pertama = 0, bukan spike dari 0 ke nilai finite
    float s1_  = sinf(theta1_d), c1_  = cosf(theta1_d);
    float s12_ = sinf(theta1_d + theta2_d), c12_ = cosf(theta1_d + theta2_d);
    float J11_ = -L1 * s1_ - L2 * s12_, J12_ = -L2 * s12_;
    float J21_ =  L1 * c1_ + L2 * c12_, J22_ =  L2 * c12_;
    float det_ = J11_ * J22_ - J12_ * J21_;
    if (fabsf(det_) > 1e-4f) {
      float inv_ = 1.0f / det_;
      float vx   = V_MAX * traj_ux;
      float vy   = V_MAX * traj_uy;
      dTheta1_d_prev_acc = inv_ * ( J22_ * vx - J12_ * vy);
      dTheta2_d_prev_acc = inv_ * (-J21_ * vx + J11_ * vy);
    } else {
      dTheta1_d_prev_acc = 0.0f;
      dTheta2_d_prev_acc = 0.0f;
    }
  }

  t_traj        = 0.0f;
  traj_x_cmd    = traj_x0;
  traj_y_cmd    = traj_y0;
  traj_time_done  = false;
  settle_ticks    = 0;

  dTheta1_d = dTheta2_d = 0.0f;
  ddTheta1_d = ddTheta2_d = 0.0f;
  omega2_prev = 0.0f;
  // integral2 di-freeze (tidak di-reset) saat mulai moving

  Serial.print("M,");
  Serial.print(traj_x0 * 1000.0f, 3); Serial.print(",");
  Serial.print(traj_y0 * 1000.0f, 3); Serial.print(",");
  Serial.print(traj_xf * 1000.0f, 3); Serial.print(",");
  Serial.println(traj_yf * 1000.0f, 3);

  is_moving = true;
}

// getTrajPoint: formula trapesium. Saat constant vel, traj_ta=traj_tc=0
// → phase accel tidak pernah masuk (t < 0 tidak terpenuhi jika t>=0),
// phase cruise aktif dari t=0 s.d. traj_tf, S = V_MAX*(t-0) = V_MAX*t. ✓
void getTrajPoint(float t, float &x, float &y) {
  float S;
  if (t < traj_ta) {
    S = 0.5f * A_MAX * t * t;
  } else if (t < traj_ta + traj_tc) {
    S = traj_da + V_MAX * (t - traj_ta);
  } else if (t <= traj_tf) {
    float dt_end = traj_tf - t;
    S = traj_D - 0.5f * A_MAX * dt_end * dt_end;
  } else {
    S = traj_D;
  }
  S = constrain(S, 0.0f, traj_D);
  float ratio = (traj_D > 0.0f) ? (S / traj_D) : 0.0f;
  x = traj_x0 + ratio * (traj_xf - traj_x0);
  y = traj_y0 + ratio * (traj_yf - traj_y0);
}

// getTrajVelocity: constant vel → V_MAX dari t=0 s.d. traj_tf. ✓
float getTrajVelocity(float t) {
  if (t < 0.0f || t > traj_tf) return 0.0f;
  if (t < traj_ta)              return A_MAX * t;
  if (t < traj_ta + traj_tc)   return V_MAX;
  return A_MAX * (traj_tf - t);
}

// getTrajAccel: constant vel → traj_ta=0, semua t >= 0 masuk cruise → 0. ✓
float getTrajAccel(float t) {
  if (t < 0.0f || t > traj_tf) return 0.0f;
  if (t < traj_ta)              return A_MAX;
  if (t < traj_ta + traj_tc)   return 0.0f;
  return -A_MAX;
}

void emitStopPacket() {
  Serial.print("S,");
  Serial.print(traj_xf * 1000.0f, 3); Serial.print(",");
  Serial.println(traj_yf * 1000.0f, 3);
}

void checkTrajectoryDone() {
  if (!is_moving) return;

  if (!traj_time_done && t_traj > traj_tf) {
    traj_time_done = true;
    settle_ticks   = 0;
  }
  if (!traj_time_done) return;

  if ((t_traj - traj_tf) > TRAJ_MAX_OVERTIME) {
    Serial.println("WARN: trajectory timeout — forcing stop");
    is_moving      = false;
    traj_time_done = false;
    emitStopPacket();
    if (pending_move) { pending_move = false; startTrajectory(pending_x, pending_y); }
    return;
  }

  float th1_f, th2_f;
  if (!IK(traj_xf, traj_yf, elbow_config, th1_f, th2_f)) {
    is_moving = false; emitStopPacket(); return;
  }

  if (fabsf(th1_f - theta1) < SETTLE_ERR_RAD && fabsf(th2_f - theta2) < SETTLE_ERR_RAD)
    settle_ticks++;
  else
    settle_ticks = 0;

  if (settle_ticks >= SETTLE_TICKS_REQ) {
    is_moving      = false;
    traj_time_done = false;
    emitStopPacket();
    if (pending_move) { pending_move = false; startTrajectory(pending_x, pending_y); }
  }
}

// ============================================================
//  SENSOR FUNCTIONS (dipilih via function pointer)
// ============================================================

void sensorWithTD() {
  int s1 = 0, s2 = 0;
  for (int i = 0; i < 4; i++) {
    s1 += analogRead(DC_POT_PIN);
    s2 += analogRead(STEP_POT_PIN);
  }
  theta1_raw = mapADCtoRadJ1(s1 >> 2);
  theta2_raw = mapADCtoRadJ2(s2 >> 2);

  td1.update(theta1_raw, DT);
  td2.update(theta2_raw, DT);

  theta1    = td1.v1;
  theta2    = td2.v1;
  dTheta1_f = td1.v2;
  dTheta2_f = td2.v2;
}

void sensorRawOnly() {
  int s1 = 0, s2 = 0;
  for (int i = 0; i < 4; i++) {
    s1 += analogRead(DC_POT_PIN);
    s2 += analogRead(STEP_POT_PIN);
  }
  theta1_raw = mapADCtoRadJ1(s1 >> 2);
  theta2_raw = mapADCtoRadJ2(s2 >> 2);

  // Total bypass: posisi = raw, velocity = finite difference dengan clamp
  theta1    = theta1_raw;
  theta2    = theta2_raw;
  dTheta1_f = constrain((theta1_raw - theta1_raw_prev) / DT,
                        -DTHETA_RAW_CLAMP, DTHETA_RAW_CLAMP);
  dTheta2_f = constrain((theta2_raw - theta2_raw_prev) / DT,
                        -DTHETA_RAW_CLAMP, DTHETA_RAW_CLAMP);
  theta1_raw_prev = theta1_raw;
  theta2_raw_prev = theta2_raw;
}

// ============================================================
//  DESIRED STATE FUNCTIONS (dipilih via function pointer)
// ============================================================

void desiredSCARA(float t) {
  if (!is_moving) {
    dTheta1_d = dTheta2_d = 0.0f;
    ddTheta1_d = ddTheta2_d = 0.0f;
    return;
  }

  float sdot      = getTrajVelocity(t);
  float xdot_cart = sdot * traj_ux;
  float ydot_cart = sdot * traj_uy;

  float s1  = sinf(theta1_d), c1  = cosf(theta1_d);
  float s12 = sinf(theta1_d + theta2_d), c12 = cosf(theta1_d + theta2_d);

  float J11 = -L1 * s1 - L2 * s12, J12 = -L2 * s12;
  float J21 =  L1 * c1 + L2 * c12, J22 =  L2 * c12;
  float det = J11 * J22 - J12 * J21;

  if (fabsf(det) < 1e-4f) {
    dTheta1_d = dTheta2_d = 0.0f;
    ddTheta1_d = ddTheta2_d = 0.0f;
    return;
  }

  float inv_det  = 1.0f / det;
  float new_dth1 = inv_det * ( J22 * xdot_cart - J12 * ydot_cart);
  float new_dth2 = inv_det * (-J21 * xdot_cart + J11 * ydot_cart);

  float raw_ddth1 = (new_dth1 - dTheta1_d_prev_acc) / DT;
  float raw_ddth2 = (new_dth2 - dTheta2_d_prev_acc) / DT;

  dTheta1_d_prev_acc = new_dth1;
  dTheta2_d_prev_acc = new_dth2;
  dTheta1_d  = new_dth1;
  dTheta2_d  = new_dth2;
  ddTheta1_d = constrain(raw_ddth1, -DDTH_MAX, DDTH_MAX);
  ddTheta2_d = constrain(raw_ddth2, -DDTH_MAX, DDTH_MAX);
}

void desiredZN(float t) {
  (void)t;
  // theta1_d / theta2_d di-set oleh command t1, / t2,
  // Tidak ada trajectory → dTheta_d dan ddTheta_d = 0
  dTheta1_d = dTheta2_d = 0.0f;
  ddTheta1_d = ddTheta2_d = 0.0f;
}

void desiredIdle(float t) {
  (void)t;
  // Tidak ada desired state computation di IDLE
}

// ============================================================
//  CTC — COMPUTED TORQUE (dengan G term)
// ============================================================
//
// Dievaluasi di desired state (bukan measured) untuk hindari
// propagasi delay sensor ke feedforward path.
//
// Gravity term menggunakan alpha_tilt (runtime-tunable):
//   G1 = (m1*d1 + m2*L1)*g*cos(alpha + θ1d) + m2*d2*g*cos(alpha + θ1d + θ2d)
//   G2 = m2*d2*g*cos(alpha + θ1d + θ2d)

void computeCTC() {
  float c2  = cosf(theta2_d);
  float s2  = sinf(theta2_d);

  // Inertia matrix elements
  float M11 = m1*d1*d1 + m2*(L1*L1 + d2*d2 + 2.0f*L1*d2*c2) + Izz1 + Izz2;
  float M12 = m2*(d2*d2 + L1*d2*c2) + Izz2;
  float M22_val = m2*d2*d2 + Izz2;

  // Coriolis / centripetal
  float h_coeff = m2 * L1 * d2 * s2;
  float C1_raw  = -h_coeff * dTheta2_d * (2.0f * dTheta1_d + dTheta2_d);
  float C2_raw  =  h_coeff * dTheta1_d * dTheta1_d;

  // Gravity — alpha_tilt hanya masuk di sini
  float ang1   = alpha_tilt + theta1_d;
  float ang12  = alpha_tilt + theta1_d + theta2_d;
  float G1_raw = (m1*d1 + m2*L1) * g_accel * cosf(ang1)
               +  m2*d2           * g_accel * cosf(ang12);
  float G2_raw =  m2*d2           * g_accel * cosf(ang12);

  // Pisah inertia term: M·ddθ
  ctc_inertia1  = M11 * ddTheta1_d + M12 * ddTheta2_d;
  ctc_inertia2  = M12 * ddTheta1_d + M22_val * ddTheta2_d;

  // Coriolis term
  ctc_coriolis1 = C1_raw;
  ctc_coriolis2 = C2_raw;

  // Gravity term
  ctc_gravity1  = G1_raw;
  ctc_gravity2  = G2_raw;
}

// ============================================================
//  OUTPUT FUNCTIONS (dipilih via function pointer)
// ============================================================

void controlJoint1() {
  float e1 = theta1_d - theta1;

  // Deadband hold logic
  if (is_moving) {
    motor1_active   = true;
    motor1_on_ticks = 0;
  } else {
    if (!motor1_active && fabsf(e1) > DB_ENGAGE) {
      motor1_active   = true;
      motor1_on_ticks = 0;
    } else if (motor1_active) {
      motor1_on_ticks++;
      if (motor1_on_ticks >= MOTOR1_MIN_TICKS
          && fabsf(e1)      < DB_RELEASE
          && fabsf(dTheta1_f) < DB_VEL) {
        motor1_active = false;
      }
    }
  }

  float kp_eff = is_moving ? Kp1 : Kp1 * KP_HOLD_SCALE;
  float kd_eff = is_moving ? Kd1 : Kd1 * KD_HOLD_SCALE;

  if (!motor1_active) {
    if (fabsf(e1) >= DB_RELEASE) {
      integral1 += e1 * DT;
      integral1  = constrain(integral1, -0.5f, 0.5f);
    } else {
      integral1 *= (1.0f - INTEGRAL_DECAY);
    }
    digitalWrite(DC_IN3, LOW);
    digitalWrite(DC_IN4, LOW);
    pwmWrite(0);
    last_pwm1     = 0;
    u1_total_out  = 0.0f;
    ff1_contrib_out = 0.0f;
    p1_out = i1_out = d1_out = 0.0f;
    return;
  }

  float d_term = constrain(-kd_eff * dTheta1_f, -DTERM_MAX, DTERM_MAX);

  // FF dari tiga komponen terpisah, dinormalisasi ke TAU_NOM_J1
  float ff_raw = FF_INERTIA  * ctc_inertia1
               + FF_CORIOLIS * ctc_coriolis1
               + FF_GRAVITY  * ctc_gravity1;
  float ff_frac       = constrain(ff_raw / TAU_NOM_J1, -1.0f, 1.0f);
  float ff_contribution = ff_frac * U1_MAX;

  integral1 += e1 * DT;
  integral1  = constrain(integral1, -0.5f, 0.5f);

  p1_out = kp_eff * e1;
  d1_out = d_term;
  i1_out = Ki1 * integral1;

  float u1_total = p1_out + d1_out + i1_out + ff_contribution;

  // Anti-windup
  if (fabsf(u1_total) >= U1_MAX && (e1 * integral1) > 0.0f) {
    integral1 -= e1 * DT;
    integral1  = constrain(integral1, -0.5f, 0.5f);
    u1_total   = kp_eff * e1 + d_term + Ki1 * integral1 + ff_contribution;
  }

  ff1_contrib_out = ff_contribution;
  u1_total_out    = u1_total;

  float total_frac = constrain(u1_total / U1_MAX, -1.0f, 1.0f);
  float frac_abs   = fabsf(total_frac);
  int   pwm_out    = 0;

  if (frac_abs >= FRAC_ZERO_THRESH) {
    float frac_eff = (frac_abs - FRAC_ZERO_THRESH) / (1.0f - FRAC_ZERO_THRESH);
    frac_eff = constrain(frac_eff, 0.0f, 1.0f);
    int mag = PWM_DEADBAND + (int)(frac_eff * (float)(PWM_MAX - PWM_DEADBAND));
    mag     = constrain(mag, PWM_DEADBAND, PWM_MAX);
    pwm_out = (total_frac >= 0.0f) ? mag : -mag;
  }
  last_pwm1 = pwm_out;

  if      (pwm_out > 0) { digitalWrite(DC_IN3, HIGH); digitalWrite(DC_IN4, LOW); }
  else if (pwm_out < 0) { digitalWrite(DC_IN3, LOW);  digitalWrite(DC_IN4, HIGH); }
  else                  { digitalWrite(DC_IN3, LOW);  digitalWrite(DC_IN4, LOW); }
  pwmWrite((uint32_t)abs(pwm_out));
}

void controlJoint2() {
  float e2    = theta2_d - theta2;
  float u2_pd = Kp2 * e2 - Kd2 * dTheta2_f;

  // Ki2 gated: aktif hanya saat hold (!is_moving) dan |e2| dalam gate
  // Saat moving: freeze integral (tidak bertambah, tidak di-reset)
  if (!is_moving && fabsf(e2) < KI2_GATE_RAD) {
    integral2 += Ki2 * e2 * DT;
    integral2  = constrain(integral2, -0.3f, 0.3f);
    // Anti-windup J2
    float u2_test = u2_pd + integral2;
    if (fabsf(u2_test) > 10.0f && (e2 * integral2) > 0.0f)
      integral2 -= Ki2 * e2 * DT;
  }

  // FF dari tiga komponen, dinormalisasi ke M22_REF → delta omega
  float ff_raw2 = FF_INERTIA  * ctc_inertia2
                + FF_CORIOLIS * ctc_coriolis2
                + FF_GRAVITY  * ctc_gravity2;
  float delta_omega_ff = (ff_raw2 / M22_REF) * DT;

  float omega2_raw     = u2_pd + integral2 + delta_omega_ff;
  delta_omega_ff_out   = delta_omega_ff;
  omega2_raw_out       = omega2_raw;

  float max_delta = OMEGA2_RATE_LIMIT * DT;
  float omega2    = omega2_prev + constrain(omega2_raw - omega2_prev, -max_delta, max_delta);
  omega2_prev     = omega2;

  float freq = constrain(fabsf(omega2) * STEPS_PER_RAD, 0.0f, STEPPER_MAX_HZ);
  if (freq < STEPPER_MIN_HZ) { step_period_us = 0; return; }

  step_period_us = (unsigned long)(1000000.0f / freq);
  digitalWrite(DIR_PIN, (omega2 > 0.0f) ? HIGH : LOW);
}

// Output untuk mode SCARA dan TEST — joint 1 + joint 2 penuh
void outputFull() {
  controlJoint1();
  controlJoint2();
}

// Output untuk MODE_ZN — CTC di-zero secara eksplisit sebelum control
void outputZN() {
  ctc_inertia1 = ctc_coriolis1 = ctc_gravity1 = 0.0f;
  ctc_inertia2 = ctc_coriolis2 = ctc_gravity2 = 0.0f;
  controlJoint1();
  controlJoint2();
}

// Output untuk MODE_IDLE — tidak ada aktuasi
void outputIdle() { /* noop */ }

// ============================================================
//  D-LINE RING BUFFER — tulis dari control tick
// ============================================================

void writeDLineToBuffer() {
  uint8_t next_head = (dline_head + 1) % DLINE_BUF_SIZE;
  if (next_head == dline_tail) return;  // buffer penuh — skip, jangan block

  DLineEntry &e = dline_buf[dline_head];

  // Format D-line ke string tanpa Serial.print — gunakan snprintf
  // D,<ms>,<th1>,<th2>,<th1d>,<th2d>,<dth1>,<dth2>,<dth1d>,<dth2d>,<pwm1>,<th1raw>,<th2raw>
  e.len = (uint8_t)snprintf(e.str, DLINE_STR_LEN,
    "D,%lu,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%d,%.3f,%.3f\n",
    millis(),
    theta1, theta2,
    theta1_d, theta2_d,
    dTheta1_f, dTheta2_f,
    dTheta1_d, dTheta2_d,
    last_pwm1,
    theta1_raw, theta2_raw);

  dline_head = next_head;
}

// Drain ring buffer ke UART — dipanggil dari loop(), non-blocking
void drainDLineBuffer() {
  // Drain maksimal 2 entry per loop() call untuk hindari monopoli CPU
  uint8_t drained = 0;
  while (dline_tail != dline_head && drained < 2) {
    DLineEntry &e = dline_buf[dline_tail];
    Serial.write((const uint8_t *)e.str, e.len);
    dline_tail = (dline_tail + 1) % DLINE_BUF_SIZE;
    drained++;
  }
}

// ============================================================
//  STEPPER PULSE SERVICE
// ============================================================

void serviceStepperPulse() {
  if (estop_active || step_period_us == 0) return;
  unsigned long now_us = micros();
  if (now_us - last_step_us >= step_period_us) {
    last_step_us = now_us;
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(2);
    digitalWrite(STEP_PIN, LOW);
  }
}

// ============================================================
//  HELPERS
// ============================================================

void allOutputsOff() {
  step_period_us    = 0;
  integral1         = 0.0f;
  integral2         = 0.0f;
  motor1_active     = false;
  motor1_on_ticks   = 0;
  is_moving         = false;
  pending_move      = false;
  dTheta1_d = dTheta2_d = 0.0f;
  ddTheta1_d = ddTheta2_d = 0.0f;
  ctc_inertia1 = ctc_coriolis1 = ctc_gravity1 = 0.0f;
  ctc_inertia2 = ctc_coriolis2 = ctc_gravity2 = 0.0f;
  p1_out = i1_out = d1_out = 0.0f;
  u1_total_out = ff1_contrib_out = 0.0f;
  omega2_raw_out = delta_omega_ff_out = 0.0f;
  omega2_prev   = 0.0f;
  last_pwm1     = 0;
  digitalWrite(DC_IN3, LOW);
  digitalWrite(DC_IN4, LOW);
  pwmWrite(0);
}

// ============================================================
//  MAIN CONTROL LOOP — flat via function pointer
// ============================================================

void runControlLoop() {
  if (estop_active) {
    // Tetap baca sensor agar HMI update posisi saat ESTOP
    active_sensor_fn();
    return;
  }

  unsigned long t_start = micros();

  active_sensor_fn();

  if (is_moving) {
    // IK di sini sebelum desiredSCARA agar theta_d sudah update
    // sebelum Jacobian velocity dihitung
    float x_cmd, y_cmd;
    getTrajPoint(t_traj, x_cmd, y_cmd);
    traj_x_cmd = x_cmd;
    traj_y_cmd = y_cmd;
    bool ok = IK(x_cmd, y_cmd, elbow_config, theta1_d, theta2_d);
    if (!ok) {
      is_moving = false;
      Serial.println("ERR: IK failed mid-trajectory — stopped.");
      emitStopPacket();
    }
    t_traj += DT;
  } else {
    FK(theta1_d, theta2_d, traj_x_cmd, traj_y_cmd);
  }

  active_desired_fn(t_traj - DT);  // t sudah di-advance, kirim t sebelumnya

  computeCTC();
  active_output_fn();

  if (is_moving) checkTrajectoryDone();

  loop_duration_us = micros() - t_start;

  // Tulis D-line ke ring buffer — TX dilakukan oleh drainDLineBuffer() di loop()
  if (op_mode != MODE_IDLE) writeDLineToBuffer();
}

// ============================================================
//  ESTOP
// ============================================================

void doEstop() {
  if (is_moving) emitStopPacket();
  estop_active = true;
  allOutputsOff();
  Serial.println("WARN: ESTOP — all outputs zeroed.");
}

// ============================================================
//  MODE TRANSITION
// ============================================================

void transitionToMode(OperatingMode new_mode) {
  if (new_mode == op_mode) {
    Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);
    return;
  }

  if (is_moving) { emitStopPacket(); is_moving = false; pending_move = false; }

  allOutputsOff();
  estop_active = false;

  // Seed desired ke posisi aktual untuk hindari step besar
  theta1_d = theta1;
  theta2_d = theta2;
  dTheta1_d_prev_acc = dTheta2_d_prev_acc = 0.0f;

  op_mode = new_mode;

  // Assign function pointer sesuai mode — satu kali per transisi
  switch (op_mode) {
    case MODE_IDLE:
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredIdle;
      active_output_fn  = outputIdle;
      break;
    case MODE_SCARA:
      // SCARA selalu pakai TD (dikunci)
      TD_ENABLED       = true;
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredSCARA;
      active_output_fn  = outputFull;
      break;
    case MODE_ZN:
      active_sensor_fn  = sensorWithTD;
      active_desired_fn = desiredZN;
      active_output_fn  = outputZN;
      break;
    case MODE_TEST:
      // TEST: sensor_fn sesuai TD_ENABLED saat ini
      active_sensor_fn  = TD_ENABLED ? sensorWithTD : sensorRawOnly;
      active_desired_fn = desiredSCARA;
      active_output_fn  = outputFull;
      break;
  }

  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);

  if (op_mode == MODE_IDLE) {
    Serial.println("INFO: MODE_IDLE — semua output dimatikan.");
  } else if (op_mode == MODE_SCARA) {
    Serial.println("INFO: MODE_SCARA aktif — kirim move,<x_mm>,<y_mm>.");
    emitFullState();
  } else if (op_mode == MODE_ZN) {
    Serial.println("INFO: MODE_ZN aktif — kirim t1,<deg> / t2,<deg>.");
    emitFullState();
  } else if (op_mode == MODE_TEST) {
    Serial.println("INFO: MODE_TEST aktif — semua parameter terbuka.");
    emitFullState();
  }
}

// ============================================================
//  TELEMETRI
// ============================================================

void emitGains() {
  // G,<Kp1>,<Ki1>,<Kd1>,<Kp2>,<Ki2>,<Kd2>,<microstep>,
  //   <FF_INERTIA>,<FF_CORIOLIS>,<FF_GRAVITY>
  Serial.print("G,");
  Serial.print(Kp1, 4);   Serial.print(",");
  Serial.print(Ki1, 4);   Serial.print(",");
  Serial.print(Kd1, 4);   Serial.print(",");
  Serial.print(Kp2, 4);   Serial.print(",");
  Serial.print(Ki2, 4);   Serial.print(",");
  Serial.print(Kd2, 4);   Serial.print(",");
  Serial.print(16);        Serial.print(",");
  Serial.print(FF_INERTIA,  3); Serial.print(",");
  Serial.print(FF_CORIOLIS, 3); Serial.print(",");
  Serial.println(FF_GRAVITY, 3);
}

void emitParams() {
  // K-packet — index komentar untuk parsing HMI
  Serial.print("K,");
  Serial.print(V_MAX, 3);          Serial.print(",");  // [0]
  Serial.print(A_MAX, 3);          Serial.print(",");  // [1]
  Serial.print(CONTROL_FREQ);      Serial.print(",");  // [2]
  Serial.print(U1_MAX, 2);         Serial.print(",");  // [3]
  Serial.print(FRAC_ZERO_THRESH, 3); Serial.print(","); // [4]
  Serial.print(PWM_DEADBAND);      Serial.print(",");  // [5]
  Serial.print(TD1_R, 2);          Serial.print(",");  // [6]
  Serial.print(TD2_R, 2);          Serial.print(",");  // [7]
  Serial.print(td1.h, 4);          Serial.print(",");  // [8]
  Serial.print(DDTH_MAX, 1);       Serial.print(",");  // [9]
  Serial.print(DB_ENGAGE, 3);      Serial.print(",");  // [10]
  Serial.print(DB_RELEASE, 3);     Serial.print(",");  // [11]
  Serial.print(DB_VEL, 3);         Serial.print(",");  // [12]
  Serial.print(KP_HOLD_SCALE, 2);  Serial.print(",");  // [13]
  Serial.print(KD_HOLD_SCALE, 2);  Serial.print(",");  // [14]
  Serial.print(INTEGRAL_DECAY, 4); Serial.print(",");  // [15]
  Serial.print(TAU_NOM_J1, 5);     Serial.print(",");  // [16]
  Serial.print(M22_REF, 8);        Serial.print(",");  // [17]
  Serial.print(alpha_tilt * (180.0f / PI), 3); Serial.print(","); // [18] deg
  Serial.print(TD_ENABLED   ? 1 : 0); Serial.print(","); // [19]
  Serial.print(TRAP_ENABLED ? 1 : 0); Serial.print(","); // [20]
  Serial.println(KI2_GATE_RAD, 3);                      // [21]
}

void emitPosition() {
  float x_now, y_now;
  FK(theta1, theta2, x_now, y_now);
  Serial.print("P,");
  Serial.print(x_now * 1000.0f, 3); Serial.print(",");
  Serial.print(y_now * 1000.0f, 3); Serial.print(",");
  Serial.print(theta1, 4);          Serial.print(",");
  Serial.println(theta2, 4);
}

void emitQueueStatus() {
  Serial.print("Q,");
  Serial.print(pending_move ? 1 : 0); Serial.print(",");
  Serial.print(pending_x * 1000.0f, 1); Serial.print(",");
  Serial.println(pending_y * 1000.0f, 1);
}

void emitFullState() {
  emitGains();
  emitParams();
  emitPosition();
  emitQueueStatus();
  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);
}

// ============================================================
//  SERIAL COMMAND PARSER
// ============================================================

void processSerialCommand(const char *cmd_raw) {
  String input = String(cmd_raw);
  input.trim();
  if (input.length() == 0) return;

  // ----------------------------------------------------------
  // SELALU VALID — semua mode
  // ----------------------------------------------------------

  if (input == "ping") {
    last_serial_rx_ms = millis();
    return;
  }
  if (input == "estop") { doEstop(); return; }
  if (input == "resume") {
    estop_active = false;
    Serial.println("INFO: ESTOP cleared.");
    return;
  }
  if (input == "getgains")  { emitFullState(); return; }
  if (input == "getparams") { emitParams();    return; }
  if (input == "clrgraph") {
    Serial.println("INFO: clrgraph acknowledged.");
    return;
  }

  // ----------------------------------------------------------
  // MODE TRANSITIONS
  // ----------------------------------------------------------

  if (input == "mode,idle")  { transitionToMode(MODE_IDLE);  return; }
  if (input == "mode,scara") { transitionToMode(MODE_SCARA); return; }
  if (input == "mode,zn")    { transitionToMode(MODE_ZN);    return; }
  if (input == "mode,test")  { transitionToMode(MODE_TEST);  return; }

  // ----------------------------------------------------------
  // GUARD: tolak semua command operasi saat MODE_IDLE
  // ----------------------------------------------------------

  if (op_mode == MODE_IDLE) {
    Serial.println("ERR: MODE_IDLE — kirim mode,scara / mode,zn / mode,test dahulu.");
    return;
  }

  // ----------------------------------------------------------
  // COMMANDS EKSKLUSIF MODE_ZN
  // ----------------------------------------------------------

  if (op_mode == MODE_ZN) {
    if (input.startsWith("t1,")) {
      theta1_d  = input.substring(3).toFloat() * (PI / 180.0f);
      integral1 = 0.0f;
      Serial.print("INFO: ZN t1_d="); Serial.print(theta1_d, 4); Serial.println(" rad");
      return;
    }
    if (input.startsWith("t2,")) {
      theta2_d = input.substring(3).toFloat() * (PI / 180.0f);
      Serial.print("INFO: ZN t2_d="); Serial.print(theta2_d, 4); Serial.println(" rad");
      return;
    }
    if (input == "dbtest") {
      Serial.println("INFO: DB test — EN=200 selama 400ms");
      digitalWrite(DC_IN3, LOW); digitalWrite(DC_IN4, HIGH);
      pwmWrite(200); delay(400); pwmWrite(0);
      digitalWrite(DC_IN3, LOW); digitalWrite(DC_IN4, LOW);
      Serial.println("INFO: dbtest selesai.");
      return;
    }
    if (input.startsWith("move,")) {
      Serial.println("ERR: 'move' tidak valid di MODE_ZN. Gunakan t1,/t2,.");
      return;
    }
  }

  // ----------------------------------------------------------
  // COMMANDS EKSKLUSIF MODE_TEST — parameter fisik & toggle
  // ----------------------------------------------------------

  if (op_mode == MODE_TEST) {
    // Toggle TD filter
    if (input.startsWith("tden,")) {
      if (is_moving) { Serial.println("ERR: tden tidak bisa diubah saat bergerak."); return; }
      bool new_td = (input.substring(5).toInt() != 0);
      if (new_td && !TD_ENABLED) {
        // Re-enable: seed TD dari posisi raw saat ini
        td1.init(theta1_raw, TD1_R, DT);
        td2.init(theta2_raw, TD2_R, DT);
      }
      if (!new_td && TD_ENABLED) {
        // Disable: seed prev untuk FD dari posisi saat ini
        theta1_raw_prev = theta1_raw;
        theta2_raw_prev = theta2_raw;
      }
      TD_ENABLED       = new_td;
      active_sensor_fn = TD_ENABLED ? sensorWithTD : sensorRawOnly;
      Serial.print("INFO: TD_ENABLED="); Serial.println(TD_ENABLED ? 1 : 0);
      emitParams();
      return;
    }

    // Toggle trapesium
    if (input.startsWith("trapen,")) {
      if (is_moving) { Serial.println("ERR: trapen tidak bisa diubah saat bergerak."); return; }
      TRAP_ENABLED = (input.substring(7).toInt() != 0);
      Serial.print("INFO: TRAP_ENABLED="); Serial.println(TRAP_ENABLED ? 1 : 0);
      emitParams();
      return;
    }

    // alpha_tilt
    if (input.startsWith("atilt,")) {
      alpha_tilt = input.substring(6).toFloat() * (PI / 180.0f);
      Serial.print("INFO: alpha_tilt="); Serial.print(alpha_tilt, 5); Serial.println(" rad");
      emitParams();
      return;
    }

    // t1, t2 di TEST (untuk manual set desired tanpa trajectory)
    if (input.startsWith("t1,")) {
      if (is_moving) { Serial.println("ERR: t1, tidak bisa diubah saat bergerak."); return; }
      theta1_d  = input.substring(3).toFloat() * (PI / 180.0f);
      integral1 = 0.0f;
      Serial.print("INFO: TEST t1_d="); Serial.print(theta1_d, 4); Serial.println(" rad");
      return;
    }
    if (input.startsWith("t2,")) {
      if (is_moving) { Serial.println("ERR: t2, tidak bisa diubah saat bergerak."); return; }
      theta2_d = input.substring(3).toFloat() * (PI / 180.0f);
      Serial.print("INFO: TEST t2_d="); Serial.print(theta2_d, 4); Serial.println(" rad");
      return;
    }

    // Parameter fisik — hanya TEST
    if (input.startsWith("vmax,")) {
      V_MAX = input.substring(5).toFloat();
      Serial.print("INFO: V_MAX="); Serial.println(V_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("amax,")) {
      A_MAX = input.substring(5).toFloat();
      Serial.print("INFO: A_MAX="); Serial.println(A_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("u1max,")) {
      U1_MAX = input.substring(6).toFloat();
      Serial.print("INFO: U1_MAX="); Serial.println(U1_MAX, 2);
      emitParams(); return;
    }
    if (input.startsWith("db,")) {
      PWM_DEADBAND = input.substring(3).toInt();
      Serial.print("INFO: PWM_DEADBAND="); Serial.println(PWM_DEADBAND);
      emitParams(); return;
    }
    if (input.startsWith("td1r,")) {
      TD1_R = input.substring(5).toFloat();
      td1.r = TD1_R; td1.h = 3.0f * DT;
      Serial.print("INFO: TD1_R="); Serial.println(TD1_R, 2);
      emitParams(); return;
    }
    if (input.startsWith("td2r,")) {
      TD2_R = input.substring(5).toFloat();
      td2.r = TD2_R; td2.h = 3.0f * DT;
      Serial.print("INFO: TD2_R="); Serial.println(TD2_R, 2);
      emitParams(); return;
    }
    if (input.startsWith("dben,")) {
      DB_ENGAGE = input.substring(5).toFloat();
      Serial.print("INFO: DB_ENGAGE="); Serial.println(DB_ENGAGE, 3);
      emitParams(); return;
    }
    if (input.startsWith("dbrel,")) {
      DB_RELEASE = input.substring(6).toFloat();
      Serial.print("INFO: DB_RELEASE="); Serial.println(DB_RELEASE, 3);
      emitParams(); return;
    }
    if (input.startsWith("dbvel,")) {
      DB_VEL = input.substring(6).toFloat();
      Serial.print("INFO: DB_VEL="); Serial.println(DB_VEL, 3);
      emitParams(); return;
    }
    if (input.startsWith("ddth,")) {
      DDTH_MAX = input.substring(5).toFloat();
      Serial.print("INFO: DDTH_MAX="); Serial.println(DDTH_MAX, 3);
      emitParams(); return;
    }
    if (input.startsWith("hskp,")) {
      KP_HOLD_SCALE = input.substring(5).toFloat();
      Serial.print("INFO: KP_HOLD_SCALE="); Serial.println(KP_HOLD_SCALE, 3);
      emitParams(); return;
    }
    if (input.startsWith("hskd,")) {
      KD_HOLD_SCALE = input.substring(5).toFloat();
      Serial.print("INFO: KD_HOLD_SCALE="); Serial.println(KD_HOLD_SCALE, 3);
      emitParams(); return;
    }
    if (input.startsWith("idecay,")) {
      INTEGRAL_DECAY = input.substring(7).toFloat();
      Serial.print("INFO: INTEGRAL_DECAY="); Serial.println(INTEGRAL_DECAY, 5);
      emitParams(); return;
    }
    if (input.startsWith("taunom,")) {
      TAU_NOM_J1 = input.substring(7).toFloat();
      Serial.print("INFO: TAU_NOM_J1="); Serial.println(TAU_NOM_J1, 5);
      emitParams(); return;
    }
    if (input.startsWith("m22ref,")) {
      M22_REF = input.substring(7).toFloat();
      Serial.print("INFO: M22_REF="); Serial.println(M22_REF, 8);
      emitParams(); return;
    }
    if (input.startsWith("cfreq,")) {
      int val = input.substring(6).toInt();
      if (val > 0) {
        CONTROL_FREQ = val;
        DT = 1.0f / CONTROL_FREQ;
        td1.h = 3.0f * DT;
        td2.h = 3.0f * DT;
        Serial.print("INFO: CONTROL_FREQ="); Serial.println(CONTROL_FREQ);
        emitParams();
      }
      return;
    }
    if (input.startsWith("ki2g,")) {
      KI2_GATE_RAD = input.substring(5).toFloat();
      Serial.print("INFO: KI2_GATE_RAD="); Serial.println(KI2_GATE_RAD, 3);
      emitParams(); return;
    }
    if (input.startsWith("omega2rl,")) {
      OMEGA2_RATE_LIMIT = input.substring(9).toFloat();
      Serial.print("INFO: OMEGA2_RATE_LIMIT="); Serial.println(OMEGA2_RATE_LIMIT, 2);
      return;
    }
    if (input.startsWith("dtclamp,")) {
      DTHETA_RAW_CLAMP = input.substring(8).toFloat();
      Serial.print("INFO: DTHETA_RAW_CLAMP="); Serial.println(DTHETA_RAW_CLAMP, 2);
      return;
    }
  }

  // ----------------------------------------------------------
  // COMMANDS VALID DI SCARA + TEST (dan ZN untuk gains)
  // ----------------------------------------------------------

  // move — hanya SCARA dan TEST
  if (input.startsWith("move,")) {
    if (op_mode == MODE_ZN) {
      Serial.println("ERR: 'move' tidak valid di MODE_ZN.");
      return;
    }
    if (estop_active) { Serial.println("ERR: E-STOP aktif. Kirim 'resume'."); return; }

    String rest = input.substring(5);
    int    c2   = rest.indexOf(',');
    if (c2 > 0) {
      float new_x = rest.substring(0, c2).toFloat() / 1000.0f;
      float new_y = rest.substring(c2 + 1).toFloat() / 1000.0f;
      float r2    = new_x * new_x + new_y * new_y;
      float max_r = L1 + L2, min_r = fabsf(L1 - L2);
      if (r2 > max_r * max_r || r2 < min_r * min_r) {
        Serial.print("ERR: Di luar workspace. R valid: ");
        Serial.print(min_r * 1000.0f, 1); Serial.print(" – ");
        Serial.println(max_r * 1000.0f, 1);
        return;
      }
      int   cfg = (theta2 > 0.009f) ? 1 : ((theta2 < -0.009f) ? -1 : 1);
      float th1_t, th2_t;
      if (!IK(new_x, new_y, cfg, th1_t, th2_t)) {
        Serial.println("ERR: IK failed untuk target ini.");
        return;
      }
      if (is_moving) {
        pending_move = true;
        pending_x    = new_x;
        pending_y    = new_y;
        Serial.println("INFO: Move queued.");
        emitQueueStatus();
        return;
      }
      startTrajectory(new_x, new_y);
    }
    return;
  }

  // Gain tuning — valid di SCARA, TEST, dan ZN
  if (input.startsWith("kp1,")) { Kp1 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("ki1,")) { Ki1 = input.substring(4).toFloat(); integral1 = 0.0f; emitGains(); return; }
  if (input.startsWith("kd1,")) { Kd1 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("kp2,")) { Kp2 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("ki2,")) { Ki2 = input.substring(4).toFloat(); emitGains(); return; }
  if (input.startsWith("kd2,")) { Kd2 = input.substring(4).toFloat(); emitGains(); return; }

  // FF blend — valid di SCARA dan TEST
  if (input.startsWith("ffi,")) {
    FF_INERTIA  = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }
  if (input.startsWith("ffc,")) {
    FF_CORIOLIS = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }
  if (input.startsWith("ffg,")) {
    FF_GRAVITY  = constrain(input.substring(4).toFloat(), 0.0f, 1.0f);
    emitGains(); return;
  }

  Serial.println("ERR: Unknown command.");
}

// ============================================================
//  SERVICE SERIAL
// ============================================================

void serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    last_serial_rx_ms = millis();

    if (watchdog_halted) {
      watchdog_halted = false;
      Serial.println("INFO: Serial restored — kirim mode,scara / mode,zn / mode,test.");
    }

    if (c == '\n' || c == '\r') {
      if (serial_idx > 0) {
        serial_buf[serial_idx] = '\0';
        processSerialCommand(serial_buf);
        serial_idx = 0;
      }
    } else if (serial_idx < (sizeof(serial_buf) - 1)) {
      serial_buf[serial_idx++] = c;
    }
  }
}

// ============================================================
//  SETUP
// ============================================================

void setup() {
  Serial.begin(921600);
  delay(100);
  while (Serial.available()) Serial.read();

  pinMode(DC_IN3, OUTPUT);
  pinMode(DC_IN4, OUTPUT);
  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);
  pinMode(MS1, OUTPUT);
  pinMode(MS2, OUTPUT);
  pinMode(MS3, OUTPUT);

  digitalWrite(MS1, HIGH);
  digitalWrite(MS2, HIGH);
  digitalWrite(MS3, HIGH);
  digitalWrite(DC_IN3, LOW);
  digitalWrite(DC_IN4, LOW);
  digitalWrite(STEP_PIN, LOW);
  digitalWrite(DIR_PIN, LOW);

  pwmSetup();
  pwmWrite(0);
  delay(200);

  // Seed filter dari 8 sample ADC awal
  {
    int s1 = 0, s2 = 0;
    for (int i = 0; i < 8; i++) {
      s1 += analogRead(DC_POT_PIN);
      s2 += analogRead(STEP_POT_PIN);
    }
    float seed1 = mapADCtoRadJ1(s1 >> 3);
    float seed2 = mapADCtoRadJ2(s2 >> 3);

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

  integral1 = 0.0f;
  integral2 = 0.0f;
  motor1_active = false;
  last_pwm1     = 0;
  estop_active  = false;
  pending_move  = false;

  elbow_config = (theta2 > 0.009f) ? 1 : ((theta2 < -0.009f) ? -1 : 1);

  float x_init, y_init;
  FK(theta1, theta2, x_init, y_init);
  traj_xf = traj_x_cmd = x_init;
  traj_yf = traj_y_cmd = y_init;

  // Boot ke MODE_IDLE — assign function pointer via transitionToMode
  // Tidak bisa panggil transitionToMode langsung karena allOutputsOff
  // butuh hardware sudah siap — sudah di atas. Set manual:
  op_mode          = MODE_IDLE;
  active_sensor_fn  = sensorWithTD;
  active_desired_fn = desiredIdle;
  active_output_fn  = outputIdle;

  Serial.println("==========================================");
  Serial.println("  SCARA Robot   |  Experiment Mode        ");
  Serial.println("  Adi Haditya Nursyam — ITB 2026           ");
  Serial.println("==========================================");
  Serial.println("INFO: Boot state = MODE_IDLE.");
  Serial.println("INFO: Kirim 'mode,scara', 'mode,zn', atau 'mode,test'.");

  emitPosition();
  Serial.print("X,"); Serial.println(MODE_NAMES[op_mode]);

  last_serial_rx_ms = millis();
  last_control_us   = micros();
  last_step_us      = micros();
}

// ============================================================
//  MAIN LOOP
// ============================================================

void loop() {
  unsigned long now_us = micros();
  unsigned long now_ms = millis();

  // ----------------------------------------------------------
  // WATCHDOG SERIAL
  // ----------------------------------------------------------
  if (op_mode != MODE_IDLE && (now_ms - last_serial_rx_ms) > SERIAL_WATCHDOG_MS) {
    watchdog_halted = true;
    Serial.println("WARN: Serial watchdog timeout — masuk MODE_IDLE.");
    transitionToMode(MODE_IDLE);
  }

  // ----------------------------------------------------------
  // CONTROL TICK — 500 Hz
  // ----------------------------------------------------------
  if (now_us - last_control_us >= (1000000UL / (unsigned long)CONTROL_FREQ)) {
    last_control_us = now_us;
    runControlLoop();
  }

  // ----------------------------------------------------------
  // STEPPER PULSE — free-running, resolusi micros()
  // ----------------------------------------------------------
  serviceStepperPulse();

  // ----------------------------------------------------------
  // DRAIN D-LINE BUFFER — non-blocking TX ke UART
  // ----------------------------------------------------------
  drainDLineBuffer();

  // ----------------------------------------------------------
  // SERIAL RX
  // ----------------------------------------------------------
  serviceSerial();

  // ----------------------------------------------------------
  // TELEMETRI E / F / T — 50 Hz
  // ----------------------------------------------------------
  if (op_mode != MODE_IDLE && !estop_active
      && (now_ms - last_telemetry_ms >= TELEMETRY_MS)) {
    last_telemetry_ms = now_ms;

    float x_act, y_act;
    FK(theta1, theta2, x_act, y_act);

    // [E] PID effort J1 + loop duration
    float effort_to_pwm = (float)PWM_MAX / U1_MAX;
    Serial.print("E,");
    Serial.print(now_ms);          Serial.print(",");
    Serial.print(p1_out * effort_to_pwm, 1); Serial.print(",");
    Serial.print(i1_out * effort_to_pwm, 1); Serial.print(",");
    Serial.print(d1_out * effort_to_pwm, 1); Serial.print(",");
    Serial.println(loop_duration_us);

    // [F] CTC komponen terpisah + integral2
    // F,<ms>,<inertia1>,<coriolis1>,<gravity1>,
    //        <inertia2>,<coriolis2>,<gravity2>,
    //        <ff1_contrib>,<u1_total>,<integral1>,
    //        <delta_omega_ff>,<omega2_raw>,<integral2>
    Serial.print("F,");
    Serial.print(now_ms);               Serial.print(",");
    Serial.print(ctc_inertia1,  5);     Serial.print(",");
    Serial.print(ctc_coriolis1, 5);     Serial.print(",");
    Serial.print(ctc_gravity1,  5);     Serial.print(",");
    Serial.print(ctc_inertia2,  5);     Serial.print(",");
    Serial.print(ctc_coriolis2, 5);     Serial.print(",");
    Serial.print(ctc_gravity2,  5);     Serial.print(",");
    Serial.print(ff1_contrib_out, 4);   Serial.print(",");
    Serial.print(u1_total_out,    4);   Serial.print(",");
    Serial.print(integral1,       4);   Serial.print(",");
    Serial.print(delta_omega_ff_out, 4); Serial.print(",");
    Serial.print(omega2_raw_out,  4);   Serial.print(",");
    Serial.println(integral2,     4);

    // [T] Cartesian position
    Serial.print("T,");
    Serial.print(traj_x_cmd * 1000.0f, 3); Serial.print(",");
    Serial.print(traj_y_cmd * 1000.0f, 3); Serial.print(",");
    Serial.print(x_act * 1000.0f,      3); Serial.print(",");
    Serial.println(y_act * 1000.0f,    3);
  }
}
