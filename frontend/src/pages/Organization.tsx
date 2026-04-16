import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import {
  assignUser,
  batchAssignUsers,
  batchRemoveUsers,
  createOrgNode,
  deleteOrgNode,
  getAssignableNodeTypes,
  getNodeUsers,
  getOrganizationOverview,
  getOrgTree,
  getUserOptions,
  moveOrgNode,
  removeUser,
  updateOrgNode,
} from '@/api/index'
import { filterOrganizationTree, flattenOrganizationTree, getOrganizationVisual } from '@/features/organization/meta'
import type {
  OrganizationCatalogItem,
  OrganizationNodePathItem,
  OrganizationOverview,
  OrganizationTreeNode,
  OrganizationNodeUsersMeta,
  OrganizationUserRecord,
} from '@/features/organization/types'

const { Paragraph, Text, Title } = Typography

type NodeModalMode = 'create' | 'edit'

const summaryCardStyle = {
  borderRadius: 20,
  minHeight: 148,
}

function findSiblingState(
  nodes: OrganizationTreeNode[],
  targetId: number | null,
): { hasPrev: boolean; hasNext: boolean; position: number; total: number } | null {
  if (!targetId) {
    return null
  }

  const walk = (items: OrganizationTreeNode[]): { hasPrev: boolean; hasNext: boolean; position: number; total: number } | null => {
    const index = items.findIndex((item) => item.id === targetId)
    if (index >= 0) {
      return {
        hasPrev: index > 0,
        hasNext: index < items.length - 1,
        position: index + 1,
        total: items.length,
      }
    }

    for (const item of items) {
      const result = walk(item.children || [])
      if (result) {
        return result
      }
    }

    return null
  }

  return walk(nodes)
}

function findNodePathKeys(nodes: OrganizationTreeNode[], targetId: number | null): React.Key[] {
  if (!targetId) {
    return []
  }

  const walk = (items: OrganizationTreeNode[], path: React.Key[]): React.Key[] | null => {
    for (const item of items) {
      const nextPath = [...path, item.key]
      if (item.id === targetId) {
        return nextPath
      }

      const childPath = walk(item.children || [], nextPath)
      if (childPath) {
        return childPath
      }
    }

    return null
  }

  return walk(nodes, []) || []
}

const OrganizationPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [treeData, setTreeData] = useState<OrganizationTreeNode[]>([])
  const [overview, setOverview] = useState<OrganizationOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [keyword, setKeyword] = useState('')
  const [nodeUsers, setNodeUsers] = useState<OrganizationUserRecord[]>([])
  const [nodePath, setNodePath] = useState<OrganizationNodePathItem[]>([])
  const [creatableTypes, setCreatableTypes] = useState<string[]>([])
  const [assignableUserCount, setAssignableUserCount] = useState(0)
  const [memberSummary, setMemberSummary] = useState<OrganizationNodeUsersMeta['member_summary'] | null>(null)
  const [nodePermissions, setNodePermissions] = useState<OrganizationNodeUsersMeta['permissions'] | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [nodeModalOpen, setNodeModalOpen] = useState(false)
  const [nodeModalMode, setNodeModalMode] = useState<NodeModalMode>('create')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [memberKeyword, setMemberKeyword] = useState('')
  const [memberRole, setMemberRole] = useState<string>('all')
  const [assignRole, setAssignRole] = useState<string>('all')
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [removingBatch, setRemovingBatch] = useState(false)
  const [userOptions, setUserOptions] = useState<OrganizationUserRecord[]>([])
  const [availableNodeTypes, setAvailableNodeTypes] = useState<OrganizationCatalogItem[]>([])
  const [nodeForm] = Form.useForm()
  const [assignForm] = Form.useForm()

  const flatNodes = useMemo(() => flattenOrganizationTree(treeData) as OrganizationTreeNode[], [treeData])
  const selectedNode = useMemo(
    () => flatNodes.find((item) => item.id === selectedNodeId) ?? null,
    [flatNodes, selectedNodeId],
  )
  const filteredTreeData = useMemo(
    () => filterOrganizationTree(treeData, keyword) as OrganizationTreeNode[],
    [treeData, keyword],
  )
  const filteredNodeUsers = useMemo(() => {
    const normalizedKeyword = memberKeyword.trim().toLowerCase()

    return nodeUsers.filter((item) => {
      const matchedRole = memberRole === 'all' || item.role === memberRole
      if (!matchedRole) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      return [
        item.real_name,
        item.username,
        item.role_display,
        item.employee_id,
        item.student_id,
        item.department_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword))
    })
  }, [memberKeyword, memberRole, nodeUsers])
  const filteredUserOptions = useMemo(() => {
    if (assignRole === 'all') {
      return userOptions
    }
    return userOptions.filter((item) => item.role === assignRole)
  }, [assignRole, userOptions])
  const siblingState = useMemo(
    () => findSiblingState(treeData, selectedNodeId),
    [selectedNodeId, treeData],
  )
  const requestedNodeId = useMemo(() => {
    const rawValue = searchParams.get('node_id')
    if (!rawValue) {
      return null
    }

    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? parsed : null
  }, [searchParams])
  const sourceType = searchParams.get('source') || ''
  const sourceName = searchParams.get('source_name') || ''
  const isUserDetailNavigation =
    sourceType === 'user_detail' && !!requestedNodeId && requestedNodeId === selectedNodeId

  const loadOrganization = async () => {
    setLoading(true)
    try {
      const [treeRes, overviewRes] = await Promise.all([getOrgTree(), getOrganizationOverview()])
      const nextTree = treeRes.data.data || []
      const nextOverview = overviewRes.data.data || null

      setTreeData(nextTree)
      setOverview(nextOverview)

      const flattened = flattenOrganizationTree(nextTree) as OrganizationTreeNode[]
      const requestedPathKeys = findNodePathKeys(nextTree, requestedNodeId)
      setExpandedKeys((current) =>
        current.length > 0
          ? Array.from(new Set([...current, ...requestedPathKeys]))
          : requestedPathKeys.length > 0
            ? requestedPathKeys
            : nextTree.map((item: OrganizationTreeNode) => item.key),
      )
      setSelectedNodeId((current) => {
        if (requestedNodeId && flattened.some((item) => item.id === requestedNodeId)) {
          return requestedNodeId
        }
        if (current && flattened.some((item) => item.id === current)) {
          return current
        }
        return flattened[0]?.id ?? null
      })
    } catch (error) {
      console.error(error)
      message.error('组织中心加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const loadNodeUsers = async (nodeId: number) => {
    setUsersLoading(true)
    try {
      const response = await getNodeUsers(nodeId)
      setNodeUsers(response.data.data || [])
      setNodePath(response.data.meta?.node_path || [])
      setCreatableTypes(response.data.meta?.creatable_types || [])
      setAssignableUserCount(response.data.meta?.assignable_user_count || 0)
      setMemberSummary(response.data.meta?.member_summary || null)
      setNodePermissions(response.data.meta?.permissions || null)
    } catch (error) {
      console.error(error)
      message.error('节点人员信息加载失败。')
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => {
    loadOrganization()
  }, [])

  useEffect(() => {
    if (selectedNodeId) {
      loadNodeUsers(selectedNodeId)
    } else {
      setNodeUsers([])
      setNodePath([])
      setCreatableTypes([])
      setAssignableUserCount(0)
      setMemberSummary(null)
      setNodePermissions(null)
    }
  }, [selectedNodeId])

  useEffect(() => {
    setMemberKeyword('')
    setMemberRole('all')
    setSelectedMemberIds([])
  }, [selectedNodeId])

  useEffect(() => {
    if (!keyword.trim()) {
      return
    }
    const visibleKeys = (flattenOrganizationTree(filteredTreeData) as OrganizationTreeNode[]).map((item) => item.key)
    setExpandedKeys(visibleKeys)
  }, [keyword, filteredTreeData])

  useEffect(() => {
    const currentValue = searchParams.get('node_id')
    const nextValue = selectedNodeId ? String(selectedNodeId) : null
    if (currentValue === nextValue) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    if (nextValue) {
      nextParams.set('node_id', nextValue)
    } else {
      nextParams.delete('node_id')
    }
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, selectedNodeId, setSearchParams])

  const prepareCreateModal = async (parentId?: number) => {
    try {
      const response = await getAssignableNodeTypes(parentId)
      const allowedTypes = response.data.data || []
      if (allowedTypes.length === 0) {
        message.warning('当前层级下没有可创建的节点类型。')
        return
      }
      const catalog = overview?.catalog || []
      setAvailableNodeTypes(catalog.filter((item) => allowedTypes.includes(item.key)))
      nodeForm.resetFields()
      nodeForm.setFieldsValue({ node_type: allowedTypes[0] })
      setNodeModalMode('create')
      setNodeModalOpen(true)
    } catch (error) {
      console.error(error)
      message.error('可创建节点类型加载失败。')
    }
  }

  const openEditModal = () => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_edit_node) {
      message.warning('当前节点只能由上级节点进行编辑。')
      return
    }
    nodeForm.setFieldsValue({
      name: selectedNode.name,
      code: selectedNode.data.code,
      description: selectedNode.data.description,
    })
    setAvailableNodeTypes([])
    setNodeModalMode('edit')
    setNodeModalOpen(true)
  }

  const handleSaveNode = async () => {
    const values = await nodeForm.validateFields()
    setSaving(true)
    try {
      if (nodeModalMode === 'edit' && selectedNode) {
        await updateOrgNode(selectedNode.id, values)
        message.success('组织节点已更新。')
      } else {
        await createOrgNode({
          ...values,
          parent_id: selectedNode?.id,
        })
        message.success('组织节点已创建。')
      }
      setNodeModalOpen(false)
      await loadOrganization()
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '组织节点保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNode = async () => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_delete_node) {
      message.warning('当前节点只能由上级节点进行删除。')
      return
    }
    try {
      await deleteOrgNode(selectedNode.id)
      message.success('组织节点已删除。')
      setSelectedNodeId(null)
      await loadOrganization()
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '组织节点删除失败。')
    }
  }

  const handleMoveNode = async (direction: 'up' | 'down') => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_move_node) {
      message.warning('当前节点只能由上级节点调整顺序。')
      return
    }

    try {
      await moveOrgNode(selectedNode.id, direction)
      message.success(direction === 'up' ? '节点已上移。' : '节点已下移。')
      await loadOrganization()
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '节点排序调整失败。')
    }
  }

  const openAssignModal = async () => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_assign_users) {
      message.warning('当前账号无权为该节点分配人员。')
      return
    }
    try {
      const response = await getUserOptions(selectedNode.id)
      const options = response.data.data || []
      setUserOptions(options)
      setAssignRole('all')
      assignForm.resetFields()
      assignForm.setFieldsValue({ is_primary: false, user_ids: [] })
      setAssignModalOpen(true)
      if (options.length === 0) {
        message.info('当前节点没有可分配人员。')
      }
    } catch (error) {
      console.error(error)
      message.error('候选人员加载失败。')
    }
  }

  const handleAssignUser = async () => {
    if (!selectedNode) {
      return
    }
    const values = await assignForm.validateFields()
    const userIds = Array.isArray(values.user_ids) ? values.user_ids : []
    if (userIds.length === 0) {
      message.warning('请至少选择一名人员。')
      return
    }
    if (values.is_primary && userIds.length > 1) {
      message.warning('批量分配时不能同时将多名人员设为主归属。')
      return
    }
    setAssigning(true)
    try {
      if (userIds.length === 1) {
        await assignUser({
          user_id: userIds[0],
          node_id: selectedNode.id,
          role_in_node: values.role_in_node,
          is_primary: values.is_primary,
        })
        message.success('人员分配成功。')
      } else {
        await batchAssignUsers({
          user_ids: userIds,
          node_id: selectedNode.id,
          role_in_node: values.role_in_node,
          is_primary: values.is_primary,
        })
        message.success(`已批量分配 ${userIds.length} 名人员。`)
      }
      setAssignModalOpen(false)
      await Promise.all([loadOrganization(), loadNodeUsers(selectedNode.id)])
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '人员分配失败。')
    } finally {
      setAssigning(false)
    }
  }

  const handleRemoveUser = async (userId: number) => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_remove_users) {
      message.warning('当前账号无权移除该节点下的成员。')
      return
    }
    try {
      await removeUser(userId, selectedNode.id)
      message.success('人员已移出当前节点。')
      setSelectedMemberIds((current) => current.filter((item) => item !== userId))
      await Promise.all([loadOrganization(), loadNodeUsers(selectedNode.id)])
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '人员移除失败。')
    }
  }

  const handleBatchRemoveUsers = async () => {
    if (!selectedNode) {
      return
    }
    if (!nodePermissions?.can_remove_users) {
      message.warning('当前账号无权移除该节点下的成员。')
      return
    }
    if (selectedMemberIds.length === 0) {
      message.warning('请先选择需要移除的成员。')
      return
    }

    setRemovingBatch(true)
    try {
      await batchRemoveUsers({
        user_ids: selectedMemberIds,
        node_id: selectedNode.id,
      })
      message.success(`已从当前节点移除 ${selectedMemberIds.length} 名成员。`)
      setSelectedMemberIds([])
      await Promise.all([loadOrganization(), loadNodeUsers(selectedNode.id)])
    } catch (error: any) {
      console.error(error)
      message.error(error.response?.data?.message || '批量移除失败。')
    } finally {
      setRemovingBatch(false)
    }
  }

  const userColumns: ColumnsType<OrganizationUserRecord> = [
    {
      title: '人员',
      key: 'real_name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.real_name}</Text>
          <Text type="secondary">{record.username}</Text>
        </Space>
      ),
    },
    {
      title: '身份',
      key: 'role_display',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Tag>{record.role_display}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.role_in_node || '未填写节点职责'}
          </Text>
        </Space>
      ),
    },
    {
      title: '编号',
      key: 'number',
      render: (_, record) => record.employee_id || record.student_id || '-',
    },
    {
      title: '主组织',
      key: 'department_name',
      render: (_, record) => record.department_name || '-',
    },
    {
      title: '主归属',
      dataIndex: 'is_primary',
      key: 'is_primary',
      width: 90,
      render: (value) => value ? <Badge status="success" text="是" /> : <Text type="secondary">否</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => (
        <Popconfirm title="确认移出当前节点？" onConfirm={() => handleRemoveUser(record.id)}>
          <Button danger size="small" type="link" disabled={!nodePermissions?.can_remove_users}>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const quickCreateLabel = selectedNode ? `在“${selectedNode.name}”下新增节点` : '新增顶层节点'
  const selectedVisual = selectedNode
    ? getOrganizationVisual(selectedNode.node_type, overview?.catalog)
    : null
  const selectedCanDelete = !!selectedNode && !!nodePermissions?.can_delete_node
  const canCreateFromCurrent = selectedNode ? !!nodePermissions?.can_create_child : flatNodes.length === 0
  const memberRoleOptions = [
    { label: '全部角色', value: 'all' },
    { label: '管理员', value: 'college_admin' },
    { label: '教职工', value: 'staff' },
    { label: '学生', value: 'student' },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={16}>
            <Space direction="vertical" size={8}>
              <Space>
                <Badge color="#1677ff" />
                <Text type="secondary">组织中心</Text>
              </Space>
              <Title level={3} style={{ margin: 0 }}>
                以组织树维护学校层级、权限边界与人员归属
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                组织节点、人员分配和下游模块围绕同一套组织层级联动。
              </Paragraph>
            </Space>
          </Col>
          <Col xs={24} lg={8}>
            <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button icon={<ReloadOutlined />} onClick={loadOrganization}>
                刷新数据
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!canCreateFromCurrent}
                onClick={() => prepareCreateModal(selectedNode?.id)}
              >
                {quickCreateLabel}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} style={summaryCardStyle}>
            <Statistic title="可见组织节点" value={overview?.summary.total_nodes || 0} prefix={<ApartmentOutlined />} />
            <Text type="secondary">当前账号有权限访问的组织树节点总数。</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} style={summaryCardStyle}>
            <Statistic title="可见人员" value={overview?.summary.accessible_users || 0} prefix={<TeamOutlined />} />
            <Text type="secondary">已纳入当前权限范围的教师、学生与管理人员。</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} style={summaryCardStyle}>
            <Statistic title="主归属关系" value={overview?.summary.primary_assignments || 0} prefix={<UserAddOutlined />} />
            <Text type="secondary">标记为主组织归属的人员关系数量。</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} style={summaryCardStyle}>
            <Statistic title="待归档人员" value={overview?.summary.unassigned_users || 0} />
            <Text type="secondary">尚未建立主组织归属的账号数量。</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card
            bordered={false}
            loading={loading}
            style={{ borderRadius: 24, minHeight: 720 }}
            title="组织树浏览"
            extra={<Badge count={flatNodes.length} />}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Input.Search
                allowClear
                placeholder="搜索节点名称"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />

              <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                <Space direction="vertical" size={6}>
                  {isUserDetailNavigation && selectedNode ? (
                    <Text strong>{sourceName ? `当前定位来自 ${sourceName}` : `当前已定位到 ${selectedNode.name}`}</Text>
                  ) : null}
                  <Text type="secondary">
                    {(overview?.hierarchy || []).join(' / ') || '系统管理员 / 学校 / 学院 / 教职工 / 学生'}
                  </Text>
                </Space>
              </Card>

              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 18,
                  padding: 16,
                  background: 'linear-gradient(180deg, #fbfdff 0%, #f6f8fb 100%)',
                }}
              >
                {filteredTreeData.length > 0 ? (
                  <Tree
                    blockNode
                    showIcon
                    treeData={filteredTreeData}
                    selectedKeys={selectedNode ? [selectedNode.key] : []}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys)}
                    onSelect={(keys) => setSelectedNodeId(keys.length ? Number(keys[0]) : null)}
                    titleRender={(node) => {
                      const visual = getOrganizationVisual(node.node_type, overview?.catalog)
                      return (
                        <Row justify="space-between" align="middle" wrap={false}>
                          <Col flex="auto">
                            <Space size={8}>
                              {visual.icon}
                              <Space direction="vertical" size={0}>
                                <Text strong>{node.name}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {node.node_type_label}
                                </Text>
                              </Space>
                            </Space>
                          </Col>
                          <Col>
                            <Badge color={node.type_color} text={`${node.data.users_count}人`} />
                          </Col>
                        </Row>
                      )
                    }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={keyword ? '没有匹配到相关节点' : '当前暂无组织结构'}
                  />
                )}
              </div>

              <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                <Space direction="vertical" size={8}>
                  <Text strong>组织分布</Text>
                  {(overview?.distribution || []).length > 0 ? (
                    <List
                      size="small"
                      dataSource={overview?.distribution || []}
                      renderItem={(item) => (
                        <List.Item style={{ paddingInline: 0 }}>
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Tag color={item.color}>{item.label}</Tag>
                            <Text strong>{item.count}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Text type="secondary">暂无可展示的组织分布。</Text>
                  )}
                </Space>
              </Card>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              bordered={false}
              style={{
                borderRadius: 24,
                border: isUserDetailNavigation ? '1px solid #b7eb8f' : undefined,
                boxShadow: isUserDetailNavigation ? '0 0 0 4px rgba(82, 196, 26, 0.12)' : undefined,
              }}
              title="节点治理面板"
              extra={
                selectedNode ? (
                  <Space wrap>
                    <Button
                      icon={<ArrowUpOutlined />}
                      onClick={() => handleMoveNode('up')}
                      disabled={!nodePermissions?.can_move_node || !siblingState?.hasPrev}
                    >
                      上移
                    </Button>
                    <Button
                      icon={<ArrowDownOutlined />}
                      onClick={() => handleMoveNode('down')}
                      disabled={!nodePermissions?.can_move_node || !siblingState?.hasNext}
                    >
                      下移
                    </Button>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => prepareCreateModal(selectedNode.id)}
                      disabled={!nodePermissions?.can_create_child}
                    >
                      添加子节点
                    </Button>
                    <Button icon={<EditOutlined />} onClick={openEditModal} disabled={!nodePermissions?.can_edit_node}>
                      编辑节点
                    </Button>
                    <Popconfirm title="确认删除当前节点？" onConfirm={handleDeleteNode}>
                      <Button danger icon={<DeleteOutlined />} disabled={!selectedCanDelete}>
                        删除节点
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : null
              }
            >
              {selectedNode && selectedVisual ? (
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                  <Space align="start">
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 16,
                        display: 'grid',
                        placeItems: 'center',
                        background: '#f5f8ff',
                        fontSize: 22,
                      }}
                    >
                      {selectedVisual.icon}
                    </div>
                    <Space direction="vertical" size={0}>
                      <Title level={4} style={{ margin: 0 }}>
                        {selectedNode.name}
                      </Title>
                      <Space wrap>
                        <Tag color={selectedNode.type_color}>{selectedNode.node_type_label}</Tag>
                        {selectedNode.data.code && <Tag>{selectedNode.data.code}</Tag>}
                      </Space>
                    </Space>
                  </Space>

                  <Breadcrumb
                    items={(nodePath || []).map((item) => ({
                      title: `${item.name} · ${item.node_type_label}`,
                    }))}
                  />

                  <Descriptions column={2} size="small" labelStyle={{ width: 96 }}>
                    <Descriptions.Item label="层级类型">{selectedNode.node_type_label}</Descriptions.Item>
                    <Descriptions.Item label="节点编码">{selectedNode.data.code || '-'}</Descriptions.Item>
                    <Descriptions.Item label="子节点数量">{selectedNode.data.children_count}</Descriptions.Item>
                    <Descriptions.Item label="节点人数">{selectedNode.data.users_count}</Descriptions.Item>
                    <Descriptions.Item label="同级顺序">
                      {siblingState ? `第 ${siblingState.position} 位 / 共 ${siblingState.total} 个` : '暂无顺序信息'}
                    </Descriptions.Item>
                    <Descriptions.Item label="排序调整">
                      {!siblingState?.hasPrev && !siblingState?.hasNext
                        ? '当前节点没有可调整的同级节点'
                        : '可调整同级顺序'}
                    </Descriptions.Item>
                    <Descriptions.Item label="可创建类型" span={2}>
                      <Space wrap>
                        {(creatableTypes || []).length > 0 ? (
                          creatableTypes.map((item) => {
                            const visual = getOrganizationVisual(item as any, overview?.catalog)
                            return <Tag key={item}>{visual.label}</Tag>
                          })
                        ) : (
                          <Text type="secondary">当前节点已到末级或无创建权限</Text>
                        )}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="操作边界" span={2}>
                      {nodePermissions?.can_edit_node
                        ? '当前节点可在本权限范围内维护。'
                        : '当前节点仅支持查看，编辑、删除和排序需从上级节点处理。'}
                    </Descriptions.Item>
                    <Descriptions.Item label="节点说明" span={2}>
                      {selectedNode.data.description || '暂无说明'}
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一个组织节点查看详情" />
              )}
            </Card>

            <Card
              bordered={false}
              style={{ borderRadius: 24 }}
              title="人员编排"
              extra={
                selectedNode ? (
                  <Button
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={openAssignModal}
                    disabled={!nodePermissions?.can_assign_users}
                  >
                    分配人员
                  </Button>
                ) : null
              }
            >
              {selectedNode && (
                <Space direction="vertical" size={16} style={{ width: '100%', marginBottom: 16 }}>
                  <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                    <Text type="secondary">
                      当前节点已有 {memberSummary?.total || 0} 名成员，还可从上级节点分配 {assignableUserCount} 名人员。
                    </Text>
                  </Card>

                  <Row gutter={[12, 12]}>
                    <Col xs={24} sm={8}>
                      <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                        <Statistic title="成员总数" value={memberSummary?.total || 0} />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                        <Statistic title="主归属人数" value={memberSummary?.primary_count || 0} />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
                        <Statistic title="可分配人员" value={assignableUserCount} />
                        <Text type="secondary">仅统计上级节点已有、当前节点尚未分配的人员。</Text>
                      </Card>
                    </Col>
                  </Row>

                  {(memberSummary?.by_role && Object.keys(memberSummary.by_role).length > 0) && (
                    <Space wrap>
                      {memberRoleOptions
                        .filter((item) => item.value !== 'all' && (memberSummary.by_role?.[item.value] || 0) > 0)
                        .map((item) => (
                          <Tag key={item.value}>
                            {item.label} {memberSummary.by_role?.[item.value] || 0}
                          </Tag>
                        ))}
                    </Space>
                  )}

                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={14}>
                      <Input.Search
                        allowClear
                        placeholder="搜索成员姓名、账号、编号或主组织"
                        value={memberKeyword}
                        onChange={(event) => setMemberKeyword(event.target.value)}
                      />
                    </Col>
                    <Col xs={24} md={10}>
                      <Select
                        value={memberRole}
                        onChange={setMemberRole}
                        options={memberRoleOptions}
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>

                  <Space wrap>
                    <Text type="secondary">
                      已选成员：{selectedMemberIds.length} 人
                    </Text>
                    <Popconfirm
                      title={`确认从当前节点批量移除 ${selectedMemberIds.length} 名成员？`}
                      onConfirm={handleBatchRemoveUsers}
                      disabled={!selectedMemberIds.length || !nodePermissions?.can_remove_users}
                    >
                      <Button
                        danger
                        disabled={!selectedMemberIds.length || !nodePermissions?.can_remove_users}
                        loading={removingBatch}
                      >
                        批量移出当前节点
                      </Button>
                    </Popconfirm>
                    {selectedMemberIds.length > 0 ? (
                      <Button onClick={() => setSelectedMemberIds([])}>
                        清空选择
                      </Button>
                    ) : null}
                  </Space>
                </Space>
              )}

              <Table
                rowKey="id"
                columns={userColumns}
                dataSource={filteredNodeUsers}
                rowSelection={{
                  selectedRowKeys: selectedMemberIds,
                  onChange: (keys) => setSelectedMemberIds(keys.map((item) => Number(item))),
                  getCheckboxProps: () => ({
                    disabled: !nodePermissions?.can_remove_users,
                  }),
                }}
                loading={usersLoading}
                pagination={{ pageSize: 6, hideOnSinglePage: true }}
                locale={{ emptyText: '当前节点暂无成员' }}
                scroll={{ x: 860 }}
              />
            </Card>

            <Card bordered={false} style={{ borderRadius: 24 }} title="组织概览">
              <List
                split={false}
                dataSource={[
                  `学校节点：${overview?.summary.school_count || 0} 个，学院节点：${overview?.summary.college_count || 0} 个。`,
                  `教职工节点：${overview?.summary.staff_count || 0} 个，学生节点：${overview?.summary.student_count || 0} 个。`,
                  overview?.root_names?.length
                    ? `当前组织树根视图：${overview.root_names.join('、')}。`
                    : '当前还未建立根节点视图。',
                ]}
                renderItem={(item) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal
        destroyOnHidden
        open={nodeModalOpen}
        title={nodeModalMode === 'edit' ? '编辑组织节点' : '创建组织节点'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={handleSaveNode}
        onCancel={() => setNodeModalOpen(false)}
      >
        <Form form={nodeForm} layout="vertical">
          {nodeModalMode === 'create' && (
            <Form.Item name="node_type" label="节点类型" rules={[{ required: true, message: '请选择节点类型' }]}>
              <Select
                placeholder="请选择节点类型"
                options={availableNodeTypes.map((item) => ({
                  label: item.label,
                  value: item.key,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: '请输入节点名称' }]}>
            <Input placeholder="例如：信息工程学院" />
          </Form.Item>
          <Form.Item name="code" label="节点编码">
            <Input placeholder="例如：COL-INFO" />
          </Form.Item>
          <Form.Item name="description" label="节点说明">
            <Input.TextArea rows={4} placeholder="描述当前组织节点的职责、边界或业务定位" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        destroyOnHidden
        open={assignModalOpen}
        title="分配人员到当前节点"
        okText="确认分配"
        cancelText="取消"
        confirmLoading={assigning}
        onOk={handleAssignUser}
        onCancel={() => setAssignModalOpen(false)}
      >
        <Form form={assignForm} layout="vertical">
          {selectedNode && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`即将分配到：${selectedNode.name}`}
              description={`当前节点类型为“${selectedNode.node_type_label}”，系统只展示已在上级节点且尚未进入当前节点的人员。`}
            />
          )}
          <Form.Item label="候选角色筛选">
            <Select value={assignRole} onChange={setAssignRole} options={memberRoleOptions} />
          </Form.Item>
          <Form.Item name="user_ids" label="选择人员" rules={[{ required: true, message: '请至少选择一名人员' }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="输入姓名、账号或角色快速搜索，支持多选"
              options={filteredUserOptions.map((item) => ({
                value: item.id,
                label: `${item.real_name} · ${item.username} · ${item.role_display}${item.department_name ? ` · 当前主组织：${item.department_name}` : ''}`,
              }))}
              notFoundContent="当前节点没有可分配人员"
            />
          </Form.Item>
          <Form.Item name="role_in_node" label="节点内职责">
            <Input placeholder="例如：节点负责人、辅导员、班主任" />
          </Form.Item>
          <Form.Item name="is_primary" label="设为主归属" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Text type="secondary" style={{ display: 'block' }}>
            可一次选择多名人员批量下发；多选时不能同时设置为主归属。
          </Text>
        </Form>
      </Modal>
    </Space>
  )
}

export default OrganizationPage








