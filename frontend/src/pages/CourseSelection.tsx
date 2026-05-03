import { getApiErrorMessage } from '@/lib/errors'
import request from '@/lib/request'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BookOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { dropCourse, selectCourse } from '@/api'
import type { CourseItem, CourseSelectionRecord } from '@/features/courses/types'

const { Paragraph, Text, Title } = Typography

interface ScheduleItem {
  day_of_week: number
  start_time: string
  end_time: string
  day_display?: string
}

const CourseSelectionPage: React.FC = () => {
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selected, setSelected] = useState<CourseSelectionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.course_id || item.course?.id).filter(Boolean)),
    [selected],
  )

  const loadData = async () => {
    setLoading(true)
    try {
      const [coursesResponse, selectedResponse] = await Promise.all([
        request.get('/course/api/courses', { skipErrorMessage: true }),
        request.get('/course/api/courses/my-selections', { skipErrorMessage: true }),
      ])
      setCourses(coursesResponse.data.data || [])
      setSelected(selectedResponse.data.data || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '选课数据加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredCourses = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return courses.filter((item) => {
      const selectedFlag = selectedIds.has(item.id)
      if (statusFilter === 'selected' && !selectedFlag) {
        return false
      }
      if (statusFilter === 'available' && selectedFlag) {
        return false
      }
      if (!normalizedKeyword) {
        return true
      }
      return [item.name, item.code, item.teacher_name, item.location]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedKeyword))
    })
  }, [courses, keyword, selectedIds, statusFilter])

  const stats = useMemo(() => ({
    total: courses.length,
    selected: selectedIds.size,
    available: courses.filter((item) => item.is_active && item.current_students < item.max_students && !selectedIds.has(item.id)).length,
  }), [courses, selectedIds])

  const formatSchedule = (course: CourseItem) => {
    if (!course.schedules?.length) {
      return '未设置'
    }
    return course.schedules.map((item) => `${item.day_display || '周'} ${item.start_time}-${item.end_time}`).join(' / ')
  }

  const handleSelect = async (courseId: number) => {
    setActionId(courseId)
    try {
      const response = await selectCourse(courseId)
      message.success(response.data.message || '选课成功。')
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '选课失败。'))
    } finally {
      setActionId(null)
    }
  }

  const handleDrop = async (courseId: number) => {
    setActionId(courseId)
    try {
      const response = await dropCourse(courseId)
      message.success(response.data.message || '退选成功。')
      await loadData()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '退选失败。'))
    } finally {
      setActionId(null)
    }
  }

  const columns: ColumnsType<CourseItem> = [
    {
      title: '课程',
      key: 'course',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.name}</Text>
          <Text type="secondary">{record.code}</Text>
        </Space>
      ),
    },
    {
      title: '教师',
      dataIndex: 'teacher_name',
      render: (value: string) => value || '未设置',
    },
    { title: '学期', dataIndex: 'semester' },
    { title: '地点', dataIndex: 'location', render: (value: string) => value || '未设置' },
    { title: '上课时间', key: 'schedules', render: (_, record) => formatSchedule(record) },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => {
        const selectedFlag = selectedIds.has(record.id)
        if (selectedFlag) return <Tag color="green">已选</Tag>
        if (!record.is_active) return <Tag>已停用</Tag>
        if (record.current_students >= record.max_students) return <Tag color="orange">已满</Tag>
        return <Tag color="blue">可选</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => {
        const selectedFlag = selectedIds.has(record.id)
        const disabled = !record.is_active || record.current_students >= record.max_students
        return selectedFlag ? (
          <Button danger loading={actionId === record.id} onClick={() => handleDrop(record.id)}>
            退选
          </Button>
        ) : (
          <Button type="primary" disabled={disabled} loading={actionId === record.id} onClick={() => handleSelect(record.id)}>
            {disabled ? '不可选' : '选课'}
          </Button>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">学生选课</Text>
          <Title level={2} style={{ margin: 0 }}>查看可选课程并完成选课</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            按你的组织范围展示可选课程。
          </Paragraph>
        </Space>
      </Card>

      <Space size={16} style={{ width: '100%' }} wrap>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="课程总数" value={stats.total} prefix={<BookOutlined />} /></Card>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="已选课程" value={stats.selected} prefix={<CheckCircleOutlined />} /></Card>
        <Card bordered={false} style={{ minWidth: 220 }}><Statistic title="仍可选择" value={stats.available} prefix={<ClockCircleOutlined />} /></Card>
      </Space>

      <Card bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索课程名称、代码、教师或地点"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={setKeyword}
              style={{ width: 280 }}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: '全部课程', value: 'all' },
                { label: '只看已选', value: 'selected' },
                { label: '只看未选', value: 'available' },
              ]}
              style={{ width: 160 }}
            />
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={filteredCourses}
            locale={{ emptyText: <Empty description="当前没有可选课程。" /> }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        </Space>
      </Card>
    </Space>
  )
}

export default CourseSelectionPage



