'use client';

import { useState } from 'react';

export default function UserGuidePage() {
  const [showMenu, setShowMenu] = useState(false);

  const sections = [
    { id: 'login', title: '登录系统', icon: '🔐' },
    { id: 'scan', title: '库存扫码', icon: '📷' },
    { id: 'parts-inventory', title: '库存盘点', icon: '📦' },
    { id: 'device-inventory', title: '设备盘点', icon: '📱' },
    { id: 'history', title: '盘点历史', icon: '📊' },
    { id: 'receiving', title: '收货入库', icon: '📥' },
    { id: 'faq', title: '常见问题', icon: '❓' },
  ];

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowMenu(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .guide-content h1 {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          margin-top: 32px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 2px solid #e5e7eb;
        }
        .guide-content h2 {
          font-size: 22px;
          font-weight: 600;
          color: #374151;
          margin-top: 24px;
          margin-bottom: 12px;
        }
        .guide-content h3 {
          font-size: 18px;
          font-weight: 600;
          color: #4b5563;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        .guide-content p {
          font-size: 15px;
          line-height: 1.7;
          color: #374151;
          margin-bottom: 12px;
        }
        .guide-content ul, .guide-content ol {
          margin-left: 24px;
          margin-bottom: 16px;
        }
        .guide-content li {
          font-size: 15px;
          line-height: 1.7;
          color: #374151;
          margin-bottom: 8px;
        }
        .guide-content code {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          color: #dc2626;
        }
        .guide-content blockquote {
          border-left: 4px solid #667eea;
          padding-left: 16px;
          margin-left: 0;
          color: #6b7280;
          font-style: italic;
        }
        @media (max-width: 768px) {
          .guide-content h1 {
            font-size: 24px;
          }
          .guide-content h2 {
            font-size: 20px;
          }
          .guide-content h3 {
            font-size: 16px;
          }
        }
      `}} />
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
      }}>
        {/* 顶部栏 */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #e5e7eb',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '1200px',
            margin: '0 auto',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <button
                onClick={() => window.location.href = '/scan'}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.color = '#667eea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#374151';
                }}
              >
                ← 返回
              </button>
              <h1 style={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#111827',
                margin: 0,
              }}>
                使用说明
              </h1>
            </div>
            
            {/* 目录按钮（移动端） */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                fontSize: 14,
                cursor: 'pointer',
                display: 'none',
              }}
              className="mobile-menu-btn"
            >
              📑 目录
            </button>
          </div>
        </div>

        <div style={{
          display: 'flex',
          flex: 1,
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          padding: '0 16px',
        }}>
          {/* 侧边栏目录（桌面端） */}
          <div style={{
            width: '240px',
            flexShrink: 0,
            padding: '24px 0',
            position: 'sticky',
            top: '80px',
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
            display: 'none',
          }}
          className="desktop-sidebar"
          >
            <div style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #e5e7eb',
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '12px',
              }}>
                目录
              </div>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.color = '#667eea';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#374151';
                  }}
                >
                  <span>{section.icon}</span>
                  <span>{section.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 移动端目录菜单 */}
          {showMenu && (
            <div style={{
              position: 'fixed',
              top: '70px',
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 100,
              display: 'none',
            }}
            className="mobile-menu-overlay"
            onClick={() => setShowMenu(false)}
            >
              <div style={{
                background: '#fff',
                width: '280px',
                height: '100%',
                padding: '20px',
                overflowY: 'auto',
                boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
              >
                <div style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#111827',
                  marginBottom: '16px',
                }}>
                  目录
                </div>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      color: '#374151',
                      fontSize: '15px',
                      cursor: 'pointer',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span>{section.icon}</span>
                    <span>{section.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 内容区域 */}
          <div style={{
            flex: 1,
            padding: '24px 0',
            maxWidth: '800px',
            margin: '0 auto',
          }}>
            <div
              className="guide-content"
              style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '40px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                lineHeight: 1.7,
              }}
              dangerouslySetInnerHTML={{
                __html: `
<h1 id="login">🔐 登录系统</h1>

<h2>登录步骤</h2>

<h3>1. 选择域名</h3>
<p>从下拉菜单中选择对应的域名（如：moboplus.co.nz），系统会自动配置相应的数据库。</p>

<h3>2. 输入账号和密码</h3>
<ul>
  <li><strong>账号</strong>：输入您的邮箱或用户名</li>
  <li><strong>密码</strong>：输入您的登录密码</li>
  <li>点击密码框右侧的眼睛图标可以显示/隐藏密码</li>
</ul>

<h3>3. 选择公司（仅限 moboplus 域名）</h3>
<p>如果选择的是 moboplus 域名，需要选择公司：</p>
<ul>
  <li>1: Brownsbay</li>
  <li>2: Birkenhead</li>
  <li>3: Avondale</li>
  <li>4: Moboplus</li>
</ul>

<h3>4. 保持登录</h3>
<p>勾选"保持登录 30 天"可以免密登录30天，建议在个人设备上使用此功能。</p>

<h3>5. 点击登录按钮</h3>
<p>登录成功后会自动跳转到库存扫码页面。</p>

<h2>注意事项</h2>
<ul>
  <li>确保网络连接正常</li>
  <li>如果登录失败，请检查账号密码是否正确</li>
  <li>忘记密码请联系系统管理员</li>
</ul>

<h1 id="scan">📷 库存扫码</h1>

<h2>功能说明</h2>
<p>库存扫码功能用于快速查询产品信息、查看库存数量、更新库存，以及查看销售记录和库存变动历史。</p>

<h2>使用方法</h2>

<h3>1. 扫码查询</h3>
<ol>
  <li><strong>启动摄像头</strong>：页面加载后摄像头会自动启动，将产品条码对准摄像头，系统会自动识别并查询产品信息</li>
  <li><strong>查看产品信息</strong>：扫码成功后，页面会显示产品名称、条码和编码、现有库存数量、可用库存数量、门店零售价和成本价、总部零售价和库存状态（如有）</li>
  <li><strong>查看产品图片</strong>：如果产品有图片，会显示在信息卡片下方，点击图片可以查看大图</li>
</ol>

<h3>2. 手动输入条码</h3>
<ol>
  <li>在底部输入框输入条码（支持手动输入或粘贴条码，系统会自动将首字母大写）</li>
  <li>点击"查询"按钮或按 Enter 键提交查询</li>
  <li>查看结果，查询结果会显示在摄像头下方</li>
</ol>

<h3>3. 更新库存数量</h3>
<ol>
  <li>扫码或查询产品后，在"盘点数量（调整为）"输入框中输入新的库存数量，可以使用 +/- 按钮快速调整数量</li>
  <li>点击"更新库存"按钮，系统会更新 Odoo 中的库存数量，更新后会显示成功提示</li>
  <li>查看更新历史，页面下方会显示最近的库存变动记录，包括数量、库位、日期、操作员等信息</li>
</ol>

<h3>4. 查看销售记录</h3>
<ol>
  <li>扫码产品后，页面会显示"销售记录"卡片</li>
  <li>选择时间范围：最近30天、最近90天、最近365天、所有记录</li>
  <li>查看销售详情：订单名称和类型（POS/销售订单/发票）、客户名称、销售日期、数量和单价、总金额</li>
</ol>

<h3>5. 其他功能</h3>
<ul>
  <li><strong>重新扫码</strong>：清空当前查询结果，重新开始扫码</li>
  <li><strong>清空</strong>：清空底部输入框的内容</li>
  <li><strong>退出</strong>：退出登录，返回登录页面</li>
</ul>

<h2>注意事项</h2>
<ul>
  <li>确保摄像头权限已授予</li>
  <li>扫码时保持条码清晰可见</li>
  <li>更新库存前请确认数量正确</li>
  <li>库存更新会记录在 Odoo 系统中</li>
</ul>

<h1 id="parts-inventory">📦 库存盘点</h1>

<h2>功能说明</h2>
<p>库存盘点功能用于对零配件（零件或配件）进行盘点，支持扫码和手动选择两种方式，可以记录多个操作员的盘点记录。</p>

<h2>使用流程</h2>

<h3>步骤1：选择盘点类型</h3>
<ol>
  <li>进入库存盘点页面（从库存扫码页面点击"库存盘点"按钮）</li>
  <li>选择类别：
    <ul>
      <li><strong>零件（Parts）</strong>：选择此选项盘点零件</li>
      <li><strong>配件（Accessories）</strong>：选择此选项盘点配件</li>
      <li><strong>设备（Devices）</strong>：选择此选项会跳转到设备盘点页面</li>
    </ul>
  </li>
  <li>点击"开始盘点"按钮</li>
</ol>

<h3>步骤2：输入操作员信息</h3>
<ol>
  <li>输入操作员姓名，系统会显示历史操作员姓名建议，可以使用键盘上下键选择建议，按 Enter 键确认选择</li>
  <li>点击"确认开始"按钮，系统会启动摄像头（如果可用），开始记录盘点时间</li>
</ol>

<h3>步骤3：进行盘点</h3>

<h4>方式A：扫码盘点 📷</h4>
<ol>
  <li>将零配件条码对准摄像头</li>
  <li>系统自动识别并添加到已盘点列表</li>
  <li>如果启用了"校验库存数量"，会弹出数量输入框</li>
</ol>

<h4>方式B：手动盘点 👆</h4>
<ol>
  <li><strong>使用搜索功能</strong>：在搜索框输入产品名称、编码或条码，从搜索结果中选择产品</li>
  <li><strong>使用快捷搜索选项</strong>：
    <ul>
      <li>点击"快捷搜索选项"展开/收起快捷按钮</li>
      <li>根据类别选择相应的快捷按钮：
        <ul>
          <li><strong>零件类别</strong>：
            <ul>
              <li>设备类型：iPhone, iPad, Macbook, Samsung</li>
              <li>部件类型：Battery, Screen, Charging Port, Back Cover/Glass</li>
            </ul>
          </li>
          <li><strong>配件类别</strong>：
            <ul>
              <li>设备类型：iPhone, iPad, Macbook, Samsung, Oppo, Huawei</li>
              <li>配件类型：Case, Screen Protector</li>
              <li>品牌/材质：Kemeng, OG, DUX DUCIS, Transparent, Silicone</li>
            </ul>
          </li>
        </ul>
      </li>
      <li>可以同时选择多个快捷按钮进行组合搜索</li>
    </ul>
  </li>
  <li><strong>浏览列表选择</strong>：直接浏览未盘点产品列表，点击产品卡片进行盘点</li>
</ol>

<h4>方式C：校验库存数量（可选）</h4>
<ol>
  <li>启用校验库存数量：在盘点模式下，勾选"校验库存数量"选项，每次盘点产品时会弹出数量输入框</li>
  <li>输入实际数量：系统会显示当前库存数量作为默认值，可以修改为实际盘点数量，点击"确认"完成盘点</li>
</ol>

<h3>步骤4：查看盘点进度</h3>
<ul>
  <li><strong>总零配件</strong>：需要盘点的总数量</li>
  <li><strong>剩余</strong>：还未盘点的数量</li>
  <li><strong>已选</strong>：已盘点的数量</li>
  <li><strong>扫码/手动</strong>：扫码和手动盘点的数量统计</li>
  <li><strong>进度</strong>：盘点完成百分比</li>
</ul>

<h3>步骤5：完成盘点</h3>
<ol>
  <li><strong>自动完成</strong>：当所有产品都盘点完成后，系统会自动结束盘点，显示完成提示并保存盘点记录</li>
  <li><strong>手动结束</strong>：点击"结束盘点"按钮，如果未完成所有盘点，会弹出确认对话框，确认后保存盘点记录</li>
</ol>

<h2>继续盘点功能</h2>
<p>如果盘点过程中需要暂停，可以：</p>
<ol>
  <li>点击"返回"按钮，系统会自动保存当前盘点进度，包括已盘点的产品、操作员信息、统计信息等</li>
  <li>继续盘点：下次进入盘点页面时，点击"继续盘点"按钮，输入操作员姓名（可以是新操作员），系统会显示上次盘点的进度（已完成数量、剩余数量、总数量），确认后可以继续盘点</li>
</ol>

<h2>多操作员支持</h2>
<ul>
  <li>系统会记录所有参与盘点的操作员</li>
  <li>每个操作员的盘点数量和时间都会记录</li>
  <li>在盘点历史中可以查看每个操作员的详细记录</li>
</ul>

<h2>注意事项</h2>
<ul>
  <li>盘点过程中可以随时返回，进度会自动保存</li>
  <li>支持多个操作员轮流盘点</li>
  <li>已盘点的产品会从列表中移除</li>
  <li>可以使用"撤销"功能撤销最近的操作</li>
</ul>

<h1 id="device-inventory">📱 设备盘点</h1>

<h2>功能说明</h2>
<p>设备盘点功能用于对设备进行盘点，支持扫码和手动选择两种方式，可以记录多个操作员的盘点记录。</p>

<h2>使用流程</h2>

<h3>步骤1：开始盘点</h3>
<ol>
  <li>进入设备盘点页面（从库存扫码页面点击"库存盘点"按钮，然后选择"设备"）</li>
  <li>点击"开始盘点"按钮</li>
  <li>输入操作员信息：输入操作员姓名，系统会显示历史操作员姓名建议，点击"确认开始"按钮</li>
</ol>

<h3>步骤2：进行盘点</h3>

<h4>方式A：扫码盘点 📷</h4>
<ol>
  <li>将设备条码/序列号对准摄像头</li>
  <li>系统自动识别并添加到已盘点列表</li>
  <li>显示扫码结果提示框</li>
</ol>

<h4>方式B：手动盘点 👆</h4>
<ol>
  <li><strong>使用搜索功能</strong>：在搜索框输入产品名称、编码或 Lot/Serial 号，从搜索结果中选择设备</li>
  <li><strong>使用快捷搜索选项</strong>：点击"快捷搜索选项"展开/收起快捷按钮，选择设备类型：iPhone, iPad, Samsung，可以点击按钮切换搜索条件</li>
  <li><strong>浏览列表选择</strong>：直接浏览未盘点设备列表，点击设备卡片进行盘点</li>
</ol>

<h3>步骤3：查看盘点进度</h3>
<ul>
  <li><strong>总设备</strong>：需要盘点的总数量</li>
  <li><strong>剩余</strong>：还未盘点的数量</li>
  <li><strong>已选</strong>：已盘点的数量</li>
  <li><strong>扫码/手动</strong>：扫码和手动盘点的数量统计</li>
  <li><strong>进度</strong>：盘点完成百分比</li>
</ul>

<h3>步骤4：完成盘点</h3>
<ol>
  <li><strong>自动完成</strong>：当所有设备都盘点完成后，系统会自动结束盘点</li>
  <li><strong>手动结束</strong>：点击"结束盘点"按钮，确认后保存盘点记录</li>
</ol>

<h2>继续盘点功能</h2>
<p>与零配件盘点类似，支持暂停和继续盘点功能。</p>

<h2>注意事项</h2>
<ul>
  <li>已盘点的设备会从列表中移除</li>
  <li>支持多个操作员轮流盘点</li>
  <li>可以使用"撤销"功能撤销最近的操作</li>
</ul>

<h1 id="history">📊 盘点历史</h1>

<h2>功能说明</h2>
<p>盘点历史页面显示所有盘点记录，包括设备盘点、零件盘点和配件盘点的历史记录。</p>

<h2>使用方法</h2>

<h3>1. 查看盘点记录</h3>
<ol>
  <li>进入盘点历史页面（从任何页面点击"盘点历史"按钮）</li>
  <li>查看记录列表：每条记录显示盘点日期和时间、门店名称、盘点类型（设备/零件/配件）、总数量、操作员详情（姓名、日期、数量）</li>
  <li>筛选记录：使用搜索框搜索门店名称，使用类型筛选器筛选盘点类型</li>
</ol>

<h3>2. 查看统计信息</h3>
<p>页面顶部显示统计信息：</p>
<ul>
  <li><strong>最后盘点统计（按门店）</strong>：显示每家门店最后一次各种类型盘点的时间和数量，包括：设备盘点、零件盘点、配件盘点</li>
</ul>

<h3>3. 删除记录</h3>

<h4>单个删除：</h4>
<ol>
  <li>点击记录右侧的"删除"按钮</li>
  <li>输入删除密码</li>
  <li>确认删除</li>
</ol>

<h4>批量删除：</h4>
<ol>
  <li>勾选要删除的记录（或点击"全选"）</li>
  <li>点击"批量删除"按钮</li>
  <li>输入删除密码</li>
  <li>确认删除</li>
</ol>

<h2>注意事项</h2>
<ul>
  <li>删除操作需要密码验证</li>
  <li>删除后无法恢复，请谨慎操作</li>
  <li>批量删除可以一次删除多条记录</li>
</ul>

<h1 id="receiving">📥 收货入库</h1>

<h2>功能说明</h2>
<p>收货入库功能用于处理采购订单的收货和入库操作。</p>

<h2>使用方法</h2>
<ol>
  <li>进入收货入库页面（从库存扫码页面点击"收货入库"按钮）</li>
  <li>查看待收货订单：页面显示待收货的采购订单列表，显示订单编号、供应商、日期等信息</li>
  <li>选择订单：点击订单进入详情页面，查看订单明细，进行收货和入库操作</li>
  <li>库存盘点：点击"库存盘点"按钮可以跳转到库存盘点页面</li>
</ol>

<h2>注意事项</h2>
<ul>
  <li>收货入库操作会更新库存数量</li>
  <li>请确认收货数量正确后再确认</li>
</ul>

<h1 id="faq">❓ 常见问题</h1>

<h3>Q1: 扫码无法识别怎么办？</h3>
<p><strong>A:</strong> 确保摄像头权限已授予，检查条码是否清晰可见，调整光线和距离，可以尝试手动输入条码。</p>

<h3>Q2: 盘点过程中可以暂停吗？</h3>
<p><strong>A:</strong> 可以，点击"返回"按钮会自动保存进度，下次可以点击"继续盘点"继续之前的盘点。</p>

<h3>Q3: 如何查看盘点记录？</h3>
<p><strong>A:</strong> 点击"盘点历史"按钮，可以查看所有历史盘点记录，支持按类型和门店筛选。</p>

<h3>Q4: 多个操作员可以一起盘点吗？</h3>
<p><strong>A:</strong> 可以，系统支持多操作员盘点，每个操作员的盘点数量和时间都会记录，可以在盘点历史中查看每个操作员的详细记录。</p>

<h3>Q5: 如何更新库存数量？</h3>
<p><strong>A:</strong> 在库存扫码页面扫码产品，在"盘点数量（调整为）"输入框中输入新数量，点击"更新库存"按钮。</p>

<h3>Q6: 忘记登录密码怎么办？</h3>
<p><strong>A:</strong> 请联系系统管理员重置密码。</p>

<h3>Q7: 盘点记录可以删除吗？</h3>
<p><strong>A:</strong> 可以，在盘点历史页面可以删除记录，需要输入删除密码，支持单个删除和批量删除。</p>

<h3>Q8: 如何查看产品的销售记录？</h3>
<p><strong>A:</strong> 在库存扫码页面扫码产品，页面会显示"销售记录"卡片，可以选择不同的时间范围查看。</p>

<h3>Q9: 快捷搜索选项太多，界面太乱怎么办？</h3>
<p><strong>A:</strong> 可以点击"快捷搜索选项"按钮收起快捷搜索选项，需要时再展开使用。</p>

<h3>Q10: 盘点完成后会自动保存吗？</h3>
<p><strong>A:</strong> 是的，盘点完成后会自动保存到盘点历史，包括所有操作员的记录和盘点详情。</p>

<h2>📞 技术支持</h2>
<p>如有问题或需要帮助，请联系系统管理员。</p>

<p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
  <strong>最后更新：</strong> 2024年
</p>
                `
              }}
            />
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 769px) {
          .desktop-sidebar {
            display: block !important;
          }
          .mobile-menu-btn,
          .mobile-menu-overlay {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-menu-btn,
          .mobile-menu-overlay {
            display: block !important;
          }
          .guide-content {
            padding: 24px 20px !important;
          }
        }
      `}} />
    </>
  );
}

