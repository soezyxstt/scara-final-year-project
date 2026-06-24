import React from "react"
import {
  HEADER_PIN_PITCH, JST_BODY_OVERHANG, JST_BODY_DEPTH,
  A4988_PIN_PITCH, A4988_ROW_SPACING, A4988_BOARD_WIDTH, A4988_BOARD_HEIGHT,
  LM2596_BOARD_WIDTH, LM2596_BOARD_HEIGHT, LM2596_PIN_SPAN_X, LM2596_PIN_SPAN_Y, LM2596_MOUNT_HOLE_X, LM2596_MOUNT_HOLE_Y,
  DC_JACK_SW_VCC_HALF_SPACING, DC_JACK_GND_Y_OFFSET, DC_JACK_BODY_WIDTH, DC_JACK_BODY_HEIGHT,
  ESP32_DEVKIT_PIN_PITCH, ESP32_DEVKIT_ROW_SPACING, ESP32_DEVKIT_BOARD_WIDTH, ESP32_DEVKIT_BOARD_HEIGHT,
} from "./constants.js"

// ---------------------------------------------------------------------------
// SCARA Controller Board — Manufacturing Revision (firmware-matched)
//
// This board is the ESP32 DevKitC "motherboard". It sockets an A4988 stepper
// carrier and an LM2596 buck module, regulates power, and breaks out the
// potentiometer, encoder and (off-board) L298N control signals.
//
// Pin assignments MATCH firmware/include/config.h 1:1.
// ---------------------------------------------------------------------------

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
      outerDiameter="1.3mm"
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
  drawJstBody?: boolean
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
  // JST-style body outline (silkscreen only) for single-row connectors.
  // Multi-row connectors (e.g. A4988) draw their own dedicated outline
  // instead — this generic shape only fits one row.
  const showBody = props.drawJstBody && props.rows.length === 1
  const bodySpan = showBody ? (props.rows[0].labels.length - 1) * props.rows[0].pitch + JST_BODY_OVERHANG : 0
  return (
    <>
      <connector
        name={props.name}
        pcbX={props.pcbX}
        pcbY={props.pcbY}
        schX={props.schX}
        schY={props.schY}
        footprint={<footprint>{holes}</footprint>}
      />
      {showBody && (
        <silkscreenrect
          pcbX={props.pcbX}
          pcbY={props.pcbY}
          width={axis === "x" ? bodySpan : JST_BODY_DEPTH}
          height={axis === "x" ? JST_BODY_DEPTH : bodySpan}
          strokeWidth={0.3}
        />
      )}
    </>
  )
}

// ---- footprints -----------------------------------------------------------

const DEVKITC_LEFT = ["3V3", "EN", "IO36", "IO39", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND_1", "IO13", "D2", "D3", "CMD", "5V"]
const DEVKITC_RIGHT = ["GND_2", "IO23", "IO22", "TXD0", "RXD0", "IO21", "GND_3", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "D1", "D0", "CLK"]

function DevKitCSocket(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pitch = ESP32_DEVKIT_PIN_PITCH; const rowSpacing = ESP32_DEVKIT_ROW_SPACING
  const leftHoles = DEVKITC_LEFT.map((label, i) => <platedhole key={`l_${label}`} portHints={[label]} pcbX={-rowSpacing / 2} pcbY={(DEVKITC_LEFT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.3mm" shape="circle" />)
  const rightHoles = DEVKITC_RIGHT.map((label, i) => <platedhole key={`r_${label}`} portHints={[label]} pcbX={rowSpacing / 2} pcbY={(DEVKITC_RIGHT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.3mm" shape="circle" />)
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{[...leftHoles, ...rightHoles]}</footprint>} />
      {/* Module is mounted rotated 90° on this board (pins run vertically,
          spanning the row's pitch*count, with rowSpacing horizontal) — so
          the vendor drawing's width/height are swapped here to match. */}
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={ESP32_DEVKIT_BOARD_HEIGHT} height={ESP32_DEVKIT_BOARD_WIDTH} strokeWidth={0.3} />
    </>
  )
}

function Lm2596Module(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pinInsetX = LM2596_PIN_SPAN_X / 2; const pinOffsetY = LM2596_PIN_SPAN_Y / 2
  const holeX = LM2596_MOUNT_HOLE_X
  const holeY = LM2596_MOUNT_HOLE_Y

  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["IN_POS"]} pcbX={-pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["IN_NEG"]} pcbX={-pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_POS"]} pcbX={pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_NEG"]} pcbX={pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />

          <platedhole pcbX={-holeX} pcbY={holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
          <platedhole pcbX={holeX} pcbY={-holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={LM2596_BOARD_WIDTH} height={LM2596_BOARD_HEIGHT} strokeWidth={0.3} />
    </>
  )
}

function DcPwrJack(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["SW"]} pcbX={-DC_JACK_SW_VCC_HALF_SPACING} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["VCC"]} pcbX={DC_JACK_SW_VCC_HALF_SPACING} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["GND"]} pcbX={0.0} pcbY={-DC_JACK_GND_Y_OFFSET} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY - 1.5} width={DC_JACK_BODY_WIDTH} height={DC_JACK_BODY_HEIGHT} strokeWidth={0.3} />
    </>
  )
}

function RadialCapacitor(props: { name: string; pcbX: number; pcbY: number; diameter: number; isPolarized?: boolean; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["POS"]} pcbX={-1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.4mm" shape="circle" />
          <platedhole portHints={["NEG"]} pcbX={1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.4mm" shape="circle" />
        </footprint>
      } />
      <silkscreencircle pcbX={props.pcbX} pcbY={props.pcbY} radius={props.diameter / 2} strokeWidth={0.3} />
      {props.isPolarized && <silkscreentext text="+" pcbX={props.pcbX - 2.5} pcbY={props.pcbY + 2.0} fontSize={1.65} anchorAlignment="center" />}
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
          pcbX={axis === "x" ? props.pcbX - span / 2 + i * pitch : props.pcbX - 6.0}
          pcbY={axis === "x" ? props.pcbY + 4.7 : props.pcbY + span / 2 - i * pitch}
          fontSize={1.65}
          anchorAlignment="center"
        />
      ))}
    </>
  )
}

