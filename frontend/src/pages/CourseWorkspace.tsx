import { getApiErrorMessage } from '@/lib/errors'
import request from '@/lib/request'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  BarChartOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReadOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/ui/PageScaffold'
import { useStudentCourses } from '@/hooks/useStudentCourses'
import { courseStatusColor } from '@/features/courses/constants'
import type { CourseItem } from '@/features/courses/types'

const { Paragraph, Text, Title } = Typography

interface CourseStudent {
  id: number
  real_name: string
  student_id: string
  major: string
  grade: string
  email: string
  phone: string
  attendance_total?: number
  attendance_present?: number
  attendance_absent?: number
  attendance_rate?: number | null
}

interface AttendanceStats {
  total: number
  present: number
  late: number
  absent: number
  leave: number
  location_abnormal: number
  manual: number
  checked_in: number
}

interface AttendanceRecord {
  id: number | null
  status: string
  status_display: string
}

interface AttendanceActivity {
  id: number
  title: string
  start_time: string
  end_time: string
  location_name?: string
  radius_meters?: number
  status: string
  status_display: string
  stats?: AttendanceStats
  my_record?: AttendanceRecord | null
}

interface CourseAssignment {
  id: number
  title: string
  description: string
  due_time: string
  max_score: number
  status: string
  status_display: string
  stats?: {
    total: number
    submitted: number
    reviewed: number
  }
  my_submission?: {
    id: number | null
    status: string
    status_display: string
  } | null
}

