import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Modal, Form, InputNumber, Select,
  Tag, message, Typography, Row, Col, Statistic
} from 'antd'
import {
  BookOutlined, SaveOutlined, TeamOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAuthStore } from '@/store/authStore'
import {
  getTeacherCourses, getCourseStudents, saveGrade, getGradeStats
} from '@/api'

const { Title, Text } = Typography

interface StudentGrade {
  student_id: number
  student_name: string
  student_number: string
  grade_id: number | null
  score: number | null
  grade_letter: string | null
  grade_type: string | null
  is_published: boolean
}

interface CourseInfo {
  id: number
  name: string
  code: string
  semester: string
  grade_count: number
}

const GradeEntryPage: React.FC = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'college_admin'
  const isTeacher = user?.role === 'staff'

  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [selectedCourse, setSelectedCourse] = useState<CourseInfo | null>(null)
  const [students, setStudents] = useState<StudentGrade[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState({ total: 0, published: 0, avg_score: 0 })

  const gradeTypeOptions = [
    { label: '平时成绩', value: 'usual' },
    { label: '期中成绩', value: 'midterm' },
    { label: '期末成绩', value: 'final' },
    { label: '总评成绩', value: 'total' },
  ]

  const loadCourses = async () => {
    try {
      const res = await getTeacherCourses()
      if (res.data.success) {
        setCourses(res.data.data || [])
      }
    } catch (error) {
      message.error('加载课程失败')
    }
  }

  const loadStats = async () => {
    try {
      const res = await getGradeStats()
      if (res.data.success) {
        setStats(res.data.data)
      }
    } catch (error) {
      console.error('加载统计失败')
    }
  }

  useEffect(() => {
    if (isAdmin || isTeacher) {
      loadCourses()
      loadStats()
    }
  }, [isAdmin, isTeacher])

  const loadStudents = async (courseId: number) => {
    setLoading(true)
    try {
      const res = await getCourseStudents(courseId)
      if (res.data.success) {
        setStudents(res.data.data || [])
      }
    } catch (error) {
      message.error('加载学生列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCourseChange = (courseId: number) => {
    const course = courses.find(c => c.id === courseId)
    setSelectedCourse(course || null)
    if (courseId) {
      loadStudents(courseId)
    } else {
      setStudents([])
    }
  }

  const handleScoreChange = (studentId: number, score: number | null) => {
    setStudents(prev =>
      prev.map(s =>
        s.student_id === studentId ? { ...s, score } : s
      )
    )
  }

  const handleGradeTypeChange = (studentId: number, gradeType: string) => {
    setStudents(prev =>
      prev.map(s =>
        s.student_id === studentId ? { ...s, grade_type: gradeType } : s
      )
    )
  }

  const handleSave = async (record: StudentGrade) => {
    if (record.score === null || record.score === undefined) {
      message.warning('请输入成绩')
      return
    }
    if (!selectedCourse) return

    setSaving(true)
    try {
      const res = await saveGrade({
        student_id: record.student_id,
        course_id: selectedCourse.id,
        score: record.score,
        grade_type: record.grade_type || 'final',
        is_published: record.is_published
      })
      if (res.data.success) {
        message.success('保存成功')
        loadStudents(selectedCourse.id)
        loadStats()
      } else {
        message.error(res.data.message || '保存失败')
      }
    } catch (error) {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePublishToggle = async (record: StudentGrade) => {
    if (!selectedCourse || record.grade_id === null) {
      message.warning('请先保存成绩再发布')
      return
    }

    try {
      const res = await saveGrade({
        student_id: record.student_id,
        course_id: selectedCourse.id,
        score: record.score,
        grade_type: record.grade_type || 'final',
        is_published: !record.is_published
      })
      if (res.data.success) {
        message.success(record.is_published ? '已取消发布' : '发布成功')
        loadStudents(selectedCourse.id)
        loadStats()
      } else {
        message.error(res.data.message || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'default'
    if (score >= 90) return 'green'
    if (score >= 80) return 'cyan'
    if (score >= 70) return 'blue'
    if (score >= 60) return 'orange'
    return 'red'
  }

  const columns: ColumnsType<StudentGrade> = [
    {
      title: '学号',
      dataIndex: 'student_number',
      key: 'student_number',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'student_name',
      key: 'student_name',
      width: 100,
    },
    {
      title: '成绩类型',
      dataIndex: 'grade_type',
      key: 'grade_type',
      width: 120,
      render: (grade_type: string, record) => (
        <Select
          value={grade_type || 'final'}
          options={gradeTypeOptions}
          onChange={(value) => handleGradeTypeChange(record.student_id, value)}
          style={{ width: 100 }}
          disabled={record.is_published}
        />
      )
    },
    {
      title: '成绩',
      dataIndex: 'score',
      key: 'score',
      width: 120,
      render: (score: number | null, record) => (
        <InputNumber
          min={0}
          max={100}
          precision={1}
          value={score}
          onChange={(value) => handleScoreChange(record.student_id, value)}
          style={{ width: 100 }}
          disabled={record.is_published}
        />
      )
    },
    {
      title: '等级',
      dataIndex: 'grade_letter',
      key: 'grade_letter',
      width: 80,
      render: (letter: string | null, record) => (
        letter ? (
          <Tag color={getScoreColor(record.score)}>{letter}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      )
    },
    {
      title: '状态',
      dataIndex: 'is_published',
      key: 'is_published',
      width: 80,
      render: (is_published: boolean) => (
        <Tag color={is_published ? 'success' : 'default'}>
          {is_published ? '已发布' : '未发布'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={() => handleSave(record)}
            loading={saving}
            disabled={record.is_published}
          >
            保存
          </Button>
          {record.grade_id !== null && (
            <Button
              size="small"
              type={record.is_published ? 'default' : 'primary'}
              onClick={() => handlePublishToggle(record)}
            >
              {record.is_published ? '取消发布' : '发布'}
            </Button>
          )}
        </Space>
      )
    }
  ]

  if (!isAdmin && !isTeacher) {
    return (
      <Card>
        <Text type="secondary">您没有权限访问成绩录入页面</Text>
      </Card>
    )
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <BookOutlined />
            <span>成绩录入</span>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Statistic title="成绩总数" value={stats.total} prefix={<TeamOutlined />} />
          </Col>
          <Col span={8}>
            <Statistic title="已发布" value={stats.published} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={8}>
            <Statistic title="平均分" value={stats.avg_score} suffix="分" precision={1} />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Text strong style={{ marginRight: 8 }}>选择课程：</Text>
            <Select
              placeholder="请选择课程"
              style={{ width: 300 }}
              onChange={handleCourseChange}
              options={courses.map(c => ({
                label: `${c.name} (${c.code}) - ${c.semester}`,
                value: c.id
              }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Col>
          {selectedCourse && (
            <Col span={12}>
              <Text type="secondary">
                已录入 {selectedCourse.grade_count} 人成绩
              </Text>
            </Col>
          )}
        </Row>

        <Table
          columns={columns}
          dataSource={students}
          rowKey="student_id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '请选择课程查看学生列表' }}
          scroll={{ y: 400 }}
        />
      </Card>
    </div>
  )
}

export default GradeEntryPage
