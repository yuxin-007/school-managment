# 启动说明

当前项目由一套统一后端同时支撑 Web 端和移动端。推荐通过根目录的 `manage.py` 管理开发、构建和运行状态，而不是分别手工维护多个窗口和命令。

## 推荐启动方式

启动后端、Web 端和移动端：

```bash
py manage.py dev --all
```

启动完成后默认地址如下：

- 后端：`http://127.0.0.1:5000`
- Web：`http://localhost:3000`
- 移动端开发服务：`http://127.0.0.1:3100`

## 按需启动

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

## 构建

构建 Web：

```bash
py manage.py build web
```

构建移动端：

```bash
py manage.py build mobile
```

同时构建 Web 和移动端：

```bash
py manage.py build all
```

## 生产服务

启动生产后端服务：

```bash
py manage.py serve
```

该模式使用 Waitress 托管 Flask 应用。

## 运行状态

启动器会将当前运行状态写入：

```text
instance/runtime-status.json
```

后端同时提供统一状态接口：

```text
GET /api/runtime/status
GET /api/health
```

可通过命令查看当前状态：

```bash
py manage.py status
```

停止由启动器记录的服务：

```bash
py manage.py stop
```
