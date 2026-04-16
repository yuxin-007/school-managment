import React, { useState, useEffect } from 'react'
import {
  Card, Table, Select, DatePicker, Tag, message, Typography, Row, Col,
  Statistic, Space, Button, Input, Drawer
} from 'antd'
import {
  FileTextOutlined, SearchOutlined, UserOutlined, GlobalOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useAuthStore } from '@/store/authStore'
import { getLogs, getLogStats } from '@/api'

const { Paragraph, Text, Title } = Typography
const { RangePicker } = DatePicker

interface LogItem {
  id: number
  user_id: number
  user_name: string
  action: string
  action_display: string
  target_type: string
  target_id: number | null
  target_name: string
  detail: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const actionOptions = [
  { label: '全部操作', value: '' },
  { label: '登录', value: 'login' },
  { label: '登出', value: 'logout' },
  { label: '创建用户', value: 'create_user' },
  { label: '更新用户', value: 'update_user' },
  { label: '删除用户', value: 'delete_user' },
  { label: '创建课程', value: 'create_course' },
  { label: '更新课程', value: 'update_course' },
  { label: '删除课程', value: 'delete_course' },
  { label: '选课', value: 'select_course' },
  { label: '退选', value: 'drop_course' },
  { label: '提交请假', value: 'create_leave' },
  { label: '审批请假', value: 'approve_leave' },
  { label: '拒绝请假', value: 'reject_leave' },
  { label: '取消请假', value: 'cancel_leave' },
  { label: '发布公告', value: 'create_announcement' },
  { label: '更新公告', value: 'update_announcement' },
  { label: '删除公告', value: 'delete_announcement' },
  { label: '打卡上班', value: 'attendance_clock_in' },
  { label: '打卡下班', value: 'attendance_clock_out' },
  { label: '录入成绩', value: 'grade_entry' },
  { label: '更新成绩', value: 'grade_update' },
]

const LogsPage: React.FC = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'super_admin'

