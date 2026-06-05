
// ============================================================
//  kinematics/kinematics.cpp — Pure geometric functions
//  Adi Haditya Nursyam — ITB 2026
// ============================================================

#include "kinematics.h"
#include "config.h"

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

void computeJacobian(float th1d, float th2d,
                     float &J11, float &J12,
                     float &J21, float &J22) {
  float s1  = sinf(th1d);
  float c1  = cosf(th1d);
  float s12 = sinf(th1d + th2d);
  float c12 = cosf(th1d + th2d);

  J11 = -L1 * s1 - L2 * s12;
  J12 = -L2 * s12;
  J21 =  L1 * c1 + L2 * c12;
  J22 =  L2 * c12;
}
