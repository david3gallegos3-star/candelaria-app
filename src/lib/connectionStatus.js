const listeners = new Set();

export function reportError() {
  listeners.forEach(fn => fn(true));
}

export function reportSuccess() {
  listeners.forEach(fn => fn(false));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
