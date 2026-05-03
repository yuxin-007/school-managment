import { getApiErrorMessage, getBrowserErrorCode } from '@/lib/errors'
import { getCurrentLocation } from '@/lib/geolocation'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  LoginOutlined,
  LogoutOutlined,
  SolutionOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  approveAttendanceSupplement,
  batchApproveAttendanceSupplements,
  batchRejectAttendanceSupplements,
  cancelAttendanceSupplement,
  clockIn,
  clockOut,
  createAttendanceSupplement,
  getMyAttendanceSupplements,
  getPendingAttendanceSupplements,
  getTodayAttendance,
  rejectAttendanceSupplement,
} from '@/api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

type SupplementStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
type SupplementType = 'clock_in' | 'clock_out'
type ApprovalAction = 'approve' | 'reject'
type ApprovalMode = 'single' | 'batch'

interface AttendanceRecord {
  id: number
  attendance_date: string
  clock_in?: string
  clock_out?: string
  status: string
  status_display?: string
  remark?: string
}

interface AttendancePolicy {
  attendance_enabled: boolean
  require_location: boolean
  location_name?: string
  latitude?: number | null
  longitude?: number | null
  radius_meters?: number
  check_in_start?: string
  check_in_end?: string
  check_out_start?: string
  check_out_end?: string
  updated_at?: string
}

interface LocationLog {
  id?: number
  punch_type?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  distance_meters?: number
  within_range?: boolean
  location_name?: string
  created_at?: string
}

interface AttendanceSupplementItem {
  id: number
  user_name: string
  attendance_date: string
  supplement_type: SupplementType
  supplement_type_display: string
  requested_time: string
  reason: string
  status: SupplementStatus
  status_display: string
  current_approver_name?: string
  final_approver_name?: string
  approval_comments?: string
  requester_primary_node_name?: string
  created_at: string
}

interface ApprovalModalState {
  open: boolean
  mode: ApprovalMode
  action: ApprovalAction
  ids: number[]
  title: string
}

const supplementStatusColorMap: Record<SupplementStatus, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
}

