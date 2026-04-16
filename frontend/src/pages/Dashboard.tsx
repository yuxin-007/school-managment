import React, { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Col, List, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import {
  ApartmentOutlined,
  BellOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  NotificationOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import {
  getAnnouncements,
  getLeaveApplications,
  getOrganizationOverview,
  getPendingLeave,
  getUnreadCount,
  getUserStatistics,
} from '@/api'
import type { OrganizationOverview } from '@/features/organization/types'
import { brandPalette } from '@/lib/designSystem'
import { useAuthStore } from '@/store/authStore'

const { Paragraph, Text, Title } = Typography

interface LeaveRecord {
  id: number
  staff_name: string
  leave_type_display: string
  total_days: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  created_at?: string
}

interface AnnouncementRecord {
  id: number
  title: string
  category_display: string
  priority: string
  priority_display: string
  author_name: string
  is_pinned: boolean
  created_at: string
  view_count: number
}

interface UserStatistics {
  total_users: number
  role_distribution?: Record<string, number>
}

const roleColor: Record<string, string> = {
  super_admin: 'red',
  college_admin: 'orange',
  staff: 'blue',
  student: 'green',
}

const leaveStatusColor: Record<LeaveRecord['status'], string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
}

const leaveStatusText: Record<LeaveRecord['status'], string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已取消',
}

const priorityColorMap: Record<string, string> = {
  normal: 'default',
  important: 'orange',
  urgent: 'red',
}

