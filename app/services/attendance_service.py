from __future__ import annotations

from datetime import timedelta

from app.extensions import db
from app.models import Attendance, LeaveApplication


def iter_leave_dates(application: LeaveApplication):
    current_date = application.start_date
    while current_date <= application.end_date:
        yield current_date
        current_date += timedelta(days=1)


def build_leave_attendance_remark(application: LeaveApplication) -> str:
    leave_type = application.get_leave_type_display()
    return f'已批准{leave_type}：{application.start_date} 至 {application.end_date}'


def remove_leave_attendance_remark(existing_remark: str | None, leave_remark: str) -> str:
    if not existing_remark:
        return ''

    parts = [item.strip() for item in existing_remark.split('；') if item.strip()]
    parts = [item for item in parts if item != leave_remark]
    return '；'.join(parts)


def sync_approved_leave_to_attendance(application: LeaveApplication):
    if application.status != 'approved':
        return []

    updated_records = []
    leave_remark = build_leave_attendance_remark(application)

    for leave_date in iter_leave_dates(application):
        attendance = Attendance.query.filter_by(user_id=application.staff_id, attendance_date=leave_date).first()

        if not attendance:
            attendance = Attendance(
                user_id=application.staff_id,
                attendance_date=leave_date,
                status='on_leave',
                remark=leave_remark,
            )
            db.session.add(attendance)
            updated_records.append(attendance)
            continue

        if attendance.status in {'normal', 'late', 'early', 'absent', 'on_leave'}:
            attendance.status = 'on_leave'

        if leave_remark not in (attendance.remark or ''):
            attendance.remark = leave_remark if not attendance.remark else f'{attendance.remark}；{leave_remark}'

        updated_records.append(attendance)

    return updated_records


def rollback_leave_attendance_sync(application: LeaveApplication):
    rolled_back_records = []
    leave_remark = build_leave_attendance_remark(application)

    for leave_date in iter_leave_dates(application):
        attendance = Attendance.query.filter_by(user_id=application.staff_id, attendance_date=leave_date).first()
        if not attendance:
            continue

        remark_contains_leave = leave_remark in (attendance.remark or '')
        remaining_remark = remove_leave_attendance_remark(attendance.remark, leave_remark)

        if attendance.status == 'on_leave':
            if attendance.clock_in or attendance.clock_out:
                attendance.status = 'normal'
                attendance.remark = remaining_remark
            elif remaining_remark:
                attendance.remark = remaining_remark
            else:
                db.session.delete(attendance)
                rolled_back_records.append({'date': leave_date.strftime('%Y-%m-%d'), 'deleted': True})
                continue
        elif remark_contains_leave:
            attendance.remark = remaining_remark

        rolled_back_records.append(attendance)

    return rolled_back_records
