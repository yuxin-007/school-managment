import { Link, useNavigate } from 'react-router-dom'
import { logout } from '@/api'
import { isStudent as isStudentRole } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'

const ProfilePage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.logout)
  const isStudent = isStudentRole(user?.role)

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-stack">
      <section className="profile-card">
        <div className="avatar-mark">{user?.real_name?.slice(0, 1) || user?.username?.slice(0, 1) || '我'}</div>
        <h2>{user?.real_name || user?.username}</h2>
        <p>{user?.role_display || user?.role}</p>
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>账号信息</h3>
          <Link to="/notifications">通知</Link>
        </div>
        <dl className="info-list">
          <div>
            <dt>账号</dt>
            <dd>{user?.username || '-'}</dd>
          </div>
          <div>
            <dt>组织</dt>
            <dd>{user?.department_name || '-'}</dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>{user?.email || '-'}</dd>
          </div>
          <div>
            <dt>手机</dt>
            <dd>{user?.phone || '-'}</dd>
          </div>
        </dl>
      </section>

      <section className="section-card">
        <h3>移动功能</h3>
        <div className="capability-list">
          <Link to="/schedule">我的课表</Link>
          <Link to="/leave">请假申请</Link>
          {isStudent ? <Link to="/grades">我的成绩</Link> : <Link to="/tasks">作业批阅</Link>}
          {isStudent ? <Link to="/freshman-guide">校园导航</Link> : null}
          <Link to="/settings">个人设置</Link>
        </div>
      </section>
    </div>
  )
}

export default ProfilePage
