import { getApiErrorMessage, hasFormErrorFields } from '@/lib/errors'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileSyncOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import {
  approveLeave,
  cancelLeave,
  createLeave,
  getLeaveApplications,
  getLeaveDetail,
  getLeaveTransferOptions,
  getLeaveTypes,
  getPendingLeave,
  rejectLeave,
  transferLeaveApprover,
} from '@/api'
import { useAuthStore } from '@/store/authStore'

const { RangePicker } = DatePicker
const { Search, TextArea } = Input
const { Paragraph, Text } = Typography

interface LeaveTypeOption {
  value: string
  label: string
}

interface ApprovalFlowRecord {
  id: number
  approver_id?: number
  approver_name?: string
  approval_step: number
  status: 'pending' | 'approved' | 'rejected' | 'transferred'
  comments?: string
  created_at?: string
  updated_at?: string
}

interface LeaveRecord {
  id: number
  staff_name: string
  leave_type: string
  leave_type_display: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  status_display?: string
  current_approver_id?: number | null
  current_approver_name?: string
  approver_name?: string
  approval_notes?: string
  approval_node_id?: number | null
  approval_node_name?: string
  has_transfer_history?: boolean
  transfer_count?: number
  latest_transfer_note?: string
  latest_transfer_at?: string
  created_at?: string
  updated_at?: string
  approval_flows?: ApprovalFlowRecord[]
}

interface TransferCandidate {
  id: number
  name: string
  role_display?: string
  role_in_node?: string
  allow_takeover?: boolean
}

interface TransferOptionsPayload {
  approval_node_id: number
  approval_node_name: string
  current_approver_name?: string
  candidates: TransferCandidate[]
}

interface CreateLeaveFormValues {
  leave_type: string
  date_range: [Dayjs, Dayjs]
  reason: string
  emergency_contact?: string
  emergency_phone?: string
}

const statusColorMap: Record<LeaveRecord['status'], string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
}

const flowColorMap: Record<ApprovalFlowRecord['status'], string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  transferred: 'blue',
}

