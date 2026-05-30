/**
 * Transport abstraction: read raw EnOcean ESP3 bytes from either a local serial port or a
 * TCP socket (e.g. a ser2net raw-TCP accepter).
 *
 * @file transport.ts
 */

import net from 'node:net';

import type { AnsiLogger } from 'matterbridge/logger';
import { SerialPort } from 'serialport';

/** Callbacks a transport invokes on its consumer. */
export interface TransportCallbacks {
  /** Called with each chunk of received bytes. */
  onData: (chunk: Buffer) => void;
  /** Called when the underlying connection opens. */
  onOpen?: () => void;
  /** Called when the underlying connection closes. */
  onClose?: () => void;
  /** Called on a transport error. */
  onError?: (err: Error) => void;
}

/** A transport that delivers bytes until closed. */
export interface Transport {
  /** Close the transport and stop reconnecting. */
  close(): void;
}

/** Options for opening a transport. */
export interface TransportOptions {
  /** Serial baud rate (ignored for TCP transports). */
  baud: number;
  /** Reconnect delay in milliseconds for TCP transports. */
  reconnectMs?: number;
  /** Logger. */
  log: AnsiLogger;
}

/** Serial transport backed by the `serialport` package. */
class SerialTransport implements Transport {
  private port: SerialPort;

  constructor(path: string, baud: number, cb: TransportCallbacks) {
    this.port = new SerialPort({ path, baudRate: baud });
    this.port.on('open', () => cb.onOpen?.());
    this.port.on('data', (chunk: Buffer) => cb.onData(chunk));
    this.port.on('close', () => cb.onClose?.());
    this.port.on('error', (err: Error) => cb.onError?.(err));
  }

  close(): void {
    if (this.port.isOpen) {
      this.port.close();
    }
  }
}

/** TCP transport with automatic reconnect (for ser2net raw-TCP accepters). */
class TcpTransport implements Transport {
  private socket?: net.Socket;
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly cb: TransportCallbacks,
    private readonly reconnectMs: number,
    private readonly log: AnsiLogger,
  ) {
    this.connect();
  }

  private connect(): void {
    const socket = net.createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    socket.on('connect', () => this.cb.onOpen?.());
    socket.on('data', (chunk: Buffer) => this.cb.onData(chunk));
    socket.on('error', (err: Error) => this.cb.onError?.(err));
    socket.on('close', () => {
      this.cb.onClose?.();
      if (!this.closed) {
        this.log.info(`EnOcean TCP transport disconnected, reconnecting in ${this.reconnectMs} ms`);
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    this.timer = setTimeout(() => this.connect(), this.reconnectMs);
  }

  close(): void {
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.socket?.destroy();
  }
}

/**
 * Open a transport for the given device URL.
 *
 * Accepts:
 *   - "tcp://host:port" — a raw TCP socket (e.g. a ser2net raw accepter).
 *   - any other string — a local serial device path (e.g. "/dev/ttyUSB0" or "/dev/serial/by-id/...").
 *
 * Note: RFC2217 ("rfc2217://...") is intentionally unsupported; configure ser2net with a
 * raw TCP accepter and use a "tcp://" URL instead.
 *
 * @param {string} url - The device URL or path.
 * @param {TransportOptions} opts - Transport options.
 * @param {TransportCallbacks} cb - Consumer callbacks.
 * @returns {Transport} The opened transport.
 */
export function openTransport(url: string, opts: TransportOptions, cb: TransportCallbacks): Transport {
  if (url.startsWith('rfc2217://')) {
    throw new Error('rfc2217:// is not supported. Configure ser2net with a raw TCP accepter and use a "tcp://host:port" URL instead.');
  }
  if (url.startsWith('tcp://')) {
    const u = new URL(url);
    const host = u.hostname;
    const port = Number(u.port);
    if (!host || !Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid tcp:// URL: ${url}`);
    }
    return new TcpTransport(host, port, cb, opts.reconnectMs ?? 5000, opts.log);
  }
  return new SerialTransport(url, opts.baud, cb);
}
