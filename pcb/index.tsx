import React from "react"

// ---------------------------------------------------------------------------
// SCARA Controller Board — Manufacturing Revision (firmware-matched)
//
// This board is the ESP32 DevKitC "motherboard". It sockets an A4988 stepper
// carrier and an LM2596 buck module, regulates power, and breaks out the
// potentiometer, encoder and (off-board) L298N control signals.
//
// Pin assignments MATCH firmware/include/config.h 1:1 (see GPIO map below).
//
// KEY DESIGN POINTS:
//  1. Solid bottom-layer GND copper pour (ground plane) — every GND pad ties
//     to net.GND, the pour stitches them together. Removes the old fragile
//     hand-routed star-ground daisy chain.
//  2. Named rails (V12 / V5 / V3V3 / GND) so the schematic renders clean net
//     labels instead of long crossing wires.
//  3. Explicit schX/schY on every part so the schematic lays out left→right
//     instead of collapsing on the origin.
//  4. DC motor is NOT driven on this board — IO16/IO17/IO18 + 12V/5V/GND are
//     broken out to J_DC for an off-board L298N H-bridge (Joint 1).
//  5. MS1/MS2/MS3 hardwired to 3V3 (fixed 1/16 microstep, matches firmware
//     which never toggles them). A4988 EN tied to GND (always enabled).
//  6. J1/J2 pot lines have a 1uF local bypass at the ADC pin for SAR settling.
//     The main brush-EMI low-pass for J1 is an off-board LPF, so no on-board
//     series resistor (avoids double-filtering + excess ADC source impedance).
// ---------------------------------------------------------------------------

// ===========================================================================
//  ESP32 GPIO MAP  (matches firmware/include/config.h)
// ---------------------------------------------------------------------------
//  IO14  A4988 STEP          IO36  J2 stepper pot wiper (ADC1, in-only)
//  IO12  A4988 DIR           IO39  J1 dc-motor pot wiper (ADC1, in-only, RC)
//  IO16  L298N IN3  (J_DC)   IO25  Encoder A  (NEW)
//  IO17  L298N IN4  (J_DC)   IO26  Encoder B  (NEW)
//  IO18  L298N EN   (J_DC)   MS1/2/3  -> 3V3 (fixed 1/16)
// ===========================================================================

// ---- helpers --------------------------------------------------------------

function pinRow(labels: string[], opts: { x: number; y: number; pitch: number; axis?: "x" | "y" }) {
  const { x, y, pitch, axis = "x" } = opts
  return labels.map((label, i) => (
    <platedhole
      key={`${label}_${i}`}
      portHints={[label]}
      pcbX={axis === "x" ? x + i * pitch : x}
      pcbY={axis === "x" ? y : y + i * pitch}
      holeDiameter="1mm"
      outerDiameter="1.8mm"
      shape="circle"
    />
  ))
}

function Connector(props: {
  name: string
  pcbX: number
  pcbY: number
  schX?: number
  schY?: number
  rows: { labels: string[]; pitch: number; rowOffsetY?: number }[]
  axis?: "x" | "y"
}) {
  const { axis = "x" } = props
  const holes = props.rows.flatMap((r) => {
    const span = (r.labels.length - 1) * r.pitch
    return pinRow(r.labels, {
      x: axis === "x" ? -span / 2 : (r.rowOffsetY ?? 0),
      y: axis === "x" ? (r.rowOffsetY ?? 0) : -span / 2,
      pitch: r.pitch,
      axis
    })
  })
  return (
    <connector
      name={props.name}
      pcbX={props.pcbX}
      pcbY={props.pcbY}
      schX={props.schX}
      schY={props.schY}
      footprint={<footprint>{holes}</footprint>}
    />
  )
}

// ---- footprints -----------------------------------------------------------

