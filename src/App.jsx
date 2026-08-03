import { useEffect } from 'react'
import { useApp } from './context/AppContext'
import Layout from './components/layout/Layout'
import Dashboard from './components/dashboard/Dashboard'
import CustomersPage from './components/customers/CustomersPage'
import LoanPage from './components/loans/LoanPage'
import ReminderPage from './components/reminders/ReminderPage'
import AccountingPage from './components/accounting/AccountingPage'
import ReportsPage from './components/reports/ReportsPage'
import SettingsModal from './components/settings/SettingsModal'
import Toast from './components/shared/Toast'

export default function App() {
  const { state, dispatch } = useApp()

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      if (state.settingsOpen) dispatch({ type: 'CLOSE_SETTINGS' })
      if (state.customerWizardOpen) dispatch({ type: 'CLOSE_CUSTOMER_WIZARD' })
      if (state.loanWizardOpen) dispatch({ type: 'CLOSE_LOAN_WIZARD' })
      if (state.previewCustomerCode) dispatch({ type: 'CLOSE_CUSTOMER_PREVIEW' })
      if (state.deletePendingCode) dispatch({ type: 'CANCEL_DELETE_CUSTOMER' })
      if (state.loanDetailIdx !== null) dispatch({ type: 'CLOSE_LOAN_DETAIL' })
      if (state.loanPreviewOpen) dispatch({ type: 'CLOSE_LOAN_PREVIEW' })
      if (state.loanOverviewOpen) dispatch({ type: 'CLOSE_LOAN_OVERVIEW' })
      if (state.loanQuickPreviewOpen) dispatch({ type: 'CLOSE_LOAN_QUICK_PREVIEW' })
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [state, dispatch])

  return (
    <>
      <Layout>
        {state.activeTab === 'dashboard'   && <Dashboard />}
        {state.activeTab === 'customers'   && <CustomersPage />}
        {state.activeTab === 'open-loan'   && <LoanPage />}
        {state.activeTab === 'reminders'   && <ReminderPage />}
        {state.activeTab === 'accounting'  && <AccountingPage />}
        {state.activeTab === 'reports'     && <ReportsPage />}
      </Layout>

      <SettingsModal />
      <Toast />
    </>
  )
}
