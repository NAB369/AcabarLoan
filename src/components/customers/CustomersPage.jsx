import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import CustomerTable, { CUSTOMER_COLUMNS } from './CustomerTable'
import CustomerWizard from './CustomerWizard'
import CustomerPreview from './CustomerPreview'
import { useTableColumns, ColumnPicker } from '../shared/DataTableTools'
import { FilterMenu } from '../shared/FilterTools'
import { isRangeActive, rangeLabel } from '../../utils/dateRange'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// Which register a saved filter belongs to. A plain string rather than the component name so
// a set survives the component being renamed or moved.
const SAVED_FILTER_TABLE = 'customers'

export default function CustomersPage() {
  const { state, dispatch, showToast, can } = useApp()
  const { visible, visibleIds, toggle } = useTableColumns(CUSTOMER_COLUMNS, {
    value: state.customerVisibleColumns,
    onChange: ids => dispatch({ type: 'SET_CUSTOMER_COLUMNS', ids }),
  })

  // How many filters are narrowing the register right now. Drives whether Reset is on screen
  // and whether there is anything worth saving — both answer the same question.
  const savedFilters = state.savedFilters?.[SAVED_FILTER_TABLE] || []
  const filterCount = [
    !!state.customerSearch.trim(),
    isRangeActive(state.customerDateRange),
  ].filter(Boolean).length
  const filterSummary = [
    state.customerSearch.trim() && `Search “${state.customerSearch.trim()}”`,
    isRangeActive(state.customerDateRange) && `Registered: ${rangeLabel(state.customerDateRange)}`,
  ].filter(Boolean).join(' · ')

  const pendingCustomer = state.deletePendingCode
    ? state.customers.find(c => c.code === state.deletePendingCode)
    : null

  function handleConfirmDelete() {
    dispatch({ type: 'DELETE_CUSTOMER', code: state.deletePendingCode })
    showToast('Customer deleted successfully.', 'success')
  }

  function handleOpenCustomerWizard() {
    if (!can('add_customer')) {
      showToast(`${state.currentRole} does not have permission to create customers.`, 'error')
      return
    }
    dispatch({ type: 'OPEN_CUSTOMER_WIZARD' })
  }

  return (
    <>
    <div className="p-4 sm:p-6 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Management</h1>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <Input
            type="text"
            placeholder="Search by name, code, phone or ID…"
            value={state.customerSearch}
            onChange={e => dispatch({ type: 'SET_CUSTOMER_SEARCH', q: e.target.value })}
            className="h-auto shadow-none md:text-xs w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition"
          />
        </div>
        <FilterMenu
          dateLabel="Registered"
          dateRange={state.customerDateRange}
          onDateRangeChange={range => dispatch({ type: 'SET_CUSTOMER_DATE_RANGE', range })}
          saved={savedFilters}
          activeCount={filterCount}
          summary={filterSummary}
          onReset={() => dispatch({ type: 'RESET_CUSTOMER_FILTERS' })}
          onApply={entry => {
            dispatch({ type: 'SET_CUSTOMER_SEARCH', q: entry.filter.search || '' })
            dispatch({ type: 'SET_CUSTOMER_DATE_RANGE', range: entry.filter.dateRange })
            showToast(`Filter “${entry.name}” applied`, 'info')
          }}
          onSave={name => {
            dispatch({
              type: 'SAVE_TABLE_FILTER',
              tableId: SAVED_FILTER_TABLE,
              name,
              filter: { search: state.customerSearch, dateRange: state.customerDateRange },
            })
            showToast(`Filter “${name}” saved`, 'success')
          }}
          onDelete={id => {
            dispatch({ type: 'DELETE_TABLE_FILTER', tableId: SAVED_FILTER_TABLE, id })
            showToast('Saved filter deleted', 'info')
          }}
        />
        {/* The column picker rides with the primary action at the far end of the row rather
            than sitting above the table, so every control on this bar is in one place. */}
        <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
          {/* Desktop only — the mobile view is a card list with no columns to hide. */}
          <div className="hidden md:block">
            <ColumnPicker columns={CUSTOMER_COLUMNS} visibleIds={visibleIds} onToggle={toggle} iconOnly />
          </div>
          {/* The page's one primary action, so it sits on this row with the filters but keeps
              the solid fill that sets it apart. */}
          <Button
            onClick={handleOpenCustomerWizard}
            title={can('add_customer') ? undefined : `${state.currentRole} cannot create customers`}
            className={`h-auto flex items-center justify-center gap-1.5 px-3 py-2 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0 ${
              can('add_customer') ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Open New Customer
          </Button>
        </div>
      </div>

      {/* Table */}
      <CustomerTable visible={visible} />
    </div>

      {/* Wizard Modal */}
      {state.customerWizardOpen && <CustomerWizard />}

      {/* Preview Modal */}
      {state.previewCustomerCode && <CustomerPreview />}

      {/* Confirm Delete Modal */}
      <AlertDialog
        open={!!state.deletePendingCode}
        onOpenChange={(open) => { if (!open) dispatch({ type: 'CANCEL_DELETE_CUSTOMER' }) }}
      >
        <AlertDialogContent className="max-w-md rounded-2xl sm:rounded-2xl border-0 bg-white dark:bg-slate-800 shadow-xl p-6">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <AlertDialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100">Delete Customer</AlertDialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 text-left">
              Are you sure you want to delete{' '}
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {pendingCustomer ? pendingCustomer.enName : state.deletePendingCode}
              </span>
              {pendingCustomer && (
                <span className="text-slate-400 dark:text-slate-500"> ({pendingCustomer.code})</span>
              )}
              ? All associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:space-x-0">
            <AlertDialogCancel
              onClick={() => dispatch({ type: 'CANCEL_DELETE_CUSTOMER' })}
              className="mt-0 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors"
            >
              Delete Customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
