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
  InputNumber,
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
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  createCourse,
  deleteCourse,
  dropCourse,
  getCourse,
  getCourses,
  getMySelections,
  getTeacherOptions,
  selectCourse,
  updateCourse,
} from '@/api'
import { useAuthStore } from '@/store/authStore'

const { Paragraph, Text, Title } = Typography

interface ScheduleItem {
  day_of_week: number
  start_time: string
  end_time: string
  day_of_week_display?: string
}

interface CourseItem {
  id: number
  name: string
  code: string
  description?: string
  credit: number
  hours: number
  teacher_id?: number
  teacher_name?: string
  location?: string
  max_students: number
  current_students: number
  semester: string
  is_active: boolean
  schedules?: ScheduleItem[]
  created_at?: string
}

interface TeacherOption {
  id: number
  name: string
  username: string
  role: string
}

interface CourseSelectionRecord {
  id: number
  course_id?: number
  course_name?: string
  course_code?: string
  status?: string
  course?: CourseItem
}

interface CourseFormValues {
  name: string
  code: string
  description?: string
  credit: number
  hours: number
  teacher_id?: number
  location?: string
  max_students: number
  semester: string
  is_active: boolean
  schedules: ScheduleItem[]
}

const dayOptions = [
  { label: '星期一', value: 1 },
  { label: '星期二', value: 2 },
  { label: '星期三', value: 3 },
  { label: '星期四', value: 4 },
  { label: '星期五', value: 5 },
  { label: '星期六', value: 6 },
  { label: '星期日', value: 7 },
]

const defaultSchedule: ScheduleItem = {
  day_of_week: 1,
  start_time: '08:00',
  end_time: '09:40',
}

const formatCourseTime = (course: CourseItem) => {
  if (!course.schedules?.length) {
    return '未设置上课时间'
  }
  return course.schedules
    .map((item) => `${item.day_of_week_display || dayOptions.find((option) => option.value === item.day_of_week)?.label || ''} ${item.start_time}-${item.end_time}`)
    .join(' / ')
}

const normalizeSelectionCourseId = (item: CourseSelectionRecord) => item.course_id || item.course?.id

