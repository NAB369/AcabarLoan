import { useEffect, useMemo, useState } from 'react'
import { Bell, Search, ChevronDown, Send, X, AlertTriangle, CalendarClock, CalendarDays, BellOff, ExternalLink, History } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import {
  REMINDER_METHODS, nextUnpaidInstallment, daysUntilDue, dueLabel,
  buildReminderRecipients, buildSampleReminderMessage, buildReminderEntry, appendReminder, weumsSignedIn,
} from '../../utils/reminders'
import WeumsGateModal from '../shared/WeumsGateModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

// Which slice of the book is on screen. 'due' is the working list — everything already due
// or falling due inside the week — and is what the page opens on: the rest of the schedule
// is not actionable yet.
const RANGES = [
  { id: 'due',     label: 'Overdue & due this week', match: d => d <= 7 },
  { id: 'overdue', label: 'Overdue only',            match: d => d < 0 },
  { id: 'today',   label: 'Due today',               match: d => d === 0 },
  { id: 'week',    label: 'Next 7 days',             match: d => d >= 0 && d <= 7 },
  { id: 'month',   label: 'Next 30 days',            match: d => d >= 0 && d <= 30 },
  { id: 'all',     label: 'All outstanding',         match: () => true },
]

// Urgency drives the row's chip and the tile counts. Anything further out than a week is
// simply 'upcoming' — there is nothing to chase yet.
function urgencyOf(days) {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'soon'
  return 'upcoming'
}

const URGENCY_STYLE = {
  overdue:  'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
  today:    'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  soon:     'bg-brand-50 text-brand-700 border-brand-200/60 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800',
  upcoming: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
}

