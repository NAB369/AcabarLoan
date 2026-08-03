import { useState } from 'react'
import { X, CheckCircle, User, FileText, Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { EMPTY_ADDRESS, IDENTITY_DOC_TYPES } from '../../data/constants'
import AddressFields from '../shared/AddressFields'
import TypedDocumentUpload from '../shared/TypedDocumentUpload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <Info className="w-3 h-3 text-slate-400 dark:text-slate-500 cursor-help" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 whitespace-normal rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block dark:bg-slate-700">
              {hint}
            </span>
          </span>
        )}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
  )
}

export default function CustomerWizard() {
  const { state, dispatch, showToast } = useApp()
  const { editingCustomerCode, customers } = state

  const editingCustomer = editingCustomerCode
    ? customers.find(c => c.code === editingCustomerCode)
    : null

  const nextCode = editingCustomerCode
    ? editingCustomerCode
    : String(customers.length + 1).padStart(6, '0')

  // Step 1 - Personal
  const [code] = useState(nextCode)
  const displayCode = `CID-${code}`
  const [khName, setKhName] = useState(editingCustomer?.khName || '')
  const [enName, setEnName] = useState(editingCustomer?.enName || '')
  const [gender, setGender] = useState(editingCustomer?.gender || 'Male')
  const [maritalStatus, setMaritalStatus] = useState(editingCustomer?.maritalStatus || 'Single')
  const [dob, setDob] = useState(editingCustomer?.dob || '')
  const [idNo, setIdNo] = useState(editingCustomer?.idNo || '')
  const [phone, setPhone] = useState(editingCustomer?.phone || '')
  const [email, setEmail] = useState(editingCustomer?.email || '')
  const [accountNumber, setAccountNumber] = useState(editingCustomer?.accountNumber || '')
  const [currentAddress, setCurrentAddress] = useState(
    editingCustomer?.currentAddress && typeof editingCustomer.currentAddress === 'object'
      ? editingCustomer.currentAddress
      : { ...EMPTY_ADDRESS }
  )
  const [permanentAddress, setPermanentAddress] = useState(
    editingCustomer?.permanentAddress && typeof editingCustomer.permanentAddress === 'object'
      ? editingCustomer.permanentAddress
      : { ...EMPTY_ADDRESS }
  )

  const [fieldErrors, setFieldErrors] = useState({})

  // Step 2 - Financial
  const [occupation, setOccupation] = useState(editingCustomer?.occupation || '')
  const [employmentStatus, setEmploymentStatus] = useState(editingCustomer?.employmentStatus || 'Employed')
  const [monthlyIncome, setMonthlyIncome] = useState(editingCustomer?.monthlyIncome || '')

  // Step 2 - Documents
  const [documents, setDocuments] = useState(
    (editingCustomer?.documents || []).map(d => typeof d === 'string' ? { name: d, type: 'Other', size: '' } : d)
  )

  const docTypes = (maritalStatus === 'Married'
    ? [...IDENTITY_DOC_TYPES.slice(0, -1), 'Marriage Certificate', IDENTITY_DOC_TYPES[IDENTITY_DOC_TYPES.length - 1]]
    : IDENTITY_DOC_TYPES
  ).filter(t => t !== 'Other')

  const inputCls = 'h-auto shadow-none md:text-xs w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
  const selectCls = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
  // Same field, red ring — swapped in once validateForm has flagged it, so the officer sees
  // exactly which control needs fixing rather than re-reading the whole form after a toast.
  function inputClsFor(key) {
    return fieldErrors[key]
      ? inputCls.replace('border-slate-200 dark:border-slate-600', 'border-rose-400 dark:border-rose-500').replace('focus:ring-brand-500/40 focus:border-brand-400', 'focus:ring-rose-400/40 focus:border-rose-400')
      : inputCls
  }

  function getAge(dobStr) {
    const birth = new Date(dobStr)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
    return age
  }

  function validateForm() {
    const errors = {}
    if (!khName.trim()) errors.khName = 'Required'
    if (!enName.trim()) errors.enName = 'Required'
    if (!dob) errors.dob = 'Required'
    else if (getAge(dob) < 18) errors.dob = 'Borrower must be at least 18 years old'
    if (!idNo.trim()) errors.idNo = 'Required'
    else {
      // Same borrower registered twice under two CIDs would confuse loan history and
      // repayment tracking — catch it before it can happen, not after.
      const dupe = customers.find(c => c.idNo?.trim() === idNo.trim() && c.code !== code)
      if (dupe) errors.idNo = `Already registered to ${dupe.enName} (CID-${dupe.code})`
    }
    if (!phone.trim()) errors.phone = 'Required'

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      showToast('Please fix the highlighted fields', 'error')
      return false
    }
    return true
  }

  const maxDob = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().slice(0, 10)
  })()

  function handleSubmit() {
    if (!validateForm()) return

    const customerObj = {
      code,
      khName: khName.trim(),
      enName: enName.trim().toUpperCase(),
      gender,
      maritalStatus,
      dob,
      idType: 'National ID',
      idNo,
      phone,
      email,
      currentAddress,
      permanentAddress,
      occupation,
      employmentStatus,
      monthlyIncome,
      documents,
      accountNumber,
      createdAt: editingCustomer?.createdAt || new Date().toISOString(),
    }

    if (editingCustomerCode) {
      dispatch({ type: 'UPDATE_CUSTOMER', customer: customerObj })
      showToast('Customer updated successfully.', 'success')
    } else {
      dispatch({ type: 'ADD_CUSTOMER', customer: customerObj })
      showToast('New customer registered successfully.', 'success')
    }
    dispatch({ type: 'CLOSE_CUSTOMER_WIZARD' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {editingCustomerCode ? 'Edit Customer' : 'Register New Customer'}
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{displayCode}</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => dispatch({ type: 'CLOSE_CUSTOMER_WIZARD' })}
            className="h-auto w-auto p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

          <div className="space-y-5">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-700">
              <User className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Personal Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="CID">
                <Input type="text" value={displayCode} readOnly className={`${inputCls} bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 cursor-not-allowed`} />
              </Field>
              <Field label="Disbursement Account Number" hint="Required before any loan for this customer can be disbursed.">
                <Input type="text" placeholder="e.g. ACB-0011002233" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name (Khmer) *" error={fieldErrors.khName}>
                <Input
                  type="text"
                  placeholder="នាមត្រកូល នាមខ្លួន"
                  value={khName}
                  onChange={e => setKhName(e.target.value)}
                  className={inputClsFor('khName')}
                />
              </Field>
              <Field label="Full Name (English) *" error={fieldErrors.enName}>
                <Input
                  type="text"
                  placeholder="FULL NAME"
                  value={enName}
                  onChange={e => setEnName(e.target.value.toUpperCase())}
                  className={inputClsFor('enName')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Gender *">
                <select value={gender} onChange={e => setGender(e.target.value)} className={selectCls}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Marital Status">
                <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className={selectCls}>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </Field>
              <Field label="Date of Birth *" hint="Borrower must be at least 18 years old." error={fieldErrors.dob}>
                <Input type="date" value={dob} max={maxDob} onChange={e => setDob(e.target.value)} className={inputClsFor('dob')} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="National ID *" error={fieldErrors.idNo}>
                <Input type="text" placeholder="National ID" value={idNo} onChange={e => setIdNo(e.target.value)} className={inputClsFor('idNo')} />
              </Field>
              <Field label="Phone Number *" error={fieldErrors.phone}>
                <Input type="text" placeholder="010517325" value={phone} onChange={e => setPhone(e.target.value)} className={inputClsFor('phone')} />
              </Field>
              <Field label="Email Address">
                <Input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <Separator className="bg-slate-200 dark:bg-slate-700" />

            <AddressFields
              label="Current Address"
              values={currentAddress}
              onChange={setCurrentAddress}
            />

            <Separator className="bg-slate-200 dark:bg-slate-700" />

            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPermanentAddress({ ...currentAddress })}
                className="h-auto w-auto p-0 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline hover:bg-transparent"
              >
                Same as Current Address
              </Button>
            </div>

            <AddressFields
              label="Permanent Address"
              values={permanentAddress}
              onChange={setPermanentAddress}
            />

            <Separator className="bg-slate-200 dark:bg-slate-700" />

            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-700">
              <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Identity Documents</span>
            </div>

            <TypedDocumentUpload
              docTypes={docTypes}
              documents={documents}
              setDocuments={setDocuments}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: 'CLOSE_CUSTOMER_WIZARD' })}
            className="h-auto px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="h-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            {editingCustomerCode ? 'Update Customer' : 'Register Customer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
