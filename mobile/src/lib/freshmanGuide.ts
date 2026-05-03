import type { UserInfo } from '@/types'

const ADMISSION_MONTH = 8
const ADMISSION_DAY = 1

const getAdmissionYear = (user?: UserInfo | null) => {
  const fromGrade = user?.grade?.match(/20\d{2}/)?.[0]
  if (fromGrade) return Number(fromGrade)

  const fromStudentId = user?.student_id?.match(/20\d{2}/)?.[0]
  if (fromStudentId) return Number(fromStudentId)

  return null
}

export const isFreshmanStudent = (user?: UserInfo | null, now = new Date()) => {
  if (!user || user.role !== 'student') return false

  const admissionYear = getAdmissionYear(user)
  if (!admissionYear) return false

  const start = new Date(admissionYear, ADMISSION_MONTH, ADMISSION_DAY)
  const end = new Date(admissionYear + 1, ADMISSION_MONTH, ADMISSION_DAY)

  return now >= start && now < end
}

export const getStudentAdmissionYear = getAdmissionYear
