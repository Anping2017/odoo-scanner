# 解决 "Odoo base missing or not allowed" 错误

## 🔍 问题诊断

这个错误通常由以下原因引起：

1. **环境变量未配置**：`ODOO_ALLOWED_BASES` 环境变量未设置
2. **Cookie缺失**：登录状态丢失，缺少必要的cookie
3. **Odoo连接问题**：Odoo服务不可用或配置错误
4. **权限问题**：用户没有访问权限

## 🛠️ 解决方案

### 方案1: 检查登录状态

1. **重新登录**：
   - 访问登录页面
   - 选择正确的数据库源（localhost:8069）
   - 输入用户名密码：`odoo`
   - 确保登录成功

2. **检查Cookie**：
   - 打开浏览器开发者工具
   - 查看Application/Storage → Cookies
   - 确认存在以下cookie：
     - `od_base`: http://localhost:8069
     - `od_db`: test-odoo2
     - `od_session`: session_id值

### 方案2: 测试Odoo连接

我已经创建了一个测试API，访问以下URL测试连接：

```
http://localhost:3000/api/test-odoo-connection
```

这将显示详细的连接信息和错误原因。

### 方案3: 检查Odoo服务

1. **确认Odoo运行**：
   ```bash
   # 检查Odoo进程
   ps aux | grep odoo
   
   # 检查端口
   netstat -tlnp | grep 8069
   ```

2. **测试Odoo访问**：
   - 浏览器访问：`http://localhost:8069`
   - 确认Odoo界面正常显示

### 方案4: 检查模块安装

1. **确认模块已安装**：
   - 登录Odoo后台
   - 应用 → 搜索 "Inventory History 8070"
   - 确认模块状态为"已安装"

2. **检查模型存在**：
   - 设置 → 技术 → 数据库结构 → 模型
   - 搜索 `inventory.history_8070`
   - 确认模型存在

### 方案5: 环境变量配置

我已经在代码中添加了默认的允许base URL：

```typescript
const ALLOWED = (process.env.ODOO_ALLOWED_BASES || 'http://localhost:8069,https://shop.moboplus.co.nz,https://repair.raytech.co.nz')
```

如果需要自定义，可以设置环境变量：

```bash
export ODOO_ALLOWED_BASES="http://localhost:8069,https://your-odoo-url.com"
```

## 🔧 调试步骤

### 1. 检查API响应

访问盘点历史页面，打开浏览器开发者工具：

1. **Network标签**：
   - 查看 `/api/inventory-history` 请求
   - 检查请求头和响应内容

2. **Console标签**：
   - 查看调试信息输出
   - 查找错误消息

### 2. 检查服务器日志

```bash
# 查看Next.js开发服务器日志
npm run dev

# 查看Odoo日志
tail -f /var/log/odoo/odoo-server.log
```

### 3. 手动测试API

使用curl测试API：

```bash
# 获取cookie后测试
curl -X GET "http://localhost:3000/api/test-odoo-connection" \
  -H "Cookie: od_base=http://localhost:8069; od_db=test-odoo2; od_session=your_session_id"
```

## 📋 检查清单

- [ ] Odoo服务正在运行 (端口8069)
- [ ] 已成功登录到Odoo
- [ ] Cookie包含正确的base、db、session信息
- [ ] Inventory History 8070模块已安装
- [ ] 用户有访问权限
- [ ] 网络连接正常

## 🆘 如果问题仍然存在

1. **提供调试信息**：
   - 浏览器控制台错误
   - 网络请求详情
   - 服务器日志

2. **尝试测试API**：
   - 访问 `/api/test-odoo-connection`
   - 查看返回的详细信息

3. **检查Odoo配置**：
   - 确认数据库名称正确
   - 确认用户权限设置

## 📞 获取帮助

如果问题持续，请提供：
- 错误截图
- 浏览器控制台输出
- 测试API的响应
- Odoo版本和配置信息
