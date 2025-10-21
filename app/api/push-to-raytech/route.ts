import { NextRequest, NextResponse } from 'next/server';

// Raytech Odoo 配置
const RAYTECH_CONFIG = {
  baseUrl: 'https://repair.raytech.co.nz',
  database: 'db-raytech-repair',
  username: 'fu',
  password: '123'
};

// 全局session存储
let globalSession: { session_id: string; uid: number } | null = null;

// 连接到Raytech Odoo (使用XML-RPC方式)
async function connectToRaytech() {
  try {
    console.log('🔐 开始连接Raytech Odoo (XML-RPC方式)...');
    
    // 使用XML-RPC认证方式 - 发送真正的XML
    const authXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${RAYTECH_CONFIG.database}</string></value></param>
    <param><value><string>${RAYTECH_CONFIG.username}</string></value></param>
    <param><value><string>${RAYTECH_CONFIG.password}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

    const authResponse = await fetch(`${RAYTECH_CONFIG.baseUrl}/xmlrpc/2/common`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: authXml,
    });

    console.log('🔐 XML-RPC认证响应状态:', authResponse.status);
    
    // XML-RPC返回XML格式，需要特殊处理
    const authText = await authResponse.text();
    console.log('🔐 XML-RPC认证响应原始数据:', authText);
    
    // 简单的XML解析 - 提取uid
    const uidMatch = authText.match(/<value><int>(\d+)<\/int><\/value>/);
    if (!uidMatch) {
      console.log('❌ 无法从XML响应中提取uid');
      throw new Error('无法从XML响应中提取uid');
    }
    
    const uid = parseInt(uidMatch[1]);
    console.log('🔐 从XML中提取的uid:', uid);
    console.log('✅ XML-RPC认证成功，uid:', uid);
    
    globalSession = {
      session_id: `xmlrpc_${uid}`,
      uid: uid
    };
    
    return globalSession;
  } catch (error) {
    console.error('❌ 连接Raytech Odoo失败:', error);
    throw error;
  }
}