const LeavePage: React.FC = () => {
  const { user } = useAuthStore()
  const isManager = ['super_admin', 'college_admin', 'staff'].includes(user?.role || '')
  const isSuperAdmin = user?.role === 'super_admin'

  const [myLeaves, setMyLeaves] = useState<LeaveRecord[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRecord[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [loadingMy, setLoadingMy] = useState(false)
  const [loadingPending, setLoadingPending] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tabKey, setTabKey] = useState(isManager ? 'pending' : 'my')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState<LeaveRecord | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<LeaveRecord | null>(null)
  const [transferTarget, setTransferTarget] = useState<LeaveRecord | null>(null)
  const [transferOptions, setTransferOptions] = useState<TransferOptionsPayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [createForm] = Form.useForm<CreateLeaveFormValues>()
  const [rejectForm] = Form.useForm<{ comments: string }>()
  const [transferForm] = Form.useForm<{ target_user_id: number; reason?: string }>()

  const loadData = async () => {
    setLoadingMy(true)
    if (isManager) {
      setLoadingPending(true)
    }
    try {
      const tasks = [getLeaveTypes(), getLeaveApplications()]
      if (isManager) {
        tasks.push(getPendingLeave())
      }
      const responses = await Promise.all(tasks)
      setLeaveTypes(responses[0].data.data || [])
      setMyLeaves(responses[1].data.data || [])
      setPendingLeaves(isManager ? responses[2].data.data || [] : [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '请假数据加载失败。'))
    } finally {
      setLoadingMy(false)
      setLoadingPending(false)
    }
  }

  useEffect(() => {
    loadData()
    // Reload when manager role changes; form actions call loadData directly after mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager])

  const filteredPendingLeaves = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return pendingLeaves.filter((item) => {
      if (!normalizedKeyword) {
        return true
      }
      return [item.staff_name, item.leave_type_display, item.reason, item.current_approver_name, item.approval_node_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedKeyword))
    })
  }, [pendingLeaves, keyword])

  const filteredMyLeaves = useMemo(() => {
    return myLeaves.filter((item) => (statusFilter === 'all' ? true : item.status === statusFilter))
  }, [myLeaves, statusFilter])

  const stats = useMemo(() => ({
    myTotal: myLeaves.length,
    pending: pendingLeaves.length,
    approved: myLeaves.filter((item) => item.status === 'approved').length,
    transferred: pendingLeaves.filter((item) => item.has_transfer_history).length,
  }), [myLeaves, pendingLeaves])

  const openDetail = async (record: LeaveRecord) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const response = await getLeaveDetail(record.id)
      setDetailRecord(response.data.data || null)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '请假详情加载失败。'))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    setSubmitting(true)
    try {
      const response = await createLeave({
        leave_type: values.leave_type,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        reason: values.reason.trim(),
        emergency_contact: values.emergency_contact?.trim(),
        emergency_phone: values.emergency_phone?.trim(),
      })
      message.success(response.data.message || '请假申请已提交。')
      setCreateOpen(false)
      createForm.resetFields()
      await loadData()
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '请假申请提交失败。'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async (record: LeaveRecord) => {
    setActingId(record.id)
    try {
      const response = await approveLeave(record.id, {})
      message.success(response.data.message || '请假申请已批准。')
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '审批失败。'))
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async () => {
    const values = await rejectForm.validateFields()
    if (!rejectTarget) return
    setSubmitting(true)
    try {
      const response = await rejectLeave(rejectTarget.id, { comments: values.comments.trim() })
      message.success(response.data.message || '请假申请已驳回。')
      setRejectOpen(false)
      setRejectTarget(null)
      rejectForm.resetFields()
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '驳回失败。'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (record: LeaveRecord) => {
    setActingId(record.id)
    try {
      const response = await cancelLeave(record.id)
      message.success(response.data.message || '请假申请已取消。')
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '取消失败。'))
    } finally {
      setActingId(null)
    }
  }

  const openTransfer = async (record: LeaveRecord) => {
    setTransferTarget(record)
    setTransferOpen(true)
    transferForm.resetFields()
    try {
      const response = await getLeaveTransferOptions(record.id)
      setTransferOptions(response.data.data || null)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '转交候选人加载失败。'))
      setTransferOpen(false)
      setTransferTarget(null)
    }
  }

  const handleTransfer = async () => {
    if (!transferTarget) return
    const values = await transferForm.validateFields()
    setTransferSubmitting(true)
    try {
      const response = await transferLeaveApprover(transferTarget.id, {
        target_user_id: values.target_user_id,
        reason: values.reason?.trim(),
      })
      message.success(response.data.message || '审批人已更新。')
      setTransferOpen(false)
      setTransferTarget(null)
      setTransferOptions(null)
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '转交失败。'))
    } finally {
      setTransferSubmitting(false)
    }
  }

  const myColumns: ColumnsType<LeaveRecord> = [
    { title: '请假类型', dataIndex: 'leave_type_display' },
    { title: '请假时间', key: 'dateRange', render: (_, record) => `${record.start_date} 至 ${record.end_date}` },
    { title: '天数', dataIndex: 'total_days', width: 90 },
    { title: '当前状态', key: 'status', render: (_, record) => <Tag color={statusColorMap[record.status]}>{record.status_display || record.status}</Tag> },
    { title: '当前审批人', dataIndex: 'current_approver_name', render: (value: string) => value || '-' },
    { title: '提交时间', dataIndex: 'created_at' },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(record)}>详情</Button>
          {(record.status === 'pending' || record.status === 'approved') && (
            <Button danger loading={actingId === record.id} onClick={() => handleCancel(record)}>取消</Button>
          )}
        </Space>
      ),
    },
  ]

  const pendingColumns: ColumnsType<LeaveRecord> = [
    { title: '申请人', dataIndex: 'staff_name' },
    { title: '请假类型', dataIndex: 'leave_type_display' },
    { title: '请假时间', key: 'dateRange', render: (_, record) => `${record.start_date} 至 ${record.end_date}` },
    { title: '审批节点', dataIndex: 'approval_node_name', render: (value: string) => value || '-' },
    {
      title: '当前审批人',
      key: 'approver',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.current_approver_name || '-'}</Text>
          {record.has_transfer_history && <Tag color="blue">已转交 {record.transfer_count || 0} 次</Tag>}
        </Space>
      ),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      render: (value: string) => <Text ellipsis={{ tooltip: value }}>{value}</Text>,
    },
    { title: '提交时间', dataIndex: 'created_at' },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space wrap>
          <Button type="link" onClick={() => openDetail(record)}>详情</Button>
          {(isSuperAdmin || record.current_approver_id === user?.id) && (
            <Button type="primary" loading={actingId === record.id} onClick={() => handleApprove(record)}>批准</Button>
          )}
          {(isSuperAdmin || record.current_approver_id === user?.id) && (
            <Button onClick={() => { setRejectTarget(record); setRejectOpen(true); rejectForm.setFieldsValue({ comments: '' }) }}>驳回</Button>
          )}
          {isSuperAdmin && <Button icon={<FileSyncOutlined />} onClick={() => openTransfer(record)}>转交审批</Button>}
        </Space>
      ),
    },
  ]

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-eyebrow">Campus Axis Leave</div>
        <h2 className="page-title">请假管理</h2>
        <p className="page-description">
          请假申请会沿组织归属自动流转到对应审批人。这里既能提交请假，也能处理审批、查看转交记录和跟踪完整审批链路。
        </p>
      </section>

      <Space size={16} wrap style={{ width: '100%' }}>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="我的申请总数" value={stats.myTotal} prefix={<FileTextOutlined />} /></Card>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="待我处理" value={stats.pending} prefix={<ClockCircleOutlined />} /></Card>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="我的已批准" value={stats.approved} prefix={<CheckCircleOutlined />} /></Card>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="发生过转交" value={stats.transferred} prefix={<FileSyncOutlined />} /></Card>
      </Space>

      {isManager && stats.pending > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`当前还有 ${stats.pending} 条待处理请假申请`}
          description={stats.transferred > 0 ? `其中 ${stats.transferred} 条发生过审批转交，请重点关注当前审批人和审批节点。` : '请在待我处理列表中查看详情并完成审批。'}
        />
      )}

      <Card bordered={false}>
        <Tabs
          activeKey={tabKey}
          onChange={setTabKey}
          items={[
            {
              key: 'my',
              label: '我的请假',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space wrap>
                      <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                          { label: '全部状态', value: 'all' },
                          { label: '待审批', value: 'pending' },
                          { label: '已批准', value: 'approved' },
                          { label: '已驳回', value: 'rejected' },
                          { label: '已取消', value: 'cancelled' },
                        ]}
                        style={{ width: 160 }}
                      />
                    </Space>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                      新建请假
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={loadingMy}
                    columns={myColumns}
                    dataSource={filteredMyLeaves}
                    locale={{ emptyText: <Empty description="当前没有请假记录。" /> }}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                  />
                </Space>
              ),
            },
            ...(isManager ? [{
              key: 'pending',
              label: '待我处理',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Search
                    allowClear
                    placeholder="搜索申请人、请假类型、原因、审批人或审批节点"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onSearch={setKeyword}
                    style={{ width: 320 }}
                  />
                  <Table
                    rowKey="id"
                    loading={loadingPending}
                    columns={pendingColumns}
                    dataSource={filteredPendingLeaves}
                    locale={{ emptyText: <Empty description="当前没有待处理申请。" /> }}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                  />
                </Space>
              ),
            }] : []),
          ]}
        />
      </Card>

      <Modal
        title="新建请假申请"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="leave_type" label="请假类型" rules={[{ required: true, message: '请选择请假类型。' }]}>
            <Select options={leaveTypes} />
          </Form.Item>
          <Form.Item name="date_range" label="请假时间" rules={[{ required: true, message: '请选择请假时间。' }]}>
            <RangePicker style={{ width: '100%' }} disabledDate={(current) => Boolean(current && current < dayjs().startOf('day'))} />
          </Form.Item>
          <Form.Item name="reason" label="请假原因" rules={[{ required: true, message: '请输入请假原因。' }]}>
            <TextArea rows={4} placeholder="请填写请假原因" />
          </Form.Item>
          <Form.Item name="emergency_contact" label="紧急联系人">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="emergency_phone" label="联系电话">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="驳回请假申请"
        open={rejectOpen}
        onCancel={() => { setRejectOpen(false); setRejectTarget(null) }}
        onOk={handleReject}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="comments" label="驳回原因" rules={[{ required: true, message: '请填写驳回原因。' }]}>
            <TextArea rows={4} placeholder="请输入驳回原因" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="转交审批"
        open={transferOpen}
        onCancel={() => { setTransferOpen(false); setTransferTarget(null); setTransferOptions(null) }}
        onOk={handleTransfer}
        confirmLoading={transferSubmitting}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {transferOptions && (
            <Alert
              type="info"
              showIcon
              message={`当前审批节点：${transferOptions.approval_node_name}`}
              description={`当前审批人：${transferOptions.current_approver_name || '未指定'}。系统管理员只能转交给同一审批节点内的候选审批人，或自己接管审批。`}
            />
          )}
          <Form form={transferForm} layout="vertical">
            <Form.Item name="target_user_id" label="新的审批人" rules={[{ required: true, message: '请选择新的审批人。' }]}>
              <Select
                placeholder="请选择新的审批人"
                options={(transferOptions?.candidates || []).map((item) => ({
                  label: `${item.name}${item.role_display ? ` · ${item.role_display}` : ''}${item.role_in_node ? ` · ${item.role_in_node}` : ''}`,
                  value: item.id,
                }))}
              />
            </Form.Item>
            <Form.Item name="reason" label="转交说明">
              <TextArea rows={3} placeholder="可选，说明本次转交原因" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Drawer title="请假详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={560} loading={detailLoading}>
        {detailRecord && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="申请人">{detailRecord.staff_name}</Descriptions.Item>
              <Descriptions.Item label="请假类型">{detailRecord.leave_type_display}</Descriptions.Item>
              <Descriptions.Item label="请假时间">{detailRecord.start_date} 至 {detailRecord.end_date}</Descriptions.Item>
              <Descriptions.Item label="请假天数">{detailRecord.total_days} 天</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusColorMap[detailRecord.status]}>{detailRecord.status_display || detailRecord.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="审批节点">{detailRecord.approval_node_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="当前审批人">{detailRecord.current_approver_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="最终处理人">{detailRecord.approver_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="审批意见">{detailRecord.approval_notes || '-'}</Descriptions.Item>
              <Descriptions.Item label="最近转交">{detailRecord.latest_transfer_note || '-'}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="请假原因">
              <Paragraph style={{ marginBottom: 0 }}>{detailRecord.reason}</Paragraph>
            </Card>
            <Card size="small" title="审批时间线">
              <Timeline
                items={(detailRecord.approval_flows || []).map((item) => ({
                  color: flowColorMap[item.status],
                  children: (
                    <Space direction="vertical" size={2}>
                      <Text strong>{item.approver_name || '待分配审批人'} · {item.status}</Text>
                      <Text type="secondary">{item.updated_at || item.created_at || '-'}</Text>
                      <Text>{item.comments || '暂无说明。'}</Text>
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </div>
  )
}

export default LeavePage




