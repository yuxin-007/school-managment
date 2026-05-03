# 学校组织与教学协同管理系统

这是一个面向学校日常管理场景的综合系统，包含统一的后端服务、Web 管理端和移动端 App。系统围绕组织结构、用户权限、课程教学、请假审批、考勤、公告通知和成绩管理展开，并支持统一的运行状态查询与多端协同。

## 系统组成

- `app/`：Flask 后端，提供认证、组织、用户、课程、作业、考勤、请假、通知、日志、成绩等 API
- `frontend/`：React + TypeScript Web 客户端，面向管理端和桌面浏览器使用
- `mobile/`：React + Capacitor 移动端，面向学生与移动办公场景
- `migrations/`：数据库迁移脚本
- `tests/`：后端自动化测试
- `manage.py`：统一启动、构建、状态查询和停止命令入口

## 核心能力

- 组织与人员管理：维护学校、学院、专业、班级等层级，以及用户归属和权限范围
- 统一认证与安全：登录、锁定、找回密码、邮箱验证码、CSRF 防护、生产环境配置校验
- 课程教学协同：课程管理、选课、课表、课程空间、作业发布与提交、作业评阅
- 考勤与请假：日常考勤、课程考勤、审批流转、统计查询
- 公告与通知：公告发布、系统通知、未读计数与消息聚合
- 成绩管理：平时成绩、课程成绩录入与查询
- 个性化体验：主题、语言、通知偏好等用户设置
- 多端运行管理：统一管理后端、Web 端、移动端的开发与构建流程

## 技术栈

后端：

- Flask
- SQLAlchemy
- Flask-Login
- Flask-Migrate
- Waitress

Web：

- React
- TypeScript
- Vite
- Ant Design
- Zustand

移动端：

- React
- TypeScript
- Vite
- Capacitor

## 快速开始

1. 安装后端依赖

```bash
pip install -r requirements.txt
```

2. 安装 Web 端依赖

```bash
cd frontend
npm install
```

3. 安装移动端依赖

```bash
cd mobile
npm install
```

4. 配置环境变量

```bash
copy .env.example .env
```

5. 初始化数据库

```bash
python init_db.py
```

6. 启动后端、Web 和移动端开发服务

```bash
py manage.py dev --all
```

默认地址：

- 后端：`http://127.0.0.1:5000`
- Web：`http://localhost:3000`
- 移动端开发服务：`http://127.0.0.1:3100`

## 常用命令

仅启动后端：

```bash
py manage.py backend
```

启动后端和 Web：

```bash
py manage.py dev --web
```

启动后端和移动端：

```bash
py manage.py dev --mobile
```

构建 Web：

```bash
py manage.py build web
```

构建移动端：

```bash
py manage.py build mobile
```

查询运行状态：

```bash
py manage.py status
```

## 测试与校验

后端测试：

```bash
pytest
```

Web 构建校验：

```bash
cd frontend
npm run build
```

移动端构建校验：

```bash
cd mobile
npm run build
```

## 环境变量

参考根目录 [`.env.example`](./.env.example)：

- `FLASK_ENV`
- `SECRET_KEY`
- `DATABASE_URL`
- `MAIL_SERVER`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_DEFAULT_SENDER`
- `MAIL_USE_SSL`
- `MAIL_USE_TLS`
- `MAIL_SUPPRESS_SEND`

## 仓库说明

仓库仅保留与系统本身相关的代码、配置示例、迁移脚本和测试，不包含本地环境文件、构建缓存和开发临时产物。
