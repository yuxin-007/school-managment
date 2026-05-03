import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/api'
import { normalizeNotificationItems } from '@/lib/mobileDashboard'
import { getNotificationActionLabel, getNotificationTargetPath } from '@/lib/notificationFlow'
import { getApiErrorMessage } from '@/lib/request'
import type { NotificationItem } from '@/types'

const NotificationsPage = () => {
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getNotifications()
      setItems(normalizeNotificationItems(response.data))
    } catch (err) {
      setError(getApiErrorMessage(err, '通知加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const markLocalRead = (notificationId: number) => {
    setItems((current) => current.map((entry) => (entry.id === notificationId ? { ...entry, is_read: true } : entry)))
  }

  const handleOpen = async (item: NotificationItem) => {
    setError('')
    setActiveId(item.id)
    try {
      if (!item.is_read) {
        await markNotificationRead(item.id)
        markLocalRead(item.id)
      }

      const targetPath = getNotificationTargetPath(item)
      if (targetPath) {
        navigate(targetPath)
      } else if (!item.is_read) {
        setMessage('已标记为已读')
      }
    } catch (err) {
      setError(getApiErrorMessage(err, '通知处理失败'))
    } finally {
      setActiveId(null)
    }
  }

  const handleReadAll = async () => {
    if (!unreadCount) return
    setError('')
    setMessage('')
    try {
      await markAllNotificationsRead()
      setItems((current) => current.map((item) => ({ ...item, is_read: true })))
      setMessage('已全部标记为已读')
    } catch (err) {
      setError(getApiErrorMessage(err, '标记失败'))
    }
  }

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Notifications</span>
        <h2>通知</h2>
      </section>
      {loading ? <div className="notice-line">正在同步通知...</div> : null}
      {message ? <div className="notice-line">{message}</div> : null}
      {error ? <div className="form-error">{error}</div> : null}
      <section className="section-card">
        <div className="section-head">
          <h3>消息列表</h3>
          <button className="text-button" disabled={!unreadCount} onClick={handleReadAll}>
            全部已读
          </button>
        </div>
        {items.map((item) => (
          <button
            className={`notification-row ${item.is_read ? '' : 'unread'}`}
            disabled={activeId === item.id}
            key={item.id}
            onClick={() => handleOpen(item)}
          >
            <span>{item.title}</span>
            <strong>{item.content}</strong>
            <em>{item.created_at}</em>
            <small>{activeId === item.id ? '处理中' : getNotificationActionLabel(item)}</small>
          </button>
        ))}
        {!items.length && !loading ? <p className="empty-text">暂无通知</p> : null}
      </section>
    </div>
  )
}

export default NotificationsPage
