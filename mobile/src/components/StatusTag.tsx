const colorMap: Record<string, string> = {
  open: 'green',
  pending: 'blue',
  submitted: 'blue',
  resubmitted: 'purple',
  reviewed: 'green',
  present: 'green',
  manual: 'green',
  late: 'orange',
  absent: 'orange',
  location_abnormal: 'orange',
  returned: 'orange',
  overdue: 'orange',
  approved: 'green',
  available: 'green',
  selected: 'green',
  rejected: 'orange',
  full: 'orange',
  inactive: 'neutral',
  cancelled: 'neutral',
  finished: 'neutral',
  closed: 'neutral',
}

const StatusTag: React.FC<{ status?: string; children: React.ReactNode }> = ({ status = 'neutral', children }) => {
  return <span className={`status-tag ${colorMap[status] || 'neutral'}`}>{children}</span>
}

export default StatusTag
