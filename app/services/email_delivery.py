import smtplib
from email.message import EmailMessage

from flask import current_app


class EmailDeliveryError(RuntimeError):
    pass


def _bool_config(name, default=False):
    return bool(current_app.config.get(name, default))


def _required_mail_config():
    server = current_app.config.get('MAIL_SERVER')
    sender = current_app.config.get('MAIL_DEFAULT_SENDER') or current_app.config.get('MAIL_USERNAME')
    if not server or not sender:
        raise EmailDeliveryError('邮箱服务未配置，请先配置 SMTP 服务器和发件人。')
    return server, sender


def send_verification_email(to_email, code, purpose):
    if current_app.config.get('MAIL_SUPPRESS_SEND', current_app.config.get('TESTING', False)):
        return False

    server, sender = _required_mail_config()
    port = int(current_app.config.get('MAIL_PORT') or 465)
    username = current_app.config.get('MAIL_USERNAME')
    password = current_app.config.get('MAIL_PASSWORD')
    use_tls = _bool_config('MAIL_USE_TLS')
    use_ssl = _bool_config('MAIL_USE_SSL', True)
    timeout = int(current_app.config.get('MAIL_TIMEOUT') or 10)

    message = EmailMessage()
    message['Subject'] = 'School Management verification code'
    message['From'] = sender
    message['To'] = to_email
    message.set_content(
        '\n'.join([
            'Your verification code is:',
            '',
            code,
            '',
            f'This code is valid for {current_app.config.get("AUTH_CODE_EXPIRES_MINUTES", 10)} minutes.',
            f'Purpose: {purpose}',
            '',
            'If you did not request this code, you can ignore this email.',
        ])
    )

    try:
        smtp_factory = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_factory(server, port, timeout=timeout) as smtp:
            if use_tls:
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise EmailDeliveryError('验证码邮件发送失败，请稍后重试。') from error

    return True
