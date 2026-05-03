import { getApiErrorMessage, getBrowserErrorCode } from '@/lib/errors'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  Modal,
  message,
} from 'antd'
import {
  CalendarOutlined,
  EnvironmentOutlined,
  AimOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { getAllAttendance, getAttendanceSettings, getAttendanceStats, updateAttendanceSettings } from '@/api'
import { useAuthStore } from '@/store/authStore'

const { RangePicker } = DatePicker
const { Paragraph, Text, Title } = Typography

interface AttendanceRecord {
  id: number
  user_name: string
  attendance_date: string
  clock_in?: string | null
  clock_out?: string | null
  status: string
  status_display: string
  remark?: string | null
  created_at: string
}

interface AttendanceStats {
  total: number
  normal: number
  late: number
  early: number
  absent: number
  on_leave: number
  month: number
}

interface AttendancePolicy {
  attendance_enabled: boolean
  require_location: boolean
  location_name?: string
  latitude?: number | null
  longitude?: number | null
  radius_meters?: number
  check_in_start?: string
  check_in_end?: string
  check_out_start?: string
  check_out_end?: string
  updated_at?: string
  updated_by_name?: string
}

const statusColorMap: Record<string, string> = {
  normal: 'green',
  late: 'orange',
  early: 'gold',
  absent: 'red',
  on_leave: 'blue',
}

const buildMapPreview = (latitude?: number | null, longitude?: number | null) => {
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return { embedUrl: '', detailUrl: '' }
  }

  const lat = Number(latitude)
  const lon = Number(longitude)
  const offset = 0.006
  const left = (lon - offset).toFixed(6)
  const right = (lon + offset).toFixed(6)
  const top = (lat + offset).toFixed(6)
  const bottom = (lat - offset).toFixed(6)

  return {
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`,
    detailUrl: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=17/${lat.toFixed(6)}/${lon.toFixed(6)}`,
  }
}

