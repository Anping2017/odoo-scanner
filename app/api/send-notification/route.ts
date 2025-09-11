import { NextRequest, NextResponse } from 'next/server';

// 强制动态渲染
export const dynamic = 'force-dynamic';

async function rpc(url: string, path: string, body: any, cookie: string) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: body }),
    cache: 'no-store',
  });
  
  const data = await res.json().catch(() => ({}));
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const { message, recipientLogin = 'fu' } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
    }

    // 从cookie获取session信息
    const cookieStr = req.headers.get('cookie') || '';
    const sessionIdMatch = cookieStr.match(/od_session=([^;]+)/);
    
    if (!sessionIdMatch) {
      return NextResponse.json({ error: '未找到有效的会话' }, { status: 401 });
    }

    // 从cookie获取base URL
    const baseUrlMatch = cookieStr.match(/od_base=([^;]+)/);
    const baseUrl = baseUrlMatch ? decodeURIComponent(baseUrlMatch[1]) : '';
    
    if (!baseUrl) {
      return NextResponse.json({ error: '未找到Odoo服务器地址' }, { status: 400 });
    }

    console.log('发送通知请求:', { message, recipientLogin, baseUrl });

    // 首先检查会话是否有效
    const sessionCheckResult = await rpc(baseUrl, '/web/session/get_session_info', {}, cookieStr);
    
    if (sessionCheckResult.error && sessionCheckResult.error.message === 'Odoo Session Expired') {
      console.log('会话已过期，无法发送通知');
      return NextResponse.json({ 
        error: 'Odoo会话已过期，请重新登录后再试' 
      }, { status: 401 });
    }

    // 1. 查找用户Fu
    const userSearchResult = await rpc(baseUrl, '/web/dataset/call_kw', {
      model: 'res.users',
      method: 'search_read',
      args: [[['login', '=', recipientLogin]]],
      kwargs: {
        fields: ['id', 'name', 'login', 'email', 'partner_id'],
        limit: 1
      }
    }, cookieStr);

    console.log('用户查找结果:', userSearchResult);

    if (userSearchResult.error) {
      console.error('查找用户失败:', userSearchResult.error);
      return NextResponse.json({ 
        error: '查找用户失败', 
        details: userSearchResult.error 
      }, { status: 500 });
    }

    const users = userSearchResult.result || [];
    if (users.length === 0) {
      return NextResponse.json({ 
        error: `未找到用户 ${recipientLogin}` 
      }, { status: 404 });
    }

    const targetUser = users[0];
    console.log('找到目标用户:', targetUser);

    // 2. 创建内部消息通知
    const messageData = {
      body: message,
      message_type: 'notification',
      partner_ids: [targetUser.partner_id], // 需要获取用户的partner_id
      subject: '设备盘点完成通知',
      model: 'res.users',
      res_id: targetUser.id,
      subtype_id: 1, // 默认子类型
    };
    
    console.log('准备创建消息:', messageData);
    
    const messageResult = await rpc(baseUrl, '/web/dataset/call_kw', {
      model: 'mail.message',
      method: 'create',
      args: [messageData],
      kwargs: {}
    }, cookieStr);

    if (messageResult.error) {
      console.error('创建消息失败:', messageResult.error);
      
      // 如果partner_id方式失败，尝试使用user_ids方式
      const messageData2 = {
        body: message,
        message_type: 'notification',
        user_ids: [targetUser.id],
        subject: '设备盘点完成通知',
        model: 'res.users',
        res_id: targetUser.id,
        subtype_id: 1,
      };
      
      console.log('尝试备用方法创建消息:', messageData2);
      
      const messageResult2 = await rpc(baseUrl, '/web/dataset/call_kw', {
        model: 'mail.message',
        method: 'create',
        args: [messageData2],
        kwargs: {}
      }, cookieStr);

      if (messageResult2.error) {
        console.error('创建消息失败(备用方法):', messageResult2.error);
        return NextResponse.json({ 
          error: '发送通知失败', 
          details: messageResult2.error 
        }, { status: 500 });
      }

      console.log('通知发送成功(备用方法):', messageResult2.result);
      return NextResponse.json({ 
        success: true, 
        message: '通知发送成功',
        recipient: targetUser.name || targetUser.login
      });
    }

    console.log('通知发送成功:', messageResult.result);
    return NextResponse.json({ 
      success: true, 
      message: '通知发送成功',
      recipient: targetUser.name || targetUser.login
    });

  } catch (error: any) {
    console.error('发送通知错误:', error);
    return NextResponse.json({ 
      error: '发送通知失败', 
      details: error.message 
    }, { status: 500 });
  }
}
