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
  Upload,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircleOutlined, DownloadOutlined, FileTextOutlined, PlusOutlined, RollbackOutlined, TeamOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useSearchParams } from 'react-router-dom'
import {
  createCourseAssignment,
  exportCourseAssignmentSubmissions,
  getCourseAssignmentSubmissions,
  reviewCourseAssignmentSubmission,
  submitCourseAssignment,
  uploadCourseAssignmentAttachment,
} from '@/api'
import { useStudentCourses } from '@/hooks/useStudentCourses'
import { assignmentStatusColor } from '@/features/courses/constants'
import type { CourseItem } from '@/features/courses/types'

const { Paragraph, Text, Title } = Typography

interface AssignmentSubmission {
  id: number | null
  assignment_id: number
  student_id: number
  student_name: string
  student_no: string
  major: string
  email: string
  phone: string
  content: string
  submitted_at: string
  status: string
  status_display: string
  score: number | null
  feedback: string
  version_count?: number
  attachments?: AssignmentAttachment[]
}

interface AssignmentAttachment {
  id: number
  original_name: string
  download_url: string
  file_size: number
}

interface AssignmentStats {
  total: number
  submitted: number
  reviewed: number
}

interface CourseAssignment {
  id: number
  course_id: number
  title: string
  description: string
  due_time: string
  max_score: number
  allow_late: boolean
  status: string
  status_display: string
  attachments?: AssignmentAttachment[]
  stats?: AssignmentStats
  my_submission?: AssignmentSubmission | null
}

interface AssignmentFormValues {
  title: string
  description?: string
  due_time: Dayjs
  max_score: number
  allow_late: boolean
}

interface SubmitFormValues {
  content: string
}

interface ReviewFormValues {
  score: number
  feedback?: string
}

