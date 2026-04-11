// Structured logging for Cloud Logging.
// On Cloud Run, console.log output is ingested automatically; JSON payloads
// with a "severity" field are parsed and indexed by Cloud Logging.
// Locally the output is human-readable JSON in the terminal.

type Level = "DEBUG" | "INFO" | "WARNING" | "ERROR";

function log(severity: Level, message: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ severity, message, ...data }));
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log("DEBUG", message, data),
  info:  (message: string, data?: Record<string, unknown>) => log("INFO",  message, data),
  warn:  (message: string, data?: Record<string, unknown>) => log("WARNING", message, data),
  error: (message: string, data?: Record<string, unknown>) => log("ERROR", message, data),
};
