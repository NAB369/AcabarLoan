import { FileText, Eye, ExternalLink, Download } from 'lucide-react'

// Whether anything was actually uploaded. Callers use it to decide whether to render this
// table at all: it lists one row per *expected* document type, so a record with nothing on
// file produces a full table of blank rows that reads as data when it is not.
export function hasUploadedDocs(documents) {
  return (documents || []).some(d => d?.dataUrl || d?.name)
}

// Table view of documents: one row per applicable document type, showing the uploaded
// file(s) or an empty state when nothing was uploaded for that type. Types that allow
// more than one file (e.g. multiple Bank Statements) get one row per uploaded file.
export default function IdentityDocumentsTable({ docTypes, documents, onView, getBadge }) {
  const docs = documents || []

  const rows = docTypes.flatMap(docType => {
    const matches = docs.filter(d => d.docType === docType)
    return matches.length > 0 ? matches.map(doc => ({ docType, doc })) : [{ docType, doc: null }]
  })

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <th className="px-3 py-2 text-left font-semibold w-8">#</th>
            <th className="px-3 py-2 text-left font-semibold">Document Type</th>
            <th className="px-3 py-2 text-left font-semibold">File</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ docType, doc }, i) => {
            const isImage = doc && (doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.name || ''))
            return (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {doc && isImage && doc.dataUrl ? (
                      <img src={doc.dataUrl} alt="" className="w-7 h-7 rounded-md object-cover border border-slate-200 flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-3.5 h-3.5 text-red-400" />
                      </div>
                    )}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{docType}</span>
                    {doc?.docType === 'Family Book' && doc.familyMemberCount && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 font-semibold whitespace-nowrap">
                        {doc.familyMemberCount} member{doc.familyMemberCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {doc && getBadge && getBadge(doc)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                  {doc ? doc.name : <span className="text-slate-400 dark:text-slate-500">No file uploaded</span>}
                </td>
                <td className="px-3 py-2.5">
                  {doc?.dataUrl ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onView(doc, isImage)}
                        title={isImage ? 'Preview image' : 'Open document'}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                      >
                        {isImage ? <Eye className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                      </button>
                      <a
                        href={doc.dataUrl}
                        download={doc.name}
                        title="Download"
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors inline-flex"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : (
                    <span className="flex justify-end text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