const CourseWorkspacePage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { courses, selectedCourseId, setSelectedCourseId, selectedCourse, isStudent, canManage, loading: coursesLoading } = useStudentCourses()
  const [students, setStudents] = useState<CourseStudent[]>([])
  const [activities, setActivities] = useState<AttendanceActivity[]>([])
  const [assignments, setAssignments] = useState<CourseAssignment[]>([])
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)

  const openActivities = useMemo(
    () => activities.filter((item) => item.status === 'open').length,
    [activities],
  )

  const latestActivity = activities[0]
  const latestStats = latestActivity?.stats
  const selectedFillRate = selectedCourse?.max_students
    ? Math.round((selectedCourse.current_students / selectedCourse.max_students) * 100)
    : 0

  const loadWorkspace = async (courseId: number) => {
    setLoadingWorkspace(true)
    try {
      const activityResponse = await request.get(`/course/api/courses/${courseId}/attendance-activities`, { skipErrorMessage: true })
      setActivities(activityResponse.data.data || [])
      const assignmentResponse = await request.get(`/assignment/api/courses/${courseId}/assignments`, { skipErrorMessage: true })
      setAssignments(assignmentResponse.data.data || [])

      if (canManage) {
        const rosterResponse = await request.get(`/course/api/courses/${courseId}/students`, { skipErrorMessage: true })
        setStudents(rosterResponse.data.data || [])
      } else {
        setStudents([])
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '课程工作台加载失败'))
    } finally {
      setLoadingWorkspace(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      setSearchParams({ course_id: String(selectedCourseId) }, { replace: true })
      loadWorkspace(selectedCourseId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId])

  const studentColumns: ColumnsType<CourseStudent> = [
    {
      title: '学生',
      key: 'student',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.real_name}</Text>
          <Text type="secondary">{record.student_id || '-'}</Text>
        </Space>
      ),
    },
    { title: '专业', dataIndex: 'major', render: (value: string) => value || '-' },
    { title: '年级', dataIndex: 'grade', render: (value: string) => value || '-' },
    { title: '手机', dataIndex: 'phone', render: (value: string) => value || '-' },
    { title: '邮箱', dataIndex: 'email', render: (value: string) => value || '-' },
    {
      title: '课程出勤',
      key: 'attendance',
      render: (_, record) => record.attendance_rate == null ? '-' : `${record.attendance_rate}%`,
    },
  ]

  const activityColumns: ColumnsType<AttendanceActivity> = [
    {
      title: '签到活动',
      key: 'activity',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{record.title}</Text>
            <Tag color={courseStatusColor[record.status]}>{record.status_display || record.status}</Tag>
          </Space>
          <Text type="secondary">{record.start_time} - {record.end_time}</Text>
        </Space>
      ),
    },
    { title: '地点', dataIndex: 'location_name', render: (value: string) => value || '-' },
    {
      title: '统计',
      key: 'stats',
      render: (_, record) => {
        if (record.stats) {
          return `${record.stats.checked_in}/${record.stats.total} 已到，${record.stats.absent} 未到`
        }
        if (record.my_record) {
          return <Tag color={courseStatusColor[record.my_record.status]}>{record.my_record.status_display}</Tag>
        }
        return <Tag>未签到</Tag>
      },
    },
    {
      title: '范围',
      dataIndex: 'radius_meters',
      render: (value: number) => value ? `${value} 米` : '-',
    },
  ]

  const assignmentColumns: ColumnsType<CourseAssignment> = [
    {
      title: '作业',
      key: 'assignment',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{record.title}</Text>
            <Tag color={courseStatusColor[record.status]}>{record.status_display || record.status}</Tag>
          </Space>
          <Text type="secondary">{record.description || '-'}</Text>
        </Space>
      ),
    },
    { title: '截止时间', dataIndex: 'due_time' },
    { title: '满分', dataIndex: 'max_score', render: (value: number) => value || 100 },
    {
      title: canManage ? '提交情况' : '我的状态',
      key: 'submission',
      render: (_, record) => canManage
        ? `${record.stats?.submitted || 0}/${record.stats?.total || selectedCourse?.current_students || 0} 已交`
        : record.my_submission
          ? <Tag color={courseStatusColor[record.my_submission.status]}>{record.my_submission.status_display}</Tag>
          : <Tag color="red">未提交</Tag>,
    },
  ]

  const overview = selectedCourse ? (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card bordered={false} title="课程信息">
          <Descriptions column={{ xs: 1, md: 2 }} size="middle">
            <Descriptions.Item label="课程名称">{selectedCourse.name}</Descriptions.Item>
            <Descriptions.Item label="课程编号">{selectedCourse.code}</Descriptions.Item>
            <Descriptions.Item label="任课老师">{selectedCourse.teacher_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="学期">{selectedCourse.semester || '-'}</Descriptions.Item>
            <Descriptions.Item label="上课地点">{selectedCourse.location || '-'}</Descriptions.Item>
            <Descriptions.Item label="学时/学分">
              {selectedCourse.hours || '-'} / {selectedCourse.credit || '-'}
            </Descriptions.Item>
          </Descriptions>
          {selectedCourse.description && (
            <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
              {selectedCourse.description}
            </Paragraph>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card bordered={false} title="选课容量">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Progress percent={selectedFillRate} status={selectedFillRate >= 100 ? 'exception' : 'active'} />
            <Row gutter={12}>
              <Col span={12}>
                <Statistic title="已选人数" value={selectedCourse.current_students} prefix={<TeamOutlined />} />
              </Col>
              <Col span={12}>
                <Statistic title="容量上限" value={selectedCourse.max_students} />
              </Col>
            </Row>
          </Space>
        </Card>
      </Col>
    </Row>
  ) : null

  const tabItems = [
    {
      key: 'overview',
      label: '概览',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {overview}
          <Card bordered={false} title="快捷操作">
            <Space wrap>
              <Button icon={<ClockCircleOutlined />} onClick={() => navigate(`/course-attendance?course_id=${selectedCourseId}`)}>
                课程签到
              </Button>
              <Button icon={<ReadOutlined />} onClick={() => navigate(`/course-assignments?course_id=${selectedCourseId}`)}>
                课程作业
              </Button>
              <Button icon={<TrophyOutlined />} onClick={() => navigate(canManage ? '/grade-entry' : '/my-grades')}>
                {canManage ? '成绩录入' : '我的成绩'}
              </Button>
              {isStudent && (
                <Button icon={<ReadOutlined />} onClick={() => navigate('/course-schedule')}>
                  课表查看
                </Button>
              )}
              {canManage && (
                <Button icon={<BookOutlined />} onClick={() => navigate('/courses')}>
                  课程管理
                </Button>
              )}
            </Space>
          </Card>
        </Space>
      ),
    },
    {
      key: 'attendance',
      label: '签到',
      children: (
        <Card
          bordered={false}
          title="签到活动"
          extra={
            <Button type="primary" icon={<ClockCircleOutlined />} onClick={() => navigate(`/course-attendance?course_id=${selectedCourseId}`)}>
              打开签到页
            </Button>
          }
        >
          <Table
            rowKey="id"
            columns={activityColumns}
            dataSource={activities}
            loading={loadingWorkspace}
            locale={{ emptyText: <Empty description="当前课程暂无签到活动" /> }}
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'students',
            label: '学生',
            children: (
              <Card bordered={false} title="选课学生">
                <Table
                  rowKey="id"
                  columns={studentColumns}
                  dataSource={students}
                  loading={loadingWorkspace}
                  locale={{ emptyText: <Empty description="当前课程暂无学生选课" /> }}
                  pagination={{ pageSize: 8, showSizeChanger: false }}
                  scroll={{ x: 'max-content' }}
                />
              </Card>
            ),
          },
        ]
      : []),
    {
      key: 'assignments',
      label: '作业',
      children: (
        <Card
          bordered={false}
          title="课程作业"
          extra={
            <Button type="primary" icon={<ReadOutlined />} onClick={() => navigate(`/course-assignments?course_id=${selectedCourseId}`)}>
              打开作业页
            </Button>
          }
        >
          <Table
            rowKey="id"
            columns={assignmentColumns}
            dataSource={assignments}
            loading={loadingWorkspace}
            locale={{ emptyText: <Empty description="当前课程暂无作业" /> }}
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      ),
    },
    {
      key: 'grades',
      label: '成绩',
      children: (
        <Card bordered={false}>
          <Space direction="vertical" size={12}>
            <Text strong>{canManage ? '进入成绩录入处理当前课程成绩。' : '查看当前账号已发布成绩。'}</Text>
            <Button type="primary" icon={<BarChartOutlined />} onClick={() => navigate(canManage ? '/grade-entry' : '/my-grades')}>
              {canManage ? '打开成绩录入' : '打开我的成绩'}
            </Button>
          </Space>
        </Card>
      ),
    },
  ]

  return (
    <PageShell>
      <Card bordered={false}>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} lg={14}>
            <Space direction="vertical" size={8}>
              <Text type="secondary">课程工作台</Text>
              <Title level={2} style={{ margin: 0 }}>围绕课程处理教学事务</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                将课程名单、课堂签到和成绩入口集中到一个课程上下文中。
              </Paragraph>
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Select
              value={selectedCourseId}
              loading={coursesLoading}
              placeholder="请选择课程"
              style={{ width: '100%' }}
              onChange={setSelectedCourseId}
              options={courses.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.code})`,
              }))}
            />
          </Col>
        </Row>
      </Card>

      {selectedCourse ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="选课人数" value={selectedCourse.current_students} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="签到活动" value={activities.length} prefix={<ClockCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="进行中签到" value={openActivities} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="最近已到" value={latestStats?.checked_in || 0} suffix={`/ ${latestStats?.total || selectedCourse.current_students || 0}`} />
              </Card>
            </Col>
          </Row>

          <Tabs items={tabItems} />
        </>
      ) : (
        <Card bordered={false}>
          <Empty description={isStudent ? '当前没有已选课程' : '当前没有可管理课程'} />
        </Card>
      )}
    </PageShell>
  )
}

export default CourseWorkspacePage
