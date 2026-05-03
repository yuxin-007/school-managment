import { describe, expect, it } from 'vitest'
import {
  isStudent,
  canManageCourses,
  canApproveLeave,
  canViewGradeEntry,
  canManageAttendance,
  canViewLogs,
  isRouteAllowed,
} from './permissions'

describe('permissions', () => {
  describe('isStudent', () => {
    it('student 返回 true', () => expect(isStudent('student')).toBe(true))
    it('staff 返回 false', () => expect(isStudent('staff')).toBe(false))
    it('college_admin 返回 false', () => expect(isStudent('college_admin')).toBe(false))
    it('super_admin 返回 false', () => expect(isStudent('super_admin')).toBe(false))
    it('undefined 返回 false', () => expect(isStudent(undefined)).toBe(false))
  })

  describe('canManageCourses', () => {
    it('staff 返回 true', () => expect(canManageCourses('staff')).toBe(true))
    it('college_admin 返回 true', () => expect(canManageCourses('college_admin')).toBe(true))
    it('super_admin 返回 true', () => expect(canManageCourses('super_admin')).toBe(true))
    it('student 返回 false', () => expect(canManageCourses('student')).toBe(false))
    it('undefined 返回 false', () => expect(canManageCourses(undefined)).toBe(false))
  })

  describe('canApproveLeave', () => {
    it('staff 返回 true', () => expect(canApproveLeave('staff')).toBe(true))
    it('college_admin 返回 true', () => expect(canApproveLeave('college_admin')).toBe(true))
    it('super_admin 返回 true', () => expect(canApproveLeave('super_admin')).toBe(true))
    it('student 返回 false', () => expect(canApproveLeave('student')).toBe(false))
    it('undefined 返回 false', () => expect(canApproveLeave(undefined)).toBe(false))
  })

  describe('canViewGradeEntry', () => {
    it('staff 返回 true', () => expect(canViewGradeEntry('staff')).toBe(true))
    it('student 返回 false', () => expect(canViewGradeEntry('student')).toBe(false))
  })

  describe('canManageAttendance', () => {
    it('super_admin 返回 true', () => expect(canManageAttendance('super_admin')).toBe(true))
    it('college_admin 返回 true', () => expect(canManageAttendance('college_admin')).toBe(true))
    it('staff 返回 false', () => expect(canManageAttendance('staff')).toBe(false))
    it('student 返回 false', () => expect(canManageAttendance('student')).toBe(false))
  })

  describe('canViewLogs', () => {
    it('super_admin 返回 true', () => expect(canViewLogs('super_admin')).toBe(true))
    it('college_admin 返回 false', () => expect(canViewLogs('college_admin')).toBe(false))
    it('staff 返回 false', () => expect(canViewLogs('staff')).toBe(false))
    it('student 返回 false', () => expect(canViewLogs('student')).toBe(false))
  })

  describe('isRouteAllowed', () => {
    it('无限制路由所有角色可访问', () => {
      expect(isRouteAllowed('/home', 'student')).toBe(true)
      expect(isRouteAllowed('/home', 'staff')).toBe(true)
      expect(isRouteAllowed('/home', 'super_admin')).toBe(true)
      expect(isRouteAllowed('/courses', 'student')).toBe(true)
      expect(isRouteAllowed('/leave', 'student')).toBe(true)
    })

    it('/grades 仅 student 可访问', () => {
      expect(isRouteAllowed('/grades', 'student')).toBe(true)
      expect(isRouteAllowed('/grades', 'staff')).toBe(false)
      expect(isRouteAllowed('/grades', 'college_admin')).toBe(false)
      expect(isRouteAllowed('/grades', 'super_admin')).toBe(false)
    })

    it('/freshman-guide 仅 student 可访问', () => {
      expect(isRouteAllowed('/freshman-guide', 'student')).toBe(true)
      expect(isRouteAllowed('/freshman-guide', 'staff')).toBe(false)
    })

    it('未定义路由默认允许', () => {
      expect(isRouteAllowed('/unknown', 'student')).toBe(true)
      expect(isRouteAllowed('/unknown', 'staff')).toBe(true)
    })

    it('undefined role 对受限路由返回 false', () => {
      expect(isRouteAllowed('/grades', undefined)).toBe(false)
    })
  })
})
