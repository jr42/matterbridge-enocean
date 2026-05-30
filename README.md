# matterbridge-enocean

A [Matterbridge](https://github.com/Luligu/matterbridge) dynamic platform plugin that exposes
**EnOcean** devices (battery-free switches and sensors) as **Matter** bridged devices.

It reads EnOcean ESP3 telegrams from a local USB dongle (e.g. USB300) **or** a TCP socket
(e.g. a [ser2net](https://github.com/cminyard/ser2net) raw accepter), decodes them per the
EnOcean Equipment Profile (EEP) declared in the config, and maps each device to one or more
Matter endpoints. Adding another device of an already-supported EEP needs **configuration
only** — no code changes.

Commissioning is **over IP** (no Bluetooth required): Matterbridge advertises the bridge via
mDNS and shows a QR/pairing code in its web UI.

## Status

Early MVP. Two kinds of profile are supported.

**Dedicated profiles** (events / multi-state, hardware-verified):

| Profile         | EEP        | EnOcean device example         | Matter representation                                          |
| --------------- | ---------- | ------------------------------ | -------------------------------------------------------------- |
| `rocker`        | `F6-02-0x` | Eltako FT55 / PTM21x rocker    | N momentary **Generic Switch** endpoints (single-press events) |
| `window-handle` | `F6-10-00` | Hoppe SecuSignal window handle | two **Contact Sensor** endpoints (`Closed` + `Tilted`)         |

**Data-driven sensors** — telegram fields are decoded straight from a bundled copy of the
[EnOcean Equipment Profiles database](https://github.com/enocean-js/eep-spec) (`data/eep.json`,
MIT — see [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)), and a small mapping table
([`src/eep/matter-map.ts`](src/eep/matter-map.ts)) turns each EEP into Matter endpoint(s).
Supporting another sensor EEP is one row in that table — no decoder code:

| EEP        | EnOcean device             | Matter representation                                  |
| ---------- | -------------------------- | ------------------------------------------------------ |
| `D5-00-01` | Single input contact       | **Contact Sensor**                                     |
| `A5-02-xx` | Temperature sensor         | **Temperature Sensor**                                 |
| `A5-04-xx` | Temperature + humidity     | **Temperature** + **Humidity Sensor**                  |
| `A5-06-xx` | Light (illuminance) sensor | **Light Sensor**                                       |
| `A5-07-xx` | Occupancy (PIR) sensor     | **Occupancy Sensor**                                   |
| `A5-08-xx` | Light + temperature + occ. | **Light** + **Temperature** + **Occupancy Sensor**     |
| `A5-09-04` | CO₂ (+ temp + humidity)    | **Air Quality** (CO₂) + **Temperature** + **Humidity** |
| `A5-10-xx` | Room operating panel       | **Temperature Sensor** (read-only)                     |

The 3-state window handle (closed / open / tilted) is modelled as two contact sensors:

| Handle position | `Closed` | `Tilted` |
| --------------- | -------- | -------- |
| closed          | true     | false    |
| tilted          | false    | true     |
| open            | false    | false    |

For rockers, `F6-02-01` ("Application Style 1", EU) and `F6-02-02` ("Style 2", US) are the
same switch mounted the other way up; the buttons are pre-named from the EEP
(`Rocker A Bottom` / `Rocker A Top` / `Rocker B Bottom` / `Rocker B Top`), and choosing the
EEP flips top/bottom. Override the names per device with `buttonNames`.

## Configuration

Per-device config (editable in the Matterbridge web UI or in `matterbridge-enocean.config.json`):

```jsonc
{
  "name": "matterbridge-enocean",
  "type": "DynamicPlatform",
  // serial path, or a raw TCP socket (e.g. ser2net raw accepter)
  "device": "tcp://enocean-host:3334",
  "baud": 57600,
  "teachIn": false,
  "devices": [
    { "id": "01:23:45:67", "name": "Stairwell", "eep": "F6-02-01", "profile": "rocker", "buttons": 4 },
    { "id": "01:23:45:68", "name": "Living room window", "eep": "F6-10-00", "profile": "window-handle" },
    { "id": "01:23:45:69", "name": "Office climate", "eep": "A5-04-01" }
  ]
}
```

- `device` — `tcp://host:port` for a raw TCP socket, or a serial path such as
  `/dev/serial/by-id/usb-EnOcean_GmbH_USB_300_...`. `rfc2217://` is **not** supported;
  configure ser2net with a raw TCP accepter instead.
- `teachIn` — when `true`, unknown sender ids and their raw telegrams are logged so you can
  discover a device's id (e.g. operate the window handle and read the id from the log), then
  add it to `devices`.
- `eep` / `profile` — the profile is inferred from `eep`; `profile` overrides it. Any sensor
  EEP listed in the table above is handled by the generic data-driven `sensor` profile, so it
  usually needs only `id`, `name` and `eep`.
- `buttons` / `buttonNames` — rocker only: number of buttons (default 4) and optional friendly
  names overriding the EEP-derived defaults.

## Running

### Local (dev)

```bash
npm install
npm link matterbridge      # do NOT add matterbridge as a runtime dependency
npm run build
matterbridge -add .        # register this plugin
matterbridge               # open the frontend and scan the QR code to commission
```

### Docker

Use the official `luligu/matterbridge` image with `--network host` (required for Matter mDNS)
and pass `--device /dev/ttyUSB0` if you use a local dongle:

```bash
docker run --name matterbridge --network host --restart always -d \
  -v ~/Matterbridge:/root/Matterbridge -v ~/.matterbridge:/root/.matterbridge \
  luligu/matterbridge:latest matterbridge --docker --frontend 8585
```

On a multi-NIC host, pin Matter mDNS to the LAN interface with `--mdnsinterface <iface>`.

## Adding a new EEP

For a **sensor** EEP whose fields the bundled `data/eep.json` already decodes (most A5/D5
profiles), just add one row to `EEP_MATTER_MAP` in [`src/eep/matter-map.ts`](src/eep/matter-map.ts)
mapping the EEP (or a `func` wildcard like `a5-02-*`) to the Matter endpoint(s) and the field
shortcut each one reads. No decoder code is needed.

For an **event / multi-state** profile that doesn't map cleanly to a sensor attribute (like the
rocker or window handle):

1. Add a profile module under `src/profiles/` that builds the Matter endpoint(s) and applies
   telegrams (decode fields with `decodeTelegram` from `src/eep/engine.ts`, or a pure decoder
   in `src/profiles/decode.ts` for RPS).
2. Register it in `src/profiles/registry.ts` (and route its EEP in `eepToProfile`).

## Development

```bash
npm run build       # tsc -> dist/
npm test            # jest unit tests (crc8, ESP3 framing, EEP decoders)
npm run lint        # eslint (type-checked)
npm run format      # prettier
```

## License

Apache-2.0
