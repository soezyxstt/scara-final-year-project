# SCARA Controller PCB (tscircuit)

ESP32 DevKitC "motherboard" that sockets an A4988 stepper driver carrier and
an LM2596 buck module (no-LED variant), regulates power, and breaks out the
potentiometer, quadrature-encoder, and off-board L298N control signals.

This board does **not** require you to solder the MCU or the driver chip by
hand — you buy the ESP32 DevKitC, the A4988 carrier, and the LM2596 module
separately, and they plug into headers/sockets on this PCB (same idea as a
RAMPS/CNC-shield board).

**Pin assignments match `firmware/include/config.h` 1:1.** The Joint 1 DC
motor is driven by an **off-board L298N H-bridge** — this PCB does not carry
the H-bridge itself, it breaks out 12V/5V/GND plus the three control signals
(IN3=IO16, IN4=IO17, EN=IO18) to the `J_DC` header. A new 4-pin `J_ENC`
header adds a quadrature encoder (A=IO25, B=IO26) for closed-loop Joint 1
feedback.

**Grounding:** a solid bottom-layer copper pour tied to `net.GND` acts as the
ground plane; every GND pad ties to it. Rails are named nets (`V12`, `V5`,
`V3V3`, `GND`) so the schematic renders clean power/ground flags.

## What's been verified

This design has been built and checked with tscircuit's own DRC/connectivity
checker (`@tscircuit/core`) — **0 errors**: no shorts, no missing nets, no
pad-clearance violations, no footprint overlaps. What has **not** been
verified: exact manufacturable footprints for the ESP32 DevKitC header pitch
and the A4988 socket pitch — those use best-known nominal dimensions, but you
should confirm them against your actual boards before ordering copper (see
"Before you fab" below).

## Setup (on your own machine — this needs internet access)

```bash
# 1. Install bun (tscircuit's CLI requires it)
curl -fsSL https://bun.sh/install | bash

# 2. Install dependencies
cd .temp
bun install --ignore-scripts   # --ignore-scripts works around a sharp/Windows install crash

# 3. Live preview (schematic + PCB + 3D, hot reload like Next.js)
npx tscircuit dev
# open http://localhost:3020
```

## Files

- `index.tsx` — the board. Default export, this is what `tsci dev` renders.
- `validate.tsx` — headless DRC/connectivity check script. Run with
  `bun run validate.tsx`.
- `package.json`, `tsconfig.json` — minimal config to run both of the above.

## Bill of materials (besides the PCB itself)

| Ref | Part | Notes |
|---|---|---|
| U1 | ESP32 DevKitC (38-pin) | Socketed via 2× 1×19, 2.54mm female headers, 25.4mm row spacing. Onboard USB-UART, 3.3V LDO, EN/BOOT buttons — none of that is duplicated on this PCB. |
| A4988 | A4988 stepper driver carrier (Pololu or clone) | Joint 2. Plugs into the A4988 socket. MS1/MS2/MS3 are tied to 3V3 on the board (fixed 1/16 step); EN tied to GND (always enabled); RESET+SLEEP tied together to 3V3. |
| U2 | LM2596 adjustable buck module — no-LED version | 12V→5V. Modeled on the real full-size "LM2596S ADJ" module (~43×21mm): IN+/IN- on the left edge, OUT+/OUT- on the right edge, current flows left-to-right. |
| PWR_IN | 3-pin terminal (stand-in for a 5.5×2.1mm female DC barrel jack) | 12V supply in. VCC (center pin), GND (sleeve), and the normally-closed switch/detect leg (tied to GND). |
| STEPPER | 4-pin terminal | Joint 2 stepper motor coils (1A/1B/2A/2B). |
| J_DC | 6-pin header | Off-board **L298N** breakout for the Joint 1 DC motor: V12, GND, IN3=IO16, IN4=IO17, ENA=IO18, V5. |
| POT1 | 3-pin header + bypass | Joint 1 (DC) position pot → IO39. Brush-EMI filtering is done off-board (external LPF); C_POT1 (1µF) is just a local bypass at the ADC pin. |
| POT2 | 3-pin header + bypass | Joint 2 (stepper) position pot → IO36, with C_POT2 (1µF) bypass. |
| ENC | 4-pin header | Joint 1 quadrature encoder: 3V3, GND, ENC_A=IO25, ENC_B=IO26. |
| J_EXP | 8-pos 3.5mm screw terminal | Spare-GPIO expansion for future sensors: 3V3, GND, IO21 (I2C SDA), IO22 (I2C SCL), IO19, IO23, IO5, IO4 (ADC2). All firmware-untouched. IO5 is boot-strapping (idles HIGH) — don't pull LOW at power-on. (IO27/IO34 were remapped here onto the ESP32 right column so expansion nets don't cross the DIP.) |

## ESP32 GPIO map (matches `firmware/include/config.h`)

