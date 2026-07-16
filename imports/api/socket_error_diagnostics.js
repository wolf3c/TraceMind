const installedDiagnostics = new WeakMap();

function addressClass(address) {
  if (typeof address !== 'string' || !address) return 'unknown';
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized.startsWith('127.') || normalized.startsWith('::ffff:127.')) {
    return 'loopback';
  }
  if (
    normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
  ) {
    return 'private';
  }
  return 'public';
}

function portNumber(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function installSocketErrorDiagnostics({
  SocketClass,
  log = (...args) => console.error(...args),
  env = process.env,
} = {}) {
  if (!SocketClass?.prototype || typeof SocketClass.prototype.emit !== 'function') {
    throw new TypeError('SocketClass with an emit method is required');
  }
  if (installedDiagnostics.has(SocketClass)) {
    return installedDiagnostics.get(SocketClass).uninstall;
  }

  const prototype = SocketClass.prototype;
  const originalEmit = prototype.emit;
  const hadOwnEmit = Object.prototype.hasOwnProperty.call(prototype, 'emit');

  function diagnosticEmit(eventName, ...args) {
    if (eventName === 'error' && this.listenerCount('error') === 0) {
      const error = args[0];
      const localPort = portNumber(this.localPort);
      const appPort = portNumber(env.PORT);
      try {
        log('[TraceMind] unhandled socket error diagnostic', {
          code: typeof error?.code === 'string' ? error.code : 'unknown',
          syscall: typeof error?.syscall === 'string' ? error.syscall : 'unknown',
          socketType: this.constructor?.name || 'Socket',
          localAddressClass: addressClass(this.localAddress),
          remoteAddressClass: addressClass(this.remoteAddress),
          localPort,
          remotePort: portNumber(this.remotePort),
          matchesAppPort: appPort !== null && localPort === appPort,
          encrypted: Boolean(this.encrypted),
          connecting: Boolean(this.connecting),
          destroyed: Boolean(this.destroyed),
          readable: Boolean(this.readable),
          writable: Boolean(this.writable),
          meteorShellEnabled: Boolean(env.METEOR_SHELL_DIR),
          galaxyLoggerConfigured: Boolean(env.GALAXY_LOGGER),
          apmConfigured: Object.keys(env).some((key) => key.startsWith('APM_')),
        });
      } catch (ignored) {}
    }
    return originalEmit.call(this, eventName, ...args);
  }

  function uninstall() {
    const installed = installedDiagnostics.get(SocketClass);
    if (installed?.patchedEmit !== diagnosticEmit) return;
    if (hadOwnEmit) prototype.emit = originalEmit;
    else delete prototype.emit;
    installedDiagnostics.delete(SocketClass);
  }

  prototype.emit = diagnosticEmit;
  installedDiagnostics.set(SocketClass, { patchedEmit: diagnosticEmit, uninstall });
  return uninstall;
}
