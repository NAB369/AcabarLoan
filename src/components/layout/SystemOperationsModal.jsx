import { Sunrise, Moon, CalendarCheck, Play, History, Download } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { buildBatchPlan, todayISO, SOD, EOD, EOM } from '../../utils/systemOperations'

const OPERATIONS = [
  {
    kind: SOD,
    icon: Sunrise,
    title: 'Start of Day (SOD)',
    description: 'Checks the ledger and opens the business day.',
  },
  {
    kind: EOD,
    icon: Moon,
    title: 'End of Day (EOD)',
    description: 'Penalises overdue installments, accrues a day of interest, closes the day.',
  },
  {
    kind: EOM,
    icon: CalendarCheck,
    title: 'End of Month (EOM)',
    description: 'Re-runs PAR aging, posts the provision movement, closes the period.',
  },
]

// One row per batch ever run, with what it checked and what it posted. The panel shows the
// last five; this is the whole record, which is what someone reconciling a month against the
// ledger actually needs — the transaction numbers here are the ones to look the postings up by.
function batchLogRows(runs) {
  return runs.map(r => {
    const checks = r.checks || []
    const tally = ['pass', 'warn', 'fail']
      .map(st => [checks.filter(c => c.status === st).length, st])
      .filter(([n]) => n > 0)
      .map(([n, st]) => `${n} ${st}`)
      .join(', ')
    const postings = (r.postings || [])
      .map(pst => `${pst.transactionNo} ${pst.currency} ${Number(pst.amount || 0).toFixed(2)}`)
      .join('; ')
    return [
      r.runAt || '',
      r.kind || '',
      r.kind === 'EOM' ? (r.period || '') : (r.date || ''),
      r.runBy || '',
      tally || 'no checks recorded',
      postings || 'none',
      r.summary || '',
    ]
  })
}