const CoursesPage: React.FC = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'college_admin'
  const isTeacher = user?.role === 'staff'
  const isStudent = user?.role === 'student'
  const canManage = isAdmin || isTeacher

  const [courses, setCourses] = useState<CourseItem[]>([])
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([])
  const [mySelections, setMySelections] = useState<CourseSelectionRecord[]>([])
  const [scopeLabel, setScopeLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionCourseId, setActionCourseId] = useState<number | null>(null)
  const [keyword, setKeyword] = useState('')
  const [semesterFilter, setSemesterFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCourse, setDetailCourse] = useState<CourseItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [form] = Form.useForm<CourseFormValues>()

  const selectedCourseIds = useMemo(
    () => new Set(mySelections.map((item) => normalizeSelectionCourseId(item)).filter(Boolean)),
    [mySelections],
  )

  const loadCourses = async () => {
    setLoading(true)
    try {
      const response = await getCourses()
      setCourses(response.data.data || [])
      setScopeLabel(response.data.meta?.scope_label || '')
    } catch (error: any) {
      message.error(error?.response?.data?.message || '课程列表加载失败。')
    } finally {
      setLoading(false)
    }
  }

  const loadSelections = async () => {
    if (!isStudent) {
      return
    }
    try {
      const response = await getMySelections()
      setMySelections(response.data.data || [])
    } catch (error: any) {
      message.error(error?.response?.data?.message || '已选课程加载失败。')
    }
  }

  const loadTeacherOptions = async () => {
    if (!canManage) {
      return
    }
    try {
      const response = await getTeacherOptions()
      setTeacherOptions(response.data.data || [])
    } catch (error: any) {
      message.error(error?.response?.data?.message || '教师候选列表加载失败。')
    }
  }

  useEffect(() => {
    loadCourses()
    loadSelections()
    loadTeacherOptions()
  }, [])

  const semesterOptions = useMemo(() => {
    return Array.from(new Set(courses.map((item) => item.semester).filter(Boolean))).map((item) => ({
      label: item,
      value: item,
    }))
  }, [courses])

  const filteredCourses = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return courses.filter((item) => {
      if (semesterFilter !== 'all' && item.semester !== semesterFilter) {
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
      return [item.name, item.code, item.teacher_name, item.location, item.description]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedKeyword))
    })
  }, [courses, keyword, semesterFilter, statusFilter])

  const stats = useMemo(() => {
    const activeCount = courses.filter((item) => item.is_active).length
    const totalSelected = courses.reduce((sum, item) => sum + (item.current_students || 0), 0)
    return {
      total: courses.length,
      active: activeCount,
      inactive: courses.length - activeCount,
      selected: totalSelected,
    }
  }, [courses])

  const openCreateModal = () => {
    setEditingCourse(null)
    form.setFieldsValue({
      name: '',
      code: '',
      description: '',
      credit: 2,
      hours: 32,
      teacher_id: isTeacher && !isAdmin ? user?.id : undefined,
      location: '',
      max_students: 40,
      semester: '2025-2026-2',
      is_active: true,
      schedules: [{ ...defaultSchedule }],
    })
    setModalOpen(true)
  }

  const openEditModal = (course: CourseItem) => {
    setEditingCourse(course)
    form.setFieldsValue({
      name: course.name,
      code: course.code,
      description: course.description || '',
      credit: course.credit,
      hours: course.hours,
      teacher_id: course.teacher_id,
      location: course.location || '',
      max_students: course.max_students,
      semester: course.semester,
      is_active: course.is_active,
      schedules: course.schedules?.length ? course.schedules : [{ ...defaultSchedule }],
    })
    setModalOpen(true)
  }

  const openDetail = async (courseId: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const response = await getCourse(courseId)
      setDetailCourse(response.data.data || null)
    } catch (error: any) {
      message.error(error?.response?.data?.message || '课程详情加载失败。')
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
        schedules: (values.schedules || []).map((item) => ({
          day_of_week: Number(item.day_of_week),
          start_time: item.start_time,
          end_time: item.end_time,
        })),
      }
      if (editingCourse) {
        const response = await updateCourse(editingCourse.id, payload)
        message.success(response.data.message || '课程已更新。')
      } else {
        const response = await createCourse(payload)
        message.success(response.data.message || '课程已创建。')
      }
      setModalOpen(false)
      await Promise.all([loadCourses(), loadSelections()])
    } catch (error: any) {
      if (!error?.errorFields) {
        message.error(error?.response?.data?.message || '课程保存失败。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (courseId: number) => {
    setActionCourseId(courseId)
    try {
      const response = await deleteCourse(courseId)
      message.success(response.data.message || '课程已删除。')
      await loadCourses()
    } catch (error: any) {
      message.error(error?.response?.data?.message || '课程删除失败。')
    } finally {
      setActionCourseId(null)
    }
  }

  const handleSelect = async (courseId: number) => {
    setActionCourseId(courseId)
    try {
      const response = await selectCourse(courseId)
      message.success(response.data.message || '选课成功。')
      await Promise.all([loadCourses(), loadSelections()])
    } catch (error: any) {
      message.error(error?.response?.data?.message || '选课失败。')
    } finally {
      setActionCourseId(null)
    }
  }

  const handleDrop = async (courseId: number) => {
    setActionCourseId(courseId)
    try {
      const response = await dropCourse(courseId)
      message.success(response.data.message || '退选成功。')
      await Promise.all([loadCourses(), loadSelections()])
    } catch (error: any) {
      message.error(error?.response?.data?.message || '退选失败。')
    } finally {
      setActionCourseId(null)
    }
  }

  const handleToggleStatus = async (course: CourseItem, nextValue: boolean) => {
    setActionCourseId(course.id)
    try {
      const response = await updateCourse(course.id, { is_active: nextValue })
      message.success(response.data.message || '课程状态已更新。')
      await loadCourses()
    } catch (error: any) {
      message.error(error?.response?.data?.message || '课程状态更新失败。')
    } finally {
      setActionCourseId(null)
    }
  }

  const columns: ColumnsType<CourseItem> = [
    {
      title: '课程信息',
      key: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space>
            <Text strong>{record.name}</Text>
            <Tag color={record.is_active ? 'green' : 'default'}>{record.is_active ? '启用中' : '已停用'}</Tag>
          </Space>
          <Text type="secondary">{record.code}</Text>
        </Space>
      ),
    },
    {
      title: '教师',
      dataIndex: 'teacher_name',
      render: (value: string) => value || '未设置',
    },
    {
      title: '学期',
      dataIndex: 'semester',
    },
    {
      title: '上课安排',
      key: 'schedule',
      render: (_, record) => <Text>{formatCourseTime(record)}</Text>,
    },
    {
      title: '容量',
      key: 'capacity',
      render: (_, record) => `${record.current_students}/${record.max_students}`,
    },
    {
      title: '地点',
      dataIndex: 'location',
      render: (value: string) => value || '未设置',
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => {
        const selected = selectedCourseIds.has(record.id)
        const full = record.current_students >= record.max_students
        return (
          <Space wrap>
            <Button type="link" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
              详情
            </Button>
            {canManage && (
              <>
                <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                  编辑
                </Button>
                <Switch
                  checked={record.is_active}
                  checkedChildren="启用"
                  unCheckedChildren="停用"
                  loading={actionCourseId === record.id}
                  onChange={(checked) => handleToggleStatus(record, checked)}
                />
                <Popconfirm title="确认删除这门课程吗？" onConfirm={() => handleDelete(record.id)}>
                  <Button danger type="link" loading={actionCourseId === record.id} icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </>
            )}
            {isStudent && (
              selected ? (
                <Button danger loading={actionCourseId === record.id} onClick={() => handleDrop(record.id)}>
                  退选
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={actionCourseId === record.id}
                  disabled={!record.is_active || full}
                  onClick={() => handleSelect(record.id)}
                >
                  {full ? '已满' : '选课'}
                </Button>
              )
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">课程管理</Text>
          <Title level={2} style={{ margin: 0 }}>
            维护课程、授课安排和学生选课
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {scopeLabel || '在这里查看课程列表、维护授课安排，并根据角色完成选课或课程治理。'}
          </Paragraph>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card bordered={false}>
            <Statistic title="课程总数" value={stats.total} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false}>
            <Statistic title="启用课程" value={stats.active} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false}>
            <Statistic title="停用课程" value={stats.inactive} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card bordered={false}>
            <Statistic title="累计选课人次" value={stats.selected} prefix={<TeamOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder="搜索课程名称、代码、教师或地点"
                onSearch={setKeyword}
                onChange={(event) => setKeyword(event.target.value)}
                value={keyword}
                style={{ width: 280 }}
              />
              <Select
                value={semesterFilter}
                onChange={setSemesterFilter}
                options={[{ label: '全部学期', value: 'all' }, ...semesterOptions]}
                style={{ width: 180 }}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '仅看启用', value: 'active' },
                  { label: '仅看停用', value: 'inactive' },
                ]}
                style={{ width: 160 }}
              />
            </Space>
            {canManage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                新建课程
              </Button>
            )}
          </Space>

          {isStudent && (
            <AlertSection selectedCount={selectedCourseIds.size} totalCount={filteredCourses.length} />
          )}

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={filteredCourses}
            locale={{ emptyText: <Empty description="当前没有可显示的课程。" /> }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        </Space>
      </Card>

      <Modal
        title={editingCourse ? '编辑课程' : '新建课程'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={880}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称。' }]}>
                <Input placeholder="例如：高等数学" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="课程代码" rules={[{ required: true, message: '请输入课程代码。' }]}>
                <Input placeholder="例如：MATH101" disabled={Boolean(editingCourse)} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="credit" label="学分" rules={[{ required: true, message: '请输入学分。' }]}>
                <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hours" label="学时" rules={[{ required: true, message: '请输入学时。' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_students" label="最大人数" rules={[{ required: true, message: '请输入最大人数。' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="semester" label="学期" rules={[{ required: true, message: '请输入学期。' }]}>
                <Input placeholder="例如：2025-2026-2" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="teacher_id" label="授课教师" rules={[{ required: true, message: '请选择授课教师。' }]}>
                <Select
                  placeholder="请选择授课教师"
                  disabled={isTeacher && !isAdmin}
                  options={teacherOptions.map((item) => ({ label: `${item.name} (${item.username})`, value: item.id }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={18}>
              <Form.Item name="location" label="上课地点">
                <Input placeholder="例如：教学楼 A101" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_active" label="课程启用" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="课程说明">
            <Input.TextArea rows={3} placeholder="补充课程介绍、选课说明或教学安排。" />
          </Form.Item>

          <Form.List name="schedules">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Text strong>上课时间</Text>
                  <Button onClick={() => add({ ...defaultSchedule })}>新增时间段</Button>
                </Space>
                {fields.map((field, index) => (
                  <Card key={field.key} size="small">
                    <Row gutter={12} align="middle">
                      <Col span={8}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'day_of_week']}
                          label={`第 ${index + 1} 段`}
                          rules={[{ required: true, message: '请选择星期。' }]}
                        >
                          <Select options={dayOptions} />
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'start_time']}
                          label="开始时间"
                          rules={[{ required: true, message: '请输入开始时间。' }]}
                        >
                          <Input placeholder="08:00" />
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'end_time']}
                          label="结束时间"
                          rules={[{ required: true, message: '请输入结束时间。' }]}
                        >
                          <Input placeholder="09:40" />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        <Button danger type="text" onClick={() => remove(field.name)} disabled={fields.length === 1}>
                          删除
                        </Button>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Drawer
        title="课程详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={520}
        loading={detailLoading}
      >
        {detailCourse && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="课程名称">{detailCourse.name}</Descriptions.Item>
              <Descriptions.Item label="课程代码">{detailCourse.code}</Descriptions.Item>
              <Descriptions.Item label="授课教师">{detailCourse.teacher_name || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="学期">{detailCourse.semester}</Descriptions.Item>
              <Descriptions.Item label="学分 / 学时">{detailCourse.credit} / {detailCourse.hours}</Descriptions.Item>
              <Descriptions.Item label="上课地点">{detailCourse.location || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="选课人数">{detailCourse.current_students} / {detailCourse.max_students}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={detailCourse.is_active ? 'success' : 'default'} text={detailCourse.is_active ? '启用中' : '已停用'} />
              </Descriptions.Item>
              <Descriptions.Item label="上课时间">{formatCourseTime(detailCourse)}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="课程说明">
              <Paragraph style={{ marginBottom: 0 }}>{detailCourse.description || '暂无课程说明。'}</Paragraph>
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}

const AlertSection: React.FC<{ selectedCount: number; totalCount: number }> = ({ selectedCount, totalCount }) => {
  return (
    <Card size="small" style={{ background: '#fff9f2', borderColor: '#f0d7b6' }}>
      <Space direction="vertical" size={4}>
        <Text strong>选课状态</Text>
        <Text type="secondary">当前已选 {selectedCount} 门课程，当前列表共有 {totalCount} 门可查看课程。</Text>
      </Space>
    </Card>
  )
}

export default CoursesPage



