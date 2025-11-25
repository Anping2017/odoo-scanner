# Odoo 库存扫描系统 - 开发指南

## 📖 简介

本文档面向**有 Odoo 基础但不懂 Next.js** 的开发者，帮助您快速理解这个项目是如何一步步构建的。

---

## 🎯 项目概述

这是一个基于 **Next.js 14** 开发的移动端库存盘点系统，通过扫码或手动输入的方式，与 Odoo 17 后端进行数据交互。

### 核心功能
- 🔐 用户登录（连接 Odoo）
- 📷 扫码识别产品
- 📦 库存盘点（设备、零件、配件）
- 📥 收货入库
- 📊 盘点历史查询

---

## 🏗️ Next.js 基础概念（对比 Odoo）

### 1. 文件路由系统

**Odoo 中的路由：**
```
Odoo 使用 XML 定义路由：
<record id="action_inventory" model="ir.actions.act_window">
    <field name="name">库存盘点</field>
    <field name="res_model">stock.inventory</field>
</record>
```

**Next.js 中的路由：**
```
Next.js 使用文件夹结构自动生成路由：

app/
  ├── page.tsx          → http://localhost:3000/          (登录页)
  ├── scan/
  │   └── page.tsx      → http://localhost:3000/scan      (扫码页)
  ├── parts-inventory/
  │   └── page.tsx      → http://localhost:3000/parts-inventory  (零件盘点页)
  └── receiving/
      └── page.tsx      → http://localhost:3000/receiving  (收货页)
```

**关键点：**
- `page.tsx` = 页面组件（类似 Odoo 的视图）
- 文件夹名 = URL 路径
- 不需要手动配置路由，Next.js 自动处理

---

### 2. API 路由（类似 Odoo 的 Controller）

**Odoo 中的 Controller：**
```python
@http.route('/api/product', type='json', auth='user')
def get_product(self, code):
    product = request.env['product.product'].search([('barcode', '=', code)])
    return {'id': product.id, 'name': product.name}
```

**Next.js 中的 API 路由：**
```
app/
  └── api/
      ├── login/
      │   └── route.ts      → POST /api/login
      ├── product/
      │   └── route.ts      → GET /api/product?code=xxx
      └── inventory/
          └── route.ts      → POST /api/inventory
```

**示例：`app/api/product/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rpc, getSessionId, getBaseFromCookie } from '../_odoo';

export async function GET(req: NextRequest) {
  // 1. 从 URL 获取参数（类似 request.params）
  const code = req.nextUrl.searchParams.get('code');
  
  // 2. 获取 Odoo 会话信息（从 Cookie）
  const sessionId = getSessionId(req);
  const base = getBaseFromCookie(req);
  
  // 3. 调用 Odoo RPC（类似 request.env['product.product'].search_read）
  const result = await rpc('/web/dataset/call_kw', {
    model: 'product.product',
    method: 'search_read',
    args: [[['barcode', '=', code]]],
    kwargs: {}
  }, sessionId, base);
  
  // 4. 返回 JSON（类似 return json.dumps(...)）
  return NextResponse.json(result);
}
```

**关键点：**
- `route.ts` = API 端点
- `GET` / `POST` 函数 = HTTP 方法
- 不需要 `@http.route` 装饰器，文件名就是路由

---

### 3. 客户端组件 vs 服务端组件

**Odoo 中的模板：**
```xml
<!-- Odoo 模板在服务端渲染 -->
<template id="inventory_view">
    <t t-foreach="products" t-as="product">
        <div><t t-esc="product.name"/></div>
    </t>
</template>
```

**Next.js 中的组件：**

**服务端组件（默认）：**
```typescript
// app/page.tsx（没有 'use client'）
export default function LoginPage() {
  // 这里可以访问数据库、文件系统等
  // 但不能使用 useState、onClick 等浏览器 API
  return <div>登录页面</div>;
}
```

**客户端组件（需要交互）：**
```typescript
// app/scan/page.tsx
'use client';  // ← 必须加这个标记

import { useState } from 'react';

export default function ScanPage() {
  const [product, setProduct] = useState(null);  // ← 状态管理
  
  const handleScan = async () => {
    // 调用 API
    const res = await fetch('/api/product?code=123');
    const data = await res.json();
    setProduct(data);
  };
  
  return (
    <div>
      <button onClick={handleScan}>扫码</button>
      {product && <div>{product.name}</div>}
    </div>
  );
}
```

