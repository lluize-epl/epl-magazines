import type { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import { auditLog } from '@/lib/logger'
import {
  parseReportFilters,
  getReceiptSummary,
  getOverdueReport,
  getTransferReport,
  getSubscriptionOverview,
  getReceiptTimeline,
} from '@/lib/reports'
import { format } from 'date-fns'
import { CADENCE_LABELS } from '@/lib/cadence'
import type { CadenceType } from '@/types'

/**
 * GET /admin/reports/export
 * Generates and returns an .xlsx file for the selected report tab and filters.
 * Admin-only — enforces auth independently since route handlers bypass layouts.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await getUser()

    if (user.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params: Record<string, string | undefined> = {}
    request.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })
    const filters = parseReportFilters(params)

    const workbook = new ExcelJS.Workbook()
    let rowCount = 0

    switch (filters.tab) {
      case 'receipts': {
        const rows = await getReceiptSummary(filters)
        const sheet = workbook.addWorksheet('Receipt Summary')
        sheet.columns = [
          { header: 'Magazine', key: 'magazine', width: 30 },
          { header: 'Language', key: 'language', width: 15 },
          { header: 'Cadence', key: 'cadence', width: 15 },
          { header: 'Receipts', key: 'receipts', width: 12 },
          { header: 'Last Received', key: 'lastReceived', width: 18 },
          { header: 'Branch', key: 'branch', width: 25 },
        ]
        for (const row of rows) {
          sheet.addRow({
            magazine: row.magazineName,
            language: row.language,
            cadence: CADENCE_LABELS[row.cadence as CadenceType],
            receipts: row.receiptCount,
            lastReceived: row.lastReceivedDate
              ? format(new Date(row.lastReceivedDate), 'MMM d, yyyy')
              : 'Never',
            branch: row.branchName,
          })
        }
        sheet.getRow(1).font = { bold: true }
        rowCount = rows.length
        break
      }

      case 'overdue': {
        const { rows } = await getOverdueReport(filters)
        const sheet = workbook.addWorksheet('Overdue Report')
        sheet.columns = [
          { header: 'Magazine', key: 'magazine', width: 30 },
          { header: 'Language', key: 'language', width: 15 },
          { header: 'Branch', key: 'branch', width: 25 },
          { header: 'Cadence', key: 'cadence', width: 15 },
          { header: 'Days Overdue', key: 'daysOverdue', width: 15 },
          { header: 'Last Received', key: 'lastReceived', width: 18 },
          { header: 'Next Expected', key: 'nextExpected', width: 18 },
        ]
        for (const row of rows) {
          sheet.addRow({
            magazine: row.magazineName,
            language: row.language,
            branch: row.branchName,
            cadence: CADENCE_LABELS[row.cadence as CadenceType],
            daysOverdue: row.daysOverdue,
            lastReceived: row.lastReceivedDate
              ? format(new Date(row.lastReceivedDate), 'MMM d, yyyy')
              : 'Never',
            nextExpected: row.nextExpectedDate
              ? format(new Date(row.nextExpectedDate), 'MMM d, yyyy')
              : 'Never',
          })
        }
        sheet.getRow(1).font = { bold: true }
        rowCount = rows.length
        break
      }

      case 'transfers': {
        const { rows } = await getTransferReport(filters)
        const sheet = workbook.addWorksheet('Transfer Activity')
        sheet.columns = [
          { header: 'Date', key: 'date', width: 18 },
          { header: 'Magazine', key: 'magazine', width: 30 },
          { header: 'From', key: 'from', width: 25 },
          { header: 'To', key: 'to', width: 25 },
          { header: 'Qty', key: 'qty', width: 8 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Initiated By', key: 'initiatedBy', width: 20 },
          { header: 'Resolved By', key: 'resolvedBy', width: 20 },
        ]
        for (const row of rows) {
          sheet.addRow({
            date: format(new Date(row.date), 'MMM d, yyyy'),
            magazine: row.magazineName,
            from: row.fromBranch,
            to: row.toBranch,
            qty: row.quantity,
            status: row.status,
            initiatedBy: row.initiatedBy,
            resolvedBy: row.resolvedBy ?? '',
          })
        }
        sheet.getRow(1).font = { bold: true }
        rowCount = rows.length
        break
      }

      case 'subscriptions': {
        const rows = await getSubscriptionOverview(filters)
        const isPeriodMode = rows.some((r) => r.issuesPerYear !== undefined)
        const sheet = workbook.addWorksheet('Subscriptions')
        if (isPeriodMode) {
          sheet.columns = [
            { header: 'Branch', key: 'branch', width: 25 },
            { header: 'Magazine', key: 'magazine', width: 30 },
            { header: 'Language', key: 'language', width: 15 },
            { header: 'Cadence', key: 'cadence', width: 15 },
            { header: 'Qty', key: 'qty', width: 8 },
            { header: 'Received', key: 'received', width: 12 },
            { header: 'Issues/Year', key: 'issuesPerYear', width: 14 },
            { header: 'Active', key: 'active', width: 10 },
          ]
          for (const row of rows) {
            sheet.addRow({
              branch: row.branchName,
              magazine: row.magazineName,
              language: row.language,
              cadence: CADENCE_LABELS[row.cadence as CadenceType],
              qty: row.quantity,
              received: row.receivedCount ?? 0,
              issuesPerYear: row.issuesPerYear ?? '',
              active: row.active ? 'Yes' : 'No',
            })
          }
        } else {
          sheet.columns = [
            { header: 'Branch', key: 'branch', width: 25 },
            { header: 'Magazine', key: 'magazine', width: 30 },
            { header: 'Language', key: 'language', width: 15 },
            { header: 'Cadence', key: 'cadence', width: 15 },
            { header: 'Qty', key: 'qty', width: 8 },
            { header: 'Active', key: 'active', width: 10 },
          ]
          for (const row of rows) {
            sheet.addRow({
              branch: row.branchName,
              magazine: row.magazineName,
              language: row.language,
              cadence: CADENCE_LABELS[row.cadence as CadenceType],
              qty: row.quantity,
              active: row.active ? 'Yes' : 'No',
            })
          }
        }
        sheet.getRow(1).font = { bold: true }
        rowCount = rows.length
        break
      }

      case 'timeline': {
        const { data } = await getReceiptTimeline(filters)
        const sheet = workbook.addWorksheet('Receipt Timeline')
        sheet.columns = [
          { header: 'Period', key: 'period', width: 15 },
          { header: 'Branch', key: 'branch', width: 25 },
          { header: 'Count', key: 'count', width: 10 },
        ]
        for (const row of data) {
          sheet.addRow({
            period: row.period,
            branch: row.branchName,
            count: row.count,
          })
        }
        sheet.getRow(1).font = { bold: true }
        rowCount = data.length
        break
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()

    // Resolve branch ID to name for audit log readability
    let branchLabel = filters.branch
    if (filters.branch !== 'all') {
      const branch = await db.branch.findUnique({
        where: { id: filters.branch },
        select: { name: true },
      })
      if (branch) branchLabel = branch.name
    }

    auditLog(user.id, 'REPORT_EXPORTED', {
      tab: filters.tab,
      period: filters.period,
      branch: branchLabel,
      language: filters.language,
      rowCount,
    })

    const filename = `report-${filters.tab}-${filters.period}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`

    return new Response(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Report export error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
