
#pragma once

// ============================================================
//  kinematics/kinematics.h — Pure geometric functions
//  No global state access, no side effects.
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include <Arduino.h>

// Forward kinematics: joint angles → Cartesian position [m]
void FK(float th1, float th2, float &x, float &y);

// Inverse kinematics: Cartesian position → joint angles [rad]
// config: +1 = elbow-up, -1 = elbow-down
// Returns false if target is outside workspace.
bool IK(float x, float y, int config, float &th1, float &th2);

// Jacobian columns evaluated at current desired configuration.
// [J11 J12]   [xdot]   [th1dot]
// [J21 J22] * [      ] = [       ]
//             [ydot ]   [th2dot ]
void computeJacobian(float th1d, float th2d,
                     float &J11, float &J12,
                     float &J21, float &J22);