// Physical pin order of the real 38-pin ESP32-DevKitC-V4 (top -> bottom).
// Left col = module pins 1..19, right col = pins 20..38. VP=IO36, VN=IO39.
// D2/D3/CMD/D0/D1/CLK are the internal-flash pins (GPIO6-11) — NOT usable.
const DEVKITC_LEFT = ["3V3", "EN", "IO36", "IO39", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND_1", "IO13", "D2", "D3", "CMD", "5V"]
const DEVKITC_RIGHT = ["GND_2", "IO23", "IO22", "TXD0", "RXD0", "IO21", "GND_3", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "D1", "D0", "CLK"]

function DevKitCSocket(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pitch = 2.54; const rowSpacing = 25.4
  const leftHoles = DEVKITC_LEFT.map((label, i) => <platedhole key={`l_${label}`} portHints={[label]} pcbX={-rowSpacing / 2} pcbY={(DEVKITC_LEFT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.8mm" shape="circle" />)
  const rightHoles = DEVKITC_RIGHT.map((label, i) => <platedhole key={`r_${label}`} portHints={[label]} pcbX={rowSpacing / 2} pcbY={(DEVKITC_RIGHT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.8mm" shape="circle" />)
  return <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{[...leftHoles, ...rightHoles]}</footprint>} />
}

function Lm2596Module(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pinInsetX = 39.497 / 2; const pinOffsetY = 17.145 / 2
  const holeX = 14.986
  const holeY = 8.001

  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          {/* Electrical Pads */}
          <platedhole portHints={["IN_POS"]} pcbX={-pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["IN_NEG"]} pcbX={-pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_POS"]} pcbX={pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_NEG"]} pcbX={pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />

          {/* Non-plated mounting holes (3mm diameter for M3 screws) */}
          <platedhole pcbX={-holeX} pcbY={holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
          <platedhole pcbX={holeX} pcbY={-holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={43.18} height={21.082} strokeWidth={0.3} />
    </>
  )
}

function DcPwrJack(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["SW"]} pcbX={-3.0} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["VCC"]} pcbX={3.0} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["GND"]} pcbX={0.0} pcbY={-4.8} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
        </footprint>
      } />
      {/* Centered silkscreen body — stays on-board */}
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY - 1.5} width={12.0} height={11.0} strokeWidth={0.3} />
    </>
  )
}

function RadialCapacitor(props: { name: string; pcbX: number; pcbY: number; diameter: number; isPolarized?: boolean; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["POS"]} pcbX={-1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.8mm" shape="circle" />
          <platedhole portHints={["NEG"]} pcbX={1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.8mm" shape="circle" />
        </footprint>
      } />
      <silkscreencircle pcbX={props.pcbX} pcbY={props.pcbY} radius={props.diameter / 2} strokeWidth={0.3} />
      {props.isPolarized && <silkscreentext text="+" pcbX={props.pcbX - 2.5} pcbY={props.pcbY + 2.0} fontSize={1.5} anchorAlignment="center" />}
    </>
  )
}

function ScrewTerminal(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number; labels: string[]; axis?: "x" | "y" }) {
  const pitch = 3.5
  const axis = props.axis ?? "x"
  const span = (props.labels.length - 1) * pitch
  const holes = props.labels.map((l, i) => (
    <platedhole
      key={l}
      portHints={[l]}
      pcbX={axis === "x" ? -span / 2 + i * pitch : 0}
      pcbY={axis === "x" ? 0 : span / 2 - i * pitch}
      holeDiameter="1.2mm"
      outerDiameter="2.6mm"
      shape="circle"
    />
  ))
  const bodyW = axis === "x" ? span + 3.5 : 7
  const bodyH = axis === "x" ? 7 : span + 3.5
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{holes}</footprint>} />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={bodyW} height={bodyH} strokeWidth={0.3} />
      {props.labels.map((l, i) => (
        <silkscreentext
          key={`t_${l}`}
          text={l}
          pcbX={axis === "x" ? props.pcbX - span / 2 + i * pitch : props.pcbX - 4.6}
          pcbY={axis === "x" ? props.pcbY + 4.7 : props.pcbY + span / 2 - i * pitch}
          fontSize={0.9}
          anchorAlignment="center"
        />
      ))}
    </>
  )
}

