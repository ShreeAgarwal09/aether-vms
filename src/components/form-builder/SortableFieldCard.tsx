import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, Copy, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FIELD_TYPES, type FormField } from '@/lib/form-builder'
import { cn } from '@/lib/utils'

export function SortableFieldCard({
  field,
  selected,
  canMoveUp,
  canMoveDown,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
}: {
  field: FormField
  selected: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })
  const typeLabel = FIELD_TYPES.find((item) => item.type === field.field_type)?.label ?? field.field_type

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-2xl border bg-navy-900/80 p-4',
        selected ? 'border-gold/60' : 'border-line',
        isDragging && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-1 cursor-grab text-mist active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <p className="truncate text-ivory">{field.label || 'Untitled field'}</p>
          <p className="mt-1 truncate text-xs text-mist">{field.field_key}</p>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Badge>{typeLabel}</Badge>
          {field.is_required ? <Badge tone="warning">Required</Badge> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move up">
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move down">
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onSelect}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  )
}
