# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - Unreleased

### Added

- Initial MVP of the EnOcean → Matter bridge as a Matterbridge dynamic platform plugin.
- ESP3 frame reader with CRC8 validation, resync, and split-frame handling.
- Transports: local serial port and raw `tcp://` socket (e.g. ser2net raw accepter), with
  automatic TCP reconnect.
- Config-file-driven device map with profile inference from the EEP.
- Profiles:
  - `rocker` (EEP F6-02-0x) → N momentary Generic Switch endpoints.
  - `window-handle` (EEP F6-10-00) → two Contact Sensor endpoints (Closed + Tilted).
- Teach-in logging of unknown sender ids.
- Unit tests for CRC8, ESP3 framing, and EEP decoders.