const AttendanceManagePage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'college_admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const [policyForm] = Form.useForm()
  const watchedLatitude = Form.useWatch('latitude', policyForm)
  const watchedLongitude = Form.useWatch('longitude', policyForm)
  const watchedRadius = Form.useWatch('radius_meters', policyForm)
  const watchedLocationName = Form.useWatch('location_name', policyForm)

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [locatingCurrent, setLocatingCurrent] = useState(false)
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null)
  const [stats, setStats] = useState<AttendanceStats>({
    total: 0,
    normal: 0,
    late: 0,
    early: 0,
    absent: 0,
    on_leave: 0,
    month: 0,
  })
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })
  const [filters, setFilters] = useState({
    status: '',
    keyword: '',
    start_date: '',
    end_date: '',
  })

  const statusOptions = [
    { label: '全部状态', value: '' },
    { label: '正常', value: 'normal' },
    { label: '迟到', value: 'late' },
    { label: '早退', value: 'early' },
    { label: '缺勤', value: 'absent' },
    { label: '请假', value: 'on_leave' },
  ]

  const loadRecords = async (page = 1, filterParams = filters) => {
    if (!isAdmin) return

    setLoading(true)
    try {
      const response = await getAllAttendance({
        page,
        per_page: pagination.pageSize,
        ...filterParams,
      })

      if (response.data.success) {
        setRecords(response.data.data || [])
        setPagination((previous) => ({
          ...previous,
          current: response.data.pagination?.page || page,
          total: response.data.pagination?.total || 0,
        }))
      } else {
        message.error(response.data.message || '考勤记录加载失败')
      }
    } catch {
      message.error('考勤记录加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    if (!isAdmin) return
    try {
      const response = await getAttendanceStats()
      if (response.data.success) {
        setStats(response.data.data)
      }
    } catch {
      message.error('考勤统计加载失败，请稍后重试')
    }
  }

  const loadPolicy = async () => {
    if (!isAdmin) return
    try {
      const response = await getAttendanceSettings()
      if (response.data.success) {
        const nextPolicy = response.data.data
        setPolicy(nextPolicy)
        policyForm.setFieldsValue({
          ...nextPolicy,
          check_in_start: nextPolicy.check_in_start ? dayjs(nextPolicy.check_in_start, 'HH:mm') : null,
          check_in_end: nextPolicy.check_in_end ? dayjs(nextPolicy.check_in_end, 'HH:mm') : null,
          check_out_start: nextPolicy.check_out_start ? dayjs(nextPolicy.check_out_start, 'HH:mm') : null,
          check_out_end: nextPolicy.check_out_end ? dayjs(nextPolicy.check_out_end, 'HH:mm') : null,
        })
      }
    } catch {
      message.error('考勤规则加载失败，请稍后重试')
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadRecords()
      loadStats()
      loadPolicy()
    }
    // Initial admin dashboard load; subsequent refreshes are triggered by user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const handleSearch = () => loadRecords(1, filters)

  const handleReset = () => {
    const nextFilters = { status: '', keyword: '', start_date: '', end_date: '' }
    setFilters(nextFilters)
    loadRecords(1, nextFilters)
  }

  const handleSavePolicy = async () => {
    const values = await policyForm.validateFields()
    setSavingPolicy(true)
    try {
      const payload = {
        ...values,
        check_in_start: values.check_in_start?.format('HH:mm'),
        check_in_end: values.check_in_end?.format('HH:mm'),
        check_out_start: values.check_out_start?.format('HH:mm'),
        check_out_end: values.check_out_end?.format('HH:mm'),
      }
      const response = await updateAttendanceSettings(payload)
      message.success(response.data.message || '考勤规则已更新')
      await loadPolicy()
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '考勤规则保存失败'))
    } finally {
      setSavingPolicy(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      message.error('当前浏览器不支持定位，无法自动获取当前位置。')
      return
    }

    setLocatingCurrent(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      policyForm.setFieldsValue({
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
      })

      message.success('已自动填入当前位置坐标。')
    } catch (error: unknown) {
      if (getBrowserErrorCode(error) === 1) {
        message.error('定位权限被拒绝，请允许浏览器访问定位后重试。')
      } else if (getBrowserErrorCode(error) === 2) {
        message.error('无法获取当前位置，请确认设备定位服务已开启。')
      } else if (getBrowserErrorCode(error) === 3) {
        message.error('获取当前位置超时，请稍后再试。')
      } else {
        message.error('当前位置获取失败，请稍后重试。')
      }
    } finally {
      setLocatingCurrent(false)
    }
  }

  const { embedUrl, detailUrl } = buildMapPreview(watchedLatitude, watchedLongitude)

  const columns: ColumnsType<AttendanceRecord> = [
    { title: '姓名', dataIndex: 'user_name', key: 'user_name', width: 120 },
    { title: '日期', dataIndex: 'attendance_date', key: 'attendance_date', width: 120 },
    {
      title: '上班打卡',
      dataIndex: 'clock_in',
      key: 'clock_in',
      width: 170,
      render: (value?: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '下班打卡',
      dataIndex: 'clock_out',
      key: 'clock_out',
      width: 170,
      render: (value?: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_, record) => <Tag color={statusColorMap[record.status] || 'default'}>{record.status_display}</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (value?: string | null) => value || '-',
    },
    {
      title: '记录时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
  ]

  if (!isAdmin) {
    return (
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%', alignItems: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前角色没有考勤管理权限。" />
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            返回首页
          </Button>
        </Space>
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          <UserSwitchOutlined />
          <span>{user?.role === 'college_admin' ? '组织范围考勤管理' : '考勤管理'}</span>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="本月考勤记录" value={stats.month} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="正常" value={stats.normal} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="迟到" value={stats.late} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="早退" value={stats.early} valueStyle={{ color: '#fa8c16' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="请假" value={stats.on_leave} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <Card size="small">
              <Statistic title="总记录数" value={stats.total} prefix={<TeamOutlined />} />
            </Card>
          </Col>
        </Row>

        <Alert
          type="info"
          showIcon
          message="请假与考勤已联动"
          description={
            user?.role === 'college_admin'
              ? '当前显示你组织范围内的考勤记录。'
              : '当前显示全局考勤记录。'
          }
        />

        <Card bordered={false} style={{ background: '#fafafa', borderRadius: 20 }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space>
              <SettingOutlined />
              <Title level={5} style={{ margin: 0 }}>打卡规则</Title>
            </Space>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card size="small" bordered={false} style={{ background: '#fff' }}>
                  <Text strong>打卡地点</Text>
                  <div style={{ marginTop: 8 }}>{policy?.location_name || '未设置'}</div>
                  <Text type="secondary">半径 {policy?.radius_meters || 0} 米</Text>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" bordered={false} style={{ background: '#fff' }}>
                  <Text strong>上班时间</Text>
                  <div style={{ marginTop: 8 }}>{policy?.check_in_start || '--:--'} - {policy?.check_in_end || '--:--'}</div>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" bordered={false} style={{ background: '#fff' }}>
                  <Text strong>下班时间</Text>
                  <div style={{ marginTop: 8 }}>{policy?.check_out_start || '--:--'} - {policy?.check_out_end || '--:--'}</div>
                </Card>
              </Col>
            </Row>

            {isSuperAdmin ? (
              <Form form={policyForm} layout="vertical">
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={6}>
                    <Form.Item name="attendance_enabled" label="启用打卡" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="关闭" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="require_location" label="定位校验" valuePropName="checked">
                      <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="location_name" label="打卡地点名称" rules={[{ required: true, message: '请输入打卡地点名称' }]}>
                      <Input prefix={<EnvironmentOutlined />} placeholder="例如：学校主校区行政楼" />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Alert
                      type="info"
                      showIcon
                      message="地图辅助选点"
                      description="可直接使用浏览器当前位置回填坐标，并配合地图预览确认范围。"
                      action={
                        <Button type="primary" ghost onClick={() => setMapPickerOpen(true)}>
                          打开选点面板
                        </Button>
                      }
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="latitude" label="中心纬度" rules={[{ required: true, message: '请输入中心纬度' }]}>
                      <InputNumber style={{ width: '100%' }} step={0.000001} placeholder="例如：31.2304" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="longitude" label="中心经度" rules={[{ required: true, message: '请输入中心经度' }]}>
                      <InputNumber style={{ width: '100%' }} step={0.000001} placeholder="例如：121.4737" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="radius_meters" label="允许半径（米）" rules={[{ required: true, message: '请输入允许半径' }]}>
                      <InputNumber style={{ width: '100%' }} min={1} max={5000} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="check_in_start" label="上班开始时间" rules={[{ required: true, message: '请选择上班开始时间' }]}>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="check_in_end" label="上班结束时间" rules={[{ required: true, message: '请选择上班结束时间' }]}>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="check_out_start" label="下班开始时间" rules={[{ required: true, message: '请选择下班开始时间' }]}>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="check_out_end" label="下班结束时间" rules={[{ required: true, message: '请选择下班结束时间' }]}>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Space>
                  <Button type="primary" onClick={handleSavePolicy} loading={savingPolicy}>
                    保存考勤规则
                  </Button>
                  <Text type="secondary">
                    {policy?.updated_by_name ? `最近更新：${policy.updated_by_name} · ${policy.updated_at || ''}` : '当前尚未记录更新人'}
                  </Text>
                </Space>
              </Form>
            ) : (
              <Alert type="info" showIcon message="当前规则仅系统管理员可修改" description="学院管理员可以查看规则，但不能调整打卡范围和时间。" />
            )}
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Input
              placeholder="搜索姓名"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(event) => setFilters((previous) => ({ ...previous, keyword: event.target.value }))}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col xs={24} md={5}>
            <Select
              style={{ width: '100%' }}
              value={filters.status}
              onChange={(value) => setFilters((previous) => ({ ...previous, status: value }))}
              options={statusOptions}
            />
          </Col>
          <Col xs={24} md={7}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(_, dateStrings) =>
                setFilters((previous) => ({
                  ...previous,
                  start_date: dateStrings[0],
                  end_date: dateStrings[1],
                }))
              }
            />
          </Col>
          <Col xs={24} md={6}>
            <Space wrap>
              <Button type="primary" onClick={handleSearch}>查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>

        <Text type="secondary">
          当前展示 {pagination.total} 条记录，可按人员、状态和日期范围查看打卡与请假联动结果。
        </Text>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={records}
          pagination={{
            ...pagination,
            onChange: (page) => loadRecords(page, filters),
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选条件下没有找到考勤记录。" />,
          }}
          scroll={{ x: 980, y: 500 }}
        />
      </Space>

      <Modal
        title="地图辅助选点"
        open={mapPickerOpen}
        onCancel={() => setMapPickerOpen(false)}
        footer={[
          <Button key="close" onClick={() => setMapPickerOpen(false)}>
            完成
          </Button>,
        ]}
        width={920}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="地图辅助选点"
            description="可直接使用浏览器当前位置回填经纬度，也可手动微调坐标。"
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <Card bordered={false} style={{ background: '#fafafa' }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <Space>
                    <Button type="primary" icon={<AimOutlined />} onClick={handleUseCurrentLocation} loading={locatingCurrent}>
                      使用当前位置
                    </Button>
                    {detailUrl ? (
                      <Button href={detailUrl} target="_blank" rel="noreferrer">
                        打开地图详情
                      </Button>
                    ) : null}
                  </Space>

                  <div>
                    <Text strong>当前地点名称</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {watchedLocationName || '未填写打卡地点名称'}
                    </Paragraph>
                  </div>

                  <div>
                    <Text strong>当前经纬度</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      纬度：{watchedLatitude ?? '--'}，经度：{watchedLongitude ?? '--'}
                    </Paragraph>
                  </div>

                  <div>
                    <Text strong>当前打卡半径</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {watchedRadius || 0} 米
                    </Paragraph>
                  </div>

                  <Divider style={{ margin: '4px 0' }} />

                  <Text type="secondary">
                    请在实际考勤点附近点击“使用当前位置”，再保存当前打卡范围。
                  </Text>
                </Space>
              </Card>
            </Col>

            <Col xs={24} lg={14}>
              <Card
                bordered={false}
                bodyStyle={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}
                style={{ background: '#f5f5f5', minHeight: 420 }}
              >
                {embedUrl ? (
                  <iframe
                    title="attendance-location-preview"
                    src={embedUrl}
                    style={{ width: '100%', height: 420, border: 0 }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      height: 420,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 24,
                      textAlign: 'center',
                    }}
                  >
                    <Space direction="vertical" size={10}>
                      <EnvironmentOutlined style={{ fontSize: 28, color: '#9f3a2b' }} />
                      <Text strong>等待地图预览</Text>
                      <Text type="secondary">先填写经纬度，或者直接使用当前位置，地图会自动显示打卡中心点。</Text>
                    </Space>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      </Modal>
    </Card>
  )
}

export default AttendanceManagePage






