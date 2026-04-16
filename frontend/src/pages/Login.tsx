import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ApartmentOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getProfile, login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

const { Title, Paragraph, Text } = Typography

const highlights = [
  {
    icon: <ApartmentOutlined style={{ color: '#9f3a2b', fontSize: 18 }} />,
    title: '组织树驱动治理',
    description: '学校、学院、学生、教职工统一纳入一棵组织树，权限与业务实时联动。',
  },
  {
    icon: <TeamOutlined style={{ color: '#9f3a2b', fontSize: 18 }} />,
    title: '人员与业务协同',
    description: '课程、请假、考勤、公告等模块均围绕组织范围进行管理。',
  },
  {
    icon: <SafetyCertificateOutlined style={{ color: '#9f3a2b', fontSize: 18 }} />,
    title: '企业级管控体验',
    description: '角色边界清晰，管理范围可控，适合学校日常运营与制度落地。',
  },
]

const LoginPage: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setUser, isLoggedIn } = useAuthStore()

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/dashboard', { replace: true })
    }
  }, [isLoggedIn, navigate])

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const loginRes = await login(values)
      if (loginRes.data.success) {
        const profileRes = await getProfile()
        if (profileRes.data.success) {
          const profile = profileRes.data.data
          setUser(profile)
          message.success(`欢迎回来，${profile.real_name || profile.username}`)
          navigate('/dashboard', { replace: true })
        }
      }
    } catch (error) {
      // 请求层已统一处理错误提示
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '32px 20px',
        background:
          'radial-gradient(circle at top left, rgba(196, 98, 51, 0.22), transparent 28%), linear-gradient(135deg, #f5ede2 0%, #f9f6f0 45%, #efe2cf 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1180 }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={14}>
            <div style={{ paddingRight: 12 }}>
              <Space align="center" style={{ marginBottom: 18 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    background: 'linear-gradient(135deg, #9f3a2b 0%, #d07a2c 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 18px 40px rgba(159, 58, 43, 0.22)',
                  }}
                >
                  <ApartmentOutlined style={{ fontSize: 28 }} />
                </div>
                <Tag color="volcano" style={{ borderRadius: 999, paddingInline: 12, lineHeight: '28px' }}>
                  School Organization OS
                </Tag>
              </Space>

              <Title style={{ fontSize: 42, lineHeight: 1.18, marginBottom: 16, color: '#251912' }}>
                学校组织与人员管理平台
              </Title>
              <Paragraph style={{ fontSize: 17, lineHeight: 1.9, color: '#5a463b', maxWidth: 620 }}>
                以组织树为核心主数据，统一承接学校、学院、学生与教职工的组织关系，
                让课程、请假、考勤、公告等业务围绕真实组织边界运行。
              </Paragraph>

              <Row gutter={[16, 16]} style={{ marginTop: 28 }}>
                {highlights.map((item) => (
                  <Col xs={24} md={12} key={item.title}>
                    <Card
                      bordered={false}
                      style={{
                        height: '100%',
                        borderRadius: 20,
                        background: 'rgba(255, 255, 255, 0.78)',
                        boxShadow: '0 20px 40px rgba(90, 70, 59, 0.08)',
                      }}
                      bodyStyle={{ padding: 20 }}
                    >
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space>
                          {item.icon}
                          <Text strong style={{ fontSize: 16, color: '#2f221c' }}>{item.title}</Text>
                        </Space>
                        <Text style={{ color: '#6c5649', lineHeight: 1.8 }}>{item.description}</Text>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          </Col>

          <Col xs={24} lg={10}>
            <Card
              bordered={false}
              style={{
                borderRadius: 28,
                overflow: 'hidden',
                boxShadow: '0 28px 80px rgba(55, 39, 29, 0.16)',
                background: 'rgba(255, 255, 255, 0.9)',
              }}
              bodyStyle={{ padding: 0 }}
            >
              <div
                style={{
                  padding: '28px 32px 22px',
                  background: 'linear-gradient(135deg, #3e2a1f 0%, #6b4732 100%)',
                  color: '#fff4e8',
                }}
              >
                <Text style={{ color: '#f1d8c4', letterSpacing: 1 }}>统一身份入口</Text>
                <Title level={3} style={{ color: '#fff', margin: '10px 0 8px' }}>
                  登录系统
                </Title>
                <Paragraph style={{ color: '#f5dfcf', marginBottom: 0 }}>
                  使用用户名、工号或学号进入与你组织身份相匹配的工作台。
                </Paragraph>
              </div>

              <div style={{ padding: '28px 32px 32px' }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 22, borderRadius: 14 }}
                  message="组织边界会实时影响你可见的课程、人员与审批数据。"
                />

                <Form form={form} onFinish={handleSubmit} size="large" layout="vertical">
                  <Form.Item
                    name="username"
                    label="账号"
                    rules={[{ required: true, message: '请输入用户名、工号或学号' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="请输入用户名、工号或学号" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      loading={loading}
                      style={{
                        height: 48,
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #9f3a2b 0%, #c86a33 100%)',
                        border: 'none',
                        boxShadow: '0 16px 30px rgba(159, 58, 43, 0.18)',
                      }}
                    >
                      进入工作台
                    </Button>
                  </Form.Item>
                </Form>

                <Divider style={{ margin: '20px 0' }} />

                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Card size="small" style={{ borderRadius: 16, background: '#faf5ef' }}>
                      <Text strong style={{ display: 'block', color: '#2f221c', marginBottom: 6 }}>
                        管理端
                      </Text>
                      <Text style={{ color: '#786253' }}>
                        系统管理员、学校管理员、学院管理员按组织范围治理业务。
                      </Text>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" style={{ borderRadius: 16, background: '#faf5ef' }}>
                      <Text strong style={{ display: 'block', color: '#2f221c', marginBottom: 6 }}>
                        使用端
                      </Text>
                      <Text style={{ color: '#786253' }}>
                        学生与教职工获取与自己组织身份一致的课表、考勤与通知。
                      </Text>
                    </Card>
                  </Col>
                </Row>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  )
}

export default LoginPage
