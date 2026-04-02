import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

/** Valid cadence values — must match the Prisma Cadence enum and CadenceType */
export const cadenceSchema = z.enum([
  'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'BI_MONTHLY', 'SEASONAL', 'YEARLY',
])

/** Valid user roles — must match the Prisma Role enum */
export const roleSchema = z.enum(['ADMIN', 'STAFF'])

/** Positive integer quantity (1–100) */
export const quantitySchema = z.number().int().min(1).max(100)

/** ISO date string that parses to a valid Date */
export const dateStringSchema = z.string().refine(
  (val) => !isNaN(new Date(val).getTime()),
  { message: 'Invalid date format' }
)

// ---------------------------------------------------------------------------
// Magazine schemas
// ---------------------------------------------------------------------------

/** POST /api/magazines — create a new magazine */
export const createMagazineSchema = z.object({
  name: z.string().min(1, 'Name is required').transform((s) => s.trim()),
  cadence: cadenceSchema,
  language: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

/** PUT /api/magazines/[id] — partial update */
export const updateMagazineSchema = z.object({
  name: z.string().min(1).transform((s) => s.trim()).optional(),
  cadence: cadenceSchema.optional(),
  language: z.string().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Receipt schemas
// ---------------------------------------------------------------------------

/** POST /api/magazines/[id]/receipts — create a receipt */
export const createReceiptSchema = z.object({
  receivedDate: dateStringSchema,
  branchId: z.string().min(1, 'branchId is required'),
  notes: z.string().nullable().optional(),
})

/** PUT /api/magazines/[id]/receipts — update last receipt date */
export const updateReceiptSchema = z.object({
  receivedDate: dateStringSchema,
  branchId: z.string().min(1, 'branchId is required'),
})

/** PUT /api/magazines/[id]/receipts/[receiptId] — edit a specific receipt */
export const editReceiptSchema = z.object({
  receivedDate: dateStringSchema.optional(),
  branchId: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Transfer schemas
// ---------------------------------------------------------------------------

/** POST /api/transfers — initiate a transfer */
export const createTransferSchema = z.object({
  magazineId: z.string().min(1, 'magazineId is required'),
  toBranchId: z.string().min(1, 'toBranchId is required'),
  quantity: quantitySchema,
})

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------

/** PUT /api/users/[id] — admin update user */
export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: roleSchema.optional(),
})

// ---------------------------------------------------------------------------
// Branch magazine schemas
// ---------------------------------------------------------------------------

/** POST /api/branches/[id]/magazines — add subscription */
export const addBranchMagazineSchema = z.object({
  magazineId: z.string().min(1, 'magazineId is required'),
  quantity: quantitySchema.optional().default(1),
})

/** PUT /api/branches/[id]/magazines/[magazineId] — update subscription */
export const updateBranchMagazineSchema = z.object({
  quantity: quantitySchema.optional(),
  active: z.boolean().optional(),
})