// 创建RPC调用（带重试机制）
async function raytechRpcCall(model: string, method_name: string, args: any[] = [], kwargs: any = {}, retryCount = 0): Promise<any> {
  const maxRetries = 2;
  
  try {
    console.log(`RPC调用 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${model}.${method_name}`, { args, kwargs });

    // 每次调用都重新认证以确保session有效
    await connectToRaytech();

    // 使用XML-RPC调用方式 - 发送真正的XML
    const argsXml = args.map(arg => {
      if (Array.isArray(arg)) {
        // 处理数组参数（如domain条件）
        const arrayXml = arg.map(item => {
          if (Array.isArray(item)) {
            // 处理嵌套数组（domain条件的三元组）
            return `<value><array><data>${item.map(subItem => 
              `<value><string>${String(subItem)}</string></value>`
            ).join('')}</data></array></value>`;
          } else {
            return `<value><string>${String(item)}</string></value>`;
          }
        }).join('');
        return `<value><array><data>${arrayXml}</data></array></value>`;
      } else if (typeof arg === 'object' && arg !== null) {
        // 将对象转换为XML结构
        const structXml = Object.entries(arg).map(([key, value]) => {
          if (value === undefined || value === null) {
            console.log(`⚠️ 跳过undefined/null值: ${key}`);
            return ''; // 跳过undefined/null值
          } else if (typeof value === 'string') {
            return `<member><name>${key}</name><value><string>${value}</string></value></member>`;
          } else if (typeof value === 'number') {
            return `<member><name>${key}</name><value><int>${value}</int></value></member>`;
          } else if (typeof value === 'boolean') {
            return `<member><name>${key}</name><value><boolean>${value ? 1 : 0}</boolean></value></member>`;
          } else {
            return `<member><name>${key}</name><value><string>${String(value)}</string></value></member>`;
          }
        }).filter(xml => xml !== '').join(''); // 过滤掉空字符串
        return `<value><struct>${structXml}</struct></value>`;
      } else if (typeof arg === 'string') {
        return `<value><string>${arg}</string></value>`;
      } else if (typeof arg === 'number') {
        return `<value><int>${arg}</int></value>`;
      } else {
        return `<value><string>${String(arg)}</string></value>`;
      }
    }).join('');
    
    const kwargsXml = Object.keys(kwargs).length > 0 ? 
      `<struct>${Object.entries(kwargs).map(([key, value]) => 
        `<member><name>${key}</name><value><string>${String(value)}</string></value></member>`
      ).join('')}</struct>` : '<struct></struct>';
    
    const rpcXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${RAYTECH_CONFIG.database}</string></value></param>
    <param><value><int>${globalSession!.uid}</int></value></param>
    <param><value><string>${RAYTECH_CONFIG.password}</string></value></param>
    <param><value><string>${model}</string></value></param>
    <param><value><string>${method_name}</string></value></param>
    <param><value><array><data>${argsXml}</data></array></value></param>
    <param><value>${kwargsXml}</value></param>
  </params>
</methodCall>`;

    const response = await fetch(`${RAYTECH_CONFIG.baseUrl}/xmlrpc/2/object`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: rpcXml,
    });

    console.log('RPC响应状态:', response.status);
    
    // XML-RPC返回XML格式，需要特殊处理
    const responseText = await response.text();
    console.log('RPC响应原始数据:', responseText);
    
    // 简单的XML解析 - 检查是否有错误
    if (responseText.includes('<fault>')) {
      console.log('❌ 检测到XML-RPC错误');
      
      // 尝试提取错误代码 - 修复正则表达式
      const faultCodeMatch = responseText.match(/<name>faultCode<\/name>\s*<value><int>(\d+)<\/int><\/value>/);
      const faultCode = faultCodeMatch ? parseInt(faultCodeMatch[1]) : 0;
      
      // 尝试提取错误消息 - 支持多种格式，包括换行符
      let faultString = 'Unknown XML-RPC error';
      const faultStringMatch1 = responseText.match(/<name>faultString<\/name>\s*<value><string><!\[CDATA\[(.*?)\]\]><\/string><\/value>/s);
      const faultStringMatch2 = responseText.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string><\/value>/);
      
      if (faultStringMatch1) {
        faultString = faultStringMatch1[1];
      } else if (faultStringMatch2) {
        faultString = faultStringMatch2[1].trim();
      }
      
      console.log('🔍 原始XML响应:', responseText);
      console.log('🔍 错误代码匹配结果:', faultCodeMatch);
      console.log('🔍 错误消息匹配结果1:', faultStringMatch1);
      console.log('🔍 错误消息匹配结果2:', faultStringMatch2);
      
      console.log('❌ 错误代码:', faultCode);
      console.log('❌ 错误消息:', faultString);
      
      // 检查是否是会话过期错误
      if (faultCode === 100 && (faultString.includes('Session expired') || faultString.includes('Session Expired'))) {
        console.log('✅ 检测到会话过期，准备重新认证...');
        globalSession = null;
        
        if (retryCount < maxRetries) {
          console.log(`🔄 重试 ${retryCount + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // 等待0.5秒
          console.log('🔄 开始重试调用...');
          return raytechRpcCall(model, method_name, args, kwargs, retryCount + 1);
        } else {
          console.log('❌ 重试次数已达上限，会话仍然过期');
          throw new Error('重试次数已达上限，会话仍然过期');
        }
      }
      
      throw new Error(`XML-RPC错误 (${faultCode}): ${faultString}`);
    }
    
    // 提取结果ID - 支持多种格式
    let result = null;
    
    // 尝试提取单个整数
    const intMatch = responseText.match(/<value><int>(\d+)<\/int><\/value>/);
    if (intMatch) {
      result = parseInt(intMatch[1]);
      console.log('✅ XML-RPC调用成功，单个整数结果:', result);
      return result;
    }
    
    // 尝试提取数组中的整数
    const arrayMatch = responseText.match(/<value><array><data>\s*<value><int>(\d+)<\/int><\/value>/);
    if (arrayMatch) {
      result = parseInt(arrayMatch[1]);
      console.log('✅ XML-RPC调用成功，数组中的整数结果:', result);
      return result;
    }
    
    // 尝试提取所有整数（用于数组结果）
    const allIntMatches = responseText.match(/<value><int>(\d+)<\/int><\/value>/g);
    if (allIntMatches && allIntMatches.length > 0) {
      const results = allIntMatches.map(match => {
        const intMatch = match.match(/<value><int>(\d+)<\/int><\/value>/);
        return intMatch ? parseInt(intMatch[1]) : null;
      }).filter(id => id !== null);
      
      if (results.length === 1) {
        console.log('✅ XML-RPC调用成功，单个结果:', results[0]);
        return results[0];
      } else if (results.length > 1) {
        console.log('✅ XML-RPC调用成功，多个结果:', results);
        return results;
      }
    }
    
    console.log('❌ 无法从XML响应中提取结果');
    console.log('🔍 响应内容:', responseText);
    throw new Error('无法从XML响应中提取结果');
  } catch (error) {
    console.error(`RPC调用失败 (尝试 ${retryCount + 1}):`, error);
    
    // 如果是网络错误或其他可重试的错误，进行重试
    if (retryCount < maxRetries && error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        console.log(`网络错误，重试 ${retryCount + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        return raytechRpcCall(model, method_name, args, kwargs, retryCount + 1);
      }
    }
    
    throw error;
  }
}

// 创建采购草稿
async function createPurchaseDraft(deviceInfo: any, userInfo: any, inspectionInfo: any) {
  try {
    console.log('开始创建采购草稿...');
    
    // 1. 首先查找或创建供应商
    let partnerId = 1; // 默认供应商ID
    
    try {
      console.log('🔍 开始查找现有供应商...');
      // 尝试查找现有供应商 - 使用最简单的搜索条件
      const partners = await raytechRpcCall('res.partner', 'search', [[]]);
      console.log('🔍 供应商搜索结果:', partners);
      
      if (partners && partners.length > 0) {
        partnerId = partners[0];
        console.log('✅ 找到现有供应商，ID:', partnerId);
      } else {
        console.log('🔍 未找到现有供应商，尝试创建新供应商...');
        // 创建新供应商
        partnerId = await raytechRpcCall('res.partner', 'create', [{
          name: 'Used Phone Recycle',
          is_company: true,
          supplier_rank: 1,
          email: 'recycle@example.com',
          phone: '000-000-0000'
        }]);
        console.log('✅ 创建新供应商，ID:', partnerId);
      }
    } catch (error) {
      console.log('⚠️ 供应商处理失败，使用默认ID 1:', error);
      // 如果供应商处理完全失败，使用默认ID 1
      partnerId = 1;
    }
    
    // 2. 查找NZD货币ID
    console.log('查找NZD货币...');
    let currencyId = 1; // 默认货币ID
    try {
      const currencies = await raytechRpcCall('res.currency', 'search', [[['name', '=', 'NZD']]]);
      console.log('NZD货币搜索结果:', currencies);
      if (currencies && currencies.length > 0) {
        currencyId = currencies[0];
        console.log('✅ 找到NZD货币，ID:', currencyId);
      } else {
        console.log('⚠️ 未找到NZD货币，使用默认货币ID 1');
      }
    } catch (error) {
      console.log('⚠️ 查找NZD货币失败，使用默认货币ID 1:', error);
    }
    
    // 3. 创建采购草稿
    console.log('创建采购草稿...');
    
    // 构建完整的回收信息
    const fullDescription = buildLogNote(deviceInfo, userInfo, inspectionInfo);
    
    const purchaseOrderData = {
      partner_id: partnerId,
      currency_id: currencyId, // NZD货币ID
      state: 'draft',
      notes: fullDescription  // 将回收信息写入Terms and Conditions
    };

    const purchaseOrder = await raytechRpcCall('purchase.order', 'create', [purchaseOrderData]);
    console.log('采购草稿创建成功:', purchaseOrder);

    // 4. 获取或创建产品R0010010001
    const productId = await getProductId('R0010010001', deviceInfo, userInfo, inspectionInfo);
    console.log('产品ID:', productId);

    // 验证产品ID
    if (!productId || productId === undefined) {
      throw new Error('产品ID无效，无法创建采购订单行');
    }

    // 5. 添加产品行
    const productLineData = {
      order_id: purchaseOrder,
      product_id: productId,
      name: 'R0010010001', // 使用产品代码作为名称
      product_qty: 1,
      product_uom: 1, // 默认单位
      // 不设置价格，让系统使用产品的默认价格
    };
    
    console.log('产品行数据:', productLineData);

    const orderLine = await raytechRpcCall('purchase.order.line', 'create', [productLineData]);
    console.log('产品行创建成功:', orderLine);

    // 4. 回收信息已写入采购订单的Terms and Conditions字段

    return {
      success: true,
      purchaseOrderId: purchaseOrder,
      orderLineId: orderLine,
      message: '成功推送到Raytech Odoo并创建采购草稿，回收信息已写入Terms and Conditions'
    };

  } catch (error) {
    console.error('创建采购草稿失败:', error);
    throw error;
  }
}

// 获取产品ID
async function getProductId(productCode: string, deviceInfo: any, userInfo: any, inspectionInfo: any) {
  try {
    console.log(`搜索产品: ${productCode}`);
    const products = await raytechRpcCall('product.product', 'search', [[['default_code', '=', productCode]]]);
    console.log('产品搜索结果:', products);
    
    // 处理不同的返回格式
    let productIds = products;
    if (!Array.isArray(products)) {
      productIds = [products];
    }
    
    if (!productIds || productIds.length === 0) {
      console.log('产品不存在，创建新产品...');
      
      const productData = {
        name: productCode, // 使用产品代码作为名称
        default_code: productCode,
        type: 'service',
        categ_id: 1
        // 不设置默认描述，让产品保持空白描述
      };
      
      const productId = await raytechRpcCall('product.product', 'create', [productData]);
      console.log('创建产品成功:', productId);
      return productId;
    }
    
    const productId = productIds[0];
    console.log('找到现有产品，ID:', productId);
    
    // 不需要更新产品描述，数据将写入采购订单的Terms and Conditions
    
    return productId;
  } catch (error) {
    console.error('获取/创建产品失败:', error);
    throw error;
  }
}

// 构建完整信息日志
function buildLogNote(deviceInfo: any, userInfo: any, inspectionInfo: any): string {
  const sections = [];
  
  // 字段名映射
  const fieldMap: { [key: string]: string } = {
    // 设备信息字段
    deviceType: '设备类型',
    brand: '品牌',
    model: '型号',
    imei: 'IMEI',
    serialNumber: '序列号',
    color: '颜色',
    storage: '存储容量',
    accessories: '配件',
    batteryHealth: '电池健康度',
    memory: '内存',
    screenSize: '屏幕大小',
    simCardType: 'Sim卡类型',
    networkType: '网络类型',
    releaseYear: '发布年份',
    cpuDescription: 'CPU补充描述',
    memoryType: '内存类型',
    storageType: '硬盘类型',
    gpu: 'GPU',
    cpuCount: 'CPU数量',
    cpuModel: 'CPU型号',
    cpuSpeed: 'CPU速度',
    storageSize: '硬盘大小',
    memorySize: '内存大小',
    deviceDescription: '设备描述',
    brandDescription: '其他品牌描述',
    condition: '成色',
    
    // 用户信息字段
    customerName: '客户姓名',
    phone: '电话',
    email: '邮箱',
    address: '地址',
    customerPhone: '客户电话',
    customerEmail: '客户邮箱',
    customerAddress: '客户地址',
    bankType: '银行类型',
    accountName: '账户名称',
    accountNumber: '付款账号',
    otherBankName: '其他银行名称',
    transferNote: '汇款备注',
    idType: '证件类型',
    idNumber: '证件号码',
    idDescription: '证件描述',
    
    // 检测信息字段
    store: '门店',
    operator: '操作人',
    estimatedValue: '估价',
    notes: '备注',
    replacementParts: '更换配件',
    suggestedReplacements: '建议更换配件',
    partDescription: '配件描述'
  };
  
  // 设备信息
  sections.push('📱 设备信息:');
  Object.entries(deviceInfo).forEach(([key, value]) => {
    if (value && value !== '') {
      const chineseKey = fieldMap[key] || key;
      if (Array.isArray(value)) {
        sections.push(`${chineseKey}: ${value.join(', ')}`);
      } else {
        sections.push(`${chineseKey}: ${value}`);
      }
    }
  });
  
  // 用户信息
  sections.push('----------👤 用户信息:');
  Object.entries(userInfo).forEach(([key, value]) => {
    if (value && value !== '') {
      const chineseKey = fieldMap[key] || key;
      sections.push(`${chineseKey}: ${value}`);
    }
  });
  
  // 检测信息
  sections.push('----------🔍 检测信息:');
  Object.entries(inspectionInfo).forEach(([key, value]) => {
    if (value && value !== '') {
      const chineseKey = fieldMap[key] || key;
      if (Array.isArray(value)) {
        sections.push(`${chineseKey}: ${value.join(', ')}`);
      } else {
        sections.push(`${chineseKey}: ${value}`);
      }
    }
  });
  
  return sections.join(' | ');
}

export async function POST(request: NextRequest) {
  try {
    console.log('收到推送请求...');
    const body = await request.json();
    const { deviceInfo, userInfo, inspectionInfo } = body;

    console.log('请求数据:', { 
      deviceInfo: Object.keys(deviceInfo || {}), 
      userInfo: Object.keys(userInfo || {}), 
      inspectionInfo: Object.keys(inspectionInfo || {}) 
    });

    // 验证必需字段
    if (!deviceInfo || !inspectionInfo) {
      return NextResponse.json(
        { error: '缺少必需的数据' },
        { status: 400 }
      );
    }

    // 推送到Raytech Odoo
    console.log('开始推送到Raytech Odoo...');
    const result = await createPurchaseDraft(deviceInfo, userInfo, inspectionInfo);
    console.log('推送完成，结果:', result);

    return NextResponse.json({
      success: true,
      data: result,
      message: '成功推送到Raytech Odoo'
    });

  } catch (error: any) {
    console.error('推送失败:', error);
    return NextResponse.json(
      { 
        error: '推送失败', 
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
