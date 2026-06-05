
#pragma once

// ============================================================
//  comms/serial_protocol.h — Telemetry packet emitters
//  D-line ring buffer + drain, G/K/P/Q/X emitters.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Write a D-line snapshot into the ring buffer (called from control tick).
// Non-blocking: skips write if buffer is full.
void writeDLineToBuffer();

// Drain up to 2 ring buffer entries to UART (called from loop()).
void drainDLineBuffer();

// G-packet: gains + FF blend factors
void emitGains();

// K-packet: 22 runtime parameters [0..21]
void emitParams();

// P-packet: current Cartesian position + joint angles
void emitPosition();

// Q-packet: pending move queue status
void emitQueueStatus();

// Emit G + K + P + Q + X packets
void emitFullState();

// Non-blocking serial RX → feeds processSerialCommand()
void serviceSerial();
