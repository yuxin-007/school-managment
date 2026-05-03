import { getApiErrorMessage } from '@/lib/errors'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Pagination,
  Row,
  Col,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  BellOutlined,
  CalendarOutlined,
  EyeOutlined,
  NotificationOutlined,
  PushpinOutlined,
  ReadOutlined,
} from '@ant-design/icons'
import { getAnnouncementDetail, getAnnouncements } from '@/api'

const { Title, Text, Paragraph } = Typography

interface AnnouncementItem {
  id: number
  title: string
  content: string
  category: string
  category_display: string
  priority: string
  priority_display: string
  author_name: string
  is_pinned: boolean
  is_active: boolean
  start_date: string
  end_date: string
  view_count: number
  created_at: string
  updated_at?: string
}

const categoryColorMap: Record<string, string> = {
  general: 'blue',
  system: 'purple',
  course: 'green',
  leave: 'cyan',
}

const priorityColorMap: Record<string, string> = {
  normal: 'default',
  important: 'orange',
  urgent: 'red',
}

const AnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementItem | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })

  const loadAnnouncements = async (page = 1, category = categoryFilter) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, per_page: pagination.pageSize }
      if (category && category !== 'all') {
        params.category = category
      }

      const response = await getAnnouncements(params)
      if (response.data.success) {
        setAnnouncements(response.data.data || [])
        setPagination((prev) => ({
          ...prev,
          current: response.data.pagination?.page || page,
          total: response.data.pagination?.total || 0,
        }))
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnnouncements()
    // Initial load only; pagination changes are handled by table events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredAnnouncements = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return announcements
    }

    return announcements.filter((item) =>
      [item.title, item.content, item.author_name, item.category_display]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword)),
    )
  }, [announcements, keyword])

  const stats = useMemo(
    () => ({
      total: announcements.length,
      pinned: announcements.filter((item) => item.is_pinned).length,
      important: announcements.filter((item) => item.priority === 'important' || item.priority === 'urgent').length,
      totalViews: announcements.reduce((sum, item) => sum + (item.view_count || 0), 0),
    }),
    [announcements],
  )

  const handlePageChange = (page: number) => {
    loadAnnouncements(page)
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value)
    loadAnnouncements(1, value)
  }

  const handleView = async (item: AnnouncementItem) => {
    setDetailLoading(true)
    try {
      const response = await getAnnouncementDetail(item.id)
      if (response.data.success) {
        const nextDetail = response.data.data
        setSelectedAnnouncement(nextDetail)
        setDetailVisible(true)
        setAnnouncements((current) =>
          current.map((entry) => (entry.id === item.id ? { ...entry, view_count: nextDetail.view_count } : entry)),
        )
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '公告详情加载失败。'))
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">公告中心</Text>
          <Title level={3} style={{ margin: 0 }}>
            集中查看学校通知、课程提醒和重要公告
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 860 }}>
            当前仅展示有效期内的公告，并将置顶内容排在前面。
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="本页公告" value={stats.total} prefix={<BellOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="置顶公告" value={stats.pinned} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="重要公告" value={stats.important} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 18 }}>
            <Statistic title="累计浏览" value={stats.totalViews} prefix={<ReadOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder="搜索标题、内容或发布人"
                style={{ width: 280 }}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <Select
                value={categoryFilter}
                onChange={handleCategoryChange}
                style={{ width: 180 }}
                options={[
                  { label: '全部分类', value: 'all' },
                  { label: '普通公告', value: 'general' },
                  { label: '系统通知', value: 'system' },
                  { label: '课程通知', value: 'course' },
                  { label: '请假通知', value: 'leave' },
                ]}
              />
            </Space>
            <Text type="secondary">当前展示 {filteredAnnouncements.length} 条公告</Text>
          </Space>

          <List
            itemLayout="vertical"
            loading={loading}
            dataSource={filteredAnnouncements}
            locale={{ emptyText: <Empty description="当前没有可查看的公告。" /> }}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                extra={
                  <Space direction="vertical" align="end" size={8}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <CalendarOutlined /> {item.created_at}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <EyeOutlined /> {item.view_count} 次浏览
                    </Text>
                    <Button type="link" style={{ paddingInline: 0 }} onClick={() => handleView(item)}>
                      查看详情
                    </Button>
                  </Space>
                }
                actions={[
                  <Space key="tags" wrap>
                    {item.is_pinned ? (
                      <Tag icon={<PushpinOutlined />} color="gold">
                        置顶
                      </Tag>
                    ) : null}
                    <Tag color={categoryColorMap[item.category] || 'default'}>{item.category_display}</Tag>
                    <Tag color={priorityColorMap[item.priority] || 'default'}>{item.priority_display}</Tag>
                    <Tag icon={<NotificationOutlined />}>
                      {item.start_date || '立即'} 至 {item.end_date || '长期'}
                    </Tag>
                  </Space>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      {item.is_pinned ? <PushpinOutlined style={{ color: '#faad14' }} /> : null}
                      <Text strong style={{ fontSize: 16 }}>
                        {item.title}
                      </Text>
                    </Space>
                  }
                  description={<Text type="secondary">发布人：{item.author_name}</Text>}
                />
                <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }} style={{ marginTop: 8 }}>
                  {item.content}
                </Paragraph>
              </List.Item>
            )}
          />

          <Pagination
            align="end"
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={handlePageChange}
            showSizeChanger={false}
          />
        </Space>
      </Card>

      <Drawer
        title="公告详情"
        open={detailVisible}
        width={640}
        onClose={() => setDetailVisible(false)}
        loading={detailLoading}
      >
        {selectedAnnouncement && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              {selectedAnnouncement.is_pinned ? <Tag color="gold">置顶</Tag> : null}
              <Tag color={categoryColorMap[selectedAnnouncement.category] || 'default'}>
                {selectedAnnouncement.category_display}
              </Tag>
              <Tag color={priorityColorMap[selectedAnnouncement.priority] || 'default'}>
                {selectedAnnouncement.priority_display}
              </Tag>
            </Space>

            <Title level={3} style={{ margin: 0 }}>
              {selectedAnnouncement.title}
            </Title>

            <Space wrap>
              <Text type="secondary">发布人：{selectedAnnouncement.author_name}</Text>
              <Text type="secondary">发布时间：{selectedAnnouncement.created_at}</Text>
              <Text type="secondary">浏览量：{selectedAnnouncement.view_count}</Text>
            </Space>

            <Card bordered={false} style={{ background: '#fafafa' }}>
              <Space direction="vertical" size={8}>
                <Text strong>有效期</Text>
                <Text type="secondary">
                  {selectedAnnouncement.start_date || '立即'} 至 {selectedAnnouncement.end_date || '长期有效'}
                </Text>
              </Space>
            </Card>

            <Paragraph style={{ whiteSpace: 'pre-wrap', lineHeight: 1.85, marginBottom: 0 }}>
              {selectedAnnouncement.content}
            </Paragraph>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}

export default AnnouncementsPage

