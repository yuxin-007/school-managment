import { getApiErrorMessage } from '@/lib/errors'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Input,
  List,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  BellOutlined,
  CheckOutlined,
  DeleteOutlined,
  MailOutlined,
  RightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'
import {
  deleteNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from '@/api'

const { Paragraph, Text, Title } = Typography

interface NotificationItem {
  id: number
  title: string
  content: string
  notification_type: string
  type_display?: string
  is_read: boolean
  related_type?: string
  related_id?: number | null
  created_at: string
  read_at?: string
}

const typeColorMap: Record<string, string> = {
  leave_pending: 'orange',
  leave_transfer: 'blue',
  leave_approved: 'green',
  leave_rejected: 'red',
  leave_cancelled: 'default',
  course_change: 'blue',
  course_selected: 'cyan',
  course_dropped: 'orange',
  announcement: 'purple',
  grade_published: 'gold',
  system: 'default',
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { notificationTypeLabel, t } = useI18n()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [readFilter, setReadFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const loadNotifications = async (
    nextReadFilter = readFilter,
    nextTypeFilter = typeFilter,
    nextKeyword = keyword,
  ) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page: 1, per_page: 100 }
      if (nextReadFilter !== 'all') {
        params.is_read = nextReadFilter
      }
      if (nextTypeFilter !== 'all') {
        params.notification_type = nextTypeFilter
      }
      if (nextKeyword.trim()) {
        params.keyword = nextKeyword.trim()
      }

      const res = await getNotifications(params)
      if (res.data.success) {
        setNotifications(res.data.data || [])
      }
    } catch {
      message.error(t('notifications.toast.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const loadUnreadCount = async () => {
    try {
      const res = await getUnreadCount()
      if (res.data.success) {
        setUnreadCount(res.data.data?.unread_count || res.data.data?.unread || 0)
      }
    } catch {
      message.error(t('notifications.toast.unreadFailed'))
    }
  }

  useEffect(() => {
    loadNotifications()
    loadUnreadCount()
    // Initial notification center load; item actions refresh data explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMarkAsRead = async (id: number, silent = false) => {
    setActingId(id)
    try {
      const res = await markAsRead(id)
      if (res.data.success) {
        if (!silent) {
          message.success(res.data.message || t('notifications.toast.markRead'))
        }
        setNotifications((current) =>
          current.map((item) => (item.id === id ? { ...item, is_read: true, read_at: dayjs().format('YYYY-MM-DD HH:mm:ss') } : item)),
        )
        setSelectedNotification((current) =>
          current?.id === id ? { ...current, is_read: true, read_at: dayjs().format('YYYY-MM-DD HH:mm:ss') } : current,
        )
        await loadUnreadCount()
      }
    } catch (error: unknown) {
      if (!silent) {
        message.error(getApiErrorMessage(error, t('notifications.toast.markReadFailed')))
      }
    } finally {
      setActingId(null)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const res = await markAllAsRead()
      if (res.data.success) {
        message.success(res.data.message || t('notifications.toast.markAll'))
        await Promise.all([loadNotifications(), loadUnreadCount()])
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, t('notifications.toast.markAllFailed')))
    }
  }

  const handleDelete = async (id: number) => {
    setActingId(id)
    try {
      const res = await deleteNotification(id)
      if (res.data.success) {
        message.success(res.data.message || t('notifications.toast.delete'))
        setNotifications((current) => current.filter((item) => item.id !== id))
        setSelectedNotification((current) => (current?.id === id ? null : current))
        if (detailVisible && selectedNotification?.id === id) {
          setDetailVisible(false)
        }
        await loadUnreadCount()
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, t('notifications.toast.deleteFailed')))
    } finally {
      setActingId(null)
    }
  }

  const openDetail = async (item: NotificationItem) => {
    setSelectedNotification(item)
    setDetailVisible(true)
    if (!item.is_read) {
      await handleMarkAsRead(item.id, true)
    }
  }

  const getTypeColor = (type: string) => typeColorMap[type] || 'default'
  const getTypeDisplay = useCallback(
    (type: string, fallback?: string) => notificationTypeLabel(type, fallback),
    [notificationTypeLabel],
  )

  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(notifications.map((item) => item.notification_type)))
    return types.map((type) => ({
      label: getTypeDisplay(type),
      value: type,
    }))
  }, [getTypeDisplay, notifications])

  const stats = useMemo(() => {
    return {
      total: notifications.length,
      unread: notifications.filter((item) => !item.is_read).length,
      leave: notifications.filter((item) => item.notification_type.startsWith('leave_')).length,
      announcement: notifications.filter((item) => item.notification_type === 'announcement').length,
    }
  }, [notifications])

  const getNotificationTarget = (item: NotificationItem | null) => {
    if (!item) {
      return null
    }

    if (item.notification_type.startsWith('leave_') || item.related_type === 'LeaveApplication') {
      return { label: t('notifications.target.leave'), path: '/leave' }
    }
    if (item.notification_type.startsWith('assignment_')) {
      return { label: t('notifications.target.assignments'), path: '/course-assignments' }
    }
    if (item.notification_type.startsWith('course_')) {
      return { label: t('notifications.target.course'), path: user?.role === 'student' ? '/course-selection' : '/courses' }
    }
    if (item.notification_type === 'announcement') {
      return { label: t('notifications.target.announcements'), path: '/announcements' }
    }
    if (item.notification_type === 'grade_published') {
      return { label: t('notifications.target.grades'), path: user?.role === 'student' ? '/my-grades' : '/grade-entry' }
    }
    return null
  }

  const selectedTarget = getNotificationTarget(selectedNotification)

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap>
            <Text type="secondary">{t('notifications.titleSmall')}</Text>
            {unreadCount > 0 ? <Tag color="red">{t('notifications.unreadTag', { count: unreadCount })}</Tag> : <Tag color="green">{t('notifications.doneTag')}</Tag>}
          </Space>
          <Title level={3} style={{ margin: 0 }}>
            {t('notifications.title')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 900 }}>
            {t('notifications.description')}
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title={t('notifications.stats.total')} value={stats.total} prefix={<BellOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title={t('notifications.stats.unread')} value={unreadCount} prefix={<MailOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title={t('notifications.stats.leave')} value={stats.leave} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title={t('notifications.stats.announcement')} value={stats.announcement} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      {unreadCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={t('notifications.alert', { count: unreadCount })}
          action={
            <Button type="primary" size="small" onClick={handleMarkAllAsRead}>
              {t('notifications.markAll')}
            </Button>
          }
        />
      ) : null}

      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder={t('notifications.searchPlaceholder')}
                style={{ width: 280 }}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onSearch={(value) => {
                  setKeyword(value)
                  loadNotifications(readFilter, typeFilter, value)
                }}
              />
              <Select
                value={readFilter}
                onChange={(value) => {
                  setReadFilter(value)
                  loadNotifications(value, typeFilter, keyword)
                }}
                style={{ width: 160 }}
                options={[
                  { label: t('notifications.readFilter.all'), value: 'all' },
                  { label: t('notifications.readFilter.unread'), value: 'false' },
                  { label: t('notifications.readFilter.read'), value: 'true' },
                ]}
              />
              <Select
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value)
                  loadNotifications(readFilter, value, keyword)
                }}
                style={{ width: 180 }}
                options={[{ label: t('notifications.typeFilter.all'), value: 'all' }, ...typeOptions]}
              />
            </Space>
            <Text type="secondary">{t('notifications.currentCount', { count: notifications.length })}</Text>
          </Space>

          <List
            itemLayout="vertical"
            loading={loading}
            dataSource={notifications}
            locale={{ emptyText: <Empty description={t('notifications.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                style={{
                  background: item.is_read ? 'transparent' : '#f6fbff',
                  border: item.is_read ? '1px solid #f0f0f0' : '1px solid #bae0ff',
                  borderRadius: 14,
                  padding: '14px 16px',
                  marginBottom: 10,
                }}
                actions={[
                  <Space key="meta" wrap>
                    <Tag color={getTypeColor(item.notification_type)}>{item.type_display || getTypeDisplay(item.notification_type)}</Tag>
                    {!item.is_read ? <Tag color="blue">{t('notifications.unread')}</Tag> : <Tag>{t('notifications.read')}</Tag>}
                    <Text type="secondary">{dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}</Text>
                  </Space>,
                  <Space key="actions" wrap>
                    {!item.is_read ? (
                      <Button
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        loading={actingId === item.id}
                        onClick={() => handleMarkAsRead(item.id)}
                      >
                        {t('notifications.markRead')}
                      </Button>
                    ) : null}
                    <Button type="link" size="small" onClick={() => openDetail(item)}>
                      {t('common.viewDetails')}
                    </Button>
                    <Popconfirm title={t('notifications.deleteConfirm')} onConfirm={() => handleDelete(item.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} loading={actingId === item.id}>
                        {t('common.delete')}
                      </Button>
                    </Popconfirm>
                  </Space>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {!item.is_read ? <Badge status="processing" /> : null}
                      <Text strong={!item.is_read} style={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                        {item.title}
                      </Text>
                    </Space>
                  }
                  description={null}
                />
                <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                  {item.content}
                </Paragraph>
              </List.Item>
            )}
          />
        </Space>
      </Card>

      <Drawer
        title={t('notifications.detail')}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        width={680}
        destroyOnClose
        extra={
          selectedTarget ? (
            <Button
              type="primary"
              icon={<RightOutlined />}
              onClick={() => {
                navigate(selectedTarget.path)
                setDetailVisible(false)
              }}
            >
              {selectedTarget.label}
            </Button>
          ) : null
        }
      >
        {selectedNotification ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card bordered={false} style={{ background: '#fafafa' }}>
              <Space direction="vertical" size={6}>
                <Space wrap>
                  <Text strong style={{ fontSize: 18 }}>
                    {selectedNotification.title}
                  </Text>
                  <Tag color={getTypeColor(selectedNotification.notification_type)}>
                    {selectedNotification.type_display || getTypeDisplay(selectedNotification.notification_type)}
                  </Tag>
                  {!selectedNotification.is_read ? <Tag color="blue">{t('notifications.unread')}</Tag> : <Tag>{t('notifications.read')}</Tag>}
                </Space>
                <Text type="secondary">
                  {t('notifications.createdAt', { time: dayjs(selectedNotification.created_at).format('YYYY-MM-DD HH:mm:ss') })}
                </Text>
              </Space>
            </Card>

            <Card bordered={false} title={t('notifications.content')}>
              <Paragraph style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{selectedNotification.content}</Paragraph>
              <Space wrap>
                {selectedNotification.read_at ? (
                  <Tag icon={<CheckOutlined />}>{t('notifications.readAt', { time: selectedNotification.read_at })}</Tag>
                ) : (
                  <Tag color="blue">{t('notifications.stillUnread')}</Tag>
                )}
                {selectedNotification.related_type ? <Tag>{t('notifications.relatedType', { type: selectedNotification.related_type })}</Tag> : null}
                {selectedNotification.related_id ? <Tag>{t('notifications.relatedRecord', { id: selectedNotification.related_id })}</Tag> : null}
              </Space>
            </Card>
          </Space>
        ) : (
          <Empty description={t('notifications.emptyDetail')} />
        )}
      </Drawer>
    </Space>
  )
}

export default NotificationsPage
