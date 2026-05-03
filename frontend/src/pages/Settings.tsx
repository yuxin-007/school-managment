import { getApiErrorMessage } from '@/lib/errors'
import React, { useEffect, useMemo, useState } from 'react'
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
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { BellOutlined, InfoCircleOutlined, LockOutlined, MailOutlined, PhoneOutlined, SettingOutlined } from '@ant-design/icons'
import { changePassword, getPreferences, sendContactCode, updatePreferences, updateProfile } from '@/api/auth'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const { Paragraph, Text, Title } = Typography

type ThemeMode = 'light' | 'dark' | 'auto'
type LanguageMode = 'zh-CN' | 'en'
type NotificationPreferenceKey = 'leave' | 'attendance' | 'announcement' | 'grade' | 'course' | 'system'

interface NotificationPreferences {
  leave: boolean
  attendance: boolean
  announcement: boolean
  grade: boolean
  course: boolean
  system: boolean
}

interface PreferencesState {
  theme: ThemeMode
  language: LanguageMode
  notification_preferences: NotificationPreferences
}

interface PreferencesUpdatePayload {
  theme?: ThemeMode
  language?: LanguageMode
  notification_preferences?: Partial<NotificationPreferences>
}

const defaultNotificationPreferences: NotificationPreferences = {
  leave: true,
  attendance: true,
  announcement: true,
  grade: true,
  course: true,
  system: true,
}

