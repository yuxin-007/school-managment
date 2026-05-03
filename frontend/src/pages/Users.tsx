import { getApiErrorMessage, hasFormErrorFields } from '@/lib/errors'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  StopOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { MetricCard, MetricGrid, PageShell } from '@/components/ui/PageScaffold'
import {
  batchUpdatePrimaryOrganization,
  createUser,
  deleteUser,
  exportUsers,
  getUser,
  getUserOrganizationOptions,
  getUserStatistics,
  getUsers,
  importUsers,
  searchUsers,
  updateUser,
} from '@/api'

const { Text, Title } = Typography

interface UserRecord {
  id: number
  username: string
  real_name: string
  role: string
  role_display: string
  email?: string
  phone?: string
  position?: string
  employee_id?: string
  student_id?: string
  grade?: string
  major?: string
  is_active: boolean
  department_name?: string
  primary_node_id?: number | null
  primary_node_name?: string
  primary_node_type_label?: string
  organization_count?: number
}

interface OrganizationOption {
  id: number
  name: string
  node_type: string
  node_type_label: string
  path_label: string
}

interface UserOrganizationRelation {
  id: number
  node_id: number
  node_name: string
  node_type: string
  node_type_label: string
  path_label: string
  is_primary: boolean
  role_in_node?: string
  created_at?: string
}

interface UserDetailRecord extends UserRecord {
  created_at?: string
  last_login?: string
  organization_relations?: UserOrganizationRelation[]
}

interface UserStatistics {
  total_users: number
  role_distribution?: {
    college_admin?: number
    staff?: number
    student?: number
  }
  users_without_primary?: number
}

const roleMap: Record<string, { text: string; color: string }> = {
  college_admin: { text: '学院管理员', color: 'orange' },
  staff: { text: '教职工', color: 'blue' },
  student: { text: '学生', color: 'green' },
}

