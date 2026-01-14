export const isDebug = import.meta.env.VITE_DEBUG_LOGS === "true";

export const logger = {
  log: (...args: any[]) => {
    if (isDebug) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDebug) {
      console.warn(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDebug) {
      console.info(...args);
    }
  },
  error: (...args: any[]) => {
    // Errors are always important
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (isDebug) {
      console.debug(...args);
    }
  },
};
