/**
 * The two runtime globals this package's tests use, declared by hand because
 * the package's tsconfig deliberately has no Node types (it performs no I/O).
 */
declare const process: { env: Record<string, string | undefined> };

declare class MessagePort {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

declare class MessageChannel {
  readonly port1: MessagePort;
  readonly port2: MessagePort;
}