// ---- board -----------------------------------------------------------------

// Trace widths: minTraceWidth sets the 0.25mm floor (signals fall back to it),
// and each power/coil trace gets an explicit `thickness` below. NOTE the working
// prop is `thickness` (or `width`) on <trace> — `pcbRouteWidth` is silently
// ignored by this autorouter. GND's real return current rides the bottom pour.
export default () => (
  <board width="96mm" height="66mm" minTraceWidth="0.25mm">
    {/* M3 Corner Mounting Holes for Enclosure */}
    <platedhole pcbX={-44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={-44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />

    {/* ZONE 2: BRAIN — ESP32 DevKitC, right-of-center.
        Left column faces the analog/stepper zone; right column faces the
        right-edge motor/expansion terminals. Placement follows pin sides to
        keep traces short and the bottom GND pour intact. */}
    <DevKitCSocket name="ESP32" pcbX={20} pcbY={0} schX={0} schY={0} />

    {/* ZONE 1: NOISY POWER — buck on the left edge (clear of the y=+/-30
        mounting holes); 12V jack above it. Power-only nets, so it does not
        need to sit near any ESP column. */}
    <Lm2596Module name="LM2596" pcbX={-24.5} pcbY={0} schX={-15} schY={2} />
    <DcPwrJack name="PWR_IN" pcbX={-40} pcbY={20} schX={-15} schY={6} />

    {/* ZONE 1b: STEPPER — bottom-left (A4988 logic pins IO14/IO12 on ESP left col) */}
    <Connector name="A4988" pcbX={-27} pcbY={-19} schX={-13} schY={-5} rows={[
      { labels: ["ENABLE", "MS1", "MS2", "MS3", "RESET", "SLEEP", "STEP", "DIR"], pitch: 2.54, rowOffsetY: 3.81 },
      { labels: ["VMOT", "GND_MOT", "1B", "1A", "2A", "2B", "VDD", "GND_LOGIC"], pitch: 2.54, rowOffsetY: -3.81 },
    ]} />
    <RadialCapacitor name="C_BULK" pcbX={-43} pcbY={-19} diameter={6.3} isPolarized schX={-15} schY={-9} />
    <Connector name="STEPPER" pcbX={-27} pcbY={-28} schX={-13} schY={-11} rows={[{ labels: ["1B", "1A", "2A", "2B"], pitch: 2.54 }]} />

    {/* ZONE 3: CLEAN ANALOG & SENSOR — between the buck and the ESP32 left
        column where IO36/IO39 (pots) and IO25/IO26 (encoder) live. */}
    {/* J2 stepper pot -> IO36 (1uF bypass) */}
    <Connector name="POT2" pcbX={-1} pcbY={13} axis="y" schX={15} schY={2} rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: 2.54 }]} />
    <capacitor name="C_POT2" capacitance="1uF" footprint="0805" pcbX={3} pcbY={13} schX={13} schY={3} />
    {/* J1 DC-motor pot -> IO39. External LPF is off-board; C_POT1 is just a
        small local bypass at the ADC pin for SAR settling. */}
    <Connector name="POT1" pcbX={-1} pcbY={5} axis="y" schX={15} schY={-4} rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: 2.54 }]} />
    <capacitor name="C_POT1" capacitance="1uF" footprint="0805" pcbX={3} pcbY={5} schX={13} schY={-6} />
    {/* Encoder -> IO25/IO26 */}
    <Connector name="ENC" pcbX={-1} pcbY={-5} axis="y" schX={15} schY={6} rows={[{ labels: ["V3V3", "GND", "ENC_A", "ENC_B"], pitch: 2.54 }]} />

    {/* ZONE 4: DC-MOTOR (off-board L298N) breakout — right edge, by the ESP32
        right column (IN3/IN4/EN = IO16/IO17/IO18). Screw terminal for the cable. */}
    <ScrewTerminal name="J_DC" pcbX={43} pcbY={-14} axis="y" schX={-2} schY={-9}
      labels={["V12", "GND", "IN3", "IN4", "ENA", "V5"]} />

    {/* ZONE 5: EXPANSION — spare GPIO on a labeled 3.5mm screw terminal, right
        edge by the ESP32 right column. All firmware-untouched & non-strapping.
        IO34 is input-only (ADC1); IO21/IO22 are the default I2C SDA/SCL. */}
    <ScrewTerminal name="J_EXP" pcbX={43} pcbY={13} axis="y" schX={4} schY={-12}
      labels={["V3V3", "GND", "IO21", "IO22", "IO19", "IO23", "IO27", "IO34"]} />

    {/* =========================================================================
        GROUND PLANE — solid bottom-layer pour tied to net.GND
        ========================================================================= */}
    <copperpour layer="bottom" connectsTo="net.GND" />

    {/* Section labels (silkscreen) */}
    <silkscreentext text="ESP32 BRAIN" pcbX={20} pcbY={28} fontSize={1.8} anchorAlignment="center" />
    <silkscreentext text="5V BUCK" pcbX={-24.5} pcbY={0} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="12V IN" pcbX={-40} pcbY={26.5} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="A4988 J2" pcbX={-27} pcbY={-12.5} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="MS=3V3 EN=GND" pcbX={-27} pcbY={-24.5} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="STEPPER" pcbX={-27} pcbY={-31} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="STEP POT" pcbX={-1} pcbY={17.2} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="DC POT" pcbX={-1} pcbY={9} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="ENCODER" pcbX={-1} pcbY={-10.2} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="L298N J1" pcbX={43} pcbY={-25.5} fontSize={1.2} anchorAlignment="center" />
    <silkscreentext text="Adi Haditya Nursyam, M22" pcbX={3} pcbY={-31} fontSize={1.4} anchorAlignment="center" />

    {/* =========================================================================
        POWER RAILS
        ========================================================================= */}

    {/* Per-trace `thickness` IS honored (unlike pcbRouteWidth). Signals fall
        back to the 0.25mm board floor; power/coil nets are explicitly fatter. */}

    {/* ---- 12V high-current (raw supply) — fat, runs in open areas ---- */}
    <trace from=".PWR_IN > .VCC" to="net.V12" thickness="0.8mm" />
    <trace from=".LM2596 > .IN_POS" to="net.V12" thickness="0.8mm" />
    <trace from=".C_BULK > .POS" to="net.V12" thickness="0.8mm" />
    <trace from=".A4988 > .VMOT" to="net.V12" thickness="0.8mm" />
    <trace from=".J_DC > .V12" to="net.V12" thickness="0.8mm" />

    {/* ---- GND ties to net.GND (bottom pour carries the real return current,
        so logic-side ties stay slim; motor-side ties are widened) ---- */}
    <trace from=".PWR_IN > .GND" to="net.GND" thickness="0.8mm" />
    <trace from=".PWR_IN > .SW" to="net.GND" thickness="0.3mm" />
    <trace from=".LM2596 > .IN_NEG" to="net.GND" thickness="0.8mm" />
    <trace from=".LM2596 > .OUT_NEG" to="net.GND" thickness="0.5mm" />
    <trace from=".C_BULK > .NEG" to="net.GND" thickness="0.8mm" />
    <trace from=".A4988 > .GND_MOT" to="net.GND" thickness="0.8mm" />
    <trace from=".A4988 > .GND_LOGIC" to="net.GND" thickness="0.3mm" />
    <trace from=".A4988 > .ENABLE" to="net.GND" thickness="0.3mm" />
    <trace from=".ESP32 > .GND_1" to="net.GND" thickness="0.4mm" />
    <trace from=".ESP32 > .GND_2" to="net.GND" thickness="0.4mm" />
    <trace from=".ESP32 > .GND_3" to="net.GND" thickness="0.4mm" />
    <trace from=".J_DC > .GND" to="net.GND" thickness="0.8mm" />
    <trace from=".POT1 > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".POT2 > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".ENC > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".C_POT1 > .pin2" to="net.GND" thickness="0.3mm" />
    <trace from=".C_POT2 > .pin2" to="net.GND" thickness="0.3mm" />

    {/* ---- 5V logic ---- */}
    <trace from=".LM2596 > .OUT_POS" to="net.V5" thickness="0.6mm" />
    <trace from=".ESP32 > .5V" to="net.V5" thickness="0.6mm" />
    <trace from=".J_DC > .V5" to="net.V5" thickness="0.5mm" />

    {/* ---- 3.3V logic (low current; slim) ---- */}
    <trace from=".ESP32 > .3V3" to="net.V3V3" thickness="0.4mm" />
    <trace from=".A4988 > .VDD" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS1" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS2" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .RESET" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .SLEEP" to="net.V3V3" thickness="0.3mm" />
    <trace from=".POT1 > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".POT2 > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".ENC > .V3V3" to="net.V3V3" thickness="0.3mm" />

    {/* =========================================================================
        SIGNALS  (pins per firmware/include/config.h) — slim, at 0.25mm floor
        ========================================================================= */}

    {/* ---- Stepper coil outputs (motor current) ---- */}
    <trace from=".A4988 > .1A" to=".STEPPER > .1A" thickness="0.6mm" />
    <trace from=".A4988 > .1B" to=".STEPPER > .1B" thickness="0.6mm" />
    <trace from=".A4988 > .2A" to=".STEPPER > .2A" thickness="0.6mm" />
    <trace from=".A4988 > .2B" to=".STEPPER > .2B" thickness="0.6mm" />

    {/* ---- Stepper control (IO14 STEP, IO12 DIR) ---- */}
    <trace from=".ESP32 > .IO14" to=".A4988 > .STEP" />
    <trace from=".ESP32 > .IO12" to=".A4988 > .DIR" />

    {/* ---- DC-motor (L298N) control breakout: IO16/IO17/IO18 ---- */}
    <trace from=".ESP32 > .IO16" to=".J_DC > .IN3" />
    <trace from=".ESP32 > .IO17" to=".J_DC > .IN4" />
    <trace from=".ESP32 > .IO18" to=".J_DC > .ENA" />

    {/* ---- J1 DC-motor pot feedback -> IO39 (external LPF; C_POT1 local bypass) ---- */}
    <trace from=".POT1 > .WIPER" to=".ESP32 > .IO39" />
    <trace from=".C_POT1 > .pin1" to=".ESP32 > .IO39" />

    {/* ---- J2 stepper pot feedback -> IO36 (1uF shunt) ---- */}
    <trace from=".POT2 > .WIPER" to=".ESP32 > .IO36" />
    <trace from=".C_POT2 > .pin1" to=".ESP32 > .IO36" />

    {/* ---- Encoder feedback: IO25 / IO26 ---- */}
    <trace from=".ESP32 > .IO25" to=".ENC > .ENC_A" />
    <trace from=".ESP32 > .IO26" to=".ENC > .ENC_B" />

    {/* ---- Expansion breakout (spare GPIO + power) ---- */}
    <trace from=".J_EXP > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".J_EXP > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".J_EXP > .IO21" to=".ESP32 > .IO21" />
    <trace from=".J_EXP > .IO22" to=".ESP32 > .IO22" />
    <trace from=".J_EXP > .IO19" to=".ESP32 > .IO19" />
    <trace from=".J_EXP > .IO23" to=".ESP32 > .IO23" />
    <trace from=".J_EXP > .IO27" to=".ESP32 > .IO27" />
    <trace from=".J_EXP > .IO34" to=".ESP32 > .IO34" />
  </board>
)
