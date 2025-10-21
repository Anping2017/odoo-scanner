# 解决 "Odoo base missing or not allowed" 错误

## 🔍 错误原因

这个错误通常由以下原因引起：

1. **模块依赖问题**：模块依赖的base模块不可用
2. **权限配置问题**：安全配置文件中的模型ID引用错误
3. **模块结构问题**：模块文件结构不完整
4. **Odoo版本兼容性**：模块与Odoo版本不兼容

## 🛠️ 解决方案

### 方案1: 检查Odoo版本

确保你的Odoo版本支持该模块：

```bash
# 检查Odoo版本
odoo --version
```

### 方案2: 简化模块安装

我已经简化了模块文件，现在尝试以下步骤：

1. **重启Odoo服务**
```bash
sudo systemctl restart odoo
# 或
sudo service odoo restart
```

2. **更新应用列表**
- 进入Odoo后台
- 应用 → 更新应用列表

3. **安装模块**
- 搜索 "盘点历史记录_8070"
- 点击安装

### 方案3: 手动安装模块

如果自动安装失败，尝试手动安装：

1. **复制模块文件**
```bash
cp -r inventory_history_8070 /opt/odoo/addons/
```

2. **设置权限**
```bash
chmod -R 755 /opt/odoo/addons/inventory_history_8070
chown -R odoo:odoo /opt/odoo/addons/inventory_history_8070
```

3. **重启Odoo**
```bash
sudo systemctl restart odoo
```

### 方案4: 检查日志

查看Odoo日志文件：

```bash
tail -f /var/log/odoo/odoo-server.log
```

查找相关错误信息。

### 方案5: 创建最小化模块

如果问题持续，可以创建一个最小化的测试模块：

```python
# 最小化模型文件
from odoo import models, fields

class TestModel(models.Model):
    _name = 'test.model_8070'
    _description = 'Test Model'
    
    name = fields.Char('Name')
```

## 🔧 当前模块状态

我已经简化了模块文件：

- ✅ 移除了复杂的计算字段
- ✅ 简化了模块清单
- ✅ 减少了权限配置
- ✅ 移除了可能导致问题的功能

## 📋 检查清单

- [ ] Odoo服务正在运行
- [ ] 模块文件已复制到正确位置
- [ ] 文件权限正确设置
- [ ] 已更新应用列表
- [ ] 尝试安装模块
- [ ] 检查错误日志

## 🆘 如果问题仍然存在

1. **检查Odoo日志**：查看详细的错误信息
2. **尝试其他模块**：确认Odoo安装正常
3. **联系技术支持**：提供错误日志信息

## 📞 获取帮助

如果问题持续，请提供：
- Odoo版本信息
- 错误日志内容
- 模块安装步骤
- 系统环境信息
