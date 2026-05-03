from app import create_app
from app.extensions import db
from app.models import (
    Attendance,
    AttendanceSupplementFlow,
    AttendanceSupplementRequest,
    LeaveApplication,
    LeaveApprovalFlow,
    Notification,
    OperationLog,
)
from app.utils.encoding_cleanup import clean_corrupted_text, has_placeholder_corruption


TARGET_FIELDS = {
    Attendance: ["remark"],
    AttendanceSupplementFlow: ["comments"],
    AttendanceSupplementRequest: ["reason", "approval_comments"],
    LeaveApplication: ["reason", "approval_notes"],
    LeaveApprovalFlow: ["comments"],
    Notification: ["content"],
    OperationLog: ["detail", "target_name"],
}


def main():
    app = create_app()
    total_updates = 0

    with app.app_context():
        for model, fields in TARGET_FIELDS.items():
            rows = model.query.all()
            model_updates = 0

            for row in rows:
                changed = False
                for field_name in fields:
                    current = getattr(row, field_name, None)
                    if not has_placeholder_corruption(current):
                        continue

                    cleaned = clean_corrupted_text(current, field_name)
                    if cleaned != current:
                        setattr(row, field_name, cleaned)
                        changed = True

                if changed:
                    model_updates += 1
                    total_updates += 1

            if model_updates:
                print(f"{model.__name__}: cleaned {model_updates} rows")

        db.session.commit()
        print(f"Total cleaned rows: {total_updates}")


if __name__ == "__main__":
    main()