| Signal | GPIO | Why |
|---|---|---|
| Stepper STEP | IO14 | A4988 step pulse (J2) |
| Stepper DIR | IO12 | A4988 direction (J2) |
| Stepper MS1/MS2/MS3 | tied to 3V3 | fixed 1/16 microstep — firmware never toggles them, so they are hardwired (frees IO33/32/35 and removes the IO35 input-only bug) |
| DC motor IN3 | IO16 | L298N direction A (J1, via J_DC) |
| DC motor IN4 | IO17 | L298N direction B (J1, via J_DC) |
| DC motor EN | IO18 | L298N PWM speed, LEDC (J1, via J_DC) |
| Joint 2 pot wiper | IO36 | ADC1_CH0 — readable while WiFi is on |
| Joint 1 pot wiper | IO39 | ADC1_CH3 — RC-filtered (brush EMI) |
| Encoder A | IO25 | Joint 1 quadrature encoder (new) |
| Encoder B | IO26 | Joint 1 quadrature encoder (new) |

Four rails exist on this board: `V12`, `V5`, `V3V3`, and `GND`. The DevKitC's
own onboard regulator produces 3.3V, which is pulled back out of its `3V3` pin
(the `V3V3` net) to power the A4988 logic (`VDD`), the hardwired MS pins, the
pots, and the encoder header. `GND` is a solid bottom-layer copper pour.

## What changed in the manufacturing revision

This revision realigns the board to the **actual firmware** (`config.h`),
which drives a Joint 1 DC motor and reads two pots — earlier drafts had the
pins and the DC-motor handling wrong.

- **Pins now match `config.h` 1:1**: STEP=IO14, DIR=IO12, J2 pot=IO36, J1
  pot=IO39, and DC-motor control IN3/IN4/EN=IO16/IO17/IO18. (Previous draft
  had STEP=IO25, pots on IO34/35, encoder on IO16/17 — none of which the
  firmware uses.)
- **DC motor restored as an off-board L298N**: added the `J_DC` 6-pin header
  (V12/GND/IN3/IN4/ENA/V5). The firmware actively PWMs an L298N for Joint 1,
  so the previous "this board does not drive a DC motor" stance was wrong.
  The H-bridge stays off-board; only power + the three control signals are
  broken out.
- **Encoder kept, moved off the conflict**: `ENC` (A/B) now uses IO25/IO26
  because IO16/IO17 are taken by the L298N. This adds the closed-loop Joint 1
  feedback the new board was built for.
- **Microstep pins hardwired**: MS1/MS2/MS3 tie to 3V3 on the PCB (fixed 1/16
  step). This frees IO33/IO32/IO35 and removes the latent bug where MS3 sat on
  input-only IO35 and could not be driven.
- **Ground plane**: added a solid bottom-layer `copperpour` on `net.GND` and
  replaced the fragile hand-routed star-ground chain with per-pad ties to the
  net. Rails are named nets so the schematic gets proper power/ground flags.
- **J1 analog bypass**: `C_POT1` (1µF) is a local bypass at IO39 for ADC
  settling. The main brush-EMI low-pass is handled by an off-board LPF, so the
  on-board series resistor was dropped to avoid double-filtering and excess
  ADC source impedance.
- **Spacing & size**: the `PWR_IN` silkscreen no longer overhangs the board
  edge, and the LM2596↔ESP32 gap was opened up. The board is tightly packed
  at **96×66mm** — width is set by the 43mm LM2596 + ESP32 + right-edge
  terminals; the rest of the empty space was trimmed out.
- **Expansion terminal**: added `J_EXP`, an 8-position 3.5mm screw terminal
  breaking out spare GPIO (I2C + digital + an ADC1 analog-in) plus 3V3/GND for
  future sensors, with per-pin silkscreen labels.

## Before you fab (i.e. before you actually order copper)

1. **Swap in real footprints.** The DevKitC header pitch/spacing and the
   A4988 socket pitch were built from best-known nominal dimensions. Once
   you're in `tsci dev` with real internet, use the part-import dialog to
   confirm:
   - your specific ESP32 DevKitC variant's row spacing (commonly 25.4mm, but
     some narrower clones use ~22.86mm)
   - your A4988/Pololu module's exact pin spacing
   - a real female DC barrel jack footprint in place of the `PWR_IN`
     3-pin terminal placeholder
2. **Trace widths.** Per-trace width is set with the **`thickness`** prop on
   `<trace>` (the `pcbRouteWidth` prop is silently ignored by this autorouter —
   don't use it). Signals fall back to the board `minTraceWidth` floor of
   **0.25mm**; power/coil nets are explicitly fatter: `V12` 0.8mm, stepper
   coils 0.6mm, motor-side `GND` ties 0.8mm, `5V`/`3V3` 0.3–0.6mm. `GND`'s real
   return current rides the bottom pour. Power traces can still pinch to the
   0.25mm floor where they squeeze through tight pad gaps — widen by hand in
   `tsci dev` if a specific run needs guaranteed copper end-to-end.
3. **Pour review.** Review the GND pour stitching (the vias tying top traces to
   the bottom plane — the small dots you see in the layout view) before fab.
4. **Firmware cleanup (optional).** Since MS1/2/3 are hardwired, you can drop
   the `MS1/MS2/MS3` defines and their `pinMode`/`digitalWrite` calls from the
   firmware — they now drive nothing. Harmless to leave, but tidier to remove.
