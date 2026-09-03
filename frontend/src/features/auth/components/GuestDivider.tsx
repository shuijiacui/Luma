export function GuestDivider() {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-luma-ivory-200" />
      <span className="text-xs font-medium text-luma-muted">或者</span>
      <div className="h-px flex-1 bg-luma-ivory-200" />
    </div>
  )
}
