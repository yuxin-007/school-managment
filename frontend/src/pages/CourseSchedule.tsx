import { getApiErrorMessage } from '@/lib/errors'
import request from '@/lib/request'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, ReadOutlined } from '@ant-design/icons'

const { Paragraph, Text, Title } = Typography

interface ScheduleRecord {
  course_id: number
  course_name: string
  course_code: string
  teacher_name?: string
  location?: string
  day_of_week: number
  day_display: string
  start_time: string
  end_time: string
  time_display: string
}

const weekdayOrder = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

const CourseSchedulePage: React.FC = () => {
  const [records, setRecords] = useState<ScheduleRecord[]>([])
  const [loading, setLoading] = useState(false)

  const loadSchedule = async () => {
    setLoading(true)
    try {
      const response = await request.get('/course/api/courses/schedule', { skipErrorMessage: true })
      setRecords(response.data.data || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '课表加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedule()
  }, [])

  const groupedRecords = useMemo(() => {
    const groups = weekdayOrder.map((day) => ({ day, items: [] as ScheduleRecord[] }))
    records.forEach((item) => {
      const group = groups.find((entry) => entry.day === item.day_display)
      if (group) {
        group.items.push(item)
      }
    })
    groups.forEach((group) => {
      group.items.sort((a, b) => a.start_time.localeCompare(b.start_time))
    })
    return groups
  }, [records])

  const todayItems = useMemo(() => {
    const todayIndex = (new Date().getDay() + 6) % 7
    return groupedRecords[todayIndex]?.items || []
  }, [groupedRecords])

  const columns: ColumnsType<ScheduleRecord> = [
    { title: '星期', dataIndex: 'day_display', width: 100 },
    { title: '课程', dataIndex: 'course_name' },
    { title: '课程代码', dataIndex: 'course_code', width: 120 },
    { title: '时间', dataIndex: 'time_display', width: 160 },
    { title: '地点', dataIndex: 'location', render: (value: string) => value || '未设置', width: 180 },
    { title: '教师', dataIndex: 'teacher_name', render: (value: string) => value || '未设置', width: 140 },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">课程表</Text>
          <Title level={2} style={{ margin: 0 }}>按周查看课程安排</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            这里会汇总你当前学期的课程时间、地点和授课教师，方便快速查看每周安排。
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="本周课程节次" value={records.length} prefix={<ReadOutlined />} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="今日课程" value={todayItems.length} prefix={<CalendarOutlined />} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="涉及教室" value={new Set(records.map((item) => item.location).filter(Boolean)).size} prefix={<EnvironmentOutlined />} /></Card></Col>
        <Col xs={24} md={6}><Card bordered={false}><Statistic title="最早上课时间" value={records.length ? records.map((item) => item.start_time).sort()[0] : '--'} prefix={<ClockCircleOutlined />} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        {groupedRecords.map((group) => (
          <Col xs={24} lg={12} xl={8} key={group.day}>
            <Card bordered={false} title={group.day} extra={<Tag color="blue">{group.items.length} 节</Tag>}>
              {group.items.length ? (
                <List
                  dataSource={group.items}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Space><Text strong>{item.course_name}</Text><Tag>{item.time_display}</Tag></Space>}
                        description={`${item.location || '未设置地点'} · ${item.teacher_name || '未设置教师'}`}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="当天没有课程安排。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Card bordered={false} title="课表明细">
        <Table
          rowKey={(record) => `${record.course_id}-${record.day_of_week}-${record.start_time}`}
          loading={loading}
          columns={columns}
          dataSource={records}
          locale={{ emptyText: <Empty description="当前没有课表数据。" /> }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>
    </Space>
  )
}

export default CourseSchedulePage