const Th = ({ children, right, className = '' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 ${right ? 'text-right' : 'text-left'} ${className}`}>
    {children}
  </th>
)

function StatTile({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    rose:  'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    slate: 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400',
  }
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Modal: compose one reminder ──────────────────────────────────────────────
// The same three choices the loan's own Repayment Reminder tab offers — who, how, and the
// wording — so a reminder sent from here is indistinguishable from one sent in the loan.
function ComposeModal({ row, onClose }) {
  const { state, dispatch, showToast } = useApp()
  const { loan, next } = row
  const currency = loan.currency || state.currency
  const recipients = buildReminderRecipients(loan)
  const [recipientKey, setRecipientKey] = useState('borrower')
  const [method, setMethod] = useState('Message')
  const [override, setOverride] = useState(null)

  // Read the history off the live list entry — `UPDATE_LOAN` replaces the loan in state and
  // the row this modal was opened with is a snapshot, so a reminder sent here would
  // otherwise not appear in the list below it.
  const liveLoan = state.loanApplications.find(a => a.ref === loan.ref) || loan
  const history = liveLoan.reminderHistory || []

  const recipient = recipients.find(r => r.key === recipientKey) || recipients[0]
  const message = override ?? buildSampleReminderMessage(method, recipient, next, currency, loan)

  // Local component state, so App.jsx's global Escape handler can't reach it.
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  function send() {
    const entry = buildReminderEntry({ method, recipient, message })
    dispatch({ type: 'UPDATE_LOAN', loan: appendReminder(liveLoan, entry) })
    showToast(`Repayment reminder sent via ${method} to ${recipient?.name}${entry.destination ? ` (${entry.destination})` : ''}`, 'success')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{loan.customerName}</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                {loan.ref} · installment #{next.num} · {next.dueDate}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close" className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent flex-shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Send To</Label>
              <select
                value={recipientKey}
                onChange={e => { setRecipientKey(e.target.value); setOverride(null) }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {recipients.map(r => <option key={r.key} value={r.key}>{r.name} ({r.role})</option>)}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                {method === 'Email' ? (recipient?.email || 'No email on file') : (recipient?.phone || 'No phone on file')}
              </p>
            </div>
            <div>
              <Label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Delivery Method</Label>
              <select
                value={method}
                onChange={e => { setMethod(e.target.value); setOverride(null) }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {REMINDER_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                {formatVal(next.totalDue, currency, 1)} due · {dueLabel(row.days)}
              </p>
            </div>
          </div>

          <div>
            <Label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Message to Send</Label>
            <Textarea
              value={message}
              onChange={e => setOverride(e.target.value)}
              rows={method === 'Email' ? 8 : 4}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Reminder History</span>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No reminders have been sent for this loan yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {[...history].reverse().map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{r.recipient}{r.role ? ` (${r.role})` : ''}</span>
                      <span className="text-slate-400 dark:text-slate-500"> · {r.timestamp}</span>
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0">via {r.method}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-auto px-4 py-2 text-sm font-semibold rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={send}
            className="h-auto flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-sm font-semibold rounded-xl shadow-sm"
          >
            <Send className="w-4 h-4" />
            Send via {method}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReminderPage() {
  const { state, dispatch, showToast } = useApp()
  const [range, setRange] = useState('due')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [composeRef, setComposeRef] = useState(null)
  const [gateOpen, setGateOpen] = useState(false)

  // Every reminder here goes out through WeUMS — see WeumsGateModal — so neither send
  // action below runs until this install is signed in with it.
  const weumsReady = weumsSignedIn(state)

  function goToWeumsSetup() {
    setGateOpen(false)
    dispatch({ type: 'OPEN_SETTINGS' })
    dispatch({ type: 'SET_SETTINGS_MENU', menu: 'integration' })
  }

  // One row per loan that still owes an installment, soonest due first. A loan is only
  // chaseable from approval onward — the same gate the loan's own Repayment Reminder tab
  // uses — and only its next unpaid installment is worth a reminder.
  const rows = useMemo(() => (state.loanApplications || [])
    .filter(loan => loan.status === 'Active' || (loan.approvalState || 1) >= 3)
    .map(loan => {
      const next = nextUnpaidInstallment(loan)
      if (!next) return null
      const history = loan.reminderHistory || []
      const days = daysUntilDue(next.dueDateISO)
      return {
        loan, next, days,
        urgency: urgencyOf(days),
        last: history[history.length - 1] || null,
        sentCount: history.length,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.next.dueDateISO.localeCompare(b.next.dueDateISO)),
    [state.loanApplications]
  )

  const counts = useMemo(() => ({
    overdue: rows.filter(r => r.urgency === 'overdue'),
    today: rows.filter(r => r.urgency === 'today'),
    soon: rows.filter(r => r.urgency === 'soon'),
    never: rows.filter(r => r.sentCount === 0 && r.days <= 7),
  }), [rows])

  const matcher = (RANGES.find(r => r.id === range) || RANGES[0]).match
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (!matcher(r.days)) return false
      if (!q) return true
      const l = r.loan
      return [l.customerName, l.ref, l.customerCode, l.customerPhone, l.product]
        .some(v => (v || '').toLowerCase().includes(q))
    })
  }, [rows, matcher, search])

  // Selection is held as loan refs, so it survives the list re-sorting or re-filtering
  // underneath it. Only what is on screen can be acted on, hence the intersection.
  const visibleRefs = visible.map(r => r.loan.ref)
  const selectedVisible = selected.filter(ref => visibleRefs.includes(ref))
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length

  function toggleRow(ref) {
    setSelected(s => s.includes(ref) ? s.filter(x => x !== ref) : [...s, ref])
  }

  function toggleAll() {
    setSelected(allSelected ? [] : visibleRefs)
  }

  // Bulk send goes to the borrower with the standard wording, as an SMS through WeUMS —
  // anything else (a guarantor, a different delivery method, a reworded message) is a
  // per-loan decision and belongs in the compose modal.
  function sendSelected() {
    const targets = visible.filter(r => selectedVisible.includes(r.loan.ref))
    if (targets.length === 0) return
    if (!weumsReady) { setGateOpen(true); return }
    targets.forEach(({ loan, next }) => {
      const recipient = buildReminderRecipients(loan)[0]
      const currency = loan.currency || state.currency
      const message = buildSampleReminderMessage('Message', recipient, next, currency, loan)
      dispatch({ type: 'UPDATE_LOAN', loan: appendReminder(loan, buildReminderEntry({ method: 'Message', recipient, message })) })
    })
    showToast(`${targets.length} repayment reminder${targets.length === 1 ? '' : 's'} sent`, 'success')
    setSelected([])
  }

  // The loan overview only renders inside Loan Management, and SET_TAB deliberately clears
  // any open loan — so the module switch has to come first and the loan open second.
  function openLoan(loan) {
    dispatch({ type: 'SET_TAB', tab: 'open-loan' })
    dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan, tab: 'Repayment Reminder' })
  }

  const composeRow = composeRef ? visible.find(r => r.loan.ref === composeRef) || rows.find(r => r.loan.ref === composeRef) : null

  return (
    <>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Reminder</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={AlertTriangle} tone="rose" label="Overdue"
            value={counts.overdue.length}
            sub={counts.overdue.length ? `Oldest ${Math.abs(counts.overdue[0].days)} days past due` : 'Nothing past due'}
          />
          <StatTile
            icon={CalendarClock} tone="amber" label="Due today"
            value={counts.today.length}
            sub={counts.today.length ? 'Collect or remind today' : 'Nothing falls due today'}
          />
          <StatTile
            icon={CalendarDays} tone="brand" label="Next 7 days"
            value={counts.soon.length}
            sub={counts.soon.length ? 'Falling due this week' : 'Clear for the week'}
          />
          <StatTile
            icon={BellOff} tone="slate" label="Never reminded"
            value={counts.never.length}
            sub="Due or overdue, no reminder sent"
          />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={range}
                onChange={e => setRange(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customer, loan or phone…"
                className="h-auto w-full border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Bulk send only appears once something is ticked — it is a second way to do
                what every row already offers, not part of the standing toolbar. */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {selectedVisible.length > 0 && (
                <Button
                  onClick={sendSelected}
                  className="h-auto flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-xs font-bold rounded-lg shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to {selectedVisible.length} borrower{selectedVisible.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-24rem)]">
            <Table className="w-full">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto w-10 px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={visible.length === 0}
                      aria-label="Select all"
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                    />
                  </TableHead>
                  <Th>Customer</Th>
                  <Th>Loan</Th>
                  <Th>Due Date</Th>
                  <Th right>Amount Due</Th>
                  <Th>Status</Th>
                  <Th>Last Reminder</Th>
                  <Th right>Action</Th>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 dark:divide-slate-700">
                {visible.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={8} className="px-4 py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                      {rows.length === 0
                        ? 'No disbursed loan has an outstanding installment.'
                        : 'No repayment falls in this range.'}
                    </TableCell>
                  </TableRow>
                ) : visible.map(row => {
                  const { loan, next, days, urgency, last } = row
                  const currency = loan.currency || state.currency
                  return (
                    <TableRow key={loan.ref} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5">
                      <TableCell className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(loan.ref)}
                          onChange={() => toggleRow(loan.ref)}
                          aria-label={`Select ${loan.customerName}`}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{loan.customerName}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{loan.customerPhone || '—'}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{loan.ref}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{loan.product}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{next.dueDate}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">Installment #{next.num}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                        {formatVal(next.totalDue, currency, 1)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border whitespace-nowrap ${URGENCY_STYLE[urgency]}`}>
                          {dueLabel(days)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {last ? (
                          <>
                            <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{last.timestamp}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">via {last.method} · {last.role}</p>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            onClick={() => weumsReady ? setComposeRef(loan.ref) : setGateOpen(true)}
                            title="Send reminder"
                            className="h-auto flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <Bell className="w-3 h-3" /> Remind
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openLoan(loan)}
                            title="Open the loan"
                            className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {composeRow && <ComposeModal row={composeRow} onClose={() => setComposeRef(null)} />}
      {gateOpen && <WeumsGateModal onClose={() => setGateOpen(false)} onGoToIntegrations={goToWeumsSetup} />}
    </>
  )
}
