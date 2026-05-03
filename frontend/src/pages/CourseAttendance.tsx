import { getApiErrorMessage, hasFormErrorFields } from '@/lib/errors'
import request from '@/lib/request'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AimOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useSearchParams } from 'react-router-dom'
import {
  createCourseAttendanceActivity,
  closeCourseAttendanceActivity,
  exportCourseAttendanceRecords,
  signInCourseAttendance,
  updateCourseAttendanceStudentRecord,
} from '@/api'
import { useStudentCourses } from '@/hooks/useStudentCourses'
import { attendanceStatusColor } from '@/features/courses/constants'
import { getCurrentPosition } from '@/lib/geolocation'
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
  attendance_total: number
  attendance_present: number
  attendance_absent: number
  attendance_rate: number | null
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

interface AttendanceActivity {
  id: number
  course_id: number
  title: string
  start_time: string
  end_time: string
  location_name: string
  radius_meters: number
  status: string
  status_display: string
  stats?: AttendanceStats
  my_record?: AttendanceRecord | null
}

interface AttendanceRecord {
  id: number | null
  student_id: number
  student_name: string
  student_no: string
  major: string
  grade: string
  email: string
  phone: string
  sign_time: string
  status: string
  status_display: string
  distance_meters?: number | null
  within_range: boolean
  remark: string
}

interface ActivityFormValues {
  title: string
  start_time: Dayjs
  end_time: Dayjs
  location_name?: string
  latitude: number
  longitude: number
  radius_meters: number
}

const statusText: Record<string, string> = {
  present: '已签到',
  late: '迟到',
  absent: '未签到',
  leave: '请假',
  location_abnormal: '位置异常',
  manual: '补签',
}

