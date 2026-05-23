import pino from 'pino';
import { getTraceContext } from '../utils/tracing.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin() {
    return getTraceContext();
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '{msg} {reqId} {jobId}'
    }
  }
});

export default logger;
