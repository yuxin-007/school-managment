export const attendanceStatusColor: Record<string, string> = {
  present: 'green',
  late: 'orange',
  absent: 'red',
  leave: 'blue',
  location_abnormal: 'volcano',
  manual: 'purple',
  open: 'green',
  pending: 'blue',
  finished: 'default',
  closed: 'default',
}

export const assignmentStatusColor: Record<string, string> = {
  open: 'green',
  overdue: 'orange',
  closed: 'default',
  submitted: 'blue',
  late: 'volcano',
  resubmitted: 'purple',
  reviewed: 'green',
  returned: 'orange',
  missing: 'red',
}

export const courseStatusColor: Record<string, string> = {
  ...attendanceStatusColor,
  ...assignmentStatusColor,
}
