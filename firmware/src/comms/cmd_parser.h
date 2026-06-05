
#pragma once

// ============================================================
//  comms/cmd_parser.h — Serial command processor
//  Parses null-terminated command string and dispatches.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Process a single null-terminated command from the serial buffer.
// Guard structure:
//   always-valid → mode transitions → IDLE guard →
//   ZN-exclusive → TEST-exclusive → SCARA+TEST shared →
//   all-active-modes (gains + ff)
void processSerialCommand(const char *cmd_raw);