**关键点：**
- `'use client'` = 客户端组件（类似 Odoo 的 JavaScript 前端）
- 没有 `'use client'` = 服务端组件（类似 Odoo 的 QWeb 模板）
- 需要 `useState`、`onClick`、`useEffect` 等 → 必须用客户端组件

---

## 📁 项目结构详解

```
odoo-scanner/
├── app/                          # Next.js 应用目录
│   ├── page.tsx                  # 登录页（首页）
│   ├── layout.tsx                 # 全局布局（类似 Odoo 的 base 模板）
│   ├── globals.css               # 全局样式
│   │
│   ├── scan/                     # 扫码页面
│   │   └── page.tsx
│   │
│   ├── parts-inventory/          # 零件盘点页面
│   │   └── page.tsx
│   │
│   ├── device-inventory/         # 设备盘点页面
│   │   └── page.tsx
│   │
│   └── api/                      # API 路由（后端接口）
│       ├── _odoo.ts              # Odoo 连接工具（核心！）
│       ├── login/
│       │   └── route.ts          # POST /api/login
│       ├── product/
│       │   └── route.ts          # GET /api/product?code=xxx
│       ├── inventory/
│       │   └── route.ts          # POST /api/inventory
│       └── parts-inventory/
│           └── route.ts          # GET /api/parts-inventory
│
├── components/                    # 可复用组件
│   ├── Scanner.tsx               # 扫码组件
│   ├── DomainPicker.tsx          # 域名选择器
│   └── CompanyPicker.tsx         # 公司选择器
│
├── lib/                          # 工具函数
│   └── odooPresets.ts            # Odoo 预设配置
│
└── package.json                  # 依赖配置（类似 requirements.txt）
```

---

## 🔌 如何与 Odoo 交互

### 核心文件：`app/api/_odoo.ts`

这个文件封装了所有与 Odoo 的通信逻辑，类似于 Odoo 的 RPC 客户端。

**主要函数：**

1. **`rpc(path, payload, sessionId, baseUrl)`**
   - 作用：调用 Odoo 的 RPC 接口
   - 类似：Odoo 中的 `request.env['model.name'].method()`

```typescript
// 示例：查询产品
const result = await rpc('/web/dataset/call_kw', {
  model: 'product.product',
  method: 'search_read',
  args: [[['barcode', '=', '123456']]],
  kwargs: { limit: 1 }
}, sessionId, baseUrl);

// 等价于 Odoo Python：
// products = request.env['product.product'].search_read(
//     [('barcode', '=', '123456')],
//     limit=1
// )
```

2. **`getSessionId(req)`**
   - 作用：从 Cookie 获取 Odoo 会话 ID
   - 类似：Odoo 中的 `request.session.uid`

3. **`getBaseFromCookie(req)`**
   - 作用：从 Cookie 获取 Odoo 服务器地址
   - 类似：Odoo 中的 `request.httprequest.host`

---

## 🚀 开发流程示例

### 场景：添加一个新功能"查询销售历史"

#### 步骤 1：创建 API 路由

**文件：`app/api/sales-history/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rpc, getSessionId, getBaseFromCookie } from '../_odoo';

export async function GET(req: NextRequest) {
  try {
    // 1. 获取参数
    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) {
      return NextResponse.json({ error: '缺少 product_id' }, { status: 400 });
    }
    
    // 2. 获取会话信息
    const sessionId = getSessionId(req);
    const base = getBaseFromCookie(req);
    
    if (!sessionId || !base) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    // 3. 调用 Odoo RPC（查询销售订单行）
    const result = await rpc('/web/dataset/call_kw', {
      model: 'sale.order.line',
      method: 'search_read',
      args: [
        [['product_id', '=', parseInt(productId)]],
        ['id', 'order_id', 'product_uom_qty', 'price_unit', 'create_date']
      ],
      kwargs: {
        limit: 10,
        order: 'create_date desc'
      }
    }, sessionId, base);
    
    // 4. 返回结果
    return NextResponse.json({ sales: result });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '查询失败' },
      { status: 500 }
    );
  }
}
```

**对比 Odoo Controller：**
```python
@http.route('/api/sales-history', type='json', auth='user')
def get_sales_history(self, product_id):
    lines = request.env['sale.order.line'].search_read(
        [('product_id', '=', int(product_id))],
        ['id', 'order_id', 'product_uom_qty', 'price_unit', 'create_date'],
        limit=10,
        order='create_date desc'
    )
    return {'sales': lines}
```

---

#### 步骤 2：创建前端页面

**文件：`app/sales-history/page.tsx`**