const UsersPage: React.FC = () => {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [stats, setStats] = useState<UserStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [orgOptions, setOrgOptions] = useState<OrganizationOption[]>([])
  const [orgLoading, setOrgLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailUser, setDetailUser] = useState<UserDetailRecord | null>(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [form] = Form.useForm()
  const [batchForm] = Form.useForm()
  const [pagination, setPagination] = useState({ page: 1, per_page: 20, total: 0 })
  const [keyword, setKeyword] = useState('')
  const [phoneFilter, setPhoneFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | undefined>()
  const [primaryFilter, setPrimaryFilter] = useState<string | undefined>()

  const currentRole = Form.useWatch('role', form)
  const selectedUsers = useMemo(
    () => users.filter((item) => selectedRowKeys.includes(item.id)),
    [selectedRowKeys, users],
  )
  const selectedRoleSet = useMemo(
    () => Array.from(new Set(selectedUsers.map((item) => item.role))),
    [selectedUsers],
  )
  const batchRole = selectedRoleSet.length === 1 ? selectedRoleSet[0] : undefined
  const batchRoleLabel = batchRole ? (roleMap[batchRole]?.text || batchRole) : ''
  const canBatchAssign = selectedUsers.length > 0 && selectedRoleSet.length === 1

  const roleOptions = [
    { label: '学院管理员', value: 'college_admin' },
    { label: '教职工', value: 'staff' },
    { label: '学生', value: 'student' },
  ]

  const loadUsers = async (
    page = 1,
    nextKeyword = keyword,
    nextRole = roleFilter,
    nextPrimary = primaryFilter,
    nextPhone = phoneFilter,
    nextEmail = emailFilter,
  ) => {
    setLoading(true)
    try {
      if (nextKeyword || nextPhone || nextEmail || nextRole || nextPrimary) {
        const res = await searchUsers({
          keyword: nextKeyword,
          phone: nextPhone,
          email: nextEmail,
          role: nextRole || '',
          has_primary: nextPrimary,
        })
        const records = res.data.data || []
        setUsers(records)
        setPagination((prev) => ({ ...prev, page: 1, total: records.length }))
        return
      }

      const res = await getUsers({ page, per_page: pagination.per_page, has_primary: nextPrimary })
      setUsers(res.data.data || [])
      setPagination((prev) => ({ ...prev, ...res.data.pagination, page }))
    } catch {
      message.error('用户数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterSearch = () => {
    loadUsers(1, keyword, roleFilter, primaryFilter, phoneFilter, emailFilter)
  }

  const handleFilterReset = () => {
    setKeyword('')
    setPhoneFilter('')
    setEmailFilter('')
    setRoleFilter(undefined)
    setPrimaryFilter(undefined)
    loadUsers(1, '', undefined, undefined, '', '')
  }

  const loadStats = async () => {
    try {
      const res = await getUserStatistics()
      if (res.data.success) {
        setStats(res.data.data)
      }
    } catch {
      message.error('用户统计加载失败')
    }
  }

  const loadOrganizationOptions = async (role?: string) => {
    if (!role) {
      setOrgOptions([])
      return
    }

    setOrgLoading(true)
    try {
      const res = await getUserOrganizationOptions(role)
      const options = res.data.data || []
      setOrgOptions(options)

      const currentNodeId = form.getFieldValue('primary_node_id')
      if (currentNodeId && !options.some((item: OrganizationOption) => item.id === currentNodeId)) {
        form.setFieldValue('primary_node_id', undefined)
      }
    } catch {
      message.error('组织选项加载失败')
    } finally {
      setOrgLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
    loadStats()
    // Initial user workspace load; filters and mutations refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (modalOpen) {
      loadOrganizationOptions(currentRole)
    }
    // Modal options depend on the visible form role; loadOrganizationOptions also reads form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole, modalOpen])

  const openCreate = () => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({
      role: 'staff',
      is_active: true,
    })
    setModalOpen(true)
  }

  const openEdit = (record: UserRecord) => {
    setEditingUser(record)
    form.setFieldsValue({
      ...record,
      primary_node_id: record.primary_node_id || undefined,
    })
    setModalOpen(true)
  }

  const openBatchModal = async () => {
    if (!canBatchAssign || !batchRole) {
      message.warning('请先选择同一角色的用户后再批量配置主组织。')
      return
    }

    batchForm.resetFields()
    setBatchModalOpen(true)
    await loadOrganizationOptions(batchRole)
  }

  const openDetail = async (record: UserRecord) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await getUser(record.id)
      setDetailUser(res.data.data)
    } catch {
      message.error('用户详情加载失败')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailUser(null)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (editingUser) {
        await updateUser(editingUser.id, values)
        message.success('用户更新成功')
      } else {
        await createUser(values)
        message.success('用户创建成功')
      }
      setModalOpen(false)
      await Promise.all([loadUsers(pagination.page), loadStats()])
    } catch (error: unknown) {
      if (hasFormErrorFields(error)) {
        return
      }
      message.error(getApiErrorMessage(error, '保存失败'))
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id)
      message.success('用户删除成功')
      await Promise.all([loadUsers(pagination.page), loadStats()])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '删除失败'))
    }
  }

  const handleToggleStatus = async (record: UserRecord) => {
    setStatusUpdatingId(record.id)
    try {
      await updateUser(record.id, { is_active: !record.is_active })
      message.success(record.is_active ? '用户已禁用' : '用户已启用')
      if (detailUser?.id === record.id) {
        setDetailUser({
          ...detailUser,
          is_active: !record.is_active,
        })
      }
      await Promise.all([loadUsers(pagination.page), loadStats()])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleBatchAssign = async () => {
    try {
      const values = await batchForm.validateFields()
      setBatchSaving(true)
      const res = await batchUpdatePrimaryOrganization({
        user_ids: selectedRowKeys.map(Number),
        primary_node_id: values.primary_node_id ?? null,
      })
      message.success(res.data.message || '批量配置成功')
      setBatchModalOpen(false)
      setSelectedRowKeys([])
      await Promise.all([loadUsers(pagination.page), loadStats()])
    } catch (error: unknown) {
      if (hasFormErrorFields(error)) {
        return
      }
      message.error(getApiErrorMessage(error, '批量配置失败'))
    } finally {
      setBatchSaving(false)
    }
  }

  const handleExport = async () => {
    try {
      const res = await exportUsers({ keyword, phone: phoneFilter, email: emailFilter, role: roleFilter, has_primary: primaryFilter })
      const url = URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `用户数据_${new Date().toLocaleDateString()}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('导出失败')
    }
  }

  const openPrimaryOrganization = () => {
    if (!detailUser?.primary_node_id) {
      message.warning('当前用户还没有配置主组织。')
      return
    }

    const params = new URLSearchParams({
      node_id: String(detailUser.primary_node_id),
      source: 'user_detail',
      source_name: detailUser.real_name,
    })
    navigate(`/organization?${params.toString()}`)
    closeDetail()
  }

  const statItems = useMemo(() => {
    if (!stats) return []
    return [
      { title: '用户总数', value: stats.total_users, color: '#1677ff' },
      { title: '学院管理员', value: stats.role_distribution?.college_admin || 0, color: '#fa8c16' },
      { title: '教职工', value: stats.role_distribution?.staff || 0, color: '#13c2c2' },
      { title: '学生', value: stats.role_distribution?.student || 0, color: '#52c41a' },
      { title: '未设主组织', value: stats.users_without_primary || 0, color: '#cf1322' },
    ]
  }, [stats])

  const primaryFilterOptions = [
    { label: '已配置主组织', value: 'true' },
    { label: '未配置主组织', value: 'false' },
  ]

  const columns = [
    {
      title: '用户',
      key: 'user',
      render: (_: unknown, record: UserRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.real_name}</Text>
          <Text type="secondary">{record.username}</Text>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      render: (value: string) => <Tag color={roleMap[value]?.color}>{roleMap[value]?.text || value}</Tag>,
    },
    {
      title: '编号',
      render: (_: unknown, record: UserRecord) => record.employee_id || record.student_id || '-',
    },
    {
      title: '主组织',
      key: 'department_name',
      render: (_: unknown, record: UserRecord) => (
        <Space direction="vertical" size={0}>
          <Text>{record.department_name || '未配置'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.primary_node_type_label || '未配置主组织'}
          </Text>
        </Space>
      ),
    },
    {
      title: '组织关系',
      key: 'organization_count',
      render: (_: unknown, record: UserRecord) => (
        <Space direction="vertical" size={0}>
          <Text>{record.organization_count || 0} 个</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.primary_node_id ? '已设主组织' : '待配置主组织'}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '正常' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      width: 250,
      render: (_: unknown, record: UserRecord) => (
        <Space>
          <Tooltip title="查看详情">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} />
          </Tooltip>
          <Tooltip title="编辑用户">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title={record.is_active ? '确认禁用该用户？' : '确认启用该用户？'}
            description={record.is_active ? '禁用后该账号将无法正常登录系统。' : '启用后该账号将恢复正常使用。'}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Tooltip title={record.is_active ? '快速禁用' : '快速启用'}>
              <Button
                size="small"
                loading={statusUpdatingId === record.id}
                icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
              >
                {record.is_active ? '禁用' : '启用'}
              </Button>
            </Tooltip>
          </Popconfirm>
          <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除用户">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <PageShell>
      <section className="page-hero">
        <div className="page-eyebrow">Campus Axis Users</div>
        <h2 className="page-title">用户治理</h2>
        <p className="page-description">
          这里统一维护系统账号、角色身份以及主组织归属。用户页与组织树直接联动，适合做批量归档、权限整理和人员信息校正。
        </p>
      </section>

      <MetricGrid>
        {statItems.map((item) => (
          <MetricCard key={item.title} label={item.title} value={item.value} accent={item.color} icon={<UserOutlined />} />
        ))}
      </MetricGrid>

      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap className="table-toolbar" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap className="toolbar-group toolbar-controls">
              <Input
                placeholder="用户名 / 姓名 / 工号 / 学号"
                allowClear
                style={{ width: 240 }}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onPressEnter={handleFilterSearch}
              />
              <Input
                placeholder="手机号"
                allowClear
                style={{ width: 160 }}
                value={phoneFilter}
                onChange={(event) => setPhoneFilter(event.target.value)}
                onPressEnter={handleFilterSearch}
              />
              <Input
                placeholder="邮箱"
                allowClear
                style={{ width: 220 }}
                value={emailFilter}
                onChange={(event) => setEmailFilter(event.target.value)}
                onPressEnter={handleFilterSearch}
              />
              <Select
                placeholder="筛选角色"
                allowClear
                style={{ width: 160 }}
                options={roleOptions}
                value={roleFilter}
                onChange={(value) => {
                  setRoleFilter(value)
                  loadUsers(1, keyword, value, primaryFilter, phoneFilter, emailFilter)
                }}
              />
              <Select
                placeholder="主组织状态"
                allowClear
                style={{ width: 180 }}
                options={primaryFilterOptions}
                value={primaryFilter}
                onChange={(value) => {
                  setPrimaryFilter(value)
                  loadUsers(1, keyword, roleFilter, value, phoneFilter, emailFilter)
                }}
              />
              <Button type="primary" onClick={handleFilterSearch}>
                查询
              </Button>
              <Button onClick={handleFilterReset}>重置</Button>
            </Space>

            <Space wrap className="toolbar-group toolbar-actions">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建用户
              </Button>
              <Button onClick={openBatchModal} disabled={selectedRowKeys.length === 0}>
                批量配置主组织
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                导出数据
              </Button>
              <Upload
                accept=".xlsx,.csv"
                showUploadList={false}
                customRequest={async ({ file }) => {
                  const res = await importUsers(file as File)
                  message.success(res.data.message)
                  await Promise.all([loadUsers(1), loadStats()])
                }}
              >
                <Button icon={<UploadOutlined />}>导入数据</Button>
              </Upload>
            </Space>
          </Space>

          {selectedRowKeys.length > 0 && (
            <Alert
              type={canBatchAssign ? 'info' : 'warning'}
              showIcon
              message={
                canBatchAssign
                  ? `已选择 ${selectedRowKeys.length} 个${batchRoleLabel}账号，可批量配置主组织。`
                  : `已选择 ${selectedRowKeys.length} 个账号，但角色不一致，暂不支持批量配置主组织。`
              }
            />
          )}

          {(stats?.users_without_primary || 0) > 0 && !primaryFilter && (
            <Alert
              type="warning"
              showIcon
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    setPrimaryFilter('false')
                    loadUsers(1, keyword, roleFilter, 'false')
                  }}
                >
                  筛选未配置用户
                </Button>
              }
              message={`当前还有 ${stats.users_without_primary} 个用户未配置主组织`}
              description="可直接筛选并完成主组织配置。"
            />
          )}

          <Table
            dataSource={users}
            columns={columns}
            rowKey="id"
            loading={loading}
            rowSelection={rowSelection}
            pagination={{
              current: pagination.page,
              pageSize: pagination.per_page,
              total: pagination.total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条记录`,
              onChange: (page) => loadUsers(page),
            }}
            scroll={{ x: 'max-content' }}
          />
        </Space>
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={760}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label="用户名" rules={[{ required: !editingUser, message: '请输入用户名' }]}>
                <Input disabled={!!editingUser} placeholder="请输入登录用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="real_name" label="真实姓名" rules={[{ required: true, message: '请输入真实姓名' }]}>
                <Input placeholder="请输入真实姓名" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            {!editingUser && (
              <Col span={12}>
                <Form.Item
                  name="password"
                  label="初始密码"
                  rules={[
                    { required: true, message: '请输入初始密码' },
                    { min: 6, message: '密码长度不能少于6位' },
                  ]}
                >
                  <Input.Password placeholder="请输入初始密码" />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
                <Select options={roleOptions} placeholder="请选择角色" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="邮箱">
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="手机号">
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="primary_node_id" label="主组织归属">
                <Select
                  showSearch
                  allowClear
                  loading={orgLoading}
                  optionFilterProp="label"
                  placeholder={currentRole ? '请选择主组织归属' : '请先选择角色'}
                  disabled={!currentRole}
                  options={orgOptions.map((item) => ({
                    value: item.id,
                    label: `${item.path_label}（${item.node_type_label}）`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_active" label="状态" initialValue={true}>
                <Select
                  options={[
                    { label: '正常', value: true },
                    { label: '禁用', value: false },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          {(currentRole === 'staff' || currentRole === 'college_admin') && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="employee_id" label="工号">
                  <Input placeholder="请输入工号" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="position" label="岗位">
                  <Input placeholder="请输入岗位，例如辅导员、任课教师" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {currentRole === 'student' && (
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="student_id" label="学号">
                  <Input placeholder="请输入学号" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="grade" label="年级">
                  <Input placeholder="例如 2023级" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="major" label="专业">
                  <Input placeholder="请输入专业" />
                </Form.Item>
              </Col>
            </Row>
          )}
        </Form>
      </Modal>

      <Modal
        title="批量配置主组织"
        open={batchModalOpen}
        onOk={handleBatchAssign}
        onCancel={() => setBatchModalOpen(false)}
        okText="确认配置"
        cancelText="取消"
        confirmLoading={batchSaving}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`当前已选择 ${selectedRowKeys.length} 个${batchRoleLabel || ''}账号`}
          description="批量配置只会调整主组织，附属组织关系不会受影响。"
        />

        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="primary_node_id"
            label="目标主组织"
            rules={[{ required: true, message: '请选择目标主组织' }]}
          >
            <Select
              showSearch
              loading={orgLoading}
              optionFilterProp="label"
              placeholder="请选择目标主组织"
              options={orgOptions.map((item) => ({
                value: item.id,
                label: `${item.path_label}（${item.node_type_label}）`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="用户详情"
        open={detailOpen}
        onClose={closeDetail}
        width={640}
        destroyOnClose
        extra={
          detailUser ? (
            <Space>
              <Button onClick={openPrimaryOrganization} disabled={!detailUser.primary_node_id}>
                定位主组织
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  closeDetail()
                  openEdit(detailUser)
                }}
              >
                编辑用户
              </Button>
            </Space>
          ) : null
        }
      >
        {detailLoading ? (
          <Card loading bordered={false} />
        ) : detailUser ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card bordered={false} style={{ background: '#fafafa' }}>
              <Space direction="vertical" size={4}>
                <Space align="center">
                  <Title level={4} style={{ margin: 0 }}>
                    {detailUser.real_name}
                  </Title>
                  <Tag color={roleMap[detailUser.role]?.color}>
                    {roleMap[detailUser.role]?.text || detailUser.role}
                  </Tag>
                  <Tag color={detailUser.is_active ? 'green' : 'red'}>
                    {detailUser.is_active ? '正常' : '禁用'}
                  </Tag>
                  <Button
                    size="small"
                    loading={statusUpdatingId === detailUser.id}
                    onClick={() =>
                      handleToggleStatus({
                        ...detailUser,
                        is_active: detailUser.is_active,
                      })
                    }
                  >
                    {detailUser.is_active ? '快速禁用' : '快速启用'}
                  </Button>
                </Space>
                <Text type="secondary">{detailUser.username}</Text>
              </Space>
            </Card>

            <Card bordered={false} title="基础信息">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="邮箱">{detailUser.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="手机号">{detailUser.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="工号">{detailUser.employee_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="学号">{detailUser.student_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="岗位">{detailUser.position || '-'}</Descriptions.Item>
                <Descriptions.Item label="年级">{detailUser.grade || '-'}</Descriptions.Item>
                <Descriptions.Item label="专业">{detailUser.major || '-'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{detailUser.created_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="最近登录">{detailUser.last_login || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card bordered={false} title="主组织归属">
              {detailUser.primary_node_id ? (
                <Space direction="vertical" size={6}>
                  <Space wrap>
                    <Tag color="blue">{detailUser.primary_node_type_label}</Tag>
                    <Text strong>{detailUser.primary_node_name}</Text>
                    <Button type="link" style={{ paddingInline: 0 }} onClick={openPrimaryOrganization}>
                      定位到组织中心
                    </Button>
                  </Space>
                  <Text type="secondary">
                    当前用户已配置主组织，可直接继承对应的组织边界和业务视图。
                  </Text>
                </Space>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="当前用户还没有配置主组织"
                />
              )}
            </Card>

            <Card
              bordered={false}
              title="全部组织关系"
              extra={<Text type="secondary">共 {detailUser.organization_relations?.length || 0} 条</Text>}
            >
              {detailUser.organization_relations?.length ? (
                <List
                  itemLayout="vertical"
                  dataSource={detailUser.organization_relations}
                  renderItem={(item) => (
                    <List.Item key={item.id}>
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Space wrap>
                          <Text strong>{item.node_name}</Text>
                          <Tag color={item.is_primary ? 'gold' : 'default'}>
                            {item.is_primary ? '主组织' : '附属组织'}
                          </Tag>
                          <Tag>{item.node_type_label}</Tag>
                          {item.role_in_node ? <Tag color="processing">{item.role_in_node}</Tag> : null}
                        </Space>
                        <Text type="secondary">{item.path_label}</Text>
                        <Text type="secondary">关联时间：{item.created_at || '-'}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="当前用户还没有任何组织关系"
                />
              )}
            </Card>
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可展示的用户详情" />
        )}
      </Drawer>
    </PageShell>
  )
}

export default UsersPage






