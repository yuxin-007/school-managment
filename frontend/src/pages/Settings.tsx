import React, { useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd'
import { InfoCircleOutlined, LockOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'
import { changePassword, updatePreferences, updateProfile } from '@/api/auth'

const { Paragraph, Text, Title } = Typography

const overviewRows = [
  { label: '系统名称', value: '学校组织与人员管理系统' },
  { label: '核心模型', value: '以组织树为核心管理组织、人员与业务关系' },
  { label: '主要角色', value: '系统管理员、学院管理员、教职工、学生' },
  { label: '主要模块', value: '组织管理、用户管理、课程管理、请假管理、考勤管理、公告管理、成绩管理' },
  { label: '技术栈', value: 'Flask + SQLAlchemy + React + TypeScript + Ant Design' },
]

const moduleHighlights = [
  '组织树负责定义学校、学院、学生和教职工之间的层级关系。',
  '课程、请假、考勤、公告等模块会随着组织归属变化同步调整可见范围。',
  '不同角色登录系统后，会自动进入与自身权限匹配的数据视图。',
]

const SettingsPage: React.FC = () => {
  const { user, setUser } = useAuthStore()
  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        real_name: user.real_name,
        email: user.email,
        phone: user.phone,
      })
    }
  }, [profileForm, user])

  const handleProfileSave = async () => {
    const values = await profileForm.validateFields()
    setLoading(true)
    try {
      const res = await updateProfile(values)
      if (res.data.success) {
        setUser({ ...user!, ...values })
        message.success('个人信息已更新')
      }
    } catch {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    const values = await passwordForm.validateFields()
    setLoading(true)
    try {
      const res = await changePassword(values)
      if (res.data.success) {
        message.success('密码修改成功')
        passwordForm.resetFields()
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || '密码修改失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePreferenceSave = async (key: string, value: string) => {
    try {
      await updatePreferences({ [key]: value })
      if (user) {
        setUser({ ...user, [key]: value })
      }
      message.success('设置已保存')
    } catch {
      message.error('保存失败')
    }
  }

  const tabItems = [
    {
      key: 'profile',
      label: <span><InfoCircleOutlined /> 个人资料</span>,
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Avatar size={80} style={{ backgroundColor: '#667eea', fontSize: 32 }}>
              {user?.real_name?.[0] || 'U'}
            </Avatar>
            <Title level={4} style={{ marginTop: 12, marginBottom: 0 }}>{user?.real_name}</Title>
            <Text type="secondary">{user?.role_display}</Text>
          </div>
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 500 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="real_name" label="真实姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                  <Input placeholder="请输入真实姓名" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="用户名">
                  <Input value={user?.username} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="email" label="邮箱">
                  <Input type="email" placeholder="请输入邮箱" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="phone" label="手机号">
                  <Input placeholder="请输入手机号" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="工号/学号">
              <Input value={user?.employee_id || user?.student_id || '-'} disabled />
            </Form.Item>
            <Form.Item label="所属部门">
              <Input value={user?.department_name || '未分配'} disabled />
            </Form.Item>
            <Button type="primary" onClick={handleProfileSave} loading={loading}>
              保存修改
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'security',
      label: <span><LockOutlined /> 账户安全</span>,
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Title level={5}>修改密码</Title>
          <Text type="secondary">为保障账户安全，请定期更换密码。</Text>
          <Divider />
          <Form form={passwordForm} layout="vertical" style={{ maxWidth: 400 }}>
            <Form.Item
              name="current_password"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" />
            </Form.Item>
            <Form.Item
              name="new_password"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码长度不能少于6位' },
              ]}
            >
              <Input.Password placeholder="请输入新密码（至少6位）" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label="确认新密码"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请确认新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password placeholder="请再次输入新密码" />
            </Form.Item>
            <Button type="primary" onClick={handlePasswordChange} loading={loading}>
              修改密码
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'appearance',
      label: <span><SettingOutlined /> 偏好设置</span>,
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Title level={5}>外观与语言</Title>
          <Text type="secondary">保留简洁设置，方便日常使用与个性化调整。</Text>
          <Divider />
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>主题</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>选择您喜欢的界面风格</Text>
              <Space>
                <Button
                  type={user?.theme === 'light' ? 'primary' : 'default'}
                  onClick={() => handlePreferenceSave('theme', 'light')}
                >
                  浅色模式
                </Button>
                <Button
                  type={user?.theme === 'dark' ? 'primary' : 'default'}
                  onClick={() => handlePreferenceSave('theme', 'dark')}
                >
                  深色模式
                </Button>
              </Space>
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div>
              <Text strong>语言</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>选择系统显示语言</Text>
              <Space>
                <Button
                  type={user?.language === 'zh-CN' ? 'primary' : 'default'}
                  onClick={() => handlePreferenceSave('language', 'zh-CN')}
                >
                  简体中文
                </Button>
                <Button
                  type={user?.language === 'en' ? 'primary' : 'default'}
                  onClick={() => handlePreferenceSave('language', 'en')}
                >
                  English
                </Button>
              </Space>
            </div>
          </Space>
        </Card>
      ),
    },
    {
      key: 'system',
      label: <span><InfoCircleOutlined /> 系统信息</span>,
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <div>
              <Title level={5}>系统概览</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0, lineHeight: 1.85 }}>
                本系统以组织树为核心，将学校、学院、学生和教职工统一纳入组织治理链路，
                让课程、请假、考勤、公告和成绩等业务围绕真实组织结构运行。
              </Paragraph>
            </div>

            <Descriptions bordered column={1} size="middle">
              {overviewRows.map((item) => (
                <Descriptions.Item key={item.label} label={item.label}>
                  {item.value}
                </Descriptions.Item>
              ))}
            </Descriptions>

            <div>
              <Title level={5}>功能说明</Title>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {moduleHighlights.map((item) => (
                  <Text key={item}>{item}</Text>
                ))}
              </Space>
            </div>
          </Space>
        </Card>
      ),
    },
  ]

  return (
    <div>
      <Title level={4}>个人设置</Title>
      <Tabs items={tabItems} defaultActiveKey="profile" />
    </div>
  )
}

export default SettingsPage

