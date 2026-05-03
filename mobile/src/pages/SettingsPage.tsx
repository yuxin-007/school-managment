import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  changePassword,
  getPreferences,
  logout,
  sendContactCode,
  updatePreferences,
  updateProfile,
} from '@/api'
import { getApiErrorMessage } from '@/lib/request'
import { APP_VERSION_NAME } from '@/lib/appVersion'
import { useAuthStore } from '@/store/authStore'
import type { NotificationPreferences, PreferencesState } from '@/types'

const defaultNotificationPrefs: NotificationPreferences = {
  leave: true, attendance: true, announcement: true,
  grade: true, course: true, system: true,
}

const notificationLabels: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'leave', label: '请假通知' },
  { key: 'attendance', label: '考勤通知' },
  { key: 'announcement', label: '公告通知' },
  { key: 'grade', label: '成绩通知' },
  { key: 'course', label: '课程通知' },
  { key: 'system', label: '系统通知' },
]

const SettingsPage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.logout)
  const uiPreferences = useAuthStore((s) => s.uiPreferences)
  const setUIPreferences = useAuthStore((s) => s.setUIPreferences)

  // Profile editing state
  const [realName, setRealName] = useState(user?.real_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [contactSending, setContactSending] = useState<{ email?: boolean; phone?: boolean }>({})
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [phoneCooldown, setPhoneCooldown] = useState(0)

  // Password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  // Preferences state
  const [preferences, setPreferences] = useState<PreferencesState>({
    theme: user?.theme || 'auto',
    language: user?.language || 'zh-CN',
    notification_preferences: defaultNotificationPrefs,
  })
  const [preferenceSaving, setPreferenceSaving] = useState(false)

  // Messages
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordErr, setPasswordErr] = useState('')

  useEffect(() => {
    if (user) {
      setRealName(user.real_name)
      setEmail(user.email)
      setPhone(user.phone)
    }
  }, [user])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getPreferences()
        if (res.data?.success && res.data.data) {
          const d = res.data.data
          setPreferences({
            theme: d.theme || user?.theme || 'auto',
            language: d.language || user?.language || 'zh-CN',
            notification_preferences: { ...defaultNotificationPrefs, ...(d.notification_preferences || {}) },
          })
        }
      } catch { /* use defaults */ }
    }
    load()
  }, [])

  useEffect(() => {
    if (emailCooldown <= 0) return
    const t = setTimeout(() => setEmailCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [emailCooldown])

  useEffect(() => {
    if (phoneCooldown <= 0) return
    const t = setTimeout(() => setPhoneCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phoneCooldown])

  const emailChanged = email.trim() !== (user?.email || '')
  const phoneChanged = phone.trim() !== (user?.phone || '')

  const handleSendContactCode = async (type: 'email' | 'phone') => {
    const value = type === 'email' ? email.trim() : phone.trim()
    if (!value) {
      setProfileErr(type === 'email' ? '请先填写邮箱' : '请先填写手机号')
      return
    }
    setContactSending((s) => ({ ...s, [type]: true }))
    setProfileErr('')
    try {
      const res = await sendContactCode({ contact_type: type, contact: value })
      if (res.data?.success) {
        if (type === 'email') setEmailCooldown(60)
        else setPhoneCooldown(60)
        const debug = res.data.debug_code
        setProfileMsg(debug ? `验证码已发送，测试码：${debug}` : '验证码已发送')
      }
    } catch (err) {
      setProfileErr(getApiErrorMessage(err, '验证码发送失败'))
    } finally {
      setContactSending((s) => ({ ...s, [type]: false }))
    }
  }

  const handleProfileSave = async () => {
    if (!realName.trim()) {
      setProfileErr('请输入姓名')
      return
    }
    if (emailChanged && !emailCode.trim()) {
      setProfileErr('换绑邮箱需要先填写邮箱验证码')
      return
    }
    if (phoneChanged && !phoneCode.trim()) {
      setProfileErr('换绑手机号需要先填写手机验证码')
      return
    }
    setProfileSaving(true)
    setProfileErr('')
    setProfileMsg('')
    try {
      const payload: Record<string, string> = { real_name: realName.trim() }
      if (email.trim()) payload.email = email.trim()
      if (phone.trim()) payload.phone = phone.trim()
      if (emailChanged && emailCode.trim()) payload.email_code = emailCode.trim()
      if (phoneChanged && phoneCode.trim()) payload.phone_code = phoneCode.trim()
      const res = await updateProfile(payload as never)
      if (res.data?.success && user) {
        setUser({ ...user, real_name: realName.trim(), email: email.trim(), phone: phone.trim() })
        setEmailCode('')
        setPhoneCode('')
        setProfileMsg('个人信息已保存')
      }
    } catch (err) {
      setProfileErr(getApiErrorMessage(err, '保存失败'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!currentPassword) { setPasswordErr('请输入当前密码'); return }
    if (!newPassword || newPassword.length < 6) { setPasswordErr('新密码至少 6 位'); return }
    if (newPassword !== confirmPassword) { setPasswordErr('两次输入的密码不一致'); return }
    setPasswordSaving(true)
    setPasswordErr('')
    setPasswordMsg('')
    try {
      const res = await changePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword })
      if (res.data?.success) {
        setPasswordMsg('密码修改成功')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setPasswordErr(getApiErrorMessage(err, '密码修改失败'))
    } finally {
      setPasswordSaving(false)
    }
  }

  const persistPreferences = async (payload: Partial<PreferencesState>) => {
    setPreferenceSaving(true)
    try {
      const res = await updatePreferences(payload)
      if (res.data?.success) {
        if (payload.theme || payload.language) {
          setUIPreferences({ theme: payload.theme, language: payload.language })
          if (user) setUser({ ...user, theme: payload.theme || user.theme, language: payload.language || user.language })
        }
      }
    } catch { /* silent */ } finally {
      setPreferenceSaving(false)
    }
  }

  const handleThemeChange = (theme: 'light' | 'dark' | 'auto') => {
    setPreferences((p) => ({ ...p, theme }))
    void persistPreferences({ theme })
  }

  const handleLanguageChange = (language: 'zh-CN' | 'en') => {
    setPreferences((p) => ({ ...p, language }))
    void persistPreferences({ language })
  }

  const handleNotificationToggle = (key: keyof NotificationPreferences) => {
    const next = { ...preferences.notification_preferences, [key]: !preferences.notification_preferences[key] }
    setPreferences((p) => ({ ...p, notification_preferences: next }))
    void persistPreferences({ notification_preferences: next })
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Settings</span>
        <h2>设置</h2>
      </section>

      {/* 个人信息编辑 */}
      <section className="section-card">
        <h3>个人信息</h3>
        <div className="compact-form" style={{ marginTop: 12 }}>
          <label>
            姓名
            <input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="请输入姓名" />
          </label>
          <label>
            账号（只读）
            <input value={user?.username || ''} disabled />
          </label>
          <label>
            工号/学号（只读）
            <input value={user?.employee_id || user?.student_id || '-'} disabled />
          </label>
          <label>
            组织（只读）
            <input value={user?.department_name || '-'} disabled />
          </label>

          <label>
            邮箱
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailCode('') }} placeholder="请输入邮箱" />
          </label>
          {emailChanged && (
            <label>
              邮箱验证码
              <div className="code-send-row">
                <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="请输入验证码" maxLength={6} inputMode="numeric" />
                <button type="button" className="small-button" disabled={contactSending.email || emailCooldown > 0} onClick={() => handleSendContactCode('email')}>
                  {contactSending.email ? '发送中...' : emailCooldown > 0 ? `${emailCooldown}s` : '发送验证码'}
                </button>
              </div>
            </label>
          )}

          <label>
            手机号
            <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneCode('') }} placeholder="请输入手机号" />
          </label>
          {phoneChanged && (
            <label>
              手机验证码
              <div className="code-send-row">
                <input value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="请输入验证码" maxLength={6} inputMode="numeric" />
                <button type="button" className="small-button" disabled={contactSending.phone || phoneCooldown > 0} onClick={() => handleSendContactCode('phone')}>
                  {contactSending.phone ? '发送中...' : phoneCooldown > 0 ? `${phoneCooldown}s` : '发送验证码'}
                </button>
              </div>
            </label>
          )}

          {profileErr && <div className="form-error">{profileErr}</div>}
          {profileMsg && <div className="notice-line">{profileMsg}</div>}
          <button className="primary-button" disabled={profileSaving} onClick={handleProfileSave}>
            {profileSaving ? '保存中...' : '保存个人信息'}
          </button>
        </div>
      </section>

      {/* 修改密码 */}
      <section className="section-card">
        <h3>修改密码</h3>
        <div className="compact-form" style={{ marginTop: 12 }}>
          <label>
            当前密码
            <div className="password-field">
              <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="请输入当前密码" autoComplete="current-password" />
              <button type="button" className="password-toggle" onClick={() => setShowCurrentPw(!showCurrentPw)}>{showCurrentPw ? '🙈' : '👁'}</button>
            </div>
          </label>
          <label>
            新密码
            <div className="password-field">
              <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" />
              <button type="button" className="password-toggle" onClick={() => setShowNewPw(!showNewPw)}>{showNewPw ? '🙈' : '👁'}</button>
            </div>
          </label>
          <label>
            确认新密码
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="请再次输入新密码" autoComplete="new-password" />
          </label>
          {passwordErr && <div className="form-error">{passwordErr}</div>}
          {passwordMsg && <div className="notice-line">{passwordMsg}</div>}
          <button className="primary-button" disabled={passwordSaving} onClick={handlePasswordChange}>
            {passwordSaving ? '修改中...' : '修改密码'}
          </button>
        </div>
      </section>

      {/* 偏好设置 */}
      <section className="section-card">
        <h3>偏好设置</h3>

        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 14, color: '#43514b' }}>主题</strong>
          <div className="mobile-segmented" style={{ marginTop: 8 }}>
            {(['light', 'dark', 'auto'] as const).map((t) => (
              <button key={t} className={preferences.theme === t ? 'active' : ''} type="button" onClick={() => handleThemeChange(t)}>
                {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14, color: '#43514b' }}>语言</strong>
          <div className="mobile-segmented two" style={{ marginTop: 8 }}>
            {(['zh-CN', 'en'] as const).map((l) => (
              <button key={l} className={preferences.language === l ? 'active' : ''} type="button" onClick={() => handleLanguageChange(l)}>
                {l === 'zh-CN' ? '简体中文' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14, color: '#43514b' }}>通知偏好</strong>
          {notificationLabels.map(({ key, label }) => (
            <div key={key} className="toggle-row">
              <span>{label}</span>
              <button
                type="button"
                className={`toggle-switch ${preferences.notification_preferences[key] ? 'on' : ''}`}
                onClick={() => handleNotificationToggle(key)}
                disabled={preferenceSaving}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 关于 */}
      <section className="section-card">
        <h3>关于</h3>
        <dl className="info-list">
          <div><dt>版本</dt><dd>v{APP_VERSION_NAME}</dd></div>
        </dl>
      </section>

      {/* 退出登录 */}
      <button className="danger-button" onClick={handleLogout}>
        退出登录
      </button>
    </div>
  )
}

export default SettingsPage
