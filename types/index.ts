/**
 * Shared domain types for EPL Magazine Tracker.
 * Import from '@/types' in all other files.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** User role — ADMIN has full CRUD, STAFF can only view and mark received */
export type UserRole = 'ADMIN' | 'STAFF'

/** Publication cadence — drives next-expected-date calculations */
export type CadenceType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'

/** Dashboard status bucket for a magazine */
export type MagazineStatus = 'overdue' | 'this_week' | 'upcoming' | 'never_received'

/** Dashboard-only status buckets (reduced from 4 to 2) */
export type DashboardStatus = 'overdue' | 'this_week'

/** Short code identifying each library branch */
export type BranchCode = 'MAIN' | 'NORTH' | 'CB' | 'MOBILE'

// ---------------------------------------------------------------------------
// Auth / Session
// ---------------------------------------------------------------------------

/**
 * Payload stored in the encrypted JWT session cookie.
 * `expiresAt` is a Date when created by jose, but deserialised as a string.
 */
export interface SessionPayload {
  userId: string
  role: UserRole
  expiresAt: Date | string
}

/** Minimal session info used in Server Components / route handlers */
export interface SessionUser {
  userId: string
  role: UserRole
}

/** Full user object returned to authenticated callers */
export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

/**
 * Standard API response shape.
 * Success responses optionally carry data; error responses carry a message string.
 */
export type ApiResponse<T = undefined> =
  | { success: true; data?: T }
  | { error: string }

// ---------------------------------------------------------------------------
// Magazine
// ---------------------------------------------------------------------------

/** Raw magazine record from the database */
export interface Magazine {
  id: string
  name: string
  cadence: CadenceType
  language: string
  active: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

/** Magazine enriched with computed dashboard status */
export interface MagazineWithStatus extends Magazine {
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
  status: MagazineStatus
  lastReceivedBy?: string | null
}

/** Magazine with receipt count (used in admin views) */
export interface MagazineWithCount extends Magazine {
  _count: { receipts: number }
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

/** Raw issue receipt record */
export interface IssueReceipt {
  id: string
  magazineId: string
  receivedById: string
  branchId: string | null
  receivedDate: Date
  notes: string | null
  createdAt: Date
}

/** Receipt with the receiver's name and branch name joined */
export interface ReceiptWithReceiver extends IssueReceipt {
  receivedBy: { name: string }
  branch?: { name: string; code: string } | null
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Raw branch record from the database */
export interface Branch {
  id: string
  name: string
  code: BranchCode
  active: boolean
  createdAt: Date
}

/** Branch magazine subscription (join table record) */
export interface BranchMagazine {
  id: string
  branchId: string
  magazineId: string
  quantity: number
  active: boolean
  createdAt: Date
}

/** Branch magazine subscription enriched with magazine data and receipt stats for admin inventory view */
export interface BranchMagazineWithDetails {
  id: string
  branchId: string
  magazineId: string
  quantity: number
  active: boolean
  createdAt: Date
  magazine: Magazine
  totalIssues: number
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
}

/** Branch with count of active magazine subscriptions */
export interface BranchWithCount extends Branch {
  _count: { magazines: number }
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

/** Transfer lifecycle status */
export type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

/** Raw transfer record from the database */
export interface Transfer {
  id: string
  magazineId: string
  fromBranchId: string
  toBranchId: string
  quantity: number
  status: TransferStatus
  initiatedById: string
  completedById: string | null
  cancelledById: string | null
  createdAt: Date
  completedAt: Date | null
  cancelledAt: Date | null
}

/** Transfer enriched with related names for display */
export interface TransferWithDetails extends Transfer {
  magazine: { name: string }
  fromBranch: { name: string; code: BranchCode }
  toBranch: { name: string; code: BranchCode }
  initiatedBy: { name: string }
  completedBy: { name: string } | null
  cancelledBy: { name: string } | null
}

// ---------------------------------------------------------------------------
// Users (admin views)
// ---------------------------------------------------------------------------

/** User record as shown in the admin users table */
export interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: Date
  _count: { receipts: number }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/** Discriminated union of known audit action strings */
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'MAGAZINE_CREATED'
  | 'MAGAZINE_UPDATED'
  | 'MAGAZINE_DELETED'
  | 'RECEIPT_CREATED'
  | 'RECEIPT_EDITED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'BRANCH_MAGAZINE_ADDED'
  | 'BRANCH_MAGAZINE_UPDATED'
  | 'BRANCH_MAGAZINE_REMOVED'
  | 'USER_NAME_CHANGED'
  | 'USER_PASSWORD_CHANGED'
  | 'TRANSFER_INITIATED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'REPORT_EXPORTED'

/** Parsed JSON line from logs/audit.log */
export interface AuditLogEntry {
  timestamp: string
  level: string
  userId: string
  action: AuditAction | string
  [key: string]: unknown // spread details passed to auditLog()
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Tab identifiers for the reports page */
export type ReportTab = 'receipts' | 'overdue' | 'transfers' | 'subscriptions' | 'timeline'

/** Period preset identifiers for report date filtering */
export type ReportPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'

/** Parsed filter state from searchParams on the reports page */
export interface ReportFilters {
  tab: ReportTab
  period: ReportPeriod
  from: Date
  to: Date
  branch: string
  language: string
}

/** Row in the Receipt Summary report table */
export interface ReceiptSummaryRow {
  magazineId: string
  magazineName: string
  language: string
  cadence: CadenceType
  receiptCount: number
  lastReceivedDate: Date | null
  branchName: string
}

/** Row in the Overdue / Compliance report table */
export interface OverdueReportRow {
  magazineId: string
  magazineName: string
  language: string
  branchName: string
  cadence: CadenceType
  daysOverdue: number
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
}

/** Row in the Transfer Activity report table */
export interface TransferReportRow {
  magazineId: string
  date: Date
  magazineName: string
  fromBranch: string
  toBranch: string
  quantity: number
  status: TransferStatus
  initiatedBy: string
  resolvedBy: string | null
}

/** Row in the Subscription Overview report table */
export interface SubscriptionReportRow {
  magazineId: string
  branchName: string
  magazineName: string
  language: string
  cadence: CadenceType
  quantity: number
  active: boolean
}

/** Data point for the Receipt Timeline chart */
export interface TimelineDataPoint {
  period: string
  branchName: string
  count: number
}
