import { DSample as GeneratedDSample, Gains as GeneratedGains, AdvParams as GeneratedAdvParams } from './telemetry-types'

export type SerialStatus = 'connected' | 'reconnecting' | 'disconnected'
export type RecordingState = 'REC' | 'IDLE' | 'WAITING'

export interface TPoint {
  xi: number  // ideal X mm
  yi: number  // ideal Y mm
  xa: number  // actual X mm
  ya: number  // actual Y mm
}

export interface DSample {
  t: number
  th1: number   // actual
  th2: number   // actual
  th1d: number  // desired
  th2d: number  // desired
  dth1: number  // actual velocity (was v1)
  dth2: number  // actual velocity (was v2)
  dth1d: number // desired velocity (was v1d)
  dth2d: number // desired velocity (was v2d)
  pwm1: number
  th1raw: number
  th2raw: number
  vff1?: number
  u1Total: number  // total J1 control effort before PWM mapping (same tick as pwm1)
  // computed by HMI (not from firmware):
  e1: number    // = th1d - th1
  e2: number    // = th2d - th2
  idx: number
}

export interface FSample {
  t: number
  inertia1: number
  coriolis1: number
  gravity1: number
  inertia2: number
  coriolis2: number
  gravity2: number
  ff1Contrib: number
  u1Total: number
  integral1: number
  deltaOmegaFf: number
  omega2Raw: number
  integral2: number
}

export interface ESample {
  t: number
  p1_out: number
  i1_out: number
  d1_out: number
  loop_duration_us: number
}

export interface AdvParams {
  vmax: number; amax: number; cfreq: number; u1max: number;
  fzt: number; pwmDb: number; td1r: number; td2r: number;
  tdH: number; ddth: number; dben: number; dbrel: number;
  dbvel: number; hskp: number; hskd: number; idecay: number;
  taunom: number; m22ref: number;
  alphaTiltDeg: number;
  tdEnabled: boolean;
  trapEnabled: boolean;
  ki2GateRad: number;
  db2en: number;
  db2rel: number;
  errDz: number;
  integralFreezeThresh: number;
  // New fields: kickstart and dynamic deadband moving options
  fztKickPct?: number;        // fraction of `fzt` used during kickstart (0.1 = 10%)
  kickstartEnabled?: boolean;
  dbMovingEnabled?: boolean;
  dbEngageScale?: number;
  kvVel?: number;
  vffMaxFrac?: number;
  vffDvMax?: number;
}

export interface ZNSample {
  idx: number
  t: number // elapsed time in seconds
  t1_target: number
  t1_actual: number
  t2_target: number
  t2_actual: number
  pwm1: number
  /** Joint 1 raw ADC position before TD filter (degrees, for noise overlay). */
  t1_raw: number
  /** Joint 2 raw ADC position before TD filter (degrees, for noise overlay). */
  t2_raw: number
  /** Joint 1 velocity (deg/s) */
  v1: number
  /** Joint 2 velocity (deg/s) */
  v2: number
}

export interface Gains {
  kp1: number; ki1: number; kd1: number;
  kp2: number; ki2: number; kd2: number;
  mstep: number;
  ffInertia: number;   // was ff1
  ffCoriolis: number;  // new
  ffGravity: number;   // was ff2 (gravity was part of ff2)
}

export interface MoveInfo {
  x0: number; y0: number
  xf: number; yf: number
}

export interface Stats {
  n: number
  max_err: number
  mean_err: number
  final_err: number
  pwm_max: number
  accuracy_idx: number
  MATE?: number
  MCTE?: number
  RMS_ATE?: number
  error_ratio?: number
  elapsed_time?: number
}

export type ESPMode = 'IDLE' | 'SCARA' | 'ZN' | 'TEST'

export interface HMIState {
  serialStatus: SerialStatus
  portName: string | null
  online: boolean
  /** ESP32 mode dari packet X,<MODE>. null = belum pernah connect. */
  currentMode: ESPMode | null
  recordingState: RecordingState
  moveCount: number
  currentMove: MoveInfo | null
  dBuffer: DSample[]
  tBuffer: TPoint[]
  fBuffer: FSample[]
  eBuffer: ESample[]
  prevTBuffer: TPoint[]
  showGhost: boolean
  frozenD: DSample[]
  frozenT: TPoint[]
  frozenF: FSample[]
  frozenE: ESample[]
  stats: Stats | null
  gains: Gains | null
  params: AdvParams | null
  hasSyncedParams: boolean
  queueStatus: { pendingStatus: number; pendingX: number; pendingY: number } | null
  logLines: string[]
  previewTarget: { x: number; y: number } | null
  bootPose: { x: number; y: number; th1: number; th2: number } | null
  pickedTarget: { x: number; y: number } | null
  estopped: boolean
  /** Current target input values from control panel (kept in sync for Run button) */
  targetInputX: number | null
  targetInputY: number | null
  /** Set before a run to trigger save-to-DB after move completes */
  pendingSave: { name: string; startedAt: number } | null
  lastSavedRunId: string | null
}

export type HMIAction =
  | { type: 'SERIAL_STATUS'; status: SerialStatus; portName?: string }
  | { type: 'ONLINE_STATUS'; online: boolean }
  | { type: 'MODE_CHANGE'; payload: ESPMode }
  | { type: 'MOVE_START'; info: MoveInfo }
  | { type: 'MOVE_CONTINUE'; info: MoveInfo }
  | { type: 'MOVE_END' }
  | { type: 'T_SAMPLE'; point: TPoint }
  | { type: 'D_SAMPLE'; sample: DSample }
  | { type: 'F_SAMPLE'; sample: FSample }
  | { type: 'E_SAMPLE'; sample: ESample }
  | { type: 'BATCH_SAMPLES'; tPoints: TPoint[]; dSamples: DSample[]; fSamples: FSample[]; eSamples: ESample[] }
  | { type: 'GAINS'; gains: Gains }
  | { type: 'PARAMS'; params: AdvParams }
  | { type: 'QUEUE_STATUS'; status: { pendingStatus: number; pendingX: number; pendingY: number } }
  | { type: 'LOG_LINE'; line: string }
  | { type: 'FLUSH_BUFFERS' }
  | { type: 'CLEAR_LOGS' }
  | { type: 'TOGGLE_GHOST' }
  | { type: 'SET_PREVIEW_TARGET'; target: { x: number; y: number } | null }
  | { type: 'BOOT_POSE'; pose: { x: number; y: number; th1: number; th2: number } }
  | { type: 'PICK_TARGET'; target: { x: number; y: number } }
  | { type: 'CLEAR_PICKED_TARGET' }
  | { type: 'SET_ESTOP'; payload: boolean }
  | { type: 'SET_TARGET_INPUT'; x: number | null; y: number | null }
  | { type: 'SET_PENDING_SAVE'; name: string; startedAt: number }
  | { type: 'CLEAR_PENDING_SAVE' }
  | { type: 'SET_LAST_SAVED_RUN_ID'; runId: string | null }

export interface SerialController {
  connect: () => Promise<void>
  connectToPort: (port: SerialPort) => Promise<void>
  disconnect: () => Promise<void>
  sendCommand: (cmd: string) => Promise<void>
  reconnect: () => Promise<void>
}