export default function SystemOperationsModal() {
  const { state, dispatch, showToast } = useApp()

  const day = state.businessDay || {}
  const dayOpen = day.status === 'open'

  function close() {
    dispatch({ type: 'CLOSE_SYSTEM_OPS' })
  }

  // One click: the plan is built, checked and posted in the same action. The checks still run
  // and a failing one still stops the posting — what changed is that their detail is no longer
  // read on screen first, it is read afterwards in the downloaded log, step by step.
  function run(kind) {
    const plan = buildBatchPlan(state, kind, todayISO())
    if (!plan) return

    if (plan.blocked) {
      const failed = (plan.checks || []).filter(c => c.status === 'fail')
      showToast(
        `${kind} stopped — ${failed.length} check${failed.length === 1 ? '' : 's'} failed: ${failed.map(c => c.label).join(', ')}. Nothing was posted.`,
        'error'
      )
      return
    }

    dispatch({ type: `RUN_${kind}`, plan })
    dispatch({
      type: 'ADD_AUDIT_LOG',
      log: { action: `${kind} batch completed`, module: 'Periodic', reference: kind === EOM ? plan.period : plan.date },
    })
    showToast(
      kind === SOD ? `Business day ${plan.date} opened`
        : kind === EOD ? `End of Day complete — business day ${plan.date} closed`
        : `End of Month complete — period ${plan.period} closed`,
      'success'
    )
    dispatch({ type: 'CLOSE_SYSTEM_OPS' })
  }

  // The log is where the detail lives now that the panel does not show it: an index of every
  // run, then a section per run listing each check step with its verdict and reason, and every
  // ledger entry it posted. Landscape, because transaction numbers and check reasons wrap into
  // uselessness on portrait A4.
  function downloadLog() {
    const runs = state.batchRuns || []
    if (runs.length === 0) return

    const doc = new jsPDF({ orientation: 'landscape' })
    const pageHeight = doc.internal.pageSize.getHeight()
    const bottom = () => doc.lastAutoTable?.finalY ?? 31

    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile?.name || 'Batch Run Log', 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Batch Run Log — System Operations', 14, 21)
    doc.text(`${runs.length} run${runs.length === 1 ? '' : 's'} · exported ${new Date().toLocaleString()}`, 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [['Run At', 'Batch', 'Business Date / Period', 'Run By', 'Checks', 'Postings', 'Summary']],
      body: batchLogRows(runs),
      styles: { fontSize: 7, cellWidth: 'wrap' },
      headStyles: { fillColor: [0, 71, 171] },
      columnStyles: { 5: { cellWidth: 55 }, 6: { cellWidth: 60 } },
    })

    // A heading, then the steps, then what they let through — repeated for every run.
    runs.forEach((r, i) => {
      let y = bottom() + 12
      if (y > pageHeight - 40) { doc.addPage(); y = 20 }

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text(
        `${i + 1}. ${r.kind} — ${r.kind === 'EOM' ? `period ${r.period || '—'}` : `business day ${r.date || '—'}`}`,
        14, y,
      )
      doc.setFontSize(8)
      doc.setFont(undefined, 'normal')
      doc.text(`Run ${r.runAt || '—'} by ${r.runBy || '—'} · ${r.summary || ''}`, 14, y + 5)

      autoTable(doc, {
        startY: y + 9,
        head: [['#', 'Check step', 'Result', 'Detail']],
        body: (r.checks || []).length
          ? r.checks.map((c, n) => [n + 1, c.label || c.id || '', (c.status || '').toUpperCase(), c.detail || ''])
          : [['—', 'No checks recorded for this run', '—', '']],
        styles: { fontSize: 7, cellWidth: 'wrap' },
        headStyles: { fillColor: [71, 85, 105] },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 60 }, 2: { cellWidth: 16 }, 3: { cellWidth: 150 } },
        margin: { left: 14 },
      })

      autoTable(doc, {
        startY: bottom() + 3,
        head: [['Ledger entries posted', 'Currency', 'Amount']],
        body: (r.postings || []).length
          ? r.postings.map(pst => [pst.transactionNo || '—', pst.currency || '', Number(pst.amount || 0).toFixed(2)])
          : [['None — this batch posted no ledger entry', '', '']],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [71, 85, 105] },
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 20 }, 2: { cellWidth: 28, halign: 'right' } },
        margin: { left: 14 },
      })
    })

    doc.save(`batch-run-log-${todayISO()}.pdf`)
    showToast(`Batch run log downloaded — ${runs.length} run${runs.length === 1 ? '' : 's'}`, 'success')
  }

  return (
    <Dialog open={state.systemOpsOpen} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-800 dark:text-slate-100">System Operations</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            One click runs the batch. Every check it made and every entry it posted is in the downloadable log.
          </DialogDescription>
        </DialogHeader>

        {/* Business day state — the gate the batches move between */}
        <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${
          dayOpen
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
        }`}>
          {dayOpen
            ? <Sunrise className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
            : <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {dayOpen ? `Business day open — ${day.date}` : day.date ? `Business day closed — last ${day.date}` : 'No business day opened yet'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {dayOpen
                ? `Opened ${day.openedAt} by ${day.openedBy}`
                : day.closedAt ? `Closed ${day.closedAt} by ${day.closedBy}` : 'Run Start of Day to begin the cycle.'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {OPERATIONS.map(op => {
            const Icon = op.icon
            return (
              <div key={op.kind} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{op.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{op.description}</p>
                  </div>
                  <Button
                    onClick={() => run(op.kind)}
                    className="flex-shrink-0 h-auto px-3.5 py-2 rounded-xl text-[11px] font-bold gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run {op.kind}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Batch history */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              Recent batch runs
            </p>
            {/* The list shows five; the download is every run on this install. */}
            {state.batchRuns.length > 0 && (
              <Button
                variant="outline"
                onClick={downloadLog}
                title="Download the full batch run log as a PDF"
                className="flex-shrink-0 h-auto px-2.5 py-1 rounded-lg text-[10px] font-bold gap-1.5 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="w-3 h-3" />
                Download log
              </Button>
            )}
          </div>
          {state.batchRuns.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              No batch has been run on this install yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {state.batchRuns.slice(0, 5).map(runRecord => (
                <li key={runRecord.id} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">{runRecord.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{runRecord.summary}</span>
                  <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{runRecord.runAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          Batch postings are irreversible — post the day's transactions before running EOD.
        </p>
      </DialogContent>
    </Dialog>
  )
}
