import React, { useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Segmented, Space, Typography, message } from 'antd'
import {
  ArrowLeftOutlined,
  KeyOutlined,
  MailOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getProfile,
  loginWithRecoveryCode,
  resetPasswordWithCode,
  sendRecoveryCode,
  type RecoveryContactType,
  type RecoveryPurpose,
} from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

const { Paragraph, Text, Title } = Typography

type RecoveryMode = 'reset_password' | 'email_login' | 'phone_login'

const modeOptions = [
  { label: '找回密码', value: 'reset_password', icon: <KeyOutlined /> },
  { label: '邮箱登录', value: 'email_login', icon: <MailOutlined /> },
  { label: '手机号登录', value: 'phone_login', icon: <MobileOutlined /> },
]

const resolveInitialMode = (mode: string | null): RecoveryMode => {
  if (mode === 'email_login' || mode === 'phone_login' || mode === 'reset_password') {
    return mode
  }
  return 'reset_password'
}

const ForgotPasswordPage: React.FC = () => {
  const [form] = Form.useForm()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<RecoveryMode>(() => resolveInitialMode(searchParams.get('mode')))
  const [resetContactType, setResetContactType] = useState<RecoveryContactType>('email')
  const [codeSent, setCodeSent] = useState(false)
  const [debugCode, setDebugCode] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)

  const contactType = mode === 'phone_login' ? 'phone' : mode === 'email_login' ? 'email' : resetContactType
  const isLoginMode = mode === 'email_login' || mode === 'phone_login'
  const contactLabel = contactType === 'email' ? '邮箱' : '手机号'
  const contactPlaceholder = contactType === 'email' ? '请输入已绑定邮箱' : '请输入已绑定手机号'

  const pageCopy = useMemo(() => {
    if (mode === 'reset_password') {
      return {
        title: '找回密码',
        description: '使用系统中已绑定的邮箱或手机号接收验证码，验证通过后即可设置新密码。',
        submit: '修改密码',
      }
    }
    if (mode === 'email_login') {
      return {
        title: '邮箱验证码登录',
        description: '输入已绑定邮箱并完成验证码校验，即可直接进入系统。',
        submit: '使用邮箱登录',
      }
    }
    return {
      title: '手机号验证码登录',
      description: '输入已绑定手机号并完成验证码校验，即可直接进入系统。',
      submit: '使用手机号登录',
    }
  }, [mode])

  const clearCodeState = () => {
    setCodeSent(false)
    setDebugCode('')
  }

  const handleModeChange = (nextMode: RecoveryMode) => {
    setMode(nextMode)
    clearCodeState()
    form.resetFields()
  }

  const handleSendCode = async () => {
    const values = await form.validateFields(['contact'])
    setSending(true)
    try {
      const response = await sendRecoveryCode({
        purpose: mode as RecoveryPurpose,
        contact_type: contactType,
        contact: values.contact,
      })
      setCodeSent(true)
      setDebugCode(response.data.data?.debug_code || '')
      message.success(response.data.message || '验证码已发送')
    } catch {
      clearCodeState()
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (isLoginMode) {
        const loginResponse = await loginWithRecoveryCode({
          contact_type: contactType,
          contact: values.contact,
          code: values.code,
        })
        if (loginResponse.data.success) {
          const profileResponse = await getProfile()
          if (profileResponse.data.success) {
            setUser(profileResponse.data.data)
            message.success(loginResponse.data.message || '登录成功')
            navigate('/dashboard', { replace: true })
          }
        }
      } else {
        const resetResponse = await resetPasswordWithCode({
          contact_type: contactType,
          contact: values.contact,
          code: values.code,
          new_password: values.new_password,
          confirm_password: values.confirm_password,
        })
        if (resetResponse.data.success) {
          message.success(resetResponse.data.message || '密码修改成功')
          navigate('/login', { replace: true })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="recovery-page">
      <div className="recovery-shell">
        <section className="recovery-copy">
          <Button className="recovery-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/login')}>
            返回登录
          </Button>
          <span className="recovery-kicker">Account Recovery</span>
          <Title className="recovery-title">账号验证中心</Title>
          <Paragraph className="recovery-description">
            当你忘记密码，或希望通过已绑定邮箱、手机号快速登录时，可使用验证码完成身份校验。
          </Paragraph>
          <div className="recovery-assurance">
            <SafetyCertificateOutlined />
            <span>仅支持系统中已绑定的邮箱或手机号；未绑定时会提示无账号。</span>
          </div>
        </section>

        <aside className="recovery-panel">
          <Segmented
            block
            className="recovery-mode-switch"
            value={mode}
            options={modeOptions}
            onChange={(value) => handleModeChange(value as RecoveryMode)}
          />

          <div className="recovery-panel-heading">
            <Title level={3}>{pageCopy.title}</Title>
            <Text>{pageCopy.description}</Text>
          </div>

          <Form form={form} layout="vertical" requiredMark={false} size="large">
            {mode === 'reset_password' ? (
              <Form.Item label="验证方式">
                <Segmented
                  block
                  value={resetContactType}
                  options={[
                    { label: '邮箱', value: 'email', icon: <MailOutlined /> },
                    { label: '手机号', value: 'phone', icon: <MobileOutlined /> },
                  ]}
                  onChange={(value) => {
                    setResetContactType(value as RecoveryContactType)
                    clearCodeState()
                    form.resetFields(['contact', 'code'])
                  }}
                />
              </Form.Item>
            ) : null}

            <Form.Item
              name="contact"
              label={contactLabel}
              rules={
                contactType === 'email'
                  ? [
                      { required: true, message: `请输入${contactLabel}` },
                      { type: 'email' as const, message: '请输入有效邮箱' },
                    ]
                  : [{ required: true, message: `请输入${contactLabel}` }]
              }
            >
              <Input
                prefix={contactType === 'email' ? <MailOutlined /> : <MobileOutlined />}
                placeholder={contactPlaceholder}
                autoComplete={contactType === 'email' ? 'email' : 'tel'}
              />
            </Form.Item>

            <Form.Item label="验证码" required>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
                  <Input prefix={<SafetyCertificateOutlined />} placeholder="请输入 6 位验证码" maxLength={6} />
                </Form.Item>
                <Button loading={sending} onClick={handleSendCode}>
                  {codeSent ? '重新发送' : '发送验证码'}
                </Button>
              </Space.Compact>
            </Form.Item>

            {debugCode ? (
              <Alert
                className="recovery-debug-code"
                type="info"
                showIcon
                message={`演示验证码：${debugCode}`}
                description="当前开启调试模式，验证码也会在这里显示；配置真实 SMTP 后仍会发送到邮箱。"
              />
            ) : null}

            {!isLoginMode ? (
              <>
                <Form.Item
                  name="new_password"
                  label="新密码"
                  rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 6, message: '密码至少 6 位' },
                  ]}
                >
                  <Input.Password placeholder="请输入新密码" autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                  name="confirm_password"
                  label="确认新密码"
                  dependencies={['new_password']}
                  rules={[
                    { required: true, message: '请确认新密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('new_password') === value) {
                          return Promise.resolve()
                        }
                        return Promise.reject(new Error('两次输入的密码不一致'))
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
                </Form.Item>
              </>
            ) : null}

            <Button type="primary" block className="recovery-submit" loading={submitting} onClick={handleSubmit}>
              {pageCopy.submit}
            </Button>
          </Form>
        </aside>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