const CourseAssignmentsPage: React.FC = () => {
  const [, setSearchParams] = useSearchParams()
  const { courses, selectedCourseId, setSelectedCourseId, selectedCourse, isStudent, canManage, loading: coursesLoading } = useStudentCourses()
  const [assignments, setAssignments] = useState<CourseAssignment[]>([])
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<CourseAssignment | null>(null)
  const [loading, setLoading] = useState(false)
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [activeSubmission, setActiveSubmission] = useState<AssignmentSubmission | null>(null)
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null)
  const [submissionFile, setSubmissionFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [assignmentForm] = Form.useForm<AssignmentFormValues>()
  const [submitForm] = Form.useForm<SubmitFormValues>()
  const [reviewForm] = Form.useForm<ReviewFormValues>()

  const submittedCount = useMemo(
    () => assignments.reduce((sum, item) => sum + (item.stats?.submitted || (item.my_submission ? 1 : 0)), 0),
    [assignments],
  )

  const loadAssignments = async (courseId: number) => {
    setLoading(true)
    try {
      const response = await request.get(`/assignment/api/courses/${courseId}/assignments`, { skipErrorMessage: true })
      setAssignments(response.data.data || [])
      setSelectedAssignment(null)
      setSubmissions([])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '作业加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      setSearchParams({ course_id: String(selectedCourseId) }, { replace: true })
      loadAssignments(selectedCourseId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId])

  const openAssignmentModal = () => {
    assignmentForm.setFieldsValue({
      title: '',
      description: '',
      due_time: dayjs().add(7, 'day'),
      max_score: 100,
      allow_late: true,
    })
    setAssignmentFile(null)
    setAssignmentModalOpen(true)
  }

  const handleCreateAssignment = async () => {
    if (!selectedCourseId) return
    const values = await assignmentForm.validateFields()
    setSubmitting(true)
    try {
      const response = await createCourseAssignment(selectedCourseId, {
        title: values.title,
        description: values.description,
        due_time: values.due_time.format('YYYY-MM-DD HH:mm:ss'),
        max_score: values.max_score,
        allow_late: values.allow_late,
      })
      if (assignmentFile) {
        await uploadCourseAssignmentAttachment(response.data.data.id, assignmentFile)
      }
      message.success(response.data.message || '作业已发布')
      setAssignmentModalOpen(false)
      await loadAssignments(selectedCourseId)
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '作业发布失败'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openSubmitModal = (assignment: CourseAssignment) => {
    setSelectedAssignment(assignment)
    submitForm.setFieldsValue({ content: assignment.my_submission?.content || '' })
    setSubmissionFile(null)
    setSubmitModalOpen(true)
  }

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !selectedCourseId) return
    const values = await submitForm.validateFields()
    setSubmitting(true)
    try {
      const payload = submissionFile ? new FormData() : { content: values.content }
      if (submissionFile && payload instanceof FormData) {
        payload.append('content', values.content)
        payload.append('file', submissionFile)
      }
      const response = await submitCourseAssignment(selectedAssignment.id, payload)
      message.success(response.data.message || '作业已提交')
      setSubmitModalOpen(false)
      await loadAssignments(selectedCourseId)
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '作业提交失败'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const loadSubmissions = async (assignment: CourseAssignment) => {
    try {
      const response = await getCourseAssignmentSubmissions(assignment.id)
      setSelectedAssignment(assignment)
      setSubmissions(response.data.data?.submissions || [])
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '提交情况加载失败'))
    }
  }

  const openReviewModal = (submission: AssignmentSubmission) => {
    if (!submission.id) return
    setActiveSubmission(submission)
    reviewForm.setFieldsValue({
      score: submission.score ?? undefined as unknown as number,
      feedback: submission.feedback || '',
    })
    setReviewModalOpen(true)
  }

  const handleReviewSubmission = async () => {
    if (!activeSubmission || !selectedAssignment || !selectedCourseId) return
    const values = await reviewForm.validateFields()
    setSubmitting(true)
    try {
      const response = await reviewCourseAssignmentSubmission(activeSubmission.id as number, {
        score: values.score,
        feedback: values.feedback,
      })
      message.success(response.data.message || '作业已批阅')
      setReviewModalOpen(false)
      await loadSubmissions(selectedAssignment)
      await loadAssignments(selectedCourseId)
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '作业批阅失败'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleReturnSubmission = async () => {
    if (!activeSubmission || !selectedAssignment || !selectedCourseId) return
    const values = await reviewForm.validateFields(['feedback'])
    setSubmitting(true)
    try {
      const response = await reviewCourseAssignmentSubmission(activeSubmission.id as number, {
        action: 'return',
        feedback: values.feedback,
      })
      message.success(response.data.message || '作业已退回')
      setReviewModalOpen(false)
      await loadSubmissions(selectedAssignment)
      await loadAssignments(selectedCourseId)
    } catch (error: unknown) {
      if (!hasFormErrorFields(error)) {
        message.error(getApiErrorMessage(error, '退回作业失败'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleExportSubmissions = async () => {
    if (!selectedAssignment) return
    try {
      const response = await exportCourseAssignmentSubmissions(selectedAssignment.id)
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedAssignment.title || 'assignment'}-submissions.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '导出提交表失败'))
    }
  }

  const renderAttachments = (attachments?: AssignmentAttachment[]) => {
    if (!attachments?.length) return '-'
    return (
      <Space wrap>
        {attachments.map((item) => (
          <Button key={item.id} size="small" type="link" href={item.download_url} target="_blank">
            {item.original_name}
          </Button>
        ))}
      </Space>
    )
  }

  const assignmentColumns: ColumnsType<CourseAssignment> = [
    {
      title: '作业',
      key: 'assignment',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{record.title}</Text>
            <Tag color={assignmentStatusColor[record.status]}>{record.status_display}</Tag>
          </Space>
          <Text type="secondary">{record.description || '无说明'}</Text>
        </Space>
      ),
    },
    {
      title: '附件',
      key: 'attachments',
      render: (_, record) => renderAttachments(record.attachments),
    },
    { title: '截止时间', dataIndex: 'due_time' },
    { title: '满分', dataIndex: 'max_score', render: (value: number) => value || 100 },
    {
      title: canManage ? '提交情况' : '我的状态',
      key: 'status',
      render: (_, record) => canManage
        ? `${record.stats?.submitted || 0}/${record.stats?.total || selectedCourse?.current_students || 0} 已交`
        : record.my_submission
          ? <Tag color={assignmentStatusColor[record.my_submission.status]}>{record.my_submission.status_display}</Tag>
          : <Tag color="red">未提交</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => canManage ? (
        <Button onClick={() => loadSubmissions(record)}>查看提交</Button>
      ) : (
        <Button
          type="primary"
          disabled={record.status === 'closed' || (record.status === 'overdue' && !record.allow_late)}
          onClick={() => openSubmitModal(record)}
        >
          {record.my_submission ? '修改提交' : '提交作业'}
        </Button>
      ),
    },
  ]

  const submissionColumns: ColumnsType<AssignmentSubmission> = [
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
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string, record) => <Tag color={assignmentStatusColor[value]}>{record.status_display}</Tag>,
    },
    { title: '提交时间', dataIndex: 'submitted_at', render: (value: string) => value || '-' },
    { title: '版本', dataIndex: 'version_count', render: (value: number) => value || '-' },
    {
      title: '附件',
      key: 'attachments',
      render: (_, record) => renderAttachments(record.attachments),
    },
    { title: '分数', dataIndex: 'score', render: (value: number | null) => value ?? '-' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => record.id ? (
        <Button size="small" onClick={() => openReviewModal(record)}>
          批阅
        </Button>
      ) : (
        <Text type="secondary">未提交</Text>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} lg={14}>
            <Space direction="vertical" size={8}>
              <Text type="secondary">课程作业</Text>
              <Title level={2} style={{ margin: 0 }}>按课程发布与批阅作业</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                老师发布课程作业，学生在已选课程内提交，老师集中查看提交情况。
              </Paragraph>
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Select
              value={selectedCourseId}
              loading={loading}
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
            <Col xs={24} md={8}>
              <Card bordered={false}>
                <Statistic title="课程人数" value={selectedCourse.current_students} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card bordered={false}>
                <Statistic title="作业数量" value={assignments.length} prefix={<FileTextOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card bordered={false}>
                <Statistic title={canManage ? '累计提交' : '我的提交'} value={submittedCount} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
          </Row>

          <Card
            bordered={false}
            title="作业列表"
            extra={canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAssignmentModal}>
                发布作业
              </Button>
            ) : null}
          >
            <Table
              rowKey="id"
              loading={loading}
              columns={assignmentColumns}
              dataSource={assignments}
              locale={{ emptyText: <Empty description="当前课程暂无作业" /> }}
              pagination={{ pageSize: 6, showSizeChanger: false }}
            />
          </Card>

          {canManage && selectedAssignment && (
            <Card
              bordered={false}
              title={`${selectedAssignment.title} 提交情况`}
              extra={
                <Button icon={<DownloadOutlined />} onClick={handleExportSubmissions}>
                  导出
                </Button>
              }
            >
              <Table
                rowKey={(record) => `${record.student_id}-${record.id || 'missing'}`}
                columns={submissionColumns}
                dataSource={submissions}
                pagination={{ pageSize: 8, showSizeChanger: false }}
              />
            </Card>
          )}
        </>
      ) : (
        <Card bordered={false}>
          <Empty description={isStudent ? '当前没有已选课程' : '当前没有可管理课程'} />
        </Card>
      )}

      <Modal
        title="发布课程作业"
        open={assignmentModalOpen}
        onCancel={() => setAssignmentModalOpen(false)}
        onOk={handleCreateAssignment}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={assignmentForm} layout="vertical">
          <Form.Item name="title" label="作业标题" rules={[{ required: true, message: '请输入作业标题' }]}>
            <Input placeholder="例如：第 8 周单元测试练习" />
          </Form.Item>
          <Form.Item name="description" label="作业说明">
            <Input.TextArea rows={4} placeholder="填写要求、提交格式或评分重点" />
          </Form.Item>
          <Form.Item label="作业附件">
            <Upload
              beforeUpload={(file) => {
                setAssignmentFile(file)
                return false
              }}
              maxCount={1}
              onRemove={() => setAssignmentFile(null)}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="due_time" label="截止时间" rules={[{ required: true, message: '请选择截止时间' }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="max_score" label="满分" rules={[{ required: true, message: '请输入满分' }]}>
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="allow_late" label="允许迟交">
            <Select
              options={[
                { value: true, label: '允许' },
                { value: false, label: '不允许' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedAssignment?.title || '提交作业'}
        open={submitModalOpen}
        onCancel={() => setSubmitModalOpen(false)}
        onOk={handleSubmitAssignment}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={submitForm} layout="vertical">
          <Form.Item name="content" label="提交内容" rules={[{ required: true, message: '请输入提交内容' }]}>
            <Input.TextArea rows={8} placeholder="在这里填写作业内容或提交说明" />
          </Form.Item>
          <Form.Item label="提交附件">
            <Upload
              beforeUpload={(file) => {
                setSubmissionFile(file)
                return false
              }}
              maxCount={1}
              onRemove={() => setSubmissionFile(null)}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批阅作业"
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        onOk={handleReviewSubmission}
        footer={[
          <Button key="cancel" onClick={() => setReviewModalOpen(false)}>
            取消
          </Button>,
          <Button key="return" icon={<RollbackOutlined />} onClick={handleReturnSubmission} loading={submitting}>
            退回重交
          </Button>,
          <Button key="review" type="primary" onClick={handleReviewSubmission} loading={submitting}>
            保存批阅
          </Button>,
        ]}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="score" label="分数" rules={[{ required: true, message: '请输入分数' }]}>
            <InputNumber min={0} max={selectedAssignment?.max_score || 100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="feedback" label="评语">
            <Input.TextArea rows={4} placeholder="填写批阅意见" />
          </Form.Item>
          {activeSubmission?.content && (
            <Card size="small" title="学生提交内容">
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{activeSubmission.content}</Paragraph>
            </Card>
          )}
        </Form>
      </Modal>
    </Space>
  )
}

export default CourseAssignmentsPage
