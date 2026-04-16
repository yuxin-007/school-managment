import React, { useState, useEffect } from 'react'
import {
  Card, Table, Tag, message, Typography, Row, Col, Statistic, Empty
} from 'antd'
import {
  TrophyOutlined, RiseOutlined, TeamOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAuthStore } from '@/store/authStore'
import { getMyGrades } from '@/api'

const { Title, Text } = Typography

interface GradeItem {
  id: number
  student_id: number
  course_id: number
  course_name: string
  course_code: string
  teacher_name: string
  score: number
  grade_type: string
  grade_letter: string
  grade_type_display: string
  semester: string
  is_published: boolean
  created_at: string
}

const MyGradesPage: React.FC = () => {
  const { user } = useAuthStore()
  const isStudent = user?.role === 'student'

  const [grades, setGrades] = useState<GradeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const loadGrades = async (page = 1) => {
    if (!isStudent) return

    setLoading(true)
    try {
      const res = await getMyGrades({ page, per_page: pagination.pageSize })
      if (res.data.success) {
        setGrades(res.data.data || [])
        setPagination(prev => ({
          ...prev,
          current: res.data.pagination?.page || page,
          total: res.data.pagination?.total || 0
        }))
      }
    } catch (error) {
      message.error('加载成绩失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGrades()
  }, [isStudent])

  const handlePageChange = (page: number) => {
    loadGrades(page)
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'default'
    if (score >= 90) return 'green'
    if (score >= 80) return 'cyan'
    if (score >= 70) return 'blue'
    if (score >= 60) return 'orange'
    return 'red'
  }

  const getGradeTypeTag = (type: string) => {
    const map: Record<string, { color: string; text: string }> = {
      usual: { color: 'blue', text: '平时' },
      midterm: { color: 'orange', text: '期中' },
      final: { color: 'purple', text: '期末' },
      total: { color: 'green', text: '总评' }
    }
    const config = map[type] || { color: 'default', text: type }
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const columns: ColumnsType<GradeItem> = [
    {
      title: '课程名称',
      dataIndex: 'course_name',
      key: 'course_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '课程代码',
      dataIndex: 'course_code',
      key: 'course_code',
      width: 100,
    },
    {
      title: '授课教师',
      dataIndex: 'teacher_name',
      key: 'teacher_name',
      width: 100,
    },
    {
      title: '学期',
      dataIndex: 'semester',
      key: 'semester',
      width: 120,
    },
    {
      title: '成绩类型',
      dataIndex: 'grade_type',
      key: 'grade_type',
      width: 80,
      render: (type: string) => getGradeTypeTag(type)
    },
    {
      title: '成绩',
      dataIndex: 'score',
      key: 'score',
      width: 100,
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
      render: (score: number | null) => {
        const text = score !== null ? String(score) : '-'
        return <Text strong style={{ fontSize: 16 }} type={score !== null ? undefined : 'secondary'}>{text}</Text>
      }
    },
    {
      title: '等级',
      dataIndex: 'grade_letter',
      key: 'grade_letter',
      width: 80,
      render: (letter: string | null, record) => (
        letter ? (
          <Tag color={getScoreColor(record.score)} style={{ fontSize: 14 }}>
            {letter}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
    },
    {
      title: '发布时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
    }
  ]

  // 计算统计信息
  const calculateStats = () => {
    if (grades.length === 0) {
      return { totalCredits: 0, avgScore: 0, passedCount: 0, rank: '-' }
    }

    const totalCredits = grades.reduce((sum, g) => sum + (g.score || 0), 0)
    const avgScore = grades.length > 0 ? (totalCredits / grades.length) : 0
    const passedCount = grades.filter(g => g.score !== null && g.score >= 60).length

    return {
      totalCredits: grades.length,
      avgScore: avgScore.toFixed(1),
      passedCount,
      rank: '-'
    }
  }

  const stats = calculateStats()

  if (!isStudent) {
    return (
      <Card>
        <Text type="secondary">您没有权限访问此页面</Text>
      </Card>
    )
  }

  return (
    <div>
      <Card
        title={
          <span>
            <TrophyOutlined /> 我的成绩
          </span>
        }
      >
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic
              title="已修课程"
              value={stats.totalCredits}
              prefix={<TeamOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="平均成绩"
              value={Number(stats.avgScore)}
              precision={1}
              suffix="分"
              prefix={<RiseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="已通过"
              value={stats.passedCount}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="成绩记录"
              value={pagination.total}
              suffix="条"
            />
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={grades}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            onChange: handlePageChange,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    暂无成绩记录
                    <br />
                    <Text type="secondary">请先完成选课并等待教师发布成绩</Text>
                  </span>
                }
              />
            )
          }}
        />
      </Card>
    </div>
  )
}

export default MyGradesPage
