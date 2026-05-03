import type { UserRole } from '@/types'

export function isStudent(role: UserRole | undefined | string): boolean {
  return role === 'student'
}

export function canManageCourses(role: UserRole | undefined | string): boolean {
  return ['super_admin', 'college_admin', 'staff'].includes(role as string)
}

export function canApproveLeave(role: UserRole | undefined | string): boolean {
  return role !== undefined && role !== 'student'
}

export function canViewGradeEntry(role: UserRole | undefined | string): boolean {
  return ['super_admin', 'college_admin', 'staff'].includes(role as string)
}

export function canManageAttendance(role: UserRole | undefined | string): boolean {
  return ['super_admin', 'college_admin'].includes(role as string)
}

export function canViewLogs(role: UserRole | undefined | string): boolean {
  return role === 'super_admin'
}

export const ROUTE_PERMISSIONS: Record<string, UserRole[] | undefined> = {
  '/home': undefined,
  '/courses': undefined,
  '/tasks': undefined,
  '/grades': ['student'],
  '/leave': undefined,
  '/schedule': undefined,
  '/notifications': undefined,
  '/profile': undefined,
  '/settings': undefined,
  '/freshman-guide': ['student'],
}

export function isRouteAllowed(pathname: string, role: UserRole | undefined): boolean {
  let allowed = ROUTE_PERMISSIONS[pathname]

  if (allowed === undefined) {
    for (const [pattern, roles] of Object.entries(ROUTE_PERMISSIONS)) {
      if (pattern.includes(':')) {
        const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$')
        if (regex.test(pathname)) {
          allowed = roles
          break
        }
      }
    }
  }

  if (!allowed || allowed.length === 0) return true
  return allowed.includes(role as UserRole)
}
