import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getProfile,
  loginWithRecoveryCode,
  resetPasswordWithCode,
  sendRecoveryCode,
} from '@/api'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type { RecoveryContactType, RecoveryPurpose } from '@/types'

type RecoveryMode = RecoveryPurpose

const modeOptions: { label: string; value: RecoveryMode }[] = [
  { label: '找回密码', value: 'reset_password' },
  { label: '邮箱登录', value: 'email_login' },
  { label: '手机登录', value: 'phone_login' },
]

const resolveInitialMode = (mode: string | null): RecoveryMode => {
  if (mode === 'email_login' || mode === 'phone_login' || mode === 'reset_password') return mode
  return 'reset_password'
}

const ForgotPasswordPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)

  const [mode, setMode] = useState<RecoveryMode>(() => resolveInitialMode(searchParams.get('mode')))
  const [resetContactType, setResetContactType] = useState<RecoveryContactType>('email')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [debugCode, setDebugCode] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const contactType: RecoveryContactType = mode === 'phone_login' ? 'phone' : mode === 'email_login' ? 'email' : resetContactType
  const isLoginMode = mode === 'email_login' || mode === 'phone_login'
  const contactLabel = contactType === 'email' ? '邮箱' : '手机号'
  const contactPlaceholder = contactType === 'email' ? '请输入已绑定邮箱' : '请输入已绑定手机号'

  const pageCopy = useMemo(() => {
    if (mode === 'reset_password') return { title: '找回密码', submit: '修改密码' }
    if (mode === 'email_login') return { title: '邮箱验证码登录', submit: '使用邮箱登录' }
    return { title: '手机号验证码登录', submit: '使用手机号登录' }
  }, [mode])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const clearCodeState = () => {
    setCodeSent(false)
    setDebugCode('')
    setCode('')
    setCooldown(0)
  }

  const handleModeChange = (next: RecoveryMode) => {
    setMode(next)
    clearCodeState()
    setContact('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
  }

  const handleSendCode = async () => {
    if (!contact.trim()) {
      setError(`请输入${contactLabel}`)
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await sendRecoveryCode({ purpose: mode, contact_type: contactType, contact: contact.trim() })
      if (res.data?.success) {
        setCodeSent(true)
        setDebugCode(res.data.debug_code || '')
        setCooldown(60)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, '验证码发送失败'))
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async () => {
    if (!contact.trim()) {
      setError(`请输入${contactLabel}`)
      return
    }
    if (!code.trim()) {
      setError('请输入验证码')
      return
    }
    if (!isLoginMode) {
      if (!newPassword) {
        setError('请输入新密码')
        return
      }
      if (newPassword.length < 6) {
        setError('密码至少 6 位')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }
    }
    setSubmitting(true)
    setError('')
    try {
      if (isLoginMode) {
        const loginRes = await loginWithRecoveryCode({ contact_type: contactType, contact: contact.trim(), code: code.trim() })
        if (loginRes.data?.success) {
          const profile = await getProfile()
          if (profile.data?.success) {
            setUser(profile.data.data)
            navigate('/home', { replace: true })
          }
        }
      } else {
        const res = await resetPasswordWithCode({
          contact_type: contactType,
          contact: contact.trim(),
          code: code.trim(),
          new_password: newPassword,
          confirm_password: confirmPassword,
        })
        if (res.data?.success) {
          navigate('/login', { replace: true })
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, '操作失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <Link to="/login" className="recovery-back">&larr; 返回登录</Link>
        <span className="eyebrow">Account Recovery</span>
        <h1>账号验证中心</h1>
        <p>忘记密码或希望通过已绑定邮箱/手机号快速登录时，可使用验证码完成身份校验。</p>
      </section>

      <section className="login-card">
        <div className="mobile-segmented two">
          {modeOptions.map((opt) => (
            <button key={opt.value} className={mode === opt.value ? 'active' : ''} type="button" onClick={() => handleModeChange(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        {mode === 'reset_password' && (
          <div className="mobile-segmented two">
            <button className={resetContactType === 'email' ? 'active' : ''} type="button" onClick={() => { setResetContactType('email'); clearCodeState(); setContact('') }}>
              邮箱验证
            </button>
            <button className={resetContactType === 'phone' ? 'active' : ''} type="button" onClick={() => { setResetContactType('phone'); clearCodeState(); setContact('') }}>
              手机验证
            </button>
          </div>
        )}

        <label>
          {contactLabel}
          <input
            type={contactType === 'email' ? 'email' : 'tel'}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={contactPlaceholder}
            autoComplete={contactType === 'email' ? 'email' : 'tel'}
          />
        </label>

        <label>
          验证码
          <div className="code-send-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入 6 位验证码"
              maxLength={6}
              inputMode="numeric"
            />
            <button
              type="button"
              className="small-button"
              disabled={sending || cooldown > 0}
              onClick={handleSendCode}
            >
              {sending ? '发送中...' : cooldown > 0 ? `${cooldown}s` : codeSent ? '重新发送' : '发送验证码'}
            </button>
          </div>
        </label>

        {debugCode && (
          <div className="notice-line">演示验证码：{debugCode}</div>
        )}

        {!isLoginMode && (
          <>
            <label>
              新密码
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少 6 位）"
                  autoComplete="new-password"
                />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </label>
            <label>
              确认新密码
              <div className="password-field">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  autoComplete="new-password"
                />
                <button type="button" className="password-toggle" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? '🙈' : '👁'}
                </button>
              </div>
            </label>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <button className="primary-button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? '提交中...' : pageCopy.submit}
        </button>
      </section>
    </main>
  )
}

export default ForgotPasswordPage
