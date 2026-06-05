// =============================================================================
// Programmatic API surface for the Sentrail CLI package.
// Lets other tooling reuse the config layer without shelling out to the binary.
// =============================================================================

export {
  CONFIG_DIR,
  CONFIG_PATH,
  DEFAULT_CLOUD_URL,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  LOG_LEVELS,
  isValidApiKey,
  isValidHttpUrl,
  isValidPort,
  loadConfig,
  maskApiKey,
  mcpConfigSnippet,
  saveConfig,
} from "./config.js";

export type { LogLevel, SentrailConfig } from "./config.js";

export { runInit } from "./commands/init.js";
export { runStatus } from "./commands/status.js";
export { runStart } from "./commands/start.js";
export { runDemo } from "./commands/demo.js";

export {
  classifyToolCall,
  classifyShellCommand,
  classifyGitCommand,
  extractCommand,
} from "./classifiers/index.js";
export type { Classification, RiskLevel } from "./classifiers/index.js";

export {
  startProxy,
  handleRpc,
  handleToolsCall,
  evaluateWithCloud,
  pollApprovalDecision,
  forwardToUpstream,
} from "./proxy.js";
export type {
  Decision,
  ApprovalOutcome,
  FetchLike,
  ProxyHandle,
  ProxyOptions,
} from "./proxy.js";

export { createLogger } from "./logger.js";
export type { Logger } from "./logger.js";
