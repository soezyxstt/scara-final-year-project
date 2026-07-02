// ============================================================
//  constants.ts — Physical footprint dimensions (mm)
//  Sourced from datasheets/vendor drawings, not measured by eye.
// ============================================================

// ---- Generic 0.1" pin headers (POT1, POT2, ENC, STEPPER, etc.) -----------
// Used for wire-to-board headers on this revision (not a specific JST part
// number — confirmed 2.54mm pitch, not the 2.5mm JST XH pitch).
export const HEADER_PIN_PITCH = 2.54

// JST-style housing body, for silkscreen outlines only (not real JST XH
// pitch — see above). From the JST outline-drawing table: body width B is
// always pin-span A + 4.9mm regardless of pole count or pitch (the table's
// A/B pairs all satisfy B - A = 4.9 exactly, e.g. 2-pole 2.5/7.4, 15-pole
// 35.0/39.9). Body depth (perpendicular to the pin row) is 7.0mm.
export const JST_BODY_OVERHANG = 4.9   // added to pin span to get body width
export const JST_BODY_DEPTH = 7.0      // body dimension across the pin row

// ---- A4988 stepper driver carrier (Pololu-style, 16-pin 2x8) -------------
// Board: 0.6" x 0.8" (15.24mm x 20.32mm). Two rows of 8 holes, 0.1" (2.54mm)
// pitch within a row, 0.5" (12.7mm) between the two rows.
export const A4988_PIN_PITCH = 2.54
export const A4988_ROW_SPACING = 12.7
export const A4988_BOARD_WIDTH = 20.32
export const A4988_BOARD_HEIGHT = 15.24

// ---- LM2596 buck converter module (no-LED variant) ------------------------
// Vendor dimension drawing: 43.18mm x 21.082mm board. IN/OUT pin pairs are
// 39.497mm apart horizontally, 17.145mm apart vertically (IN+/IN- span).
// (The module's own two large mounting/jumper holes are NOT replicated on this
// carrier — it's held by its soldered pins, so those holes had no function.)
export const LM2596_BOARD_WIDTH = 43.18
export const LM2596_BOARD_HEIGHT = 21.082
export const LM2596_PIN_SPAN_X = 39.497
export const LM2596_PIN_SPAN_Y = 17.145

// ---- DC barrel power jack (5.5x2.1mm, THT, switched) ----------------------
// PCB hole pattern: SW and VCC pins on one row, GND (sleeve) tab offset
// 4.8mm below — confirmed against vendor drawing. SW/VCC spacing kept at
// the previously-validated 6.0mm (the datasheet's PCB-hole view doesn't
// give an unambiguous alternate spacing; leg width is 2.4mm, leg thickness
// <2mm, which doesn't change the hole pitch).
export const DC_JACK_SW_VCC_HALF_SPACING = 3.0   // SW at -3.0, VCC at +3.0
export const DC_JACK_GND_Y_OFFSET = 4.8
export const DC_JACK_BODY_WIDTH = 12.0
export const DC_JACK_BODY_HEIGHT = 11.0

// ---- ESP32 DevKitC (38-pin, WROOM-32) --------------------------------------
// Vendor dimension drawing: 54.6mm x 27.94mm outer board. Header pins are
// 0.1" (2.54mm) pitch, 19 per side, rows spaced 25.4mm (1") apart center-
// to-center — the drawing's 45.72mm figure is the first-pin-to-last-pin
// span along a row ((19-1) * 2.54 = 45.72), not the row spacing.
export const ESP32_DEVKIT_PIN_PITCH = 2.54
export const ESP32_DEVKIT_ROW_SPACING = 25.4
export const ESP32_DEVKIT_BOARD_WIDTH = 54.6
export const ESP32_DEVKIT_BOARD_HEIGHT = 27.94
