import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getProfile, login } from '@/api'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'

const LoginPage = () => {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim()) {
      setError('请输入账号')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login({ username: username.trim(), password })
      const profile = await getProfile()
      setUser(profile.data.data)
      navigate('/home', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, '登录失败，请检查账号和网络。'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <span className="eyebrow">Campus Mobile</span>
        <h1>校园管理 App</h1>
        <p>把签到、课程、作业、通知放进手机里的日常工作流。</p>
      </section>

      <form className="login-card" onSubmit={handleSubmit}>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary-button" disabled={loading}>
          {loading ? '登录中...' : '登录 App'}
        </button>
        <div className="login-links">
          <Link to="/forgot-password">忘记密码?</Link>
          <Link to="/forgot-password?mode=email_login">邮箱验证码登录</Link>
        </div>
      </form>
    </main>
  )
}

export default LoginPage