// ---- board -----------------------------------------------------------------
//
// DESIGN-RULE CONSTRAINT (hard 0.5mm fab minimum):
//   Rules below are set to the fab spec: 0.5mm min trace width AND 0.5mm min
//   copper clearance (trace-trace and trace-to-pad).
//
//   `npm run validate` reports ~49 DRC errors, and they are NOT routable away.
//   They are geometric: a trace escaping an INNER pin of a 2.54mm-pitch header
//   (ESP32 DevKitC, A4988, the 0.1" connectors) must pass between two adjacent
//   pads. That channel is 2.54 - 1.3(min pad) = 1.24mm, so a 0.5mm trace clears
//   only (1.24 - 0.5)/2 = 0.37mm < 0.5mm. The pads themselves are fine
//   (1.24mm > 0.5mm); only breakout traces in the channel violate the rule.
//
//   => This through-hole-module layout is INCOMPATIBLE with a hard 0.5mm fab.
//      Resolving it is a ground-up re-layout (every net escapes to open copper
//      and routes AROUND pad rows, never between pins; likely larger board +
//      full manual routing), or a fab/process with finer capability, or SMD
//      parts. It cannot be fixed by changing trace widths or clearances.
//
// Shared component positions (single source of truth so a connector and its
// dedicated silkscreen outline can never drift apart — the A4988 box did).
const A4988_X = -27
const A4988_Y = -16

// Via sizes for the GND-tree's bottom-layer-entry vias. Each one sits at the
// exact center of the through-hole pad it starts from — a tscircuit pcbPath
// limitation, since switching to the bottom layer requires `via:true` as the
// FIRST waypoint, which has nowhere else to go but the pad's own location.
// Matching the via's own diameter to its host pad's diameter makes the two
// drill hits in the Gerber/Excellon output IDENTICAL (same tool, same XY)
// instead of two DIFFERENT-sized overlapping holes — fab CAM software
// treats an identical duplicate drill as a no-op, but two different-sized
// holes at the same point as a DFM violation that can get an order rejected
// (confirmed by exporting real gerbers and inspecting drill.drl directly).
const VIA_HEADER_PIN = { viaPadDiameter: "1.3mm", viaHoleDiameter: "1mm" }    // 0.1" header / ESP32 socket pads
const VIA_LM2596_PIN = { viaPadDiameter: "2.8mm", viaHoleDiameter: "1.5mm" }  // LM2596 power pads
const VIA_DCJACK_PIN = { viaPadDiameter: "4mm", viaHoleDiameter: "2.8mm" }    // DC barrel jack pads
const VIA_CBULK_PIN = { viaPadDiameter: "1.4mm", viaHoleDiameter: "0.8mm" }   // C_BULK cap pads
const VIA_SCREW_PIN = { viaPadDiameter: "2.6mm", viaHoleDiameter: "1.2mm" }   // screw terminal pads