  const [logs, setLogs] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    week: 0,
    by_action: {} as Record<string, { count: number; display: string }>
  })
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })
  const [filters, setFilters] = useState({
    action: '',
    keyword: '',
    start_date: '',
    end_date: ''
  })
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null)

  const loadLogs = async (page = 1, filterParams = filters) => {
    if (!isAdmin) return

    setLoading(true)
    try {
      const params: any = { page, per_page: pagination.pageSize, ...filterParams }
      if (params.start_date) {
        params.start_date = dayjs(params.start_date).format('YYYY-MM-DD')
      }
      if (params.end_date) {
        params.end_date = dayjs(params.end_date).format('YYYY-MM-DD')
      }

      const res = await getLogs(params)
      if (res.data.success) {
        setLogs(res.data.data || [])
        setPagination(prev => ({
          ...prev,
          current: res.data.pagination?.page || page,
          total: res.data.pagination?.total || 0
        }))
      }
    } catch (error) {
      message.error('加载日志失败')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await getLogStats()
      if (res.data.success) {
        setStats(res.data.data)
      }
    } catch (error) {
      console.error('加载统计失败')
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadLogs()
      loadStats()
    }
  }, [isAdmin])

  const handleSearch = () => {
    loadLogs(1, filters)
  }

  const handleReset = () => {
    setFilters({ action: '', keyword: '', start_date: '', end_date: '' })
    loadLogs(1, { action: '', keyword: '', start_date: '', end_date: '' })
  }

  const handlePageChange = (page: number) => {
    loadLogs(page, filters)
  }

  const handleDateChange = (dates: any, dateStrings: [string, string]) => {
    setFilters(prev => ({
      ...prev,
      start_date: dateStrings[0],
      end_date: dateStrings[1]
    }))
  }

  const handleViewDetail = (record: LogItem) => {
    setSelectedLog(record)
    setDrawerVisible(true)
  }

  const getActionColor = (action: string) => {
    const colorMap: Record<string, string> = {
      login: 'blue',
      logout: 'default',
      create_user: 'green',
      update_user: 'cyan',
      delete_user: 'red',
      create_course: 'green',
      update_course: 'cyan',
      delete_course: 'red',
      select_course: 'blue',
      drop_course: 'orange',
      create_leave: 'green',
      approve_leave: 'success',
      reject_leave: 'error',
      cancel_leave: 'default',
      create_announcement: 'green',
      update_announcement: 'cyan',
      delete_announcement: 'red',
      attendance_clock_in: 'blue',
      attendance_clock_out: 'purple',
      grade_entry: 'green',
      grade_update: 'cyan',
    }
    return colorMap[action] || 'default'
  }

  const columns: ColumnsType<LogItem> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
    {
      title: '操作用户',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 120,
    },
    {
      title: '操作类型',
      dataIndex: 'action_display',
      key: 'action_display',
      width: 120,
      render: (_, record) => (
        <Tag color={getActionColor(record.action)}>{record.action_display}</Tag>
      )
    },
    {
      title: '操作对象',
      dataIndex: 'target_name',
      key: 'target_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
          详情
        </Button>
      )
    }
  ]

  if (!isAdmin) {
    return (
      <Card>
        <Text type="secondary">您没有权限访问操作日志页面</Text>
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary">操作日志</Text>
          <Title level={3} style={{ margin: 0 }}>
            查看系统中的关键操作记录
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 860 }}>
            这里汇总用户、课程、请假、公告、考勤等模块的关键操作，便于按时间、关键词和类型追踪系统行为。
          </Paragraph>
        </Space>
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 24 }}
        title={
          <Space>
            <FileTextOutlined />
            <span>日志列表</span>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic
              title="总记录数"
              value={stats.total}
              prefix={<FileTextOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="今日"
              value={stats.today}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="本周"
              value={stats.week}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Text type="secondary">
              <GlobalOutlined /> 共 {Object.keys(stats.by_action).length} 种操作类型
            </Text>
          </Col>
        </Row>

        <Space wrap style={{ width: '100%', marginBottom: 16, justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              placeholder="搜索关键词"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
              onPressEnter={handleSearch}
              style={{ width: 240 }}
            />
            <Select
              value={filters.action}
              onChange={(value) => setFilters(prev => ({ ...prev, action: value }))}
              options={actionOptions}
              style={{ width: 180 }}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <RangePicker
              onChange={handleDateChange}
            />
          </Space>
          <Space>
            <Button type="primary" onClick={handleSearch}>查询</Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            onChange: handlePageChange,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          scroll={{ y: 500 }}
        />
      </Card>

      <Drawer
        title="日志详情"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={500}
      >
        {selectedLog && (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Text strong>操作时间：</Text>
              <br />
              <Text>{selectedLog.created_at}</Text>
            </Col>
            <Col span={24}>
              <Text strong>操作用户：</Text>
              <br />
              <Text>{selectedLog.user_name}</Text>
            </Col>
            <Col span={24}>
              <Text strong>操作类型：</Text>
              <br />
              <Tag color={getActionColor(selectedLog.action)}>
                {selectedLog.action_display}
              </Tag>
            </Col>
            <Col span={24}>
              <Text strong>操作对象：</Text>
              <br />
              <Text>{selectedLog.target_name || '-'}</Text>
            </Col>
            <Col span={24}>
              <Text strong>对象类型：</Text>
              <br />
              <Text>{selectedLog.target_type || '-'}</Text>
            </Col>
            <Col span={24}>
              <Text strong>对象ID：</Text>
              <br />
              <Text>{selectedLog.target_id || '-'}</Text>
            </Col>
            <Col span={24}>
              <Text strong>操作详情：</Text>
              <br />
              <Text>{selectedLog.detail || '-'}</Text>
            </Col>
            <Col span={24}>
              <Text strong>IP地址：</Text>
              <br />
              <Text>{selectedLog.ip_address || '-'}</Text>
            </Col>
            <Col span={24}>
              <Text strong>浏览器信息：</Text>
              <br />
              <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {selectedLog.user_agent || '-'}
              </Text>
            </Col>
          </Row>
        )}
      </Drawer>
    </Space>
  )
}

export default LogsPage
