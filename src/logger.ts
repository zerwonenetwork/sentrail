// =============================================================================
// logger — level-filtered logging with color-coded decision output.
// =============================================================================

import chalk from "chalk";
import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  /** Decision lines always print regardless of level — they are the point. */
  allow(msg: string): void;
  block(msg: string): void;
  pending(msg: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = ORDER[level];
  const enabled = (l: LogLevel) => ORDER[l] >= threshold;
  return {
    debug: (m) => { if (enabled("debug")) console.log(chalk.dim(m)); },
    info: (m) => { if (enabled("info")) console.log(m); },
    warn: (m) => { if (enabled("warn")) console.log(chalk.yellow(m)); },
    error: (m) => { if (enabled("error")) console.log(chalk.red(m)); },
    allow: (m) => console.log(chalk.green(m)),
    block: (m) => console.log(chalk.red(m)),
    pending: (m) => console.log(chalk.yellow(m)),
  };
}