export default () => (
  <board
    width="96mm"
    height="66mm"
    minTraceWidth="0.5mm"
    autorouter={{ traceClearance: "0.5mm" }}
    minTraceToPadEdgeClearance="0.5mm"
    minBoardEdgeClearance="2mm"
    pcbStyle={{ viaPadDiameter: "1.3mm", viaHoleDiameter: "0.7mm" }}
  >
    {/* M3 Corner Mounting Holes for Enclosure */}
    <platedhole pcbX={-44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={-44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />

    {/* ZONE 2: BRAIN — ESP32 DevKitC */}
    <DevKitCSocket name="ESP32" pcbX={20} pcbY={0} schX={0} schY={0} />

    {/* ZONE 1: NOISY POWER — Buck + 12V Jack */}
    {/* Buck + jack raised (buck 0->3, jack 19->21.5) to open ~3mm of vertical
        room below the buck: the A4988 carrier body (15.24mm) couldn't fit the
        old 13.96mm window between buck-bottom and the STEPPER connector. */}
    <Lm2596Module name="LM2596" pcbX={-24.5} pcbY={3} schX={-15} schY={2} />
    <DcPwrJack name="PWR_IN" pcbX={-41} pcbY={21.5} schX={-15} schY={6} />

    {/* ZONE 1b: STEPPER — A4988 Carrier + Bulk Cap + Output Header
        Pololu-style carrier: 0.6"x0.8" body, 0.1" pin pitch, 0.5" row
        spacing (see constants.ts — the row spacing here was previously
        wrong at 7.62mm; real hardware is 12.7mm).
        pcbY moved -19 -> -16.5: the real A4988 body (15.24mm tall) and the
        STEPPER connector's JST body overlapped by 2.12mm at the old
        position (STEPPER can't move further south, it'd run off the board
        edge). This shift invalidates the manually-routed V12/STEP/DIR
        pcbPath waypoints below, which are anchor-relative to A4988's pcbY —
        they've been recomputed for the new position. */}
    <Connector name="A4988_SOCKET" pcbX={A4988_X} pcbY={A4988_Y} schX={-13} schY={-5} rows={[
      { labels: ["ENABLE", "MS1", "MS2", "MS3", "RESET", "SLEEP", "STEP", "DIR"], pitch: A4988_PIN_PITCH, rowOffsetY: A4988_ROW_SPACING / 2 },
      { labels: ["VMOT", "GND_MOT", "1B", "1A", "2A", "2B", "VDD", "GND_LOGIC"], pitch: A4988_PIN_PITCH, rowOffsetY: -A4988_ROW_SPACING / 2 },
    ]} />
    <silkscreenrect pcbX={A4988_X} pcbY={A4988_Y} width={A4988_BOARD_WIDTH} height={A4988_BOARD_HEIGHT} strokeWidth={0.3} />
    <RadialCapacitor name="C_BULK" pcbX={-43} pcbY={-19} diameter={6.3} isPolarized schX={-15} schY={-9} />
    <Connector name="STEPPER" pcbX={-27} pcbY={-28} schX={-13} schY={-11} drawJstBody rows={[{ labels: ["1B", "1A", "2A", "2B"], pitch: HEADER_PIN_PITCH }]} />

    {/* ZONE 3: CLEAN ANALOG & SENSOR (Shifted to x=2 for buck and ESP32 isolation) */}
    {/* Spaced so the real JST body outlines (9.98mm for the 3-pin POTs,
        12.52mm for the 4-pin ENC) clear each other with ~1.5mm gaps. The
        4-pin ENC is the tall one, so it's dropped lowest. */}
    <Connector name="POT2" pcbX={2} pcbY={17} axis="y" schX={15} schY={2} drawJstBody rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: HEADER_PIN_PITCH }]} />
    <Connector name="POT1" pcbX={2} pcbY={6.5} axis="y" schX={15} schY={-4} drawJstBody rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: HEADER_PIN_PITCH }]} />
    <Connector name="ENC" pcbX={2} pcbY={-6.5} axis="y" schX={15} schY={6} drawJstBody rows={[{ labels: ["V3V3", "GND", "ENC_A", "ENC_B"], pitch: HEADER_PIN_PITCH }]} />

    {/* ZONE 4: DC-MOTOR Breakout (L298N)
        Pin order chosen so each slot's y roughly matches its ESP32 source
        pin's y (ENA=IO18 y=2.54 highest -> top slot; IN4=IO17 y=-2.54;
        IN3=IO16 y=-5.08; V5 matches ESP32.5V y=-22.86 almost exactly ->
        bottom slot; V12 (from A4988, routed via the south lane) gets the
        next-to-bottom slot so it only needs a short rise instead of
        crossing the whole congested ESP32-fanout corridor). GPIO mapping
        is unchanged — only the physical screw position moved. */}
    <ScrewTerminal name="J_DC" pcbX={43} pcbY={-14} axis="y" schX={-2} schY={-9} labels={["ENA", "IN4", "IN3", "GND", "V12", "V5"]} />

    {/* ZONE 5: EXPANSION */}
    {/* IO27/IO34 (ESP32 LEFT column) remapped to IO5/IO4 (RIGHT column) so the
        expansion nets no longer cross the DIP. IO4 is fully free (ADC2-capable);
        IO5 is a boot-strapping pin (idles HIGH) — fine for a spare, just don't
        hold it LOW at power-on. Both are firmware-untouched. */}
    <ScrewTerminal name="J_EXP" pcbX={43} pcbY={13} axis="y" schX={4} schY={-12} labels={["V3V3", "GND", "IO21", "IO22", "IO19", "IO23", "IO5", "IO4"]} />

    {/* =========================================================================
        GROUND PLANE — Full bottom pour (replaces all explicit GND traces)
        Every GND pad is through-hole, so it ties to this pour directly. This
        removes ~12 top-layer GND traces and the violations they caused, and
        decongests the remaining signal/power routing.
        ========================================================================= */}
    <copperpour layer="bottom" connectsTo="net.GND" clearance="0.55mm"
      boundary={[
        { x: -46, y: 28 },
        { x: 46,  y: 28 },
        { x: 46,  y: -28 },
        { x: -46, y: -28 },
      ]}
    />
    <keepout pcbX={-44} pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={-44} pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />

    {/* Silkscreen Labels */}
    <silkscreentext text="ESP32 BRAIN" pcbX={20} pcbY={28} fontSize={1.8} anchorAlignment="center" />
    <silkscreentext text="5V BUCK" pcbX={-24.5} pcbY={3} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="12V IN" pcbX={-41} pcbY={28} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="A4988 J2" pcbX={-27} pcbY={-12.5} fontSize={1.65} anchorAlignment="center" />
    {/* Strap note moved inside the A4988 box (inter-row gap, clear of both pad
        rows): at 1.65mm it no longer fits the 0.88mm gap between the A4988 and
        STEPPER bodies, and the strip north of the box is under the buck. */}
    <silkscreentext text="MS=3V3 EN=GND" pcbX={-27} pcbY={-19.5} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="STEPPER" pcbX={-27} pcbY={-31} fontSize={1.65} anchorAlignment="center" />
    {/* POT/ENC labels use their refdes (POT2=stepper joint, POT1=DC joint) —
        the descriptive forms are too wide at 1.65mm and collide with the ESP32
        left-column pads (and the buck OUT pad) in the narrow x=2 channel. */}
    <silkscreentext text="POT2" pcbX={2} pcbY={21.2} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="POT1" pcbX={2} pcbY={10.5} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="ENC" pcbX={2} pcbY={-13.5} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="L298N J1" pcbX={43} pcbY={-25.5} fontSize={1.65} anchorAlignment="center" />
    <silkscreentext text="Adi Haditya Nursyam, M22" pcbX={3} pcbY={-31} fontSize={1.65} anchorAlignment="center" />

    {/* =========================================================================
        POWER RAILS
        ========================================================================= */}
    {/* Manual pcbPath: the autorouter connected this straight to LM2596.IN_POS
        (the nearest other open net.V12 stub) via a corridor hugging the left
        board edge at x=-46.84, only 0.91mm clear of the edge (board edge at
        x=-48; spec wants >=2mm). That edge-side gap is only 2mm wide total
        (board edge to PWR_IN.SW's pad), so there's no width left in it for
        both the 2mm edge clearance AND 0.5mm pad clearance at once — the fix
        is an interior reroute instead of nudging the same corridor. Routes
        right of PWR_IN.SW/GND and LM2596's NW mount hole, then approaches
        IN_POS from below. The IN_POS net anchor is removed since this trace
        now ties it to net.V12 via VCC instead. Waypoints relative to anchor
        PWR_IN (-41, 21.5). */}
    <trace from=".PWR_IN > .VCC" to=".LM2596 > .IN_POS" thickness="0.8mm"
      pcbPath={[
        { x: 3, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: -14.5 },
        { x: -3.2485, y: -14.5 },
        { x: -3.2485, y: -9.9275 },
      ]}
    />
    {/* This net anchor independently routed itself to C_BULK.POS (the other
        open net.V12 stub) along the same left-edge corridor as the traces
        above, so it inherited the same edge-clearance problem. Made explicit
        and interior (threading the gap between the LM2596 mount hole and the
        A4988's left pad column, then approaching C_BULK.POS from below to
        clear C_BULK.NEG). Waypoints relative to anchor LM2596 (-24.5, 3). */}
    <trace from=".LM2596 > .IN_POS" to=".C_BULK > .POS" thickness="0.8mm"
      pcbPath={[
        { x: -19.7485, y: 8.5725 },
        { x: -19.7485, y: 4 },
        { x: -13.5, y: 4 },
        { x: -13.5, y: -23.7 },
        { x: -19.77, y: -23.7 },
        { x: -19.77, y: -22 },
      ]}
    />
    <trace from=".C_BULK > .POS" to="net.V12" thickness="0.8mm" />
    {/* BUGFIX (V12 island reconnect): A4988.VMOT + J_DC.V12 were a SEPARATE
        copper island with NO path to the 12V source (PWR_IN/buck/C_BULK) —
        the net-membership glue was lost when VMOT->net.V12 got converted to
        the explicit VMOT->J_DC.V12 pair below. C_BULK is VMOT's bulk cap and
        sits right next to it, and C_BULK.POS is already on the V12 source
        island, so tie VMOT->C_BULK.POS (also the textbook placement: bulk cap
        directly across VMOT/GND at the driver). J_DC.V12 rejoins via the
        existing VMOT->J_DC.V12 trace. Top layer (clears the bottom GND pour);
        routed left along y=-22.35 BELOW C_BULK.NEG, then up into C_BULK.POS.
        Waypoints relative to anchor A4988 (-27,-16). */}
    <trace from=".A4988_SOCKET > .VMOT" to=".C_BULK > .POS" thickness="0.8mm"
      pcbPath={[
        { x: -8.89, y: -6.35 },
        { x: -17.27, y: -6.35 },
        { x: -17.27, y: -3.0 },
      ]}
    />
    {/* Manually routed (pcbRouteHints are ignored under this board's global
        autorouter mode — pcbPath bypasses the autorouter entirely). Path goes
        via the open south lane (below A4988/STEPPER/ESP32 bottom row, above
        the GND pour boundary), then north through the gap between the ESP32
        right column and J_DC — avoids cutting across pad fields. Converted
        from net-based to an explicit pair (matches what it resolved to
        anyway); other net.V12 members still join the net via their own
        traces below. */}
    {/* Rise segment dropped to the bottom layer via two vias so it physically
        crosses under the V5 trace (different layer = no clearance conflict)
        instead of competing for the same x/y in the congested J_DC corridor.
        Dropped immediately to the bottom layer at VMOT pad to avoid crossing 
        the top-layer stepper connector signals. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".A4988_SOCKET > .VMOT" to=".J_DC > .V12" thickness="0.8mm"
        pcbPath={[
          { x: -8.89, y: -6.35, via: true, toLayer: "bottom" },
          { x: -8.89, y: -6.35 },
          { x: -8.89, y: -14.5 },
          { x: 63, y: -14.5 },
          { x: 63, y: -0.25 },
          { x: 63, y: -0.25, via: true, toLayer: "top" },
          { x: 63, y: -0.25 },
        ]}
      />
    </group>

    {/* ===== GROUND — bottom-layer membership tree =====================
        Every GND pad must be on net.GND for the bottom pour to fill to it
        (connectsTo on a platedhole does nothing here; only traces create
        net membership). Routing that membership on the TOP layer makes the
        autorouter MST the pads pad-to-pad across the board (28 DRC errors +
        perturbs signals). Instead we tie them in on the BOTTOM layer, where
        each GND trace merges into the GND pour (same net = no clearance
        conflict) and never touches top-layer signals.
        One pad anchors to net.GND (routes straight into the pour); the rest
        chain to a neighbour via 2-port pcbPath forced onto the bottom layer.
        pcbPath waypoints are ABSOLUTE-minus-anchor-component-origin. */}
    <trace from=".PWR_IN > .GND" to="net.GND" thickness="0.5mm" />
    {/* Center cluster: POT2/POT1/ENC/OUT_NEG/ESP32.GND_1 chained on the
        bottom through the clear x=-1 corridor (left of the POT/ENC pads; the
        top-layer V3V3 trunk also sits at x=-1 but on the other layer). */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".POT1 > .GND" to=".POT2 > .GND" thickness="0.5mm"
        pcbPath={[{ x: 0, y: 2.54, via: true, toLayer: "bottom" }, { x: 0, y: 2.54 }, { x: -3, y: 2.54 }, { x: -3, y: 13.04 }, { x: 0, y: 13.04 }]} />
    </group>
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ENC > .GND" to=".POT1 > .GND" thickness="0.5mm"
        pcbPath={[{ x: 0, y: -1.27, via: true, toLayer: "bottom" }, { x: 0, y: -1.27 }, { x: -3, y: -1.27 }, { x: -3, y: 15.54 }, { x: 0, y: 15.54 }]} />
    </group>
    <group pcbStyle={VIA_LM2596_PIN}>
      <trace from=".LM2596 > .OUT_NEG" to=".ENC > .GND" thickness="0.5mm"
        pcbPath={[{ x: 19.7485, y: -8.5725, via: true, toLayer: "bottom" }, { x: 19.7485, y: -8.5725 }, { x: 23.5, y: -8.5725 }, { x: 23.5, y: -10.77 }, { x: 26.5, y: -10.77 }]} />
    </group>
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .GND_1" to=".ENC > .GND" thickness="0.5mm"
        pcbPath={[{ x: -12.7, y: -10.16, via: true, toLayer: "bottom" }, { x: -12.7, y: -10.16 }, { x: -15.5, y: -10.16 }, { x: -15.5, y: -7.77 }, { x: -18, y: -7.77 }]} />
    </group>
    {/* Left cluster (PWR_IN/buck/C_BULK/A4988 grounds) + the anchor link.
        Was a left-edge corridor at x=-46.7 (only 1.3mm clear of the x=-48
        board edge; spec wants >=2mm). Same problem as the V12 trace above —
        the edge-side gap is too narrow for both edge and pad clearance at
        once — so this is also an interior reroute now: right of LM2596's NW
        mount hole and IN_POS pad, then in to PWR_IN.GND from above. The
        A4988 grounds chain along y=-23.5 (below the bottom pin row, above
        the corner mounting keepout) is unchanged. */}
    <group pcbStyle={VIA_DCJACK_PIN}>
      <trace from=".PWR_IN > .SW" to=".PWR_IN > .GND" thickness="0.5mm"
        pcbPath={[{ x: -3, y: 0, via: true, toLayer: "bottom" }, { x: -3, y: 0 }, { x: 0, y: -4.8 }]} />
    </group>
    <group pcbStyle={VIA_LM2596_PIN}>
      <trace from=".LM2596 > .IN_NEG" to=".PWR_IN > .GND" thickness="0.5mm"
        pcbPath={[{ x: -19.7485, y: -8.5725, via: true, toLayer: "bottom" }, { x: -19.7485, y: -8.5725 }, { x: -11.5, y: -8.5725 }, { x: -11.5, y: 13.7 }, { x: -16.5, y: 13.7 }]} />
    </group>
    {/* Was also a left-edge corridor at x=-46.7 (same edge-clearance problem
        as the two traces above). Rerouted to the interior (x=-39, between
        C_BULK and the A4988's leftmost pad column) instead. */}
    <group pcbStyle={VIA_CBULK_PIN}>
      <trace from=".C_BULK > .NEG" to=".LM2596 > .IN_NEG" thickness="0.5mm"
        pcbPath={[{ x: 1.27, y: 0, via: true, toLayer: "bottom" }, { x: 1.27, y: 0 }, { x: 1.27, y: -2.5 }, { x: 4, y: -2.5 }, { x: 4, y: 13.43 }, { x: -1.25, y: 13.43 }]} />
    </group>
    {/* A4988 grounds chain GND_LOGIC -> GND_MOT -> ENABLE -> IN_NEG, running
        along y=-24.5 (centered between the A4988 bottom row at -22.35 and the
        STEP bottom lane at -26, and clear of the corner keepout). ENABLE then
        joins the cluster via the buck IN_NEG. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".A4988_SOCKET > .GND_LOGIC" to=".A4988_SOCKET > .GND_MOT" thickness="0.5mm"
        pcbPath={[{ x: 8.89, y: -6.35, via: true, toLayer: "bottom" }, { x: 8.89, y: -6.35 }, { x: 8.89, y: -8.5 }, { x: -6.35, y: -8.5 }, { x: -6.35, y: -6.35 }]} />
    </group>
    {/* GND_MOT -> ENABLE rises through the A4988 inter-row gap (y=-12, above
        the V12 trace's drop at x=-35.9 and clear of both pin rows). */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".A4988_SOCKET > .GND_MOT" to=".A4988_SOCKET > .ENABLE" thickness="0.5mm"
        pcbPath={[{ x: -6.35, y: -6.35, via: true, toLayer: "bottom" }, { x: -6.35, y: -6.35 }, { x: -6.35, y: 4 }, { x: -10.5, y: 4 }, { x: -10.5, y: 6.35 }, { x: -8.89, y: 6.35 }]} />
    </group>
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".A4988_SOCKET > .ENABLE" to=".LM2596 > .IN_NEG" thickness="0.5mm"
        pcbPath={[{ x: -8.89, y: 6.35, via: true, toLayer: "bottom" }, { x: -8.89, y: 6.35 }, { x: -8.89, y: 9 }, { x: -17.25, y: 9 }, { x: -17.25, y: 10.43 }]} />
    </group>
    {/* Center<->Left link: POT2.GND tied to the anchor PWR_IN.GND along
        y=16.7 (above the buck body, below the jack pads), avoiding the
        STEP/DIR bottom traces that wall off the lower-center. Makes center +
        left + anchor one net. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".POT2 > .GND" to=".PWR_IN > .GND" thickness="0.5mm"
        pcbPath={[{ x: 0, y: 2.54, via: true, toLayer: "bottom" }, { x: 0, y: 2.54 }, { x: -3, y: 2.54 }, { x: -3, y: -0.3 }, { x: -43, y: -0.3 }]} />
    </group>
    {/* Right cluster: ESP32.GND_2/GND_3 + J_DC.GND/J_EXP.GND. GND_3 links to
        the center (ESP32.GND_1) through the open central corridor x=30; the
        two screw terminals chain along the right edge x=45.5; J_EXP.GND ties
        the screw-terminal pair back to GND_2. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .GND_3" to=".ESP32 > .GND_1" thickness="0.5mm"
        pcbPath={[{ x: 12.7, y: 7.62, via: true, toLayer: "bottom" }, { x: 12.7, y: 7.62 }, { x: 10, y: 7.62 }, { x: 10, y: -3 }, { x: -10, y: -3 }, { x: -10, y: -10.16 }, { x: -12.7, y: -10.16 }]} />
    </group>
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .GND_2" to=".ESP32 > .GND_3" thickness="0.5mm"
        pcbPath={[{ x: 12.7, y: 22.86, via: true, toLayer: "bottom" }, { x: 12.7, y: 22.86 }, { x: 10, y: 22.86 }, { x: 10, y: 7.62 }, { x: 12.7, y: 7.62 }]} />
    </group>
    <group pcbStyle={VIA_SCREW_PIN}>
      <trace from=".J_DC > .GND" to=".J_EXP > .GND" thickness="0.5mm"
        pcbPath={[{ x: 0, y: -1.75, via: true, toLayer: "bottom" }, { x: 0, y: -1.75 }, { x: 2.5, y: -1.75 }, { x: 2.5, y: 35.75 }, { x: 0, y: 35.75 }]} />
    </group>
    <group pcbStyle={VIA_SCREW_PIN}>
      <trace from=".J_EXP > .GND" to=".ESP32 > .GND_2" thickness="0.5mm"
        pcbPath={[{ x: 0, y: 8.75, via: true, toLayer: "bottom" }, { x: 0, y: 8.75 }, { x: -8.5, y: 8.75 }, { x: -8.5, y: 9.86 }]} />
    </group>

    <trace from=".LM2596 > .OUT_POS" to="net.V5" thickness="0.6mm" />
    {/* BUGFIX (V5 island reconnect): the buck 5V output (OUT_POS) was an
        ISOLATED net island — no copper path to its loads (ESP32.5V, J_DC.V5).
        Same root cause as the V12 bug: lost net glue when ESP32.5V->net.V5
        became the explicit ESP32.5V->J_DC.V5 pair below. J_DC.V5 rejoins via
        that existing trace; here we tie OUT_POS->ESP32.5V.
        The direct corridor between the buck and ESP32 is walled off on BOTH
        layers by the V3V3 trunk (x=-1, top) + GND trunk (x=-3, bottom) and
        their pad stubs through the POT/ENC y-range, plus the dense ESP32<->
        POT/ENC signal fan (y in [-8,9]). So route AROUND it: west across the
        open top-layer space under the buck body (clear of the buck's pads),
        straight down past the buck's south edge into the empty south-central
        region (below the connectors, above the south power lanes), then east
        and down into ESP32.5V from the west (clears the CMD pad above it).
        All top layer, no via. Waypoints relative to anchor LM2596 (-24.5,3). */}
    {/* One obstacle on the way down: the A4988 V3V3 bus feed (ENC.V3V3 ->
        SLEEP) runs along y=-12 on the top layer and crosses this descent at
        (x=-13). Dip to the bottom layer across that crossing (vias straddle it
        at y=3 / y=-13) then back to top. Vias are mid-air (not on a pad),
        wrapped to the 1.3/0.7mm board spec. */}
      <trace from=".LM2596 > .OUT_POS" to=".ESP32 > .5V" thickness="0.6mm"
        pcbPath={[
          { x: 19.7485, y: 8.5725 },
          { x: 11.5, y: 8.5725 },
          { x: 11.5, y: 0 },
          { x: 11.5, y: 0, via: true, toLayer: "bottom" },
          { x: 11.5, y: 0 },
          { x: 11.5, y: -16 },
          { x: 29.5, y: -16 },
          { x: 29.5, y: -16, via: true, toLayer: "top" },
          { x: 29.5, y: -16 },
          { x: 29.5, y: -25.86 },
        ]}
      />
    {/* Manual pcbPath (see V12 note above for why). Parallel south lane,
        offset from the V12 lane, clearing the ESP32 right-column CLK pad
        instead of grazing past it. Waypoints are local to the "from" anchor
        (ESP32, pcbX=20 pcbY=0) — i.e. desiredAbsolute - (20, 0). */}
    <trace from=".ESP32 > .5V" to=".J_DC > .V5" thickness="0.6mm"
      pcbPath={[{ x: -10, y: -24.5 }, { x: 15, y: -24.5 }]}
    />

    <trace from=".ESP32 > .3V3" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988_SOCKET > .VDD" to=".ENC > .V3V3" thickness="0.5mm"
      pcbPath={[
        { x: 6.35, y: -6.35 },
        { x: 6.35, y: 0.0 },
        { x: 26.0, y: 0.0 },
        { x: 26.0, y: 5.69 },
        { x: 29.0, y: 5.69 }
      ]}
    />
    {/* A4988 microstep/enable bus: MS1/MS2/MS3/RESET/SLEEP all tie to 3.3V
        (fixed 1/16 microstep, driver held awake). Previously these were
        five `net.V3V3` autorouted stubs — the autorouter chained them pad-to-
        pad along the top row (legal: same net) but then escaped SLEEP on a
        long DIAGONAL up to the V3V3 trunk near POT2/ESP32, which looked
        terrible and cut diagonally across the open region below the buck.
        Replaced with an explicit orthogonal V3V3 bus: the feed comes in from
        the east off the nearest trunk pad (ENC.V3V3), drops into the A4988
        inter-row gap and runs straight LEFT at y=-12 (open copper under the
        socketed module body, same lane the VDD->ENC trace already uses — the
        north strip above the row is blocked by the LM2596's OUT_NEG pad, its
        GND via and the buck's SE mount hole, all of which hang down to ~y=-7).
        SLEEP is the first (easternmost) pin reached; the bus continues left
        and each pin taps straight UP into it (perpendicular escape — the only
        legal approach for these inner header pins). All top layer (clears the
        bottom GND pour). Anchors: feed is ENC-relative (2,-6.5); the four taps
        are A4988-relative (-27,-16); bus sits at A4988-rel y=4.0 (abs -12). */}
    <trace from=".ENC > .V3V3" to=".A4988_SOCKET > .SLEEP" thickness="0.5mm"
      pcbPath={[
        { x: 0, y: -3.81 },
        { x: 0, y: -5.5 },
        { x: -25.19, y: -5.5 },
        { x: -25.19, y: -3.15 },
      ]}
    />
    <trace from=".A4988_SOCKET > .SLEEP" to=".A4988_SOCKET > .RESET" thickness="0.5mm"
      pcbPath={[{ x: 3.81, y: 6.35 }, { x: 3.81, y: 4.0 }, { x: 1.27, y: 4.0 }, { x: 1.27, y: 6.35 }]} />
    <trace from=".A4988_SOCKET > .RESET" to=".A4988_SOCKET > .MS3" thickness="0.5mm"
      pcbPath={[{ x: 1.27, y: 6.35 }, { x: 1.27, y: 4.0 }, { x: -1.27, y: 4.0 }, { x: -1.27, y: 6.35 }]} />
    <trace from=".A4988_SOCKET > .MS3" to=".A4988_SOCKET > .MS2" thickness="0.5mm"
      pcbPath={[{ x: -1.27, y: 6.35 }, { x: -1.27, y: 4.0 }, { x: -3.81, y: 4.0 }, { x: -3.81, y: 6.35 }]} />
    <trace from=".A4988_SOCKET > .MS2" to=".A4988_SOCKET > .MS1" thickness="0.5mm"
      pcbPath={[{ x: -3.81, y: 6.35 }, { x: -3.81, y: 4.0 }, { x: -6.35, y: 4.0 }, { x: -6.35, y: 6.35 }]} />
    {/* V3V3 to the POT/ENC cluster as a clean vertical trunk on the left
        (x=-1, clear of the pads) instead of the autorouter's hairpin, which
        dove from the A4988 feed into ENC.V3V3 (the bottom pad) then doubled
        back up alongside the encoder. Chain: ENC.V3V3 -> POT1.V3V3 ->
        POT2.V3V3 -> net. pcbPath waypoints are anchor-relative (the "from"
        connector: POT1 at (2,6.5), ENC at (2,-6.5)). */}
    {/* NOTE: this trace's via could not be bumped to the 1.3mm/0.7mm board
        default — net-anchored traces (to="net.X") crash if given a manual
        pcbPath, and redirecting it to a concrete V3V3 pad elsewhere on the
        board destabilized the autorouter's grouping for unrelated traces
        (IO21/IO22/IO23). Left on the tscircuit default 0.3mm/0.2mm via; this
        is the only via in the design below the 1.27mm/0.6096mm fab spec, and
        it carries 3.3V logic (not power/ground). */}
    {/* V3V3 to the POT/ENC cluster as a clean vertical trunk.
        Bypassing the to="net.V3V3" anchor to avoid tscircuit's micro-via fallback bug. 
        Point-to-point routing guarantees adherence to the 1.3mm/0.7mm fab spec. */}
    <group pcbStyle={{ viaPadDiameter: "1.3mm", viaHoleDiameter: "0.7mm" }}>
      <trace from=".POT2 > .V3V3" to=".ESP32 > .3V3" thickness="0.5mm"
        pcbPath={[
          { x: 0.0, y: -2.54 },
          { x: -3.0, y: -2.54 },
          { x: -3.0, y: 5.86 },
          { x: 5.3, y: 5.86 }
        ]}
      />
      <trace from=".POT1 > .V3V3" to=".POT2 > .V3V3" thickness="0.5mm"
        pcbPath={[
          { x: 0.0, y: -2.54 },
          { x: -3.0, y: -2.54 },
          { x: -3.0, y: 7.96 },
          { x: 0.0, y: 7.96 }
        ]}
      />
      <trace from=".ENC > .V3V3" to=".POT1 > .V3V3" thickness="0.5mm"
        pcbPath={[
          { x: 0.0, y: -3.81 },
          { x: -3.0, y: -3.81 },
          { x: -3.0, y: 10.46 },
          { x: 0.0, y: 10.46 }
        ]}
      />
    </group>

    {/* =========================================================================
        SIGNALS
        ========================================================================= */}
    <trace from=".A4988_SOCKET > .1A" to=".STEPPER > .1A" thickness="0.6mm" />
    <trace from=".A4988_SOCKET > .1B" to=".STEPPER > .1B" thickness="0.6mm" />
    <trace from=".A4988_SOCKET > .2A" to=".STEPPER > .2A" thickness="0.6mm" />
    <trace from=".A4988_SOCKET > .2B" to=".STEPPER > .2B" thickness="0.6mm" />

    {/* Manual pcbPath. STEP is an INNER pin of the A4988 top row (8-pin
        header), so the only legal approach is perpendicular (straight down
        the row's own x), never along the row — and it must come from the
        NORTH: approaching from the south runs into the A4988.VDD pad
        (directly below STEP in the bottom row) and the auto-routed
        VDD-SLEEP jumper that occupies that exact space. Also: crossing the
        ESP32 column must happen south of ALL its pads (y < -22.86) — at any
        y inside its pin range the 2.54mm pitch leaves no legal channel.
        On top of that, the V3V3 bus feeding SLEEP/RESET/MS* runs the
        inter-row gap at y=-12 on the TOP layer, crossing STEP's own column —
        so STEP must stay clear of it there. So: escape east of the ESP32
        column, drop to the bottom layer immediately (one via) and STAY
        there for the rest of the run — south lane (avoids the V5 trace,
        which lives in this corridor on top), west under everything, then
        straight up into STEP from the north. Through-hole pads accept
        connections on either layer, so no via back to top is needed.
        Waypoints relative to anchor ESP32 (20, 0). */}
    <trace from=".ESP32 > .IO14" to=".A4988_SOCKET > .STEP"
      pcbPath={[
        { x: -8, y: -5.08 },
        { x: -8, y: -5.08, via: true, toLayer: "bottom" },
        { x: -8, y: -5.08 },
        { x: -8, y: -26 },
        { x: -35, y: -26 },
        { x: -35, y: -8 },
        { x: -40.65, y: -8 },
      ]}
    />
    {/* Manual pcbPath (same technique as STEP above). After the A4988 row-
        spacing fix, this trace's autorouted path grazed the POT/ENC column
        (0.37mm gap). Anchor is ESP32.IO12 (the "from" port), so the path
        runs IO12 -> ... -> DIR. Escape east of the ESP32 column, drop to
        bottom layer immediately so the rest of the run (south lane,
        crossing the ESP32 column south of its pin range) can't conflict
        with any top-layer trace in this corridor (V5, etc). DIR is the
        row's east-END pin, so unlike STEP this one never needs to travel
        past x=-18.11 — the whole detour stays east of the row/coils/jumper
        entirely (separate south lane, y=-28.5, offset from STEP's y=-26 lane
        to keep clearance from it), then approaches DIR horizontally at its
        own exact y. Waypoints relative to anchor ESP32 (20, 0). */}
    <trace from=".ESP32 > .IO12" to=".A4988_SOCKET > .DIR"
      pcbPath={[
        { x: -5, y: -7.62 },
        { x: -5, y: -7.62, via: true, toLayer: "bottom" },
        { x: -5, y: -7.62 },
        { x: -5, y: -28.5 },
        { x: -36, y: -28.5 },
        { x: -36, y: -10.15 },
      ]}
    />

    <trace from=".ESP32 > .IO16" to=".J_DC > .IN3" />
    <trace from=".ESP32 > .IO17" to=".J_DC > .IN4" />
    <trace from=".ESP32 > .IO18" to=".J_DC > .ENA" />

    <trace from=".POT1 > .WIPER" to=".ESP32 > .IO39" />
    <trace from=".POT2 > .WIPER" to=".ESP32 > .IO36" />

    <trace from=".ESP32 > .IO25" to=".ENC > .ENC_A" />
    <trace from=".ESP32 > .IO26" to=".ENC > .ENC_B" />

    <trace from=".J_EXP > .V3V3" to="net.V3V3" thickness="0.5mm" />
    {/* J_EXP.GND ties to the pour via connectsTo on its platedhole (ScrewTerminal). */}
    {/* Left autorouted (no via needed on this trace at all — it never had an
        undersized-via problem; it only became unstable as a side effect of
        manually routing its neighbors above. Now that IO22/IO23 are locked
        down, the autorouter resolves this cleanly around them again. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .IO21" to=".J_EXP > .IO21"
        pcbPath={[
          { x: 12.7, y: 10.16, via: true, toLayer: "bottom" },
          { x: 12.7, y: 10.16 },
          { x: 20.5, y: 10.16 },
          { x: 20.5, y: 18.25 },
          { x: 23.0, y: 18.25 },
        ]}
      />
    </group>
    {/* Manual pcbPath (same reason as POT2.V3V3 above — makes the via explicit
        so it inherits pcbStyle's via size). IO21's ESP32 pin sits below
        IO22's but its J_EXP pin sits above IO22's, so the two traces must
        cross somewhere on one layer — unavoidable since IO22 starts above
        IO21's bottom-layer curve and ends below it. IO23 isn't actually a
        threat here (its path stays ~5mm below this whole route). Fix: via to
        bottom right at ESP32's pad (clear of IO23's top-layer run earlier in
        its path), stay numerically above IO21's curve (margin >=1.88mm) on
        the bottom layer, then via back to top just before the crossing point
        IO21's curve would otherwise force, finishing clear on top. Waypoints
        relative to anchor ESP32 (20, 0). */}
    {/* Wrapped in VIA_HEADER_PIN so the first via (which sits right on
        ESP32.IO22's pad, same reason as the GND tree above) gets an
        identical-not-overlapping drill hit. The second via (mid-air layer
        swap, not on any pad) just inherits the same size — harmless there. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .IO22" to=".J_EXP > .IO22"
        pcbPath={[
          { x: 12.7, y: 17.78, via: true, toLayer: "bottom" },
          { x: 12.7, y: 17.78 },
          { x: 19, y: 17 },
          { x: 19, y: 17 },
          { x: 19, y: 17, via: true, toLayer: "top" },
          { x: 19, y: 17 },
          { x: 23, y: 14.75 },
        ]}
      />
    </group>
    <trace from=".J_EXP > .IO19" to=".ESP32 > .IO19" />
    {/* Left autorouted, same reason as POT2.V3V3 above: this corner has four
        signal traces (IO19/21/22/23) crossing in a ~10mm-square space, and
        proving it numerically, there is no path for IO23's via that clears
        IO19, IO21, and itself at the 1.3mm board-default via size — the
        combined clearance requirements exceed the physical gap between the
        obstacles. IO22 (the one trace that DID need an explicit reroute to
        avoid crossing IO23/IO21) was fixed already. IO23's via stays at the
        tscircuit default 0.3mm/0.2mm; it carries a digital GPIO signal, not
        power/ground. */}
    <group pcbStyle={VIA_HEADER_PIN}>
      <trace from=".ESP32 > .IO23" to=".J_EXP > .IO23"
        pcbPath={[
          { x: 12.7, y: 20.32 },
          { x: 17.0, y: 20.32 },
          { x: 17.0, y: 7.75 },
          { x: 17.0, y: 7.75, via: true, toLayer: "bottom" },
          { x: 17.0, y: 7.75 },
          { x: 23.0, y: 7.75 },
        ]}
      />
    </group>
    <trace from=".J_EXP > .IO5" to=".ESP32 > .IO5" />
    <trace from=".J_EXP > .IO4" to=".ESP32 > .IO4" />
  </board>
)
