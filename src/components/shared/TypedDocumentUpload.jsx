import { useEffect, useRef, useState } from 'react'
import { Upload, FileText, Trash2, Check, Eye, ExternalLink, Download, Plus, X } from 'lucide-react'
import { formatFileSize } from '../../utils/format'

function isImageDoc(doc) {
  return doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.name)
}

// Browsers refuse to navigate a top-level tab to a data: URL, so the stored data URL is
// turned into a blob URL first. The blob is revoked on a delay — revoking straight away
// leaves the new tab blank because it hasn't finished loading yet.
function openDocInNewTab(doc) {
  if (!doc.dataUrl) return
  try {
    const [meta, b64] = doc.dataUrl.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] || doc.mimeType || 'application/octet-stream'
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const win = window.open(url, '_blank', 'noopener')
    if (!win) URL.revokeObjectURL(url)
    else setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    const win = window.open()
    if (win) win.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:0"></iframe>`)
  }
}

function DocCard({ doc, docType, onView, onDownload, onRemove, onFamilyCountChange }) {
  const isImage = isImageDoc(doc)

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      {isImage && doc.dataUrl ? (
        <img src={doc.dataUrl} alt={doc.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-red-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{doc.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{doc.size}</p>
      </div>
      {docType === 'Family Book' && (
        <label className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">Members</span>
          <input
            type="number"
            min="1"
            value={doc.familyMemberCount ?? ''}
            onChange={e => {
              const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1)
              onFamilyCountChange(val)
            }}
            placeholder="#"
            className="w-12 text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none"
          />
        </label>
      )}
      <span title="Uploaded" className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium whitespace-nowrap flex-shrink-0">
        <Check className="w-3 h-3" />
      </span>
      <button
        type="button"
        onClick={() => onView(doc)}
        title={isImage ? 'View' : 'Open in new tab'}
        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors flex-shrink-0"
      >
        {isImage ? <Eye className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => onDownload(doc)}
        title="Download"
        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors flex-shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// A single "pick the document type, then upload" control followed by the list of files
// already uploaded — instead of one dropzone per type, which got very tall once a section
// had five or more types.
//
// `multiple` controls whether a type accepts several files (e.g. multiple Bank Statements,
// multiple Property Photos) or just one (identity-document sets, where a type is replaced
// by re-uploading).
//
// `onFilesAdded(docType, files)` fires with the raw File objects as soon as a file is
// picked, before they're read — lets a caller run extra processing (e.g. parsing a PDF)
// without the shared component needing to know about it.
export default function TypedDocumentUpload({ docTypes, documents, setDocuments, multiple = false, hideTypeLabels = false, onFilesAdded }) {
  const [previewDoc, setPreviewDoc] = useState(null)
  const [selectedType, setSelectedType] = useState('')
  const [customTypes, setCustomTypes] = useState([])
  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Capture-phase + stopPropagation so Escape closes only this preview, not the wizard/modal
  // underneath — a bubble-phase handler here wouldn't reach the App.jsx listener in time if
  // nothing inside the preview has focus (its keydown target would be document.body, which
  // never bubbles through this nested div).
  useEffect(() => {
    if (!previewDoc) return
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPreviewDoc(null)
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [previewDoc])

  // "Other" is both a usable type and the way out when the needed type isn't listed:
  // picking it offers Add New Document Type, which names the type and adds it to the
  // dropdown for the rest of the session so several files can use it.
  const optionTypes = [...docTypes.filter(t => t !== 'Other'), ...customTypes, 'Other']
  const isOther = selectedType === 'Other'
  const canUpload = !!selectedType

  function confirmNewType() {
    const name = newTypeName.trim()
    if (!name) return
    if (!optionTypes.includes(name)) setCustomTypes(prev => [...prev, name])
    setSelectedType(name)
    setNewTypeName('')
    setAddingType(false)
  }

  function cancelNewType() {
    setNewTypeName('')
    setAddingType(false)
  }

  function addFiles(docType, files) {
    const fileList = multiple ? Array.from(files) : Array.from(files).slice(0, 1)
    onFilesAdded && onFilesAdded(docType, fileList)
    fileList.forEach(file => {
      const reader = new FileReader()
      reader.onload = e => {
        const newDoc = { name: file.name, size: formatFileSize(file.size), mimeType: file.type, dataUrl: e.target.result, docType }
        setDocuments(prev => {
          if (!multiple) {
            const idx = prev.findIndex(d => d.docType === docType)
            if (idx === -1) return [...prev, newDoc]
            const copy = [...prev]
            copy[idx] = { ...newDoc, familyMemberCount: prev[idx].familyMemberCount }
            return copy
          }
          return [...prev, newDoc]
        })
      }
      reader.readAsDataURL(file)
    })
  }

  function handleFiles(files) {
    if (!canUpload) return
    addFiles(selectedType, files)
    setSelectedType('')
    cancelNewType()
  }

  function removeAt(idx) {
    setDocuments(prev => prev.filter((_, i) => i !== idx))
  }

  function setFamilyCountAt(idx, val) {
    setDocuments(prev => prev.map((d, i) => i === idx ? { ...d, familyMemberCount: val } : d))
  }

  // Images stay in the in-app lightbox; anything else (PDFs) opens in its own browser tab
  // so the native viewer handles paging, zoom and printing — same rule as the read-only
  // document tables elsewhere in the app.
  function viewDoc(doc) {
    if (!doc.dataUrl) return
    if (isImageDoc(doc)) setPreviewDoc(doc)
    else openDocInNewTab(doc)
  }

  function downloadDoc(doc) {
    if (!doc.dataUrl) return
    const link = document.createElement('a')
    link.href = doc.dataUrl
    link.download = doc.name
    link.click()
  }

  // Grouped under a title per document type, in docTypes order, so the section still reads
  // like the checklist it replaces. Anything of an unlisted type (e.g. a type removed from a
  // config) keeps its own group at the end rather than disappearing.
  const indexed = documents.map((d, i) => ({ d, i }))
  const extraTypes = [...new Set(indexed.filter(x => !docTypes.includes(x.d.docType)).map(x => x.d.docType || 'Document'))]
  const groups = [...docTypes, ...extraTypes]
    .map(type => ({
      type,
      items: indexed.filter(x => (docTypes.includes(x.d.docType) ? x.d.docType : x.d.docType || 'Document') === type),
    }))
    .filter(g => g.items.length)

  const selectCls = 'text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-brand-400'

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); if (canUpload) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
        }}
        className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl transition-colors ${
          dragOver ? 'bg-brand-50 dark:bg-brand-900/20' : ''
        }`}
      >
        <select
          value={selectedType}
          onChange={e => { setSelectedType(e.target.value); cancelNewType() }}
          className={`${selectCls} w-full sm:w-56 min-w-0`}
        >
          <option value="">Select document type</option>
          {optionTypes.map(t => {
            const uploaded = documents.some(d => d.docType === t)
            return (
              // Native <option> can't hold an icon element, so the uploaded state is a green
              // tick character — colour is applied too, which most desktop browsers honour.
              <option key={t} value={t} style={uploaded ? { color: '#059669' } : undefined}>
                {uploaded ? `✓ ${t}` : t}
              </option>
            )
          })}
        </select>

        {addingType && (
          <input
            type="text"
            autoFocus
            value={newTypeName}
            onChange={e => setNewTypeName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirmNewType() }
              if (e.key === 'Escape') cancelNewType()
            }}
            placeholder="New document type name"
            className={`${selectCls} w-full sm:w-56 min-w-0 placeholder:text-slate-400`}
          />
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canUpload}
          title={!selectedType ? 'Select a document type first' : undefined}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors flex-shrink-0 ${
            canUpload
              ? 'bg-[#0047ab] hover:bg-blue-700 text-white cursor-pointer'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Document
        </button>

        {isOther && !addingType && (
          <button
            type="button"
            onClick={() => setAddingType(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Document Type
          </button>
        )}

        {addingType && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={confirmNewType}
              disabled={!newTypeName.trim()}
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors ${
                newTypeName.trim()
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={cancelNewType}
              title="Cancel"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ type, items }) => (
            <div key={type} className="space-y-1.5">
              {!hideTypeLabels && (
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{type}</p>
              )}
              {items.map(({ d, i }) => (
                <DocCard
                  key={i}
                  doc={d}
                  docType={d.docType}
                  onView={viewDoc}
                  onDownload={downloadDoc}
                  onRemove={() => removeAt(i)}
                  onFamilyCountChange={val => setFamilyCountAt(i, val)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{previewDoc.name}</p>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center p-2">
              <img src={previewDoc.dataUrl} alt={previewDoc.name} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
