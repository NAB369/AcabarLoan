import { FileText, Eye, ExternalLink, Download } from 'lucide-react'

export default function DocList({ documents, onView, getBadge }) {
  const docs = documents || []

  if (docs.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">No documents uploaded.</p>
  }

  return (
    <div className="space-y-2">
      {docs.map((doc, i) => {
        const isImage = doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.name || '')
        return (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
            {isImage && doc.dataUrl ? (
              <img
                src={doc.dataUrl}
                alt={doc.name}
                onClick={() => onView(doc, isImage)}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-red-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{doc.name || doc}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {doc.docType && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 border border-brand-100 dark:border-brand-800">{doc.docType}</span>}
                {doc.size && <span className="text-[10px] text-slate-400">{doc.size}</span>}
              </div>
            </div>
            {doc.dataUrl && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {getBadge && getBadge(doc)}
                <button
                  onClick={() => onView(doc, isImage)}
                  title={isImage ? 'Preview image' : 'Open document'}
                  className="p-1.5 text-slate-500 dark:text-slate-300 hover:text-[#0047ab] dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors"
                >
                  {isImage ? <Eye className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={doc.dataUrl}
                  download={doc.name || 'document'}
                  title="Download"
                  className="p-1.5 text-slate-500 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
