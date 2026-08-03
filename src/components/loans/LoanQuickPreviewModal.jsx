import { useState, useRef } from 'react'
import { X, Bell, Calendar, DollarSign, Phone, Printer, Download } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { buildReminderRecipients, buildSampleReminderMessage, daysUntilDue as daysUntilDueISO, weumsSignedIn } from '../../utils/reminders'
import { formatVal, formatAddress } from '../../utils/format'
import { downloadSheetPdf } from '../../utils/exportPdf'
import { companyLogoSrc } from '../../utils/companyLogo'
import { InfoRow, InfoCard } from '../shared/InfoCard'
import WeumsGateModal from '../shared/WeumsGateModal'
import RepaymentTracking from './RepaymentTracking'

function formatDMY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function ScheduleField({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold text-slate-700 dark:text-slate-200 w-44 flex-shrink-0">{label}</span>
      <span className="text-slate-600 dark:text-slate-300">{value || '—'}</span>
    </div>
  )
}

function RepaymentScheduleContent({ loan }) {
  const { state } = useApp()
  const currency = loan.currency || state.currency
  const schedule = loan.schedule || []
  const customer = state.customers.find(c => c.code === loan.customerCode)
  const sheetRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      await downloadSheetPdf(sheetRef.current, `Repayment-Schedule-${loan.ref || 'loan'}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading || schedule.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Schedule
        </button>
      </div>

      <div
        ref={sheetRef}
        className="printable-area bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto w-full max-w-[210mm] shadow-sm"
        style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="w-14 h-14 object-contain flex-shrink-0" />
          <div className="flex-1 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{state.companyProfile.nameKh}</p>
            <p className="text-sm font-bold tracking-wide text-slate-700 dark:text-slate-200">{state.companyProfile.name.toUpperCase()}</p>
          </div>
          <div className="w-14 h-14 flex-shrink-0" aria-hidden="true" />
        </div>
        <p className="text-center text-base font-bold text-slate-800 dark:text-slate-100 mt-1 mb-5">តារាងកាលវិភាគសងប្រាក់</p>

        {/* Borrower / loan info */}
        <div className="flex flex-col sm:flex-row gap-x-8 gap-y-1.5 text-xs mb-3">
          <div className="space-y-1.5 flex-1">
            <ScheduleField label="លេខគណនី (AccNo)" value={loan.ref} />
            <ScheduleField label="លេខអតិថិជន (CID)" value={loan.customerCode} />
            <ScheduleField label="ឈ្មោះអតិថិជន (Name)" value={loan.customerKhName || loan.customerName} />
            <ScheduleField label="ភេទ (Sex)" value={loan.customerGender?.toUpperCase()} />
            <ScheduleField label="ទូរស័ព្ទ (Tel)" value={loan.customerPhone} />
            <ScheduleField label="គោលបំណងកម្ចី (Purpose)" value={loan.reasonCredit} />
          </div>
          <div className="space-y-1.5 flex-1">
            <ScheduleField label="ទំហំកម្ចី (Amount)" value={`${currency} ${(loan.amount || 0).toFixed(2)}`} />
            <ScheduleField label="ថ្ងៃបើកប្រាក់ (Disb Date)" value={formatDMY(loan.disbursementDate)} />
            <ScheduleField label="អត្រា (Rate)" value={`${loan.interestRate}% p.a.`} />
            <ScheduleField label="រយៈពេល (Period)" value={`${loan.installments} ${loan.repaymentType || 'Monthly'}`} />
            <ScheduleField label="ជុំទី (Loan Seq)" value={loan.loanCycle === '1' ? 'New' : `Renewal (Cycle ${loan.loanCycle})`} />
            <ScheduleField label="សេវា (Admin Fee)" value="0.00 % = 0.00" />
            <ScheduleField label="Refinance Fee" value="0.00" />
            <ScheduleField label="ភ្នាក់ងារឥណទាន (CO)" value={loan.creditOfficer} />
          </div>
        </div>
        <div className="text-xs mb-4">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Address </span>
          <span className="text-slate-600 dark:text-slate-300">{formatAddress(customer?.currentAddress) || '—'}</span>
        </div>

        {/* Schedule table */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[11px] border-separate border-spacing-0 border-t border-l border-slate-300 dark:border-slate-600">
          <thead>
            <tr>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">លេខ<br />No</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ថ្ងៃបង់ប្រាក់<br />Repayment Date</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ដើម<br />Principle</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ការប្រាក់<br />Interest</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">សេវាមូល<br />Col Fee</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">សរុប<br />Total</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ដើមនៅសល់<br />Balance</th>
              <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ផាកពិន័យ<br />Penalty Payoff</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, idx) => (
              <tr key={idx}>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-center text-slate-700 dark:text-slate-200">{row.num}</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-center whitespace-nowrap text-slate-700 dark:text-slate-200">
                  {formatDMY(row.dueDateISO)}
                </td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.principal.toFixed(2)}</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.interest.toFixed(2)}</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">0.00</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right font-semibold text-slate-800 dark:text-slate-100">{row.totalDue.toFixed(2)}</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.balance.toFixed(2)}</td>
                <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">0.00</td>
              </tr>
            ))}
            {schedule.length === 0 && (
              <tr>
                <td colSpan={8} className="border-r border-b border-slate-300 dark:border-slate-600 px-3 py-8 text-center text-slate-400 dark:text-slate-500">No repayment schedule available.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Footer */}
        <div className="mt-8 text-xs text-slate-600 dark:text-slate-300">
          <span>កាលបរិច្ឆេទ (Date) {formatDMY(loan.disbursementDate)}</span>
        </div>
        <div className="flex items-center justify-between mt-10 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>រៀបចំដោយ (Prepare by)</span>
          <span>ស្នាមមេដៃអតិថិជន (Customer's thumbprint)</span>
        </div>
      </div>
    </div>
  )
}

function RepaymentReminderContent({ loan }) {
  const { state, dispatch, showToast } = useApp()
  const [reminderRecipientKey, setReminderRecipientKey] = useState('borrower')
  const [reminderMessageOverride, setReminderMessageOverride] = useState(null)
  const [reminderGateOpen, setReminderGateOpen] = useState(false)

  const currency = loan.currency || state.currency
  const schedule = loan.schedule || []
  // `UPDATE_LOAN` does not refresh `activeLoan`, so read the history off the live
  // list entry — otherwise a reminder sent from here never shows up below.
  const liveLoan = state.loanApplications.find(a => a.ref === loan.ref) || loan
  const reminderHistory = liveLoan.reminderHistory || []
  const upcomingInstallments = schedule.filter(r => r.status !== 'Paid')
  const nextPayment = upcomingInstallments[0] || null
  const daysUntilDue = nextPayment ? daysUntilDueISO(nextPayment.dueDateISO) : null

  const reminderRecipients = buildReminderRecipients(loan)
  const selectedRecipient = reminderRecipients.find(r => r.key === reminderRecipientKey) || reminderRecipients[0]
  const sampleReminderMessage = buildSampleReminderMessage('Message', selectedRecipient, nextPayment, currency, loan)
  const reminderMessage = reminderMessageOverride ?? sampleReminderMessage

  function handleReminderRecipientChange(key) {
    setReminderRecipientKey(key)
    setReminderMessageOverride(null)
  }

  function goToWeumsSetup() {
    setReminderGateOpen(false)
    dispatch({ type: 'OPEN_SETTINGS' })
    dispatch({ type: 'SET_SETTINGS_MENU', menu: 'integration' })
  }

  function handleSendReminder() {
    if (!weumsSignedIn(state)) { setReminderGateOpen(true); return }
    const destination = selectedRecipient?.phone
    const updatedLoan = {
      ...liveLoan,
      reminderHistory: [
        ...reminderHistory,
        {
          method: 'Message',
          recipient: selectedRecipient?.name,
          role: selectedRecipient?.role,
          destination: destination || '',
          message: reminderMessage,
          timestamp: new Date().toLocaleString('en-GB'),
        },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    showToast(`Repayment reminder sent to ${selectedRecipient?.name}${destination ? ` (${destination})` : ''}`, 'success')
  }

  if (!nextPayment) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">No upcoming repayments — the schedule is fully paid or not yet generated.</p>
  }

  return (
    <>
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className={`rounded-xl p-3 ${daysUntilDue < 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className={`w-3.5 h-3.5 ${daysUntilDue < 0 ? 'text-rose-500' : 'text-slate-400'}`} />
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Next Due Date</p>
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{nextPayment.dueDate}</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Amount Due</p>
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatVal(nextPayment.totalDue, currency, 1)}</p>
        </div>
        <div className={`rounded-xl p-3 ${daysUntilDue < 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Bell className={`w-3.5 h-3.5 ${daysUntilDue < 0 ? 'text-rose-500' : 'text-slate-400'}`} />
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Status</p>
          </div>
          <p className={`text-sm font-semibold ${daysUntilDue < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
            {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue` : daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard icon={Phone} title="Send Reminder To">
          <div className="pb-2">
            <label className="block text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">Recipient</label>
            <select
              value={reminderRecipientKey}
              onChange={e => handleReminderRecipientChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition"
            >
              {reminderRecipients.map(r => (
                <option key={r.key} value={r.key}>{r.name} ({r.role})</option>
              ))}
            </select>
          </div>
          <InfoRow label="Phone" value={selectedRecipient?.phone} />
          <InfoRow label="Email" value={selectedRecipient?.email} />
        </InfoCard>

        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={handleSendReminder}
              className="flex items-center gap-2 px-4 py-2 bg-[#0047ab] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0"
            >
              <Bell className="w-4 h-4" />
              Send Reminder
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Message to Send</label>
            <textarea
              value={reminderMessage}
              onChange={e => setReminderMessageOverride(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition resize-y"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Sent Reminder History</span>
        </div>
        <div className="p-4 space-y-1.5 max-h-64 overflow-y-auto">
          {reminderHistory.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No reminders have been sent for this loan yet.</p>
          ) : (
            [...reminderHistory].reverse().map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{r.recipient}{r.role ? ` (${r.role})` : ''}</span>
                  <span className="text-slate-400 dark:text-slate-500"> · {r.timestamp}</span>
                </div>
                <span className="font-semibold text-slate-700 dark:text-slate-200">via {r.method}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    {reminderGateOpen && <WeumsGateModal onClose={() => setReminderGateOpen(false)} onGoToIntegrations={goToWeumsSetup} />}
    </>
  )
}

export default function LoanQuickPreviewModal() {
  const { state, dispatch } = useApp()
  const loan = state.activeLoan

  if (!state.loanQuickPreviewOpen || !loan) return null

  const tab = state.loanQuickPreviewTab

  function handleClose() {
    dispatch({ type: 'CLOSE_LOAN_QUICK_PREVIEW' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{tab}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{loan.ref} · {loan.product} · {loan.customerName}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === 'Repayment Tracking' ? (
            <RepaymentTracking />
          ) : tab === 'Repayment Schedule' ? (
            <RepaymentScheduleContent loan={loan} />
          ) : (
            <RepaymentReminderContent loan={loan} />
          )}
        </div>
      </div>
    </div>
  )
}
