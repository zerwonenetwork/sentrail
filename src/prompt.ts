// =============================================================================
// prompt — minimal interactive prompts built on a single readline line-iterator
// (avoids an extra dependency, and works for both interactive TTY input and
//  piped/redirected input — one line consumed per question)
// =============================================================================

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import chalk from "chalk";

export interface AskOptions {
  /** Default value used when the user submits an empty line. */
  defaultValue?: string;
  /** Return null when valid, or an error string to re-prompt. */
  validate?: (value: string) => string | null;
}

export interface Prompter {
  ask(label: string, options?: AskOptions): Promise<string>;
  close(): void;
}

export function createPrompter(): Prompter {
  const rl = createInterface({ input: stdin });
  const lines = rl[Symbol.asyncIterator]();

  async function ask(label: string, options: AskOptions = {}): Promise<string> {
    const { defaultValue, validate } = options;
    const suffix = defaultValue ? chalk.dim(` (${defaultValue})`) : "";

    for (;;) {
      stdout.write(`${chalk.cyan("?")} ${label}${suffix}: `);
      const next = await lines.next();

      // EOF (end of piped input): fall back to the default, or fail if required.
      if (next.done) {
        stdout.write("\n");
        const value = defaultValue ?? "";
        const error = validate?.(value);
        if (error) {
          throw new Error(`No input available for "${label}": ${error}`);
        }
        return value;
      }

      const value = next.value.trim() || defaultValue || "";
      const error = validate?.(value);
      if (error) {
        console.log(chalk.red(`  ✗ ${error}`));
        continue;
      }
      return value;
    }
  }

  return { ask, close: () => rl.close() };
}
