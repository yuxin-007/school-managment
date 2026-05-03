import { getApiErrorMessage } from '@/lib/errors'
import React, { useEffect, useState } from 'react'
import { Alert, Button, Form, Input, message } from 'antd'
import { ArrowRightOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getProfile, login } from '@/api/auth'
import loginBackground from '@/assets/login-architectural-minimal-bg.svg'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const LoginPage: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [hasEntered, setHasEntered] = useState(false)
  const navigate = useNavigate()
  const { setUser, isLoggedIn } = useAuthStore()
  const { t } = useI18n()

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/dashboard', { replace: true })
    }
  }, [isLoggedIn, navigate])

  useEffect(() => {
    if (!hasEntered) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      document.getElementById('login-username')?.focus()
    }, 360)

    return () => window.clearTimeout(focusTimer)
  }, [hasEntered])

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true)
    setSubmitError('')
    try {
      const loginRes = await login(values)
      if (loginRes.data.success) {
        const profileRes = await getProfile()
        if (profileRes.data.success) {
          const profile = profileRes.data.data
          setUser(profile)
          message.success(t('common.welcomeBack', { name: profile.real_name || profile.username }))
          navigate('/dashboard', { replace: true })
        }
      }
    } catch (error: unknown) {
      setSubmitError(getApiErrorMessage(error, t('login.error')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={hasEntered ? 'login-scene is-entered' : 'login-scene'}>
      <div className="login-bg-image" aria-hidden="true" style={{ backgroundImage: `url(${loginBackground})` }} />
      <div className="login-bg-wash" aria-hidden="true" />

      <main className="login-stage-shell">
        <section className="login-hero-pane" aria-labelledby="login-brand-title">
          <div className="login-hero-copy">
            <span className="login-hero-kicker">{t('login.brandKicker')}</span>
            <h1 id="login-brand-title" className="login-system-name-zh">
              {t('login.brandTitleZh')}
            </h1>
            <p className="login-hero-description">{t('login.brandDescription')}</p>
            <button
              type="button"
              className="login-enter-trigger"
              onClick={() => setHasEntered(true)}
              aria-controls="login-auth-card"
              aria-expanded={hasEntered}
            >
              <span>{t('login.enter')}</span>
              <ArrowRightOutlined aria-hidden="true" />
            </button>
            <p className="login-enter-hint">{t('login.enterHint')}</p>
          </div>
        </section>

        {hasEntered ? (
          <div className="login-auth-layer">
            <div className="login-auth-reveal" aria-hidden="true" />

            <aside id="login-auth-card" className="login-auth-panel" aria-labelledby="login-auth-title">
              <div className="login-auth-brand">{t('login.brandTitleEn')}</div>
              <h2 id="login-auth-title" className="login-auth-title">
                {t('login.welcomeTitle')}
              </h2>
              <p className="login-auth-description">{t('login.welcomeDescription')}</p>

              {submitError ? (
                <Alert
                  className="login-auth-error"
                  type="error"
                  showIcon
                  message={t('login.errorTitle')}
                  description={submitError}
                />
              ) : null}

              <Form
                form={form}
                onFinish={handleSubmit}
                onValuesChange={() => {
                  if (submitError) {
                    setSubmitError('')
                  }
                }}
                size="large"
                layout="vertical"
                requiredMark={false}
              >
                <Form.Item
                  label={t('login.accountLabel')}
                  name="username"
                  rules={[{ required: true, message: t('login.accountRequired') }]}
                >
                  <Input
                    id="login-username"
                    allowClear
                    autoComplete="username"
                    className="login-input"
                    prefix={<UserOutlined />}
                    placeholder={t('login.accountPlaceholder')}
                  />
                </Form.Item>
                <Form.Item
                  label={t('login.passwordLabel')}
                  name="password"
                  rules={[{ required: true, message: t('login.passwordRequired') }]}
                >
                  <Input.Password
                    autoComplete="current-password"
                    className="login-input"
                    prefix={<LockOutlined />}
                    placeholder={t('login.passwordPlaceholder')}
                  />
                </Form.Item>

                <div className="login-form-support">
                  <span className="login-form-security-note">{t('login.securityNote')}</span>
                  <button type="button" className="login-forgot-link" onClick={() => navigate('/forgot-password')}>
                    {t('login.forgotPassword')}
                  </button>
                </div>

                <button
                  type="button"
                  className="login-email-code-link"
                  onClick={() => navigate('/forgot-password?mode=email_login')}
                >
                  <MailOutlined aria-hidden="true" />
                  <span>使用邮箱验证码登录</span>
                </button>

                <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    loading={loading}
                    disabled={loading}
                    icon={<ArrowRightOutlined />}
                    className="login-submit"
                  >
                    {t('login.submit')}
                  </Button>
                </Form.Item>
              </Form>

              <div className="login-auth-footer">
                <span>{t('login.supportLabel')}: {t('login.supportValue')}</span>
                <span>{t('login.helpLabel')}: {t('login.helpValue')}</span>
              </div>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default LoginPage