const SettingsPage: React.FC = () => {
  const { user, setUser, setUIPreferences } = useAuthStore()
  const { roleLabel, t } = useI18n()
  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [profileSaving, setProfileSaving] = useState(false)
  const [contactCodeLoading, setContactCodeLoading] = useState<{ email?: boolean; phone?: boolean }>({})
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [preferenceSaving, setPreferenceSaving] = useState(false)
  const [preferences, setPreferences] = useState<PreferencesState>({
    theme: user?.theme || 'light',
    language: user?.language || 'zh-CN',
    notification_preferences: defaultNotificationPreferences,
  })

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        real_name: user.real_name,
        email: user.email,
        phone: user.phone,
      })
      setPreferences((current) => ({
        ...current,
        theme: user.theme || current.theme,
        language: user.language || current.language,
      }))
    }
  }, [profileForm, user])

  useEffect(() => {
    const loadPreferences = async () => {
      setPreferencesLoading(true)
      try {
        const res = await getPreferences()
        if (res.data.success) {
          setPreferences({
            theme: res.data.data?.theme || user?.theme || 'light',
            language: res.data.data?.language || user?.language || 'zh-CN',
            notification_preferences: {
              ...defaultNotificationPreferences,
              ...(res.data.data?.notification_preferences || {}),
            },
          })
        }
      } catch {
        message.error(t('settings.preferences.loadFailed'))
      } finally {
        setPreferencesLoading(false)
      }
    }

    loadPreferences()
  }, [t, user?.language, user?.theme])

  const syncUserPreferences = (next: { theme?: ThemeMode; language?: LanguageMode }) => {
    setUIPreferences(next)
    if (!user) return
    setUser({
      ...user,
      theme: next.theme || user.theme,
      language: next.language || user.language,
    })
  }

  const persistPreferences = async (payload: PreferencesUpdatePayload, successMessage = t('settings.preferences.saved')) => {
    setPreferenceSaving(true)
    try {
      const res = await updatePreferences(payload)
      if (res.data.success) {
        const nextData = res.data.data
        if (nextData) {
          setPreferences({
            theme: nextData.theme || preferences.theme,
            language: nextData.language || preferences.language,
            notification_preferences: {
              ...defaultNotificationPreferences,
              ...(nextData.notification_preferences || {}),
            },
          })
          syncUserPreferences(nextData)
        } else {
          setPreferences((current) => ({
            theme: payload.theme || current.theme,
            language: payload.language || current.language,
            notification_preferences: payload.notification_preferences
              ? { ...current.notification_preferences, ...payload.notification_preferences }
              : current.notification_preferences,
          }))
          syncUserPreferences(payload)
        }
        message.success(successMessage)
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, t('settings.preferences.saveFailed')))
    } finally {
      setPreferenceSaving(false)
    }
  }

  const normalizeContactValue = (value?: string) => (value || '').trim()

  const contactNeedsVerification = (type: 'email' | 'phone', value?: string) =>
    normalizeContactValue(value) !== normalizeContactValue(user?.[type])

  const handleSendContactCode = async (type: 'email' | 'phone') => {
    const fieldName = type
    const values = await profileForm.validateFields([fieldName])
    const contact = normalizeContactValue(values[fieldName])
    if (!contact) {
      message.warning(type === 'email' ? '请先填写需要绑定的邮箱' : '请先填写需要绑定的手机号')
      return
    }

    setContactCodeLoading((current) => ({ ...current, [type]: true }))
    try {
      const res = await sendContactCode({ contact_type: type, contact })
      if (res.data.success) {
        const debugCode = res.data.data?.debug_code
        message.success(debugCode ? `验证码已发送，测试验证码：${debugCode}` : '验证码已发送')
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '验证码发送失败'))
    } finally {
      setContactCodeLoading((current) => ({ ...current, [type]: false }))
    }
  }

  const handleProfileSave = async () => {
    const values = await profileForm.validateFields()
    if (contactNeedsVerification('email', values.email) && !normalizeContactValue(values.email_code)) {
      message.warning('绑定或换绑邮箱需要先填写邮箱验证码')
      return
    }
    if (contactNeedsVerification('phone', values.phone) && !normalizeContactValue(values.phone_code)) {
      message.warning('绑定或换绑手机号需要先填写手机验证码')
      return
    }
    setProfileSaving(true)
    try {
      const res = await updateProfile(values)
      if (res.data.success && user) {
        const profileValues = Object.fromEntries(
          Object.entries(values).filter(([key]) => !['email_code', 'phone_code'].includes(key)),
        )
        setUser({ ...user, ...profileValues })
        profileForm.setFieldsValue({ email_code: undefined, phone_code: undefined })
        message.success(t('settings.profile.saveSuccess'))
      }
    } catch {
      message.error(t('settings.profile.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    const values = await passwordForm.validateFields()
    setPasswordSaving(true)
    try {
      const res = await changePassword(values)
      if (res.data.success) {
        message.success(t('settings.security.passwordSuccess'))
        passwordForm.resetFields()
      }
    } catch (err: unknown) {
      message.error(getApiErrorMessage(err, t('settings.security.passwordFailed')))
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleThemeChange = (theme: ThemeMode) => {
    void persistPreferences({ theme }, t('settings.preferences.saved'))
  }

  const handleLanguageChange = (language: LanguageMode) => {
    void persistPreferences({ language }, t('settings.preferences.saved'))
  }

  const handleNotificationToggle = (key: NotificationPreferenceKey, value: boolean) => {
    const nextPreferences: NotificationPreferences = {
      ...preferences.notification_preferences,
      [key]: value,
    }
    const partialPreferences: Partial<NotificationPreferences> = { [key]: value }
    setPreferences((current) => ({
      ...current,
      notification_preferences: nextPreferences,
    }))
    void persistPreferences({ notification_preferences: partialPreferences }, t('settings.preferences.saved'))
  }

  const overviewRows = useMemo(
    () => [
      { label: t('settings.system.row.name'), value: t('settings.system.value.name') },
      { label: t('settings.system.row.core'), value: t('settings.system.value.core') },
      { label: t('settings.system.row.roles'), value: t('settings.system.value.roles') },
      { label: t('settings.system.row.modules'), value: t('settings.system.value.modules') },
      { label: t('settings.system.row.stack'), value: t('settings.system.value.stack') },
    ],
    [t],
  )

  const moduleHighlights = useMemo(
    () => [
      t('settings.system.highlight.orgTree'),
      t('settings.system.highlight.scope'),
      t('settings.system.highlight.role'),
    ],
    [t],
  )

  const notificationKeys: NotificationPreferenceKey[] = ['leave', 'attendance', 'announcement', 'grade', 'course', 'system']

  const tabItems = [
    {
      key: 'profile',
      label: (
        <span>
          <InfoCircleOutlined /> {t('settings.tab.profile')}
        </span>
      ),
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Avatar size={80} style={{ backgroundColor: 'var(--brand-primary)', fontSize: 32 }}>
              {user?.real_name?.[0] || 'U'}
            </Avatar>
            <Title level={4} style={{ marginTop: 12, marginBottom: 0 }}>
              {user?.real_name}
            </Title>
            <Text type="secondary">{roleLabel(user?.role, user?.role_display)}</Text>
          </div>
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 560 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="real_name"
                  label={t('settings.profile.realName')}
                  rules={[{ required: true, message: t('settings.profile.validation.realName') }]}
                >
                  <Input placeholder={t('settings.profile.realName')} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={t('settings.profile.username')}>
                  <Input value={user?.username} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="email"
                  label={t('settings.profile.email')}
                  rules={[{ type: 'email', message: t('settings.profile.validation.email') }]}
                >
                  <Input
                    type="email"
                    placeholder={t('settings.profile.email')}
                    prefix={<MailOutlined />}
                    onChange={() => profileForm.setFieldValue('email_code', undefined)}
                  />
                </Form.Item>
                <Form.Item shouldUpdate={(prev, current) => prev.email !== current.email}>
                  {({ getFieldValue }) => {
                    const changed = contactNeedsVerification('email', getFieldValue('email'))
                    return (
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item
                          name="email_code"
                          noStyle
                          rules={changed ? [{ required: true, message: '请输入邮箱验证码' }] : []}
                        >
                          <Input placeholder={changed ? '邮箱验证码' : '未更换邮箱时无需验证码'} disabled={!changed} />
                        </Form.Item>
                        <Button
                          disabled={!changed}
                          loading={contactCodeLoading.email}
                          onClick={() => void handleSendContactCode('email')}
                        >
                          {user?.email ? '换绑验证' : '绑定验证'}
                        </Button>
                      </Space.Compact>
                    )
                  }}
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="phone"
                  label={t('settings.profile.phone')}
                  rules={[{ pattern: /^$|^1\d{10}$/, message: t('settings.profile.validation.phone') }]}
                >
                  <Input
                    placeholder={t('settings.profile.phone')}
                    prefix={<PhoneOutlined />}
                    onChange={() => profileForm.setFieldValue('phone_code', undefined)}
                  />
                </Form.Item>
                <Form.Item shouldUpdate={(prev, current) => prev.phone !== current.phone}>
                  {({ getFieldValue }) => {
                    const changed = contactNeedsVerification('phone', getFieldValue('phone'))
                    return (
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item
                          name="phone_code"
                          noStyle
                          rules={changed ? [{ required: true, message: '请输入手机验证码' }] : []}
                        >
                          <Input placeholder={changed ? '手机验证码' : '未更换手机号时无需验证码'} disabled={!changed} />
                        </Form.Item>
                        <Button
                          disabled={!changed}
                          loading={contactCodeLoading.phone}
                          onClick={() => void handleSendContactCode('phone')}
                        >
                          {user?.phone ? '换绑验证' : '绑定验证'}
                        </Button>
                      </Space.Compact>
                    )
                  }}
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label={t('settings.profile.employeeOrStudentId')}>
              <Input value={user?.employee_id || user?.student_id || '-'} disabled />
            </Form.Item>
            <Form.Item label={t('settings.profile.department')}>
              <Input value={user?.department_name || t('settings.profile.unassigned')} disabled />
            </Form.Item>
            <Button type="primary" onClick={handleProfileSave} loading={profileSaving}>
              {t('settings.profile.save')}
            </Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'security',
      label: (
        <span>
          <LockOutlined /> {t('settings.tab.security')}
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Title level={5}>{t('settings.security.passwordTitle')}</Title>
            <Text type="secondary">{t('settings.security.passwordDesc')}</Text>
            <Divider />
            <Form form={passwordForm} layout="vertical" style={{ maxWidth: 420 }}>
              <Form.Item
                name="current_password"
                label={t('settings.security.currentPassword')}
                rules={[{ required: true, message: t('settings.security.validation.currentPassword') }]}
              >
                <Input.Password placeholder={t('settings.security.currentPasswordPlaceholder')} />
              </Form.Item>
              <Form.Item
                name="new_password"
                label={t('settings.security.newPassword')}
                rules={[
                  { required: true, message: t('settings.security.validation.newPassword') },
                  { min: 6, message: t('settings.security.validation.newPasswordLength') },
                ]}
              >
                <Input.Password placeholder={t('settings.security.newPasswordPlaceholder')} />
              </Form.Item>
              <Form.Item
                name="confirm_password"
                label={t('settings.security.confirmPassword')}
                dependencies={['new_password']}
                rules={[
                  { required: true, message: t('settings.security.validation.confirmPassword') },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('new_password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error(t('settings.security.validation.passwordMismatch')))
                    },
                  }),
                ]}
              >
                <Input.Password placeholder={t('settings.security.confirmPasswordPlaceholder')} />
              </Form.Item>
              <Button type="primary" onClick={handlePasswordChange} loading={passwordSaving}>
                {t('settings.security.changePassword')}
              </Button>
            </Form>
          </Card>

          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Title level={5}>{t('settings.security.accountStatus')}</Title>
            <Descriptions bordered column={1} size="middle">
              <Descriptions.Item label={t('settings.security.account')}>{user?.username || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('settings.security.role')}>{roleLabel(user?.role, user?.role_display)}</Descriptions.Item>
              <Descriptions.Item label={t('settings.security.primaryOrg')}>
                {user?.department_name || t('common.notConfiguredPrimaryOrg')}
              </Descriptions.Item>
              <Descriptions.Item label={t('settings.security.lastLogin')}>
                {user?.last_login || t('settings.security.firstLogin')}
              </Descriptions.Item>
              <Descriptions.Item label={t('settings.security.createdAt')}>
                {user?.created_at || t('common.notAvailable')}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Space>
      ),
    },
    {
      key: 'appearance',
      label: (
        <span>
          <SettingOutlined /> {t('settings.tab.appearance')}
        </span>
      ),
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }} loading={preferencesLoading}>
          <Title level={5}>{t('settings.appearance.title')}</Title>
          <Text type="secondary">{t('settings.appearance.desc')}</Text>
          <Divider />
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text strong>{t('settings.appearance.themeLabel')}</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                {t('settings.appearance.themeCurrent', { value: t(`settings.appearance.theme.${preferences.theme}`) })}
              </Text>
              <Space wrap>
                <Button type={preferences.theme === 'light' ? 'primary' : 'default'} onClick={() => handleThemeChange('light')}>
                  {t('settings.appearance.theme.light')}
                </Button>
                <Button type={preferences.theme === 'dark' ? 'primary' : 'default'} onClick={() => handleThemeChange('dark')}>
                  {t('settings.appearance.theme.dark')}
                </Button>
                <Button type={preferences.theme === 'auto' ? 'primary' : 'default'} onClick={() => handleThemeChange('auto')}>
                  {t('settings.appearance.theme.auto')}
                </Button>
              </Space>
            </div>

            <div>
              <Text strong>{t('settings.appearance.languageLabel')}</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                {t('settings.appearance.languageDesc')}
              </Text>
              <Space wrap>
                <Button
                  type={preferences.language === 'zh-CN' ? 'primary' : 'default'}
                  onClick={() => handleLanguageChange('zh-CN')}
                >
                  {t('settings.appearance.language.zh-CN')}
                </Button>
                <Button type={preferences.language === 'en' ? 'primary' : 'default'} onClick={() => handleLanguageChange('en')}>
                  {t('settings.appearance.language.en')}
                </Button>
              </Space>
            </div>

            <div>
              <Text strong>{t('settings.appearance.overview')}</Text>
              <div style={{ marginTop: 10 }}>
                <Space wrap>
                  <Tag color="blue">{t(`settings.appearance.theme.${preferences.theme}`)}</Tag>
                  <Tag color="cyan">{t(`settings.appearance.language.${preferences.language}`)}</Tag>
                  {preferenceSaving ? <Tag color="processing">{t('common.syncing')}</Tag> : <Tag color="success">{t('common.synced')}</Tag>}
                </Space>
              </div>
            </div>
          </Space>
        </Card>
      ),
    },
    {
      key: 'notifications',
      label: (
        <span>
          <BellOutlined /> {t('settings.tab.notifications')}
        </span>
      ),
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }} loading={preferencesLoading}>
          <Title level={5}>{t('settings.notifications.title')}</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('settings.notifications.desc')}
          </Paragraph>
          <Divider />
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {notificationKeys.map((key) => (
              <Card key={key} size="small" bordered style={{ borderRadius: 16 }}>
                <Row align="middle" justify="space-between" gutter={16}>
                  <Col flex="auto">
                    <Text strong>{t(`settings.notifications.${key}.title`)}</Text>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                      {t(`settings.notifications.${key}.desc`)}
                    </Text>
                  </Col>
                  <Col>
                    <Switch
                      checked={preferences.notification_preferences[key]}
                      loading={preferenceSaving}
                      onChange={(checked) => handleNotificationToggle(key, checked)}
                    />
                  </Col>
                </Row>
              </Card>
            ))}
          </Space>
        </Card>
      ),
    },
    {
      key: 'system',
      label: (
        <span>
          <InfoCircleOutlined /> {t('settings.tab.system')}
        </span>
      ),
      children: (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <div>
              <Title level={5}>{t('settings.system.overviewTitle')}</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0, lineHeight: 1.85 }}>
                {t('settings.system.overviewDesc')}
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
              <Title level={5}>{t('settings.system.featuresTitle')}</Title>
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
      <Title level={4}>{t('settings.title')}</Title>
      <Tabs items={tabItems} defaultActiveKey="profile" />
    </div>
  )
}

export default SettingsPage