const AttendancePage: React.FC = () => {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null)
  const [locationLogs, setLocationLogs] = useState<LocationLog[]>([])
  const [mySupplements, setMySupplements] = useState<AttendanceSupplementItem[]>([])
  const [pendingSupplements, setPendingSupplements] = useState<AttendanceSupplementItem[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<SupplementType | null>(null)
  const [submittingSupplement, setSubmittingSupplement] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const [selectedPendingIds, setSelectedPendingIds] = useState<number[]>([])
  const [supplementModalOpen, setSupplementModalOpen] = useState(false)
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState>({
    open: false,
    mode: 'single',
    action: 'approve',
    ids: [],
    title: '',
  })
  const [supplementForm] = Form.useForm()
  const [approvalForm] = Form.useForm()

  const loadToday = async () => {
    setLoading(true)
    try {
      const response = await getTodayAttendance()
      setTodayRecord(response.data.data || null)
      setPolicy(response.data.policy || null)
      setLocationLogs(response.data.location_logs || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '考勤信息加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  const loadSupplements = async () => {
    try {
      const [mineResponse, pendingResponse] = await Promise.all([
        getMyAttendanceSupplements(),
        getPendingAttendanceSupplements(),
      ])
      setMySupplements(mineResponse.data.data || [])
      setPendingSupplements(pendingResponse.data.data || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '补签申请加载失败。'))
    }
  }

  useEffect(() => {
    loadToday()
    loadSupplements()
  }, [])

  useEffect(() => {
    setSelectedPendingIds((previous) =>
      previous.filter((id) => pendingSupplements.some((item) => item.id === id)),
    )
  }, [pendingSupplements])

  const handlePunch = async (type: SupplementType) => {
    setActionLoading(type)
    try {
      const location = await getCurrentLocation()
      const response = type === 'clock_in' ? await clockIn(location) : await clockOut(location)
      message.success(response.data.message || (type === 'clock_in' ? '上班打卡成功。' : '下班打卡成功。'))
      await loadToday()
    } catch (error: unknown) {
      if (getBrowserErrorCode(error) === 1) {
        message.error('定位权限被拒绝，请允许浏览器访问定位后再打卡。')
      } else if (getBrowserErrorCode(error) === 2) {
        message.error('无法获取当前位置，请检查定位服务是否开启。')
      } else if (getBrowserErrorCode(error) === 3) {
        message.error('定位超时，请在网络和定位稳定后重试。')
      } else {
        message.error(getApiErrorMessage(error, '打卡失败。'))
      }
    } finally {
      setActionLoading(null)
    }
  }

  const handleOpenSupplementModal = () => {
    supplementForm.setFieldsValue({
      attendance_date: dayjs(),
      supplement_type: todayRecord?.clock_in ? 'clock_out' : 'clock_in',
      requested_time: null,
      reason: '',
    })
    setSupplementModalOpen(true)
  }

  const handleSubmitSupplement = async () => {
    const values = await supplementForm.validateFields()
    setSubmittingSupplement(true)
    try {
      const response = await createAttendanceSupplement({
        attendance_date: values.attendance_date.format('YYYY-MM-DD'),
        supplement_type: values.supplement_type,
        requested_time: values.requested_time.format('HH:mm'),
        reason: values.reason.trim(),
      })
      message.success(response.data.message || '补签申请已提交。')
      setSupplementModalOpen(false)
      supplementForm.resetFields()
      await Promise.all([loadToday(), loadSupplements()])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '补签申请提交失败。'))
    } finally {
      setSubmittingSupplement(false)
    }
  }

  const openApprovalModal = (action: ApprovalAction, ids: number[], mode: ApprovalMode, title: string) => {
    approvalForm.setFieldsValue({ comments: '' })
    setApprovalModal({ open: true, action, ids, mode, title })
  }

  const handleWithdrawSupplement = (item: AttendanceSupplementItem) => {
    Modal.confirm({
      title: '撤回补签申请',
      content: `确认撤回 ${item.attendance_date} ${item.supplement_type_display} 申请吗？`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: async () => {
        setWithdrawingId(item.id)
        try {
          const response = await cancelAttendanceSupplement(item.id)
          message.success(response.data.message || '补签申请已撤回。')
          await loadSupplements()
        } catch (error: unknown) {
          message.error(getApiErrorMessage(error, '撤回补签申请失败。'))
        } finally {
          setWithdrawingId(null)
        }
      },
    })
  }

  const handleSubmitApproval = async () => {
    const values = await approvalForm.validateFields()
    const comments = values.comments?.trim() || ''
    setReviewSubmitting(true)
    try {
      let response
      if (approvalModal.mode === 'single') {
        const id = approvalModal.ids[0]
        response =
          approvalModal.action === 'approve'
            ? await approveAttendanceSupplement(id, { comments })
            : await rejectAttendanceSupplement(id, { comments })
      } else {
        response =
          approvalModal.action === 'approve'
            ? await batchApproveAttendanceSupplements({ request_ids: approvalModal.ids, comments })
            : await batchRejectAttendanceSupplements({ request_ids: approvalModal.ids, comments })
      }

      message.success(
        response.data.message ||
          (approvalModal.action === 'approve' ? '补签申请已批准。' : '补签申请已驳回。'),
      )
      setApprovalModal({ open: false, action: 'approve', ids: [], mode: 'single', title: '' })
      approvalForm.resetFields()
      setSelectedPendingIds([])
      await Promise.all([loadToday(), loadSupplements()])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '补签审批失败。'))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const latestLocationLog = locationLogs.length > 0 ? locationLogs[locationLogs.length - 1] : null
  const isOnLeaveToday = todayRecord?.status === 'on_leave'
  const clockInDisabled = !policy?.attendance_enabled || Boolean(todayRecord?.clock_in) || isOnLeaveToday
  const clockOutDisabled =
    !policy?.attendance_enabled || !todayRecord?.clock_in || Boolean(todayRecord?.clock_out) || isOnLeaveToday

  const summary = useMemo(
    () => ({
      statusText: todayRecord?.status_display || '未打卡',
      clockInTime: todayRecord?.clock_in ? dayjs(todayRecord.clock_in).format('HH:mm') : '-',
      clockOutTime: todayRecord?.clock_out ? dayjs(todayRecord.clock_out).format('HH:mm') : '-',
      distance:
        latestLocationLog?.distance_meters !== undefined && latestLocationLog?.distance_meters !== null
          ? `${Math.round(latestLocationLog.distance_meters)} 米`
          : '-',
    }),
    [latestLocationLog?.distance_meters, todayRecord?.clock_in, todayRecord?.clock_out, todayRecord?.status_display],
  )

  const supplementOverview = useMemo(
    () => ({
      myPending: mySupplements.filter((item) => item.status === 'pending').length,
      myApproved: mySupplements.filter((item) => item.status === 'approved').length,
      pendingToReview: pendingSupplements.length,
    }),
    [mySupplements, pendingSupplements],
  )

  const mySupplementColumns: ColumnsType<AttendanceSupplementItem> = [
    { title: '补签日期', dataIndex: 'attendance_date', key: 'attendance_date', width: 120 },
    { title: '补签类型', dataIndex: 'supplement_type_display', key: 'supplement_type_display', width: 120 },
    { title: '补签时间', dataIndex: 'requested_time', key: 'requested_time', width: 110 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: SupplementStatus, record) => (
        <Tag color={supplementStatusColorMap[value]}>{record.status_display}</Tag>
      ),
    },
    {
      title: '当前审批人',
      dataIndex: 'current_approver_name',
      key: 'current_approver_name',
      render: (value?: string) => value || '-',
    },
    {
      title: '审批意见',
      dataIndex: 'approval_comments',
      key: 'approval_comments',
      render: (value?: string) => value || '-',
    },
    { title: '提交时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) =>
        record.status === 'pending' ? (
          <Button
            danger
            size="small"
            loading={withdrawingId === record.id}
            onClick={() => handleWithdrawSupplement(record)}
          >
            撤回申请
          </Button>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ]

  const pendingSupplementColumns: ColumnsType<AttendanceSupplementItem> = [
    { title: '申请人', dataIndex: 'user_name', key: 'user_name', width: 110 },
    {
      title: '主组织',
      dataIndex: 'requester_primary_node_name',
      key: 'requester_primary_node_name',
      render: (value?: string) => value || '-',
    },
    { title: '补签日期', dataIndex: 'attendance_date', key: 'attendance_date', width: 120 },
    { title: '补签类型', dataIndex: 'supplement_type_display', key: 'supplement_type_display', width: 120 },
    { title: '补签时间', dataIndex: 'requested_time', key: 'requested_time', width: 110 },
    { title: '补签原因', dataIndex: 'reason', key: 'reason' },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => openApprovalModal('approve', [record.id], 'single', '批准补签申请')}
          >
            批准
          </Button>
          <Button
            size="small"
            danger
            onClick={() => openApprovalModal('reject', [record.id], 'single', '驳回补签申请')}
          >
            驳回
          </Button>
        </Space>
      ),
    },
  ]

  const locationColumns: ColumnsType<LocationLog> = [
    {
      title: '打卡类型',
      dataIndex: 'punch_type',
      key: 'punch_type',
      render: (value?: string) => (value === 'clock_out' ? '下班打卡' : '上班打卡'),
    },
    {
      title: '打卡地点',
      dataIndex: 'location_name',
      key: 'location_name',
      render: (value?: string) => value || '-',
    },
    {
      title: '距离考勤点',
      dataIndex: 'distance_meters',
      key: 'distance_meters',
      render: (value?: number) => (value !== undefined && value !== null ? `${Math.round(value)} 米` : '-'),
    },
    {
      title: '定位结果',
      dataIndex: 'within_range',
      key: 'within_range',
      render: (value?: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '范围内' : '超出范围'}</Tag>,
    },
    { title: '记录时间', dataIndex: 'created_at', key: 'created_at', render: (value?: string) => value || '-' },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }} loading={loading}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">考勤打卡</Text>
          <Title level={3} style={{ margin: 0 }}>
            处理每日打卡和补签申请
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 860 }}>
            打卡会校验时间窗口和定位范围；如有漏打卡，可直接提交补签申请。
          </Paragraph>
        </Space>
      </Card>

      {!policy?.attendance_enabled ? (
        <Alert type="warning" showIcon message="当前考勤打卡已关闭" description="请联系系统管理员确认开放时间。" />
      ) : null}

      {isOnLeaveToday ? (
        <Alert
          type="info"
          showIcon
          message="今日已按请假处理"
          description={todayRecord?.remark || '当前日期已同步为请假状态，无需再进行打卡或补签。'}
        />
      ) : null}

      {pendingSupplements.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`当前有 ${pendingSupplements.length} 条补签申请待你审批`}

        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
              <Space direction="vertical" size={4}>
                <Text type="secondary">今日考勤</Text>
                <Title level={4} style={{ margin: 0 }}>
                  {dayjs().format('YYYY年MM月DD日')}
                </Title>
              </Space>

              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic title="当前状态" value={summary.statusText} prefix={<CheckCircleOutlined />} />
                </Col>
                <Col span={12}>
                  <Statistic title="当前时间" value={dayjs().format('HH:mm')} prefix={<ClockCircleOutlined />} />
                </Col>
              </Row>

              <Space wrap>
                <Button
                  type="primary"
                  icon={<LoginOutlined />}
                  onClick={() => handlePunch('clock_in')}
                  loading={actionLoading === 'clock_in'}
                  disabled={clockInDisabled}
                >
                  上班打卡
                </Button>
                <Button
                  icon={<LogoutOutlined />}
                  onClick={() => handlePunch('clock_out')}
                  loading={actionLoading === 'clock_out'}
                  disabled={clockOutDisabled}
                >
                  下班打卡
                </Button>
                <Button icon={<SolutionOutlined />} onClick={handleOpenSupplementModal} disabled={isOnLeaveToday}>
                  申请补签
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="上班打卡时间" value={summary.clockInTime} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="下班打卡时间" value={summary.clockOutTime} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="最近定位距离" value={summary.distance} prefix={<EnvironmentOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="我的待审批补签" value={supplementOverview.myPending} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="我的已批准补签" value={supplementOverview.myApproved} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="待我处理补签" value={supplementOverview.pendingToReview} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 24 }} title="当前打卡规则">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Alert
              type={policy?.require_location ? 'info' : 'success'}
              showIcon
              message={policy?.require_location ? '已开启定位校验' : '未开启定位校验'}
              description={policy?.location_name || '暂未配置打卡地点'}
            />
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
              <Text strong>上班打卡时间</Text>
              <div>
                {policy?.check_in_start || '--:--'} - {policy?.check_in_end || '--:--'}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
              <Text strong>下班打卡时间</Text>
              <div>
                {policy?.check_out_start || '--:--'} - {policy?.check_out_end || '--:--'}
              </div>
            </Card>
          </Col>
          <Col xs={24}>
            <Text type="secondary">
              打卡半径：{policy?.radius_meters || 0} 米
              {policy?.updated_at ? `，最近更新：${policy.updated_at}` : ''}
            </Text>
          </Col>
        </Row>
      </Card>

      <Card bordered={false} style={{ borderRadius: 24 }} title="我的补签申请">
        <Table
          rowKey="id"
          dataSource={mySupplements}
          columns={mySupplementColumns}
          pagination={false}
          locale={{ emptyText: '当前没有补签申请记录' }}
          scroll={{ x: 980 }}
        />
      </Card>

      {pendingSupplements.length > 0 ? (
        <Card
          bordered={false}
          style={{ borderRadius: 24 }}
          title="待我审批的补签申请"
          extra={
            <Space wrap>
              <Text type="secondary">已选 {selectedPendingIds.length} 条</Text>
              <Button onClick={() => setSelectedPendingIds([])} disabled={selectedPendingIds.length === 0}>
                清空选择
              </Button>
              <Button
                type="primary"
                disabled={selectedPendingIds.length === 0}
                onClick={() =>
                  openApprovalModal('approve', selectedPendingIds, 'batch', `批量批准 ${selectedPendingIds.length} 条补签申请`)
                }
              >
                批量批准
              </Button>
              <Button
                danger
                disabled={selectedPendingIds.length === 0}
                onClick={() =>
                  openApprovalModal('reject', selectedPendingIds, 'batch', `批量驳回 ${selectedPendingIds.length} 条补签申请`)
                }
              >
                批量驳回
              </Button>
            </Space>
          }
        >
          <Table
            rowKey="id"
            dataSource={pendingSupplements}
            columns={pendingSupplementColumns}
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedPendingIds,
              onChange: (keys) => setSelectedPendingIds(keys.map((item) => Number(item))),
            }}
            locale={{ emptyText: '当前没有待审批补签申请' }}
            scroll={{ x: 1080 }}
          />
        </Card>
      ) : null}

      <Card bordered={false} style={{ borderRadius: 24 }} title="今日定位记录">
        <Table
          rowKey={(record, index) => String(record.id || index)}
          dataSource={locationLogs}
          columns={locationColumns}
          pagination={false}
          locale={{ emptyText: '今日暂无定位打卡记录' }}
        />
      </Card>

      <Modal
        title="提交补签申请"
        open={supplementModalOpen}
        onCancel={() => setSupplementModalOpen(false)}
        onOk={handleSubmitSupplement}
        confirmLoading={submittingSupplement}
        okText="提交申请"
        cancelText="取消"
      >
        <Form form={supplementForm} layout="vertical">
          <Form.Item
            name="attendance_date"
            label="补签日期"
            rules={[{ required: true, message: '请选择补签日期' }]}
          >
            <DatePicker style={{ width: '100%' }} disabledDate={(current) => !!current && current > dayjs().endOf('day')} />
          </Form.Item>
          <Form.Item
            name="supplement_type"
            label="补签类型"
            rules={[{ required: true, message: '请选择补签类型' }]}
          >
            <Segmented
              style={{ width: '100%' }}
              options={[
                { label: '上班补签', value: 'clock_in' },
                { label: '下班补签', value: 'clock_out' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="requested_time"
            label="补签时间"
            rules={[{ required: true, message: '请选择补签时间' }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} minuteStep={5} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="补签原因"
            rules={[
              { required: true, message: '请填写补签原因' },
              { min: 4, message: '请至少填写 4 个字说明原因' },
            ]}
          >
            <TextArea rows={4} maxLength={200} showCount placeholder="例如：外出办事返校较晚，忘记打卡。" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={approvalModal.title}
        open={approvalModal.open}
        onCancel={() => setApprovalModal({ open: false, action: 'approve', ids: [], mode: 'single', title: '' })}
        onOk={handleSubmitApproval}
        confirmLoading={reviewSubmitting}
        okText={approvalModal.action === 'approve' ? '确认批准' : '确认驳回'}
        cancelText="取消"
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={approvalModal.action === 'approve' ? 'success' : 'warning'}
            showIcon
            message={approvalModal.mode === 'batch' ? `本次将处理 ${approvalModal.ids.length} 条补签申请` : '本次将处理 1 条补签申请'}
            description={approvalModal.action === 'approve' ? '批准后会自动回写对应日期的考勤记录。' : '驳回后申请人会收到审批结果通知。'}
          />
          <Form form={approvalForm} layout="vertical">
            <Form.Item
              name="comments"
              label={approvalModal.action === 'approve' ? '审批说明（可选）' : '驳回原因'}
              rules={
                approvalModal.action === 'reject'
                  ? [{ required: true, message: '请填写驳回原因' }]
                  : []
              }
            >
              <TextArea
                rows={4}
                maxLength={200}
                showCount
                placeholder={approvalModal.action === 'approve' ? '可填写审批备注，例如同意补签。' : '请说明驳回原因，申请人会看到这条说明。'}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  )
}

export default AttendancePage



