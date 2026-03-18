import winston from 'winston'
import path from 'path'
import fs from 'fs'
import type { AuditAction } from '@/types'

// Ensure logs directory exists at startup
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
    }),
  ],
})

/**
 * Writes a structured audit log entry.
 * @param userId - ID of the acting user
 * @param action - Named audit action (e.g. 'LOGIN', 'RECEIPT_CREATED')
 * @param details - Optional additional context to include in the log entry
 */
export function auditLog(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown> = {}
): void {
  logger.info('audit', { userId, action, ...details })
}
