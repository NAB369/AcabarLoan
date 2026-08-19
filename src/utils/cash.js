// Physical cash held in the branch: which accounts are tills, what has moved through one,
// and how a count of the drawer compares with what the books say is in it.
//
// The movements are derived rather than stored in one place on purpose. A repayment writes
// its own cash line (state.cashSheet, each carrying the repayment it came from), but cash
// also arrives and leaves through transfers between drawers, cash-funded expenses and income
// booked straight to a till — all of which already move the account's GL balance. Reading
// them back off the registers that hold them is what keeps the sheet and the ledger from
// ever disagreeing.

const round2 = n => Math.round((n || 0) * 100) / 100

export const CASH_GL_CODES = new Set(['1010', '1011'])

// A branch running more than one till files each cashier under the currency's cash account,
// so a child of 1010/1011 is a cash float in its own right — it holds notes someone counts.
export function isCashGlAccount(account) {
  if (!account) return false
  if (CASH_GL_CODES.has(account.code) || CASH_GL_CODES.has(account.parentCode)) return true
  return /cash on hand/i.test(account.name || '')
}

export function cashGlAccounts(chartOfAccounts) {
  return (chartOfAccounts || [])
    .filter(isCashGlAccount)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
}

// Every movement through one till, oldest first, each row carrying the balance it left
// behind. Repayment *income* rows are skipped deliberately: they name the same till the
// repayment's own cash line already reports, and counting both would double the cash in.
//
// The running balance is walked forward from whatever the drawer must have opened at for
// these movements to land on the balance the chart of accounts holds — not from an assumed
// zero, which would have every row reporting a figure the ledger disagrees with.
export function buildCashMovements({ cashSheet, cashTransfers, expenses, incomes, chartOfAccounts }, account) {
  if (!account) return []
  const code = account.code
  const nameOf = c => (chartOfAccounts || []).find(a => a.code === c)?.name || c || '—'
  const rows = [
    ...(cashSheet || []).filter(l => l.cashAccountCode === code).map(l => ({
      key: l.id, date: l.date, ref: l.id,
      source: l.source, repaymentId: l.repaymentId || '',
      reference: l.reference || '', customerName: l.customerName || '',
      description: l.memo || '',
      cashIn: l.direction === 'IN' ? l.amount : 0,
      cashOut: l.direction === 'OUT' ? l.amount : 0,
    })),
    ...(cashTransfers || []).filter(t => t.fromCode === code || t.toCode === code).map(t => {
      const isOut = t.fromCode === code
      // A transfer states its amount in the source account's currency; the other side
      // receives the converted figure, which is what actually reaches this drawer.
      const credited = t.creditedAmount ?? round2((t.amount || 0) * (Number(t.exchangeRate) > 0 ? Number(t.exchangeRate) : 1))
      return {
        key: `ct-${t.ref}`, date: t.date, ref: t.ref,
        source: 'Cash Transfer', repaymentId: '',
        reference: isOut ? `To ${nameOf(t.toCode)}` : `From ${nameOf(t.fromCode)}`,
        customerName: '', description: t.description || '',
        cashIn: isOut ? 0 : credited,
        cashOut: isOut ? (t.amount || 0) : 0,
      }
    }),
    ...(expenses || []).filter(e => e.status === 'Approved' && e.account === code).map(e => ({
      key: `exp-${e.code}`, date: e.date, ref: e.code,
      source: e.category || 'Expense', repaymentId: '',
      reference: '', customerName: e.customerName || '', description: e.description || '',
      cashIn: 0, cashOut: e.amount || 0,
    })),
    ...(incomes || []).filter(i => i.account === code && !i.repaymentId).map(i => ({
      key: `inc-${i.code}-${i.date}`, date: i.date, ref: i.code,
      source: i.category || 'Income', repaymentId: '',
      reference: '', customerName: i.customerName || '', description: i.description || '',
      cashIn: i.amount || 0, cashOut: 0,
    })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const net = rows.reduce((s, r) => s + r.cashIn - r.cashOut, 0)
  let running = round2((account.balance || 0) - net)
  return rows.map(r => {
    running = round2(running + r.cashIn - r.cashOut)
    return { ...r, balance: running }
  })
}

// Whether a count agrees with the books. A drawer is only "short" or "over" by real money —
// half a cent either way is float drift in the balance it is being compared against.
export function cashCountStatus(physical, systemBalance) {
  const difference = round2(physical - systemBalance)
  if (Math.abs(difference) <= 0.005) return { status: 'MATCHED', difference: 0 }
  return { status: difference < 0 ? 'SHORT' : 'OVER', difference }
}
