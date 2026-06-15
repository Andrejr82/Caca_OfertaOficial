export interface LogMetadata {
  event?: string;
  [key: string]: any;
}

export const logger = {
  info: (message: string, metadata?: LogMetadata) => {
    console.log(JSON.stringify({ level: "INFO", message, timestamp: new Date().toISOString(), ...metadata }));
  },
  warn: (message: string, metadata?: LogMetadata) => {
    console.warn(JSON.stringify({ level: "WARN", message, timestamp: new Date().toISOString(), ...metadata }));
  },
  error: (message: string, error?: any, metadata?: LogMetadata) => {
    const errorDetails = error instanceof Error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : { error };
    console.error(JSON.stringify({ level: "ERROR", message, timestamp: new Date().toISOString(), ...errorDetails, ...metadata }));
  }
};