const CourseAttendancePage: React.FC = () => {
  const { courses, selectedCourseId, setSelectedCourseId, selectedCourse, isStudent, canManage, loading: coursesLoading } = useStudentCourses()

  const [students, setStudents] = useState<CourseStudent[]>([])
  const [activities, setActivities] = useState<AttendanceActivity[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [selectedActivity, setSelectedActivity] = useState<AttendanceActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [signingId, setSigningId] = useState<number | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [reviewingKey, setReviewingKey] = useState<string | null>(null)
  const [activityModalOpen, setActivityModalOpen] = useState(false)
  const [activitySubmitting, setActivitySubmitting] = useState(false)
  const [form] = Form.useForm<ActivityFormValues>()

  const latestStats = useMemo(() => {
    const activityWithStats = activities.find((item) => item.stats)
    return activityWithStats?.stats || {
      total: selectedCourse?.current_students || 0,
      present: 0,
      late: 0,
      absent: selectedCourse?.current_students || 0,
      leave: 0,
      location_abnormal: 0,
      manual: 0,
      checked_in: 0,
    }
  }, [activities, selectedCourse])

  const loadCourseWorkspace = async (courseId: number) => {
    setLoading(true)
    try {
      const activityResponse = await request.get(`/course/api/courses/${courseId}/attendance-activities`, { skipErrorMessage: true })
      setActivities(activityResponse.data.data || [])
      if (canManage) {
        const rosterResponse = await request.get(`/course/api/courses/${courseId}/students`, { skipErrorMessage: true })
        setStudents(rosterResponse.data.data || [])
      }
      setRecords([])
      setSelectedActivity(null)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '课程签到数据加载失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      loadCourseWorkspace(selectedCourseId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId])

  const openActivityModal = () => {
    const now = dayjs()
    form.setFieldsValue({
      title: `${now.format('MM-DD')} 课堂签到`,
      start_time: now,
      end_time: now.add(20, 'minute'),
      location_name: selectedCourse?.location || '',
      latitude: undefined as unknown as number,
      longitude: undefined as unknown as number,
      radius_meters: 200,
    })
    setActivityModalOpen(true)
  }

  const fillCurrentLocation = async () => {
    try {
      const position = await getCurrentPosition()
      form.setFieldsValue({
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
      })
      message.success('已填入当前位置。')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '定位失败，请检查浏览器权限。')
    }
  }

  const handleCreateActivity = async () => {
    if (!selectedCourseId) return
    const values = await form.validateFields()
    setActivitySubmitting(true)
    try {
      const response = await createCourseAttendanceActivity(selectedCourseId, {
        title: values.title,
        start_time: values.start_time.format('YYYY-MM-DD HH:mm:ss'),
        end_time: values.end_time.format('YYYY-MM-DD HH:mm:ss'),
        location_name: values.location_name,
        latitude: values.latitude,
        longitude: values.longitude,
        radius_meters: values.radius_meters,
        allow_late: true,
      })
      message.success(response.data.message || '课程签到已发布。')
      setActivityModalOpen(false)
      await loadCourseWorkspace(selectedCourseId)
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '课程签到发布失败。'))
      }
    } finally {
      setActivitySubmitting(false)
    }
  }

  const handleLoadRecords = async (activity: AttendanceActivity) => {
    try {
      const response = await request.get(`/course/api/attendance-activities/${activity.id}/records`, { skipErrorMessage: true })
      setSelectedActivity(activity)
      setRecords(response.data.data?.records || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '签到明细加载失败。'))
    }
  }

  const handleCloseActivity = async (activity: AttendanceActivity) => {
    if (!selectedCourseId) return
    setClosingId(activity.id)
    try {
      const response = await closeCourseAttendanceActivity(activity.id)
      message.success(response.data.message || '签到活动已结束。')
      await loadCourseWorkspace(selectedCourseId)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '结束签到失败。'))
    } finally {
      setClosingId(null)
    }
  }

  const refreshSelectedActivityRecords = async () => {
    if (selectedActivity) {
      await handleLoadRecords(selectedActivity)
    }
  }

  const handleReviewRecord = async (record: AttendanceRecord, status: string, remark?: string) => {
    if (!selectedActivity) return
    const reviewKey = `${selectedActivity.id}-${record.student_id}-${status}`
    setReviewingKey(reviewKey)
    try {
      const response = await updateCourseAttendanceStudentRecord(selectedActivity.id, record.student_id, {
        status,
        remark: remark || record.remark,
      })
      message.success(response.data.message || '签到记录已更新。')
      await refreshSelectedActivityRecords()
      if (selectedCourseId) {
        const activityResponse = await request.get(`/course/api/courses/${selectedCourseId}/attendance-activities`, { skipErrorMessage: true })
        setActivities(activityResponse.data.data || [])
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '签到记录更新失败。'))
    } finally {
      setReviewingKey(null)
    }
  }

  const handleExportRecords = async () => {
    if (!selectedActivity) return
    try {
      const response = await exportCourseAttendanceRecords(selectedActivity.id)
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedActivity.title || 'course-attendance'}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '签到明细导出失败。'))
    }
  }

  const handleSignIn = async (activity: AttendanceActivity) => {
    setSigningId(activity.id)
    try {
      const position = await getCurrentPosition()
      const response = await signInCourseAttendance(activity.id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
      message.success(response.data.message || '签到成功。')
      if (selectedCourseId) {
        await loadCourseWorkspace(selectedCourseId)
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '签到失败，请检查定位权限或签到范围。'))
      if (selectedCourseId) {
        await loadCourseWorkspace(selectedCourseId)
      }
    } finally {
      setSigningId(null)
    }
  }

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
    { title: '手机号', dataIndex: 'phone', render: (value: string) => value || '-' },
    { title: '邮箱', dataIndex: 'email', render: (value: string) => value || '-' },
    {
      title: '出勤率',
      key: 'attendance_rate',
      render: (_, record) => record.attendance_rate === null ? '-' : `${record.attendance_rate}%`,
    },
  ]

  const activityColumns: ColumnsType<AttendanceActivity> = [
    {
      title: '签到活动',
      key: 'activity',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space>
            <Text strong>{record.title}</Text>
            <Tag color={attendanceStatusColor[record.status]}>{record.status_display}</Tag>
          </Space>
          <Text type="secondary">{record.start_time} - {record.end_time}</Text>
        </Space>
      ),
    },
    { title: '地点', dataIndex: 'location_name', render: (value: string) => value || '-' },
    { title: '范围', dataIndex: 'radius_meters', render: (value: number) => `${value || 0} 米` },
    {
      title: '统计',
      key: 'stats',
      render: (_, record) => record.stats
        ? `${record.stats.checked_in}/${record.stats.total} 已到，${record.stats.absent} 未到`
        : record.my_record
          ? <Tag color={attendanceStatusColor[record.my_record.status]}>{record.my_record.status_display}</Tag>
          : <Tag>未签到</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => canManage ? (
        <Space wrap>
          <Button onClick={() => handleLoadRecords(record)}>查看明细</Button>
          {record.status === 'open' && (
            <Popconfirm title="确认结束这次签到吗？" onConfirm={() => handleCloseActivity(record)}>
              <Button danger icon={<CloseCircleOutlined />} loading={closingId === record.id}>
                结束签到
              </Button>
            </Popconfirm>
          )}
        </Space>
      ) : (
        <Button
          type="primary"
          icon={<AimOutlined />}
          loading={signingId === record.id}
          disabled={record.status !== 'open' || Boolean(record.my_record && ['present', 'late', 'manual'].includes(record.my_record.status))}
          onClick={() => handleSignIn(record)}
        >
          定位签到
        </Button>
      ),
    },
  ]

  const recordColumns: ColumnsType<AttendanceRecord> = [
    {
      title: '学生',
      key: 'student',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.student_name}</Text>
          <Text type="secondary">{record.student_no || '-'}</Text>
        </Space>
      ),
    },
    { title: '专业', dataIndex: 'major', render: (value: string) => value || '-' },
    { title: '手机号', dataIndex: 'phone', render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string, record) => <Tag color={attendanceStatusColor[value]}>{record.status_display || statusText[value] || value}</Tag>,
    },
    { title: '签到时间', dataIndex: 'sign_time', render: (value: string) => value || '-' },
    {
      title: '距离',
      dataIndex: 'distance_meters',
      render: (value?: number | null) => value == null ? '-' : `${Math.round(value)} 米`,
    },
    { title: '备注', dataIndex: 'remark', render: (value: string) => value || '-' },
    {
      title: '处理',
      key: 'review',
      width: 260,
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            loading={reviewingKey === `${selectedActivity?.id}-${record.student_id}-present`}
            disabled={record.status === 'present'}
            onClick={() => handleReviewRecord(record, 'present', record.remark || '教师确认到课')}
          >
            确认到课
          </Button>
          <Button
            size="small"
            loading={reviewingKey === `${selectedActivity?.id}-${record.student_id}-leave`}
            disabled={record.status === 'leave'}
            onClick={() => handleReviewRecord(record, 'leave', record.remark || '教师标记请假')}
          >
            请假
          </Button>
          <Button
            size="small"
            loading={reviewingKey === `${selectedActivity?.id}-${record.student_id}-manual`}
            disabled={record.status === 'manual'}
            onClick={() => handleReviewRecord(record, 'manual', record.remark || '教师手动补签')}
          >
            补签
          </Button>
          <Button
            danger
            size="small"
            loading={reviewingKey === `${selectedActivity?.id}-${record.student_id}-absent`}
            disabled={record.status === 'absent'}
            onClick={() => handleReviewRecord(record, 'absent', record.remark || '教师标记缺勤')}
          >
            缺勤
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">课程签到</Text>
          <Title level={2} style={{ margin: 0 }}>按课程管理课堂到课情况</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            老师发布定位签到并实时查看学生到课情况，学生在已选课程内完成定位签到。
          </Paragraph>
        </Space>
      </Card>

      <Card bordered={false}>
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <Select
            value={selectedCourseId}
            loading={loading}
            placeholder="请选择课程"
            style={{ minWidth: 320 }}
            onChange={setSelectedCourseId}
            options={courses.map((item) => ({
              value: item.id,
              label: `${item.name} (${item.code})`,
            }))}
          />
          {canManage && selectedCourseId && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openActivityModal}>
              发布签到
            </Button>
          )}
        </Space>
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
                <Statistic title="已到" value={latestStats.checked_in} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="未到" value={latestStats.absent} prefix={<WarningOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card bordered={false}>
                <Statistic title="签到活动" value={activities.length} prefix={<ClockCircleOutlined />} />
              </Card>
            </Col>
          </Row>

          <Card bordered={false} title="签到活动">
            <Table
              rowKey="id"
              loading={loading}
              columns={activityColumns}
              dataSource={activities}
              locale={{ emptyText: <Empty description="当前课程还没有签到活动。" /> }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>

          {canManage && (
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={selectedActivity ? 10 : 24}>
                <Card bordered={false} title="选课学生">
                  <Table
                    rowKey="id"
                    columns={studentColumns}
                    dataSource={students}
                    locale={{ emptyText: <Empty description="当前课程还没有学生选课。" /> }}
                    pagination={{ pageSize: 6, showSizeChanger: false }}
                  />
                </Card>
              </Col>
              {selectedActivity && (
                <Col xs={24} xl={14}>
                  <Card
                    bordered={false}
                    title={`${selectedActivity.title} 明细`}
                    extra={
                      <Button icon={<DownloadOutlined />} onClick={handleExportRecords}>
                        导出
                      </Button>
                    }
                  >
                    <Table
                      rowKey={(record) => `${record.student_id}-${record.id || 'absent'}`}
                      columns={recordColumns}
                      dataSource={records}
                      pagination={{ pageSize: 6, showSizeChanger: false }}
                    />
                  </Card>
                </Col>
              )}
            </Row>
          )}
        </>
      ) : (
        <Card bordered={false}>
          <Empty description="当前没有可用课程。" />
        </Card>
      )}

      <Modal
        title="发布课程签到"
        open={activityModalOpen}
        onCancel={() => setActivityModalOpen(false)}
        onOk={handleCreateActivity}
        confirmLoading={activitySubmitting}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="签到名称" rules={[{ required: true, message: '请输入签到名称。' }]}>
            <Input placeholder="例如：第 8 周课堂签到" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: '请选择开始时间。' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="end_time" label="结束时间" rules={[{ required: true, message: '请选择结束时间。' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="location_name" label="签到地点">
            <Input placeholder="例如：教学楼 A301" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="latitude" label="纬度" rules={[{ required: true, message: '请填写纬度。' }]}>
                <InputNumber precision={6} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="longitude" label="经度" rules={[{ required: true, message: '请填写经度。' }]}>
                <InputNumber precision={6} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="radius_meters" label="允许范围" rules={[{ required: true, message: '请填写允许范围。' }]}>
                <InputNumber min={1} addonAfter="米" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Button icon={<EnvironmentOutlined />} onClick={fillCurrentLocation}>
            使用当前位置作为签到点
          </Button>
        </Form>
      </Modal>
    </Space>
  )
}

export default CourseAttendancePage