const actionCardStyle: React.CSSProperties = {
  borderRadius: 20,
  cursor: 'pointer',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { user, isLoggedIn } = useAuthStore()
  const [userStats, setUserStats] = useState<UserStatistics | null>(null)
  const [organizationOverview, setOrganizationOverview] = useState<OrganizationOverview | null>(null)
  const [leaves, setLeaves] = useState<LeaveRecord[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRecord[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const isManager = user?.role === 'super_admin' || user?.role === 'college_admin' || user?.role === 'staff'
  const canSeeOrganizationSummary = user?.role === 'super_admin' || user?.role === 'college_admin'

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login')
      return
    }

    if (user?.role === 'super_admin') {
      getUserStatistics()
        .then((response) => {
          if (response.data.success) {
            setUserStats(response.data.data)
          }
        })
        .catch(() => {})
    }

    if (canSeeOrganizationSummary) {
      getOrganizationOverview()
        .then((response) => {
          if (response.data.success) {
            setOrganizationOverview(response.data.data)
          }
        })
        .catch(() => {})
    }

    getLeaveApplications()
      .then((response) => {
        if (response.data.success) {
          setLeaves((response.data.data || []).slice(0, 5))
        }
      })
      .catch(() => {})

    if (isManager) {
      getPendingLeave()
        .then((response) => {
          if (response.data.success) {
            setPendingLeaves((response.data.data || []).slice(0, 5))
          }
        })
        .catch(() => {})
    }

    getAnnouncements({ per_page: 6 })
      .then((response) => {
        if (response.data.success) {
          setAnnouncements(response.data.data || [])
        }
      })
      .catch(() => {})

    getUnreadCount()
      .then((response) => {
        if (response.data.success) {
          setUnreadCount(response.data.data?.unread_count || response.data.data?.unread || 0)
        }
      })
      .catch(() => {})
  }, [canSeeOrganizationSummary, isLoggedIn, isManager, navigate, user?.role])

  const myPendingCount = leaves.filter((item) => item.status === 'pending').length
  const myApprovedCount = leaves.filter((item) => item.status === 'approved').length
  const urgentAnnouncementCount = announcements.filter((item) => item.priority === 'urgent').length
  const pinnedAnnouncementCount = announcements.filter((item) => item.is_pinned).length
  const summaryCards = useMemo(
    () => [
      {
        title: '未读通知',
        value: unreadCount,
        icon: <NotificationOutlined />,
        color: '#c2472d',
        path: '/notifications',
      },
      {
        title: isManager ? '待我处理' : '我的待审批',
        value: isManager ? pendingLeaves.length : myPendingCount,
        icon: <ClockCircleOutlined />,
        color: '#c97818',
        path: '/leave',
      },
      {
        title: '置顶公告',
        value: pinnedAnnouncementCount,
        icon: <BellOutlined />,
        color: '#9f3a2b',
        path: '/announcements',
      },
      {
        title: isManager ? '紧急公告' : '已批准请假',
        value: isManager ? urgentAnnouncementCount : myApprovedCount,
        icon: <FileTextOutlined />,
        color: '#4f8a2f',
        path: isManager ? '/announcements' : '/leave',
      },
    ],
    [isManager, myApprovedCount, myPendingCount, pendingLeaves.length, pinnedAnnouncementCount, unreadCount, urgentAnnouncementCount],
  )

  const leaveColumns: ColumnsType<LeaveRecord> = [
    { title: '申请人', dataIndex: 'staff_name', key: 'staff_name' },
    { title: '请假类型', dataIndex: 'leave_type_display', key: 'leave_type_display' },
    { title: '天数', dataIndex: 'total_days', key: 'total_days', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: LeaveRecord['status']) => <Tag color={leaveStatusColor[value]}>{leaveStatusText[value]}</Tag>,
    },
  ]

  const focusItems = [
    `当前未读通知 ${unreadCount} 条。`,
    isManager
      ? `当前待审批请假 ${pendingLeaves.length} 条。`
      : `我的请假记录 ${leaves.length} 条，其中待审批 ${myPendingCount} 条。`,
    `当前共有公告 ${announcements.length} 条，其中置顶公告 ${pinnedAnnouncementCount} 条。`,
    canSeeOrganizationSummary && organizationOverview
      ? `当前组织范围内可见人员 ${organizationOverview.summary.accessible_users} 人。`
      : `当前主组织为 ${user?.department_name || '未配置主组织'}。`,
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          background:
            'linear-gradient(135deg, rgba(255,245,230,0.96) 0%, rgba(252,248,242,0.94) 48%, rgba(244,249,255,0.92) 100%)',
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} xl={16}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Space wrap>
                <Text type="secondary">系统总览</Text>
                <Tag color={roleColor[user?.role || 'blue']}>{user?.role_display || '未识别角色'}</Tag>
                {user?.department_name ? <Tag>{user.department_name}</Tag> : null}
                <Badge count={unreadCount} showZero color={brandPalette.primary} />
              </Space>

              <Title level={3} style={{ margin: 0 }}>
                欢迎回来，{user?.real_name}
              </Title>

              <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 900, lineHeight: 1.85 }}>
                首页集中展示组织、课程、请假、公告和通知等核心数据，
                你可以从下方卡片和列表直接进入对应模块。
              </Paragraph>

              <Space wrap>
                <Button type="primary" onClick={() => navigate(canSeeOrganizationSummary ? '/organization' : '/leave')}>
                  {canSeeOrganizationSummary ? '进入组织中心' : '进入请假管理'}
                </Button>
                <Button onClick={() => navigate('/notifications')}>通知中心</Button>
                <Button onClick={() => navigate('/announcements')}>公告中心</Button>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {summaryCards.map((item) => (
          <Col xs={12} lg={6} key={item.title}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate(item.path)}>
              <Statistic title={item.title} value={item.value} prefix={item.icon} valueStyle={{ color: item.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {canSeeOrganizationSummary && organizationOverview ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title="组织节点数" value={organizationOverview.summary.total_nodes} prefix={<ApartmentOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title="可见人员数" value={organizationOverview.summary.accessible_users} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title="主归属关系" value={organizationOverview.summary.primary_assignments} prefix={<UserAddOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title="待归档人员" value={organizationOverview.summary.unassigned_users} />
            </Card>
          </Col>
        </Row>
      ) : null}

      {user?.role === 'super_admin' && userStats ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title="系统总用户" value={userStats.total_users} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title="学院管理员" value={userStats.role_distribution?.college_admin || 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title="教职工人数" value={userStats.role_distribution?.staff || 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title="学生人数" value={userStats.role_distribution?.student || 0} />
            </Card>
          </Col>
        </Row>
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card bordered={false} style={{ borderRadius: 24 }} title={isManager ? '待处理请假' : '我的请假'}>
            <Table
              rowKey="id"
              columns={leaveColumns}
              dataSource={isManager ? pendingLeaves : leaves}
              pagination={false}
              locale={{ emptyText: isManager ? '当前没有待处理请假' : '当前没有请假记录' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card bordered={false} style={{ borderRadius: 24 }} title="最新公告">
            <List
              dataSource={announcements.slice(0, 5)}
              locale={{ emptyText: '当前暂无公告' }}
              renderItem={(item) => (
                <List.Item style={{ paddingInline: 0 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.title}</Text>
                      {item.is_pinned ? <Tag color="volcano">置顶</Tag> : null}
                      <Tag color={priorityColorMap[item.priority] || 'default'}>{item.priority_display}</Tag>
                    </Space>
                    <Space wrap>
                      <Text type="secondary">{item.category_display}</Text>
                      <Text type="secondary">发布人：{item.author_name}</Text>
                      <Text type="secondary">{item.created_at}</Text>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 24 }} title="系统摘要">
        <List
          split={false}
          dataSource={focusItems}
          renderItem={(item) => (
            <List.Item style={{ paddingInline: 0 }}>
              <Text>{item}</Text>
            </List.Item>
          )}
        />
      </Card>
    </Space>
  )
}

export default DashboardPage
