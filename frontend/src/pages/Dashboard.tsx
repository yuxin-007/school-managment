import React, { useEffect, useMemo, useState } from 'react'
import { priorityColorMap } from '@/features/announcements/constants'
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
import { MetricCard, MetricGrid, PageHero, PageShell } from '@/components/ui/PageScaffold'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const { Text } = Typography

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

const actionCardStyle: React.CSSProperties = {
  cursor: 'pointer',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { user, isLoggedIn } = useAuthStore()
  const { leaveStatusLabel, roleLabel, t } = useI18n()
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
        title: t('dashboard.summary.unread'),
        value: unreadCount,
        icon: <NotificationOutlined />,
        color: '#c2472d',
        path: '/notifications',
      },
      {
        title: isManager ? t('dashboard.summary.pendingAction') : t('dashboard.summary.pendingMine'),
        value: isManager ? pendingLeaves.length : myPendingCount,
        icon: <ClockCircleOutlined />,
        color: '#c97818',
        path: '/leave',
      },
      {
        title: t('dashboard.summary.pinned'),
        value: pinnedAnnouncementCount,
        icon: <BellOutlined />,
        color: '#9f3a2b',
        path: '/announcements',
      },
      {
        title: isManager ? t('dashboard.summary.urgent') : t('dashboard.summary.approvedLeave'),
        value: isManager ? urgentAnnouncementCount : myApprovedCount,
        icon: <FileTextOutlined />,
        color: '#4f8a2f',
        path: isManager ? '/announcements' : '/leave',
      },
    ],
    [isManager, myApprovedCount, myPendingCount, pendingLeaves.length, pinnedAnnouncementCount, t, unreadCount, urgentAnnouncementCount],
  )

  const leaveColumns: ColumnsType<LeaveRecord> = [
    { title: t('dashboard.table.applicant'), dataIndex: 'staff_name', key: 'staff_name' },
    { title: t('dashboard.table.leaveType'), dataIndex: 'leave_type_display', key: 'leave_type_display' },
    { title: t('dashboard.table.days'), dataIndex: 'total_days', key: 'total_days', width: 90 },
    {
      title: t('dashboard.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: LeaveRecord['status']) => <Tag color={leaveStatusColor[value]}>{leaveStatusLabel(value)}</Tag>,
    },
  ]

  const focusItems = [
    t('dashboard.focus.unread', { count: unreadCount }),
    isManager
      ? t('dashboard.focus.pendingManager', { count: pendingLeaves.length })
      : t('dashboard.focus.pendingSelf', { total: leaves.length, pending: myPendingCount }),
    t('dashboard.focus.announcements', { total: announcements.length, pinned: pinnedAnnouncementCount }),
    canSeeOrganizationSummary && organizationOverview
      ? t('dashboard.focus.accessibleUsers', { count: organizationOverview.summary.accessible_users })
      : t('dashboard.focus.primaryOrg', { name: user?.department_name || t('common.notConfiguredPrimaryOrg') }),
  ]

  return (
    <PageShell>
      <PageHero
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <>
          <Tag color={roleColor[user?.role || 'blue']}>{roleLabel(user?.role, user?.role_display)}</Tag>
          {user?.department_name ? <Tag>{user.department_name}</Tag> : null}
          <Button type="primary" onClick={() => navigate(canSeeOrganizationSummary ? '/organization' : '/leave')}>
            {canSeeOrganizationSummary ? t('dashboard.openOrganization') : t('dashboard.openLeave')}
          </Button>
          <Button onClick={() => navigate('/notifications')}>{t('common.messages')}</Button>
          {unreadCount > 0 ? <Badge count={unreadCount} color="var(--brand-primary)" /> : null}
          </>
        }
      />

      <MetricGrid>
        {summaryCards.map((item) => (
          <MetricCard
            key={item.title}
            label={item.title}
            value={item.value}
            icon={item.icon}
            accent={item.color}
            actionLabel={`${t('common.open')} ${item.title}`}
            onActivate={() => navigate(item.path)}
          />
        ))}
      </MetricGrid>

      {canSeeOrganizationSummary && organizationOverview ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title={t('dashboard.organizationNodes')} value={organizationOverview.summary.total_nodes} prefix={<ApartmentOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title={t('dashboard.accessibleUsers')} value={organizationOverview.summary.accessible_users} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/organization')}>
              <Statistic title={t('dashboard.primaryAssignments')} value={organizationOverview.summary.primary_assignments} prefix={<UserAddOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title={t('dashboard.unassignedUsers')} value={organizationOverview.summary.unassigned_users} />
            </Card>
          </Col>
        </Row>
      ) : null}

      {user?.role === 'super_admin' && userStats ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title={t('dashboard.totalUsers')} value={userStats.total_users} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title={t('dashboard.collegeAdmins')} value={userStats.role_distribution?.college_admin || 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title={t('dashboard.staffCount')} value={userStats.role_distribution?.staff || 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card bordered={false} hoverable style={actionCardStyle} onClick={() => navigate('/users')}>
              <Statistic title={t('dashboard.studentCount')} value={userStats.role_distribution?.student || 0} />
            </Card>
          </Col>
        </Row>
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card bordered={false} title={isManager ? t('dashboard.pendingLeave') : t('dashboard.myLeave')}>
            <Table
              rowKey="id"
              columns={leaveColumns}
              dataSource={isManager ? pendingLeaves : leaves}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: isManager ? t('dashboard.empty.pending') : t('dashboard.empty.leave') }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card bordered={false} title={t('dashboard.latestAnnouncements')}>
            <List
              dataSource={announcements.slice(0, 5)}
              locale={{ emptyText: t('dashboard.empty.announcements') }}
              renderItem={(item) => (
                <List.Item style={{ paddingInline: 0 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{item.title}</Text>
                      {item.is_pinned ? <Tag color="volcano">{t('dashboard.pinnedTag')}</Tag> : null}
                      <Tag color={priorityColorMap[item.priority] || 'default'}>{item.priority_display}</Tag>
                    </Space>
                    <Space wrap>
                      <Text type="secondary">{item.category_display}</Text>
                      <Text type="secondary">{t('dashboard.author', { name: item.author_name })}</Text>
                      <Text type="secondary">{item.created_at}</Text>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} title={t('dashboard.systemSummary')}>
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
    </PageShell>
  )
}

export default DashboardPage
