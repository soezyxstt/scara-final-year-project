// Shared SCARA arm physical geometry — must match firmware/include/config.h
// (L1/L2) and the SolidWorks CAD assemblies in hmi/public/models/.

export const ARM_L1_MM = 100  // J1 (inner) link length
export const ARM_L2_MM = 70   // J2 (outer) link length

// Mounting height (Z) of each link assembly's pivot above the base plane,
// per the SolidWorks CAD stack-up. The base and J1 exports share an origin;
// base.glb extends 62 mm below it, so placing that origin at Z=62 rests the
// static base on the workspace plane. J2 keeps the same 30 mm offset from J1.
export const J1_MOUNT_Z_MM = 62
export const J2_MOUNT_Z_MM = 32


/** Forward kinematics — matches firmware/src/kinematics/kinematics.cpp. */
export function forwardKinematics(th1: number, th2: number) {
  const elbowX = ARM_L1_MM * Math.cos(th1)
  const elbowY = ARM_L1_MM * Math.sin(th1)
  const tipX = elbowX + ARM_L2_MM * Math.cos(th1 + th2)
  const tipY = elbowY + ARM_L2_MM * Math.sin(th1 + th2)
  return { elbowX, elbowY, tipX, tipY }
}
