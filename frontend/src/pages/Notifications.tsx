import React, { useEffect, useMemo, useState } from 'react'
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
  NotificationOutlined,
  RightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
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

const typeDisplayMap: Record<string, string> = {
  leave_pending: '待审批请假',
  leave_transfer: '审批已转交',
  leave_approved: '请假已通过',
  leave_rejected: '请假已驳回',
  leave_cancelled: '请假已取消',
  course_change: '课程变动',
  course_selected: '选课成功',
  course_dropped: '课程退选',
  announcement: '公告通知',
  grade_published: '成绩发布',
  system: '系统通知',
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
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
      const params: Record<string, any> = { page: 1, per_page: 100 }
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
      message.error('加载通知失败')
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
      message.error('加载未读通知数量失败')
    }
  }

  useEffect(() => {
    loadNotifications()
    loadUnreadCount()
  }, [])

  const handleMarkAsRead = async (id: number, silent = false) => {
    setActingId(id)
    try {
      const res = await markAsRead(id)
      if (res.data.success) {
        if (!silent) {
          message.success(res.data.message || '通知已标记为已读')
        }
        setNotifications((current) =>
          current.map((item) => (item.id === id ? { ...item, is_read: true, read_at: dayjs().format('YYYY-MM-DD HH:mm:ss') } : item)),
        )
        setSelectedNotification((current) =>
          current?.id === id ? { ...current, is_read: true, read_at: dayjs().format('YYYY-MM-DD HH:mm:ss') } : current,
        )
        await loadUnreadCount()
      }
    } catch (error: any) {
      if (!silent) {
        message.error(error.response?.data?.message || '标记已读失败')
      }
    } finally {
      setActingId(null)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const res = await markAllAsRead()
      if (res.data.success) {
        message.success(res.data.message || '全部已标记为已读')
        await Promise.all([loadNotifications(), loadUnreadCount()])
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '标记全部已读失败')
    }
  }

  const handleDelete = async (id: number) => {
    setActingId(id)
    try {
      const res = await deleteNotification(id)
      if (res.data.success) {
        message.success(res.data.message || '通知已删除')
        setNotifications((current) => current.filter((item) => item.id !== id))
        setSelectedNotification((current) => (current?.id === id ? null : current))
        if (detailVisible && selectedNotification?.id === id) {
          setDetailVisible(false)
        }
        await loadUnreadCount()
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除通知失败')
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
  const getTypeDisplay = (type: string) => typeDisplayMap[type] || type

  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(notifications.map((item) => item.notification_type)))
    return types.map((type) => ({
      label: getTypeDisplay(type),
      value: type,
    }))
  }, [notifications])

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
      return { label: '打开请假管理', path: '/leave' }
    }
    if (item.notification_type.startsWith('course_')) {
      return { label: '打开课程模块', path: user?.role === 'student' ? '/course-selection' : '/courses' }
    }
    if (item.notification_type === 'announcement') {
      return { label: '打开公告中心', path: '/announcements' }
    }
    if (item.notification_type === 'grade_published') {
      return { label: '打开成绩页面', path: user?.role === 'student' ? '/my-grades' : '/grade-entry' }
    }
    return null
  }

  const selectedTarget = getNotificationTarget(selectedNotification)

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap>
            <Text type="secondary">消息通知</Text>
            {unreadCount > 0 ? <Tag color="red">未读 {unreadCount}</Tag> : <Tag color="green">已全部处理</Tag>}
          </Space>
          <Title level={3} style={{ margin: 0 }}>
            集中查看提醒、结果通知和业务变更
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 900 }}>
            这里汇总请假、课程、公告和系统消息，支持筛选未读通知并直接进入对应业务页面。
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="当前列表" value={stats.total} prefix={<BellOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="未读通知" value={unreadCount} prefix={<MailOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="请假相关" value={stats.leave} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="公告提醒" value={stats.announcement} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      {unreadCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`当前还有 ${unreadCount} 条未读通知`}
          action={
            <Button type="primary" size="small" onClick={handleMarkAllAsRead}>
              全部标为已读
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
                placeholder="搜索通知标题或内容"
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
                  { label: '全部状态', value: 'all' },
                  { label: '仅看未读', value: 'false' },
                  { label: '仅看已读', value: 'true' },
                ]}
              />
              <Select
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value)
                  loadNotifications(readFilter, value, keyword)
                }}
                style={{ width: 180 }}
                options={[{ label: '全部类型', value: 'all' }, ...typeOptions]}
              />
            </Space>
            <Text type="secondary">当前展示 {notifications.length} 条通知</Text>
          </Space>

          <List
            itemLayout="vertical"
            loading={loading}
            dataSource={notifications}
            locale={{ emptyText: <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
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
                    {!item.is_read ? <Tag color="blue">未读</Tag> : <Tag>已读</Tag>}
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
                        标为已读
                      </Button>
                    ) : null}
                    <Button type="link" size="small" onClick={() => openDetail(item)}>
                      查看详情
                    </Button>
                    <Popconfirm title="确定删除这条通知？" onConfirm={() => handleDelete(item.id)}>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={actingId === item.id}
                      >
                        删除
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
        title="通知详情"
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
                  {!selectedNotification.is_read ? <Tag color="blue">未读</Tag> : <Tag>已读</Tag>}
                </Space>
                <Text type="secondary">
                  创建时间：{dayjs(selectedNotification.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              </Space>
            </Card>

            <Card bordered={false} title="通知内容">
              <Paragraph style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{selectedNotification.content}</Paragraph>
              <Space wrap>
                {selectedNotification.read_at ? (
                  <Tag icon={<CheckOutlined />}>已读时间：{selectedNotification.read_at}</Tag>
                ) : (
                  <Tag color="blue">当前仍未读</Tag>
                )}
                {selectedNotification.related_type ? <Tag>关联类型：{selectedNotification.related_type}</Tag> : null}
                {selectedNotification.related_id ? <Tag>关联记录：{selectedNotification.related_id}</Tag> : null}
              </Space>
            </Card>
          </Space>
        ) : (
          <Empty description="暂无通知详情" />
        )}
      </Drawer>
    </Space>
  )
}

export default NotificationsPage








