Agent guidance for this repository

- Integrated firmware file: `firmware/dist/integrated_firmware.cpp`
	- This file is a generated concatenation of the firmware `include/` and `src/` files.
	- It is intentionally redundant; agents and automated readers should IGNORE this file to avoid duplicate or noisy analysis of the same source code.

How agents should behave

- Skip Path: `firmware/dist/integrated_firmware.cpp`
	- Do not index, read, or analyze the generated integrated firmware file.
	- Prefer individual source files under `firmware/include/` and `firmware/src/` for any code understanding, edits, or diffs.

- Do not perform builds:
	- Do not run build scripts (e.g. `npm run build`, firmware compile/build steps) after completing a task unless explicitly requested by the user.

How to (re)generate the integrated file

- From the `firmware` folder run:

	- `npm run integrate`

	- The script writes `firmware/dist/integrated_firmware.cpp` and prints a short summary.

Notes

- The integrated file is provided solely for quick human review or archival snapshots. It should not be treated as the authoritative editable source.
