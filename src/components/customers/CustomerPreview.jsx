import { useEffect, useState } from 'react'
import { X, Pencil, User } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import StatusBadge from '../shared/StatusBadge'
import PersonInfoGrid from '../shared/PersonInfoGrid'
import IdentityDocumentsTable, { hasUploadedDocs } from '../shared/IdentityDocumentsTable'
import { formatAddress } from '../../utils/format'
import { IDENTITY_DOC_TYPES } from '../../data/constants'
import { getCustomerStatus } from '../../utils/customerStatus'

export default function CustomerPreview() {
  const { state, dispatch } = useApp()
  const [lightbox, setLightbox] = useState(null)

  // Capture-phase + stopPropagation so Escape closes only the lightbox, not the whole preview
  // (or the wizard behind it) — see the identical pattern in TypedDocumentUpload.jsx.
  useEffect(() => {
    if (!lightbox) return
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setLightbox(null)
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [lightbox])

  const customer = state.previewCustomerCode
    ? state.customers.find(c => c.code === state.previewCustomerCode)
    : null

  if (!customer) return null

  const currentAddrStr = typeof customer.currentAddress === 'object'
    ? formatAddress(customer.currentAddress)
    : customer.currentAddress

  const permanentAddrStr = typeof customer.permanentAddress === 'object'
    ? formatAddress(customer.permanentAddress)
    : customer.permanentAddress

  const docTypes = (customer.maritalStatus === 'Married'
    ? [...IDENTITY_DOC_TYPES.slice(0, -1), 'Marriage Certificate', IDENTITY_DOC_TYPES[IDENTITY_DOC_TYPES.length - 1]]
    : IDENTITY_DOC_TYPES
  ).filter(t => t !== 'Other')

  // Nothing uploaded, nothing to show — the header's Edit button is still the way in to add
  // the first document.
  const showDocuments = hasUploadedDocs(customer.documents)

  function handleViewDoc(doc, isImage) {
    if (isImage && doc.dataUrl) {
      setLightbox(doc)
    } else if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:0"></iframe>`)
    }
  }

  function openEdit() {
    dispatch({ type: 'CLOSE_CUSTOMER_PREVIEW' })
    dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: customer.code })
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-4 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{customer.enName}</h2>
              <StatusBadge status={getCustomerStatus(customer, state.loanApplications)} size="xs" />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">{customer.code}</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Customer Code</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={() => dispatch({ type: 'CLOSE_CUSTOMER_PREVIEW' })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Disbursement Account Number</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{customer.accountNumber || 'N/A'}</span>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <PersonInfoGrid
              personal={{ khName: customer.khName, enName: customer.enName, dob: customer.dob, gender: customer.gender, maritalStatus: customer.maritalStatus }}
              contact={{ phone: customer.phone, email: customer.email, currentAddress: currentAddrStr, permanentAddress: permanentAddrStr }}
              identification={{ idNo: customer.idNo, idType: customer.idType }}
              showIdType={false}
            />
          </div>

          {showDocuments && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 gap-2">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Identity Documents</span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Documents used to verify the customer's identity.</p>
                </div>
                <button
                  onClick={openEdit}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  Add Document
                </button>
              </div>
              <IdentityDocumentsTable docTypes={docTypes} documents={customer.documents} onView={handleViewDoc} />
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Image Lightbox */}
    {lightbox && (
      <div
        className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
        onClick={() => setLightbox(null)}
      >
        <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-white truncate">{lightbox.name}</p>
              {lightbox.docType && <p className="text-xs text-white/60">{lightbox.docType}</p>}
            </div>
            <button
              onClick={() => setLightbox(null)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightbox.dataUrl}
            alt={lightbox.name}
            className="w-full max-h-[80vh] object-contain rounded-xl"
          />
        </div>
      </div>
    )}
    </>
  )
}
