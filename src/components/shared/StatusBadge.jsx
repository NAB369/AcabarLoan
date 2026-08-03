import { Badge } from '@/components/ui/badge'
import { getStatusBadgeClass } from '../../utils/format'

export default function StatusBadge({ status, size = 'sm' }) {
  const cls = getStatusBadgeClass(status)
  const pad = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
  return (
    <Badge variant="outline" className={`rounded-full font-bold ${pad} ${cls}`}>
      {status}
    </Badge>
  )
}