```typescript
'use client';  // ← 必须加，因为需要 useState 和 onClick

import { useState } from 'react';

export default function SalesHistoryPage() {
  const [productId, setProductId] = useState('');
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuery = async () => {
    if (!productId) {
      setError('请输入产品ID');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // 调用我们刚创建的 API
      const res = await fetch(`/api/sales-history?product_id=${productId}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '查询失败');
      }
      
      setSales(data.sales || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>销售历史查询</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder="输入产品ID"
          style={{ padding: '8px', marginRight: '10px' }}
        />
        <button 
          onClick={handleQuery}
          disabled={loading}
        >
          {loading ? '查询中...' : '查询'}
        </button>
      </div>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      <div>
        <h2>销售记录</h2>
        {sales.length === 0 ? (
          <div>暂无数据</div>
        ) : (
          <ul>
            {sales.map((sale: any) => (
              <li key={sale.id}>
                订单: {sale.order_id[1]} | 
                数量: {sale.product_uom_qty} | 
                单价: {sale.price_unit} | 
                日期: {sale.create_date}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**访问地址：** `http://localhost:3000/sales-history`

---

## 🔑 关键概念对比表

| Odoo 概念 | Next.js 概念 | 说明 |
|----------|-------------|------|
| `ir.actions.act_window` | `app/xxx/page.tsx` | 页面视图 |
| `@http.route` | `app/api/xxx/route.ts` | API 接口 |
| `request.env['model']` | `rpc('/web/dataset/call_kw', {...})` | 调用 Odoo 模型 |
| `request.session.uid` | `getSessionId(req)` | 获取会话 |
| QWeb 模板 | 服务端组件（无 `'use client'`） | 服务端渲染 |
| JavaScript 前端 | 客户端组件（`'use client'`） | 浏览器交互 |
| `t-esc`, `t-foreach` | JSX 语法 `{variable}`, `map()` | 模板语法 |
| `fields_get()` | `rpc(..., method: 'fields_get')` | 获取字段定义 |

---

## 🛠️ 常用开发模式

### 模式 1：从 Odoo 读取数据并显示

```typescript
// 1. 创建 API 路由：app/api/my-data/route.ts
export async function GET(req: NextRequest) {
  const sessionId = getSessionId(req);
  const base = getBaseFromCookie(req);
  
  const result = await rpc('/web/dataset/call_kw', {
    model: 'your.model',
    method: 'search_read',
    args: [[/* domain */], [/* fields */]],
    kwargs: {}
  }, sessionId, base);
  
  return NextResponse.json(result);
}

// 2. 在页面中调用：app/my-page/page.tsx
'use client';
const [data, setData] = useState([]);

useEffect(() => {
  fetch('/api/my-data')
    .then(res => res.json())
    .then(setData);
}, []);
```

### 模式 2：向 Odoo 写入数据

```typescript
// API 路由：app/api/create-record/route.ts
export async function POST(req: NextRequest) {
  const { name, value } = await req.json();
  const sessionId = getSessionId(req);
  const base = getBaseFromCookie(req);
  
  const result = await rpc('/web/dataset/call_kw', {
    model: 'your.model',
    method: 'create',
    args: [{ name, value }],
    kwargs: {}
  }, sessionId, base);
  
  return NextResponse.json({ id: result });
}

// 页面中调用
const handleSubmit = async () => {
  await fetch('/api/create-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', value: 123 })
  });
};
```

### 模式 3：更新 Odoo 记录

```typescript
// API 路由
const result = await rpc('/web/dataset/call_kw', {
  model: 'your.model',
  method: 'write',
  args: [[recordId], { field: newValue }],
  kwargs: {}
}, sessionId, base);
```

### 模式 4：删除 Odoo 记录

```typescript
// API 路由
const result = await rpc('/web/dataset/call_kw', {
  model: 'your.model',
  method: 'unlink',
  args: [[recordId]],
  kwargs: {}
}, sessionId, base);
```

---

## 📝 实际项目中的关键文件

### 1. 登录流程

**`app/page.tsx`（登录页）**
```typescript
// 用户输入账号密码 → 调用 /api/login → 设置 Cookie → 跳转到 /scan
```

**`app/api/login/route.ts`**
```typescript
// 1. 调用 Odoo /web/session/authenticate
// 2. 获取 session_id
// 3. 保存到 Cookie（od_session, od_base, od_db）
```

### 2. 产品查询流程

**`app/scan/page.tsx`**
```typescript
// 用户扫码 → 调用 /api/product?code=xxx → 显示产品信息
```

**`app/api/product/route.ts`**
```typescript
// 1. 从 Cookie 获取 session_id 和 base
// 2. 调用 rpc('/web/dataset/call_kw', {
//      model: 'product.product',
//      method: 'search_read',
//      args: [[['barcode', '=', code]]]
//    })
// 3. 返回产品数据
```

### 3. 库存盘点流程

**`app/parts-inventory/page.tsx`**
```typescript
// 1. 加载产品列表（调用 /api/parts-inventory）
// 2. 用户选择产品并输入数量
// 3. 调用 /api/inventory 更新库存
```

**`app/api/inventory/route.ts`**
```typescript
// 1. 调用 rpc 创建或更新 stock.quant
// 2. 调用 action_apply_inventory 应用盘点
```

---

## 🎨 UI 开发提示

### 样式方式

Next.js 支持多种样式方式，本项目主要使用**内联样式**：

```typescript
<div style={{
  padding: '20px',
  backgroundColor: '#fff',
  borderRadius: '8px',
  fontSize: '16px'
}}>
  内容
</div>
```

### 响应式设计（手机适配）

```typescript
<div style={{
  padding: '20px',
  // 使用媒体查询（在 <style> 标签中）
}}>
  <style>{`
    @media (max-width: 768px) {
      .my-div {
        padding: 10px !important;
        font-size: 14px !important;
      }
    }
  `}</style>
</div>
```

---

## 🔍 调试技巧

### 1. 查看 API 响应

在 API 路由中添加日志：
```typescript
console.log('请求参数:', req.nextUrl.searchParams);
console.log('Odoo 响应:', result);
```

### 2. 查看前端状态

在客户端组件中：
```typescript
console.log('当前状态:', { product, loading, error });
```

### 3. 检查 Cookie

在浏览器开发者工具 → Application → Cookies 中查看：
- `od_session` - Odoo 会话 ID
- `od_base` - Odoo 服务器地址
- `od_db` - 数据库名

---

## 🚨 常见问题

### Q1: 为什么 API 返回 401（未登录）？

**A:** 检查 Cookie 是否设置正确：
- 确保 `/api/login` 成功设置了 Cookie
- 确保 API 请求包含了 `credentials: 'include'`（前端）或正确读取了 Cookie（后端）

### Q2: 为什么 `rpc` 调用失败？

**A:** 检查：
1. `sessionId` 是否有效（可能已过期）
2. `base` URL 是否正确
3. Odoo 模型名和方法名是否正确
4. 参数格式是否符合 Odoo RPC 规范

### Q3: 为什么页面显示空白？

**A:** 检查：
1. 浏览器控制台是否有错误
2. 组件是否添加了 `'use client'`（如果使用了 `useState` 等）
3. API 是否返回了正确的数据格式

---

## 📚 学习资源

### Next.js 官方文档
- [Next.js 14 文档](https://nextjs.org/docs)
- [App Router 指南](https://nextjs.org/docs/app)
- [API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

### React 基础（如果不懂 React）
- [React 官方教程](https://react.dev/learn)
- `useState` - 状态管理
- `useEffect` - 副作用处理
- `useCallback` - 函数缓存

### Odoo RPC 参考
- [Odoo Web API 文档](https://www.odoo.com/documentation/17.0/developer/reference/backend/orm.html)
- `/web/dataset/call_kw` 是核心 RPC 端点

---

## 🎯 总结

1. **文件结构 = 路由**：`app/xxx/page.tsx` 自动成为 `/xxx` 页面
2. **API 路由**：`app/api/xxx/route.ts` 自动成为 `/api/xxx` 接口
3. **Odoo 交互**：使用 `rpc()` 函数调用 Odoo RPC，类似 Python 中的 `request.env['model']`
4. **客户端组件**：需要交互的页面必须加 `'use client'`
5. **状态管理**：使用 `useState` 管理组件状态
6. **数据获取**：前端 `fetch()` 调用 API，API 使用 `rpc()` 调用 Odoo

**核心思路：**
```
用户操作 → 前端组件（React） → API 路由（Next.js） → Odoo RPC → 返回数据 → 更新 UI
```

---

## 💡 下一步

1. 阅读现有代码，理解项目结构
2. 尝试修改一个简单的页面（如修改按钮文字）
3. 创建一个新的 API 路由，查询 Odoo 数据
4. 创建一个新页面，调用这个 API 并显示数据

**祝您开发顺利！** 🚀











