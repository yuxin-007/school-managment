import { getApiErrorMessage, hasFormErrorFields } from '@/lib/errors'
import { priorityColorMap } from '@/features/announcements/constants'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  NotificationOutlined,
  PlusOutlined,
  PushpinOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementDetail,
  getAllAnnouncements,
  updateAnnouncement,
} from '@/api'

const { Paragraph, Text, Title } = Typography

interface AnnouncementItem {
  id: number
  title: string
  content: string
  category: string
  category_display?: string
  priority: string
  priority_display?: string
  author_name?: string
  is_pinned: boolean
  is_active: boolean
  start_date?: string
  end_date?: string
  view_count?: number
  created_at?: string
}

interface AnnouncementFormValues {
  title: string
  content: string
  category: string
  priority: string
  is_pinned: boolean
  is_active: boolean
  start_date?: string
  end_date?: string
}

const categoryOptions = [
  { label: '普通', value: 'general' },
  { label: '系统通知', value: 'system' },
  { label: '课程通知', value: 'course' },
  { label: '请假通知', value: 'leave' },
]

const priorityOptions = [
  { label: '普通', value: 'normal' },
  { label: '重要', value: 'important' },
  { label: '紧急', value: 'urgent' },
]

const AnnouncementManagePage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<AnnouncementItem | null>(null)
  const [detailItem, setDetailItem] = useState<AnnouncementItem | null>(null)
  const [form] = Form.useForm<AnnouncementFormValues>()

  const loadAnnouncements = async () => {
    setLoading(true)
    try {
      const response = await getAllAnnouncements({ page: 1, per_page: 100 })
      setAnnouncements(response.data.data || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告列表加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

  const filteredAnnouncements = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return announcements.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      if (statusFilter === 'active' && !item.is_active) {
        return false
      }
      if (statusFilter === 'inactive' && item.is_active) {
        return false
      }
      if (!normalizedKeyword) {
        return true
      }
      return [item.title, item.content, item.author_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedKeyword))
    })
  }, [announcements, keyword, categoryFilter, statusFilter])

  const stats = useMemo(() => ({
    total: announcements.length,
    active: announcements.filter((item) => item.is_active).length,
    pinned: announcements.filter((item) => item.is_pinned).length,
    urgent: announcements.filter((item) => item.priority === 'urgent').length,
  }), [announcements])

  const openCreateModal = () => {
    setEditingItem(null)
    form.setFieldsValue({
      title: '',
      content: '',
      category: 'general',
      priority: 'normal',
      is_pinned: false,
      is_active: true,
      start_date: '',
      end_date: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (item: AnnouncementItem) => {
    setEditingItem(item)
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      category: item.category,
      priority: item.priority,
      is_pinned: item.is_pinned,
      is_active: item.is_active,
      start_date: item.start_date || '',
      end_date: item.end_date || '',
    })
    setModalOpen(true)
  }

  const openDetail = async (item: AnnouncementItem) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const response = await getAnnouncementDetail(item.id, { increment_view: false })
      setDetailItem(response.data.data || item)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告详情加载失败。'))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      }
      if (editingItem) {
        const response = await updateAnnouncement(editingItem.id, payload)
        message.success(response.data.message || '公告已更新。')
      } else {
        const response = await createAnnouncement(payload)
        message.success(response.data.message || '公告已发布。')
      }
      setModalOpen(false)
      await loadAnnouncements()
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '公告保存失败。'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    setActionId(id)
    try {
      const response = await deleteAnnouncement(id)
      message.success(response.data.message || '公告已删除。')
      await loadAnnouncements()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告删除失败。'))
    } finally {
      setActionId(null)
    }
  }

  const handleQuickToggle = async (item: AnnouncementItem, changes: Partial<AnnouncementItem>) => {
    setActionId(item.id)
    try {
      const response = await updateAnnouncement(item.id, changes)
      message.success(response.data.message || '公告状态已更新。')
      await loadAnnouncements()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告状态更新失败。'))
    } finally {
      setActionId(null)
    }
  }

  const columns: ColumnsType<AnnouncementItem> = [
    {
      title: '公告标题',
      key: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space>
            <Text strong>{record.title}</Text>
            {record.is_pinned && <Tag color="gold">置顶</Tag>}
            <Tag color={priorityColorMap[record.priority] || 'default'}>{record.priority_display || record.priority}</Tag>
          </Space>
          <Text type="secondary">发布人：{record.author_name || '未知'} | 发布时间：{record.created_at || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category_display',
      render: (value: string, record) => value || record.category,
    },
    {
      title: '生效期',
      key: 'dateRange',
      render: (_, record) => `${record.start_date || '立即'} 至 ${record.end_date || '长期有效'}`,
    },
    {
      title: '浏览量',
      dataIndex: 'view_count',
      width: 100,
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => <Badge status={record.is_active ? 'success' : 'default'} text={record.is_active ? '已发布' : '已下线'} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_, record) => (
        <Space wrap>
          <Button type="link" icon={<EyeOutlined />} onClick={() => openDetail(record)}>
            详情
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Button
            type="link"
            icon={<PushpinOutlined />}
            loading={actionId === record.id}
            onClick={() => handleQuickToggle(record, { is_pinned: !record.is_pinned })}
          >
            {record.is_pinned ? '取消置顶' : '置顶'}
          </Button>
          <Switch
            checked={record.is_active}
            checkedChildren="发布"
            unCheckedChildren="下线"
            loading={actionId === record.id}
            onChange={(checked) => handleQuickToggle(record, { is_active: checked })}
          />
          <Popconfirm title="确认删除这条公告吗？" onConfirm={() => handleDelete(record.id)}>
            <Button danger type="link" icon={<DeleteOutlined />} loading={actionId === record.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">公告治理</Text>
          <Title level={2} style={{ margin: 0 }}>
            管理公告发布、置顶和生效状态
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            在这里维护公告内容、发布时间和当前状态。
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="公告总数" value={stats.total} prefix={<NotificationOutlined />} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="当前发布" value={stats.active} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="置顶公告" value={stats.pinned} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="紧急公告" value={stats.urgent} /></Card></Col>
      </Row>

      <Card bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder="搜索标题、内容或发布人"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onSearch={setKeyword}
                style={{ width: 280 }}
              />
              <Select
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[{ label: '全部分类', value: 'all' }, ...categoryOptions]}
                style={{ width: 160 }}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '已发布', value: 'active' },
                  { label: '已下线', value: 'inactive' },
                ]}
                style={{ width: 160 }}
              />
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建公告
            </Button>
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={filteredAnnouncements}
            locale={{ emptyText: <Empty description="当前没有可管理的公告。" /> }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        </Space>
      </Card>

      <Modal
        title={editingItem ? '编辑公告' : '新建公告'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="公告标题" rules={[{ required: true, message: '请输入公告标题。' }]}>
            <Input placeholder="请输入公告标题" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="category" label="公告分类" rules={[{ required: true, message: '请选择分类。' }]}>
                <Select options={categoryOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级。' }]}>
                <Select options={priorityOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_active" label="发布状态" valuePropName="checked">
                <Switch checkedChildren="发布" unCheckedChildren="下线" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="start_date" label="生效日期">
                <Input placeholder="YYYY-MM-DD，可留空" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="end_date" label="失效日期">
                <Input placeholder="YYYY-MM-DD，可留空" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_pinned" label="置顶显示" valuePropName="checked">
            <Switch checkedChildren="置顶" unCheckedChildren="普通" />
          </Form.Item>
          <Form.Item name="content" label="公告内容" rules={[{ required: true, message: '请输入公告内容。' }]}>
            <Input.TextArea rows={8} placeholder="请输入公告正文内容" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="公告详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={560} loading={detailLoading}>
        {detailItem && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="标题">{detailItem.title}</Descriptions.Item>
              <Descriptions.Item label="分类">{detailItem.category_display || detailItem.category}</Descriptions.Item>
              <Descriptions.Item label="优先级">{detailItem.priority_display || detailItem.priority}</Descriptions.Item>
              <Descriptions.Item label="发布人">{detailItem.author_name || '未知'}</Descriptions.Item>
              <Descriptions.Item label="状态">{detailItem.is_active ? '已发布' : '已下线'}</Descriptions.Item>
              <Descriptions.Item label="置顶">{detailItem.is_pinned ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="浏览量">{detailItem.view_count || 0}</Descriptions.Item>
              <Descriptions.Item label="生效期">{detailItem.start_date || '立即'} 至 {detailItem.end_date || '长期有效'}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="公告正文">
              <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{detailItem.content}</Paragraph>
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}

export default AnnouncementManagePage



