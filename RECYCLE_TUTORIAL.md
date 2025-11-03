# 设备回收模块完整教程

## 📋 目录

1. [模块概述](#模块概述)
2. [功能特点](#功能特点)
3. [使用流程](#使用流程)
4. [详细字段说明](#详细字段说明)
5. [数据流程](#数据流程)
6. [技术实现](#技术实现)
7. [常见问题](#常见问题)

---

## 📖 模块概述

设备回收模块是一个用于记录和管理电子设备（手机、平板、笔记本等）回收业务的系统。该模块支持：

- ✅ 三类设备的详细信息录入（手机、平板、笔记本）
- ✅ 客户信息管理
- ✅ 设备检测和估价记录
- ✅ 自动同步到 Odoo 系统创建采购订单
- ✅ 中英文数据自动转换

---

## ✨ 功能特点

### 1. 三步式表单流程
- **步骤1：设备信息** - 记录设备基本信息和技术规格
- **步骤2：用户信息** - 记录客户和付款信息
- **步骤3：回收记录** - 记录检测结果和回收价格

### 2. 智能表单验证
- 根据设备类型动态显示必填字段
- 实时验证表单完整性
- 防止重复提交

### 3. 数据国际化
- **界面显示**：全中文界面，便于操作
- **数据提交**：自动转换为英文，符合后端系统要求
- **备注信息**：Term and Conditions 栏全部使用英文标签

### 4. 自动同步 Odoo
- 自动创建采购订单（Purchase Order）
- 自动创建产品（如不存在）
- 价格仅在订单行设置，不影响产品价格

---

## 🚀 使用流程

### 第一步：填写设备信息

#### 1.1 选择设备类型
- **手机**：需要填写 IMEI、颜色、存储容量
- **平板**：需要填写序列号、颜色、存储容量、屏幕大小
- **笔记本**：需要填写完整的 CPU、内存、硬盘信息
- **其他**：需要填写设备描述

#### 1.2 填写品牌和型号
- 选择品牌（如：苹果、三星、华为等）
- 如果选择"其他"，需要填写其他品牌描述
- 填写设备型号（必填）

#### 1.3 填写设备详细信息

**手机专用字段：**
- **IMEI**：设备的唯一标识码（必填）
- **颜色**：设备颜色（必填）
- **存储容量**：如 128GB, 256GB（必填）
- **Sim卡类型**：选择支持的 SIM 卡类型
- **网络类型**：
  - 苹果手机：可选（4G/5G/WiFi 等）
  - 其他手机：必须选择 4G 或 5G

**平板专用字段：**
- **序列号**：设备序列号（必填）
- **颜色**：设备颜色（必填）
- **存储容量**：如 128GB, 256GB（必填）
- **屏幕大小**：如 10.9英寸, 12.9英寸（必填）
- **网络类型**：WiFi 或 WiFi+Cellular（必填）

**笔记本专用字段：**
- **序列号**：设备序列号（必填）
- **颜色**：设备颜色（必填）
- **屏幕大小**：如 13.3英寸, 15.6英寸（必填）
- **发布年份**：如 2023（必填）
- **CPU信息**：
  - CPU数量：单核/双核/四核等（必填）
  - CPU型号：如 Intel i7-13700H（必填）
  - CPU速度：如 3.2GHz（必填）
  - CPU补充描述：完整型号（必填）
- **内存信息**：
  - 内存类型：DDR3/DDR4/DDR5 等（必填）
  - 内存大小：如 8GB, 16GB（必填）
- **硬盘信息**：
  - 硬盘类型：SSD/HDD/NVMe 等（必填）
  - 硬盘大小：如 512GB, 1TB（必填）
- **GPU**：显卡型号（必填）

**通用字段：**
- **电池健康度**：0-100 之间的数字（手机/平板/笔记本必填）
- **配件**：可选择多个（充电器、数据线、耳机、保护壳、包装盒、说明书）

### 第二步：填写用户信息

#### 2.1 基本联系信息（全部可选）
- **客户姓名**
- **手机号码**
- **邮箱地址**
- **地址**

#### 2.2 证件信息（可选）
- **证件类型**：护照、驾驶证、其他
  - 如果选择证件类型，需要填写证件号码
  - 如果选择"其他"，需要填写证件描述
- **证件号码**

#### 2.3 银行付款信息（可选）
- **银行类型**：
  - 支持新西兰主要银行（ANZ、ASB、BNZ、Westpac 等）
  - 如果选择"其他"，需要填写其他银行名称
- **账户名称**（如果选择了银行类型，必填）
- **付款账号**（如果选择了银行类型，必填）
- **汇款备注**：可选

### 第三步：填写回收记录

#### 3.1 基本信息（必填）
- **门店**：选择门店（Moboplus、Birkenhead、BrownsBay、Avondale、Raytech）
- **操作人**：填写操作人员姓名
- **回收价格**：填写回收价格（必填）
- **成色**：
  - 几乎全新（Like New）
  - 轻微磨损（Good）
  - 需要维修（Need repair）
  - 拆配件（For Parts）

#### 3.2 配件信息（可选）
- **建议更换的配件**：可选择多个（屏幕、电池、充电接口等）
  - 如果选择"其他"，需要填写配件描述

#### 3.3 备注（可选）
- 可以填写其他备注信息

### 第四步：提交订单

1. 检查所有必填字段是否已填写
2. 点击"记录回收信息"按钮
3. 等待系统创建订单
4. 成功后显示：
   - 采购订单号（PO+ID）
   - 订单行ID

---

## 📝 详细字段说明

### 设备类型映射
界面显示 → 提交数据
- 手机 → Phone
- 平板 → Tablet
- 笔记本 → Laptop
- 其他 → Other

### 品牌映射
界面显示 → 提交数据
- 苹果 → Apple
- 三星 → Samsung
- 华为 → Huawei
- 小米 → Xiaomi
- OPPO → OPPO
- vivo → vivo
- 联想 → Lenovo
- 戴尔 → Dell
- 惠普 → HP
- 华硕 → ASUS
- 其他 → Other

### SIM卡类型映射
- 标准SIM → Standard SIM
- 三卡槽 (双SIM + 存储卡) → Triple Slot (Dual SIM + SD Card)
- 无SIM卡 → No SIM Card
- 其他组合保持不变

### 网络类型映射
- 4G → 4G
- 5G → 5G
- WiFi → WiFi
- WiFi+Cellular → WiFi+Cellular
- 其他 → Other

### CPU核心数映射
- 单核 → Single Core
- 双核 → Dual Core
- 四核 → Quad Core
- 六核 → Hexa Core
- 八核 → Octa Core
- 十核 → Deca Core
- 十二核 → Dodeca Core
- 十六核 → Hexadeca Core
- 其他 → Other

### 配件映射
- 充电器 → Charger
- 数据线 → Cable
- 耳机 → Earphones
- 保护壳 → Case
- 包装盒 → Box
- 说明书 → Manual

### 成色映射
- 几乎全新 → Like New
- 轻微磨损 → Good
- 需要维修 → Need repair
- 拆配件 → For Parts

### 更换配件映射
- 屏幕 → Screen
- 电池 → Battery
- 充电接口 → Charging Port
- 扬声器 → Speaker
- 摄像头 → Camera
- 按键 → Button
- 主板 → Motherboard
- 内存 → Memory
- 硬盘 → Hard Drive
- 键盘 → Keyboard
- 触摸板 → Touchpad
- 风扇 → Fan
- 散热器 → Heat Sink
- 外壳 → Case
- 后盖 → Back Cover
- 天线 → Antenna
- 麦克风 → Microphone
- 其他 → Other

### 证件类型映射
- 护照 → Passport
- 驾驶证 → Driver License
- 其他 → Other

---

## 🔄 数据流程

### 1. 前端数据收集
```
用户填写表单 → React State 存储（中文值）
```

### 2. 数据转换
```
提交时调用转换函数 → 将中文值转换为英文值
```

### 3. API 请求
```
POST /api/push-to-raytech
Body: {
  deviceInfo: { 英文值 },
  userInfo: { 英文值 },
  inspectionInfo: { 英文值 }
}
```

### 4. Odoo 集成
```
1. 查找/创建供应商 "Used Phone Recycle"
2. 创建采购订单（Purchase Order）
   - Partner: Used Phone Recycle
   - Currency: NZD (ID: 35)
   - State: draft
   - Notes: 完整回收信息（英文格式）
   - Partner Ref: 门店 + 日期

3. 查找/创建产品 R0010010001
   - 如果不存在，创建产品
   - 如果存在，直接使用（不更新价格）

4. 创建采购订单行（Purchase Order Line）
   - Product: R0010010001
   - Quantity: 1
   - Price Unit: 回收价格（仅在订单行设置）
```

### 5. 返回结果
```
{
  success: true,
  purchaseOrderId: 订单ID,
  orderLineId: 订单行ID
}
```

---

## 🔧 技术实现

### 前端架构
- **框架**：Next.js 14 (App Router)
- **语言**：TypeScript + React
- **状态管理**：React Hooks (useState, useCallback)
- **文件位置**：`app/recycle/page.tsx`

### 数据转换逻辑
```typescript
// 转换函数位置：app/recycle/page.tsx

// 1. 设备信息转换
convertDeviceInfoToEnglish()

// 2. 用户信息转换
convertUserInfoToEnglish()

// 3. 检测信息转换
convertInspectionInfoToEnglish()
```

### API 端点
- **路径**：`/api/push-to-raytech`
- **方法**：POST
- **文件位置**：`app/api/push-to-raytech/route.ts`

### Odoo 连接
- **方式**：XML-RPC
- **服务器**：https://repair.raytech.co.nz
- **数据库**：db-raytech-repair
- **认证**：用户名/密码认证

### 关键函数

#### `buildLogNote()`
构建完整的回收信息备注，用于写入采购订单的 Terms and Conditions 栏。

**格式**：
```
📱 Device Info: | Device Type: Phone | Brand: Apple | Model: iPhone 13 | ...
----------👤 User Info: | Customer Name: John | Phone: 123456789 | ...
----------🔍 Inspection Info: | Store: Moboplus | Operator: Alice | Recycle Price: 500 | Condition: Like New | ...
```

#### `getProductId()`
获取或创建产品 R0010010001。

**逻辑**：
1. 搜索产品（按 default_code）
2. 如果不存在，创建新产品（不设置价格）
3. 如果存在，直接返回（不更新价格）

#### `createPurchaseDraft()`
创建采购订单和订单行。

**流程**：
1. 查找供应商
2. 创建采购订单
3. 获取产品ID
4. 创建订单行（设置价格）

---

## ❓ 常见问题

### Q1: 为什么界面是中文但提交的数据是英文？
A: 这是系统设计特点。界面使用中文便于操作人员使用，但提交到后端时自动转换为英文，以符合 Odoo 系统的数据规范。

### Q2: 产品 R0010010001 的价格会被更改吗？
A: 不会。系统只会在采购订单行中设置价格，不会修改产品本身的价格。

### Q3: 如果选择了"其他"设备类型，还需要填写哪些字段？
A: 只需填写"设备描述"字段。品牌、型号等其他字段变为可选。

### Q4: 苹果手机的网络类型是必填吗？
A: 不是。苹果手机的网络类型是可选的，但其他品牌的手机必须选择 4G 或 5G。

### Q5: 用户信息全部是必填的吗？
A: 不是。用户信息全部为可选，但如果有条件性字段：
- 选择证件类型 → 需要填写证件号码
- 选择银行类型 → 需要填写完整的银行信息

### Q6: 提交失败怎么办？
A: 检查以下几点：
1. 网络连接是否正常
2. 所有必填字段是否已填写
3. 电池健康度是否在 0-100 之间
4. 查看浏览器控制台的错误信息

### Q7: 如何在 Odoo 中查看创建的订单？
A: 在 Odoo 系统中：
1. 进入采购（Purchases）模块
2. 找到供应商 "Used Phone Recycle"
3. 查看草稿状态的采购订单
4. 订单的 Terms and Conditions 栏包含完整回收信息

### Q8: Vendor Reference 是什么格式？
A: 格式为：`门店名称 + 日期（YYYYMMDD）`
例如：`Moboplus20240315`

### Q9: 可以重复提交吗？
A: 系统有防重复提交机制。提交过程中按钮会被禁用，直到提交完成或失败。

### Q10: 备注信息在哪里查看？
A: 在 Odoo 采购订单的 **Terms and Conditions** 字段中，所有信息以英文格式存储。

---

## 📞 技术支持

如有问题或建议，请联系开发团队。

---

**最后更新**：2024年3月

