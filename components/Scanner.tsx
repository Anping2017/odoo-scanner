'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

type Props = { onDetected: (text: string) => void; highPrecision?: boolean };

export default function Scanner({ onDetected, highPrecision = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const engineRef = useRef<'native' | 'zxing' | null>(null);

  const [err, setErr] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const [code93Mode, setCode93Mode] = useState(false); // 默认兼容所有条码格式
  const [imageQuality, setImageQuality] = useState<number>(0); // 图像质量评分
  const [isCapturing, setIsCapturing] = useState(false); // 照相识别状态

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // 图像后处理 - 减少噪点提高清晰度
  const processImageForRecognition = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 应用降噪和锐化滤镜
    for (let i = 0; i < data.length; i += 4) {
      // 计算灰度值
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      
      // 应用高斯模糊降噪（简化版）
      const smoothed = gray * 0.8 + (data[i] + data[i + 1] + data[i + 2]) / 3 * 0.2;
      
      // 应用锐化滤镜
      const sharpened = Math.min(255, Math.max(0, smoothed * 1.5 - gray * 0.5));
      
      // 应用对比度增强
      const enhanced = Math.min(255, Math.max(0, (sharpened - 128) * 1.8 + 128));
      
      // 应用二值化处理
      const binary = enhanced > 140 ? 255 : 0;
      
      data[i] = binary;     // R
      data[i + 1] = binary; // G
      data[i + 2] = binary; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // 图像质量检测
  const calculateImageQuality = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): number => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalVariance = 0;
    let pixelCount = 0;
    
    // 计算图像方差（衡量清晰度）
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      totalVariance += Math.pow(gray - 128, 2);
      pixelCount++;
    }
    
    const variance = totalVariance / pixelCount;
    const quality = Math.min(100, Math.max(0, (variance / 1000) * 100)); // 转换为0-100评分
    
    return Math.round(quality);
  };

  // 深度图像处理 - 专门优化条形码识别
  const deepImageProcessing = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 第一步：转换为灰度图
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
    }
    
    // 第二步：高斯降噪
    const tempData = new Uint8ClampedArray(data);
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        let sum = 0;
        let count = 0;
        
        // 3x3高斯核
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
            const weight = dy === 0 && dx === 0 ? 4 : 1; // 中心权重更高
            sum += tempData[nIdx] * weight;
            count += weight;
          }
        }
        
        data[idx] = sum / count;     // R
        data[idx + 1] = sum / count; // G
        data[idx + 2] = sum / count; // B
      }
    }
    
    // 第三步：对比度增强
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i];
      const enhanced = Math.min(255, Math.max(0, (gray - 128) * 2.5 + 128));
      data[i] = enhanced;     // R
      data[i + 1] = enhanced; // G
      data[i + 2] = enhanced; // B
    }
    
    // 第四步：锐化处理
    const sharpData = new Uint8ClampedArray(data);
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        const center = sharpData[idx];
        
        // 拉普拉斯锐化核
        const top = sharpData[((y - 1) * canvas.width + x) * 4];
        const bottom = sharpData[((y + 1) * canvas.width + x) * 4];
        const left = sharpData[(y * canvas.width + (x - 1)) * 4];
        const right = sharpData[(y * canvas.width + (x + 1)) * 4];
        
        const sharpened = Math.min(255, Math.max(0, center + 0.5 * (4 * center - top - bottom - left - right)));
        
        data[idx] = sharpened;     // R
        data[idx + 1] = sharpened; // G
        data[idx + 2] = sharpened; // B
      }
    }
    
    // 第五步：自适应二值化
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i];
      // 动态阈值：根据周围像素计算
      const threshold = gray > 140 ? 140 : gray < 100 ? 100 : gray;
      const binary = gray > threshold ? 255 : 0;
      
      data[i] = binary;     // R
      data[i + 1] = binary; // G
      data[i + 2] = binary; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // 照相识别功能
  const captureAndRecognize = async () => {
    if (!videoRef.current || isCapturing) return;
    
    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // 设置画布尺寸
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // 绘制视频帧
      ctx.drawImage(video, 0, 0);
      
      // 应用深度图像处理
      deepImageProcessing(canvas, ctx);
      
      // 尝试识别条码
      let code = '';
      
      // 使用原生检测器
      try {
        const Detector = (globalThis as any).BarcodeDetector;
        if (Detector) {
          const formats = code93Mode ? ['code_93'] : [
            'code_93', 'code_128', 'code_39', 'codabar', 'code_11',
            'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417'
          ];
          const detector = new Detector({ formats });
          const detections = await detector.detect(canvas);
          if (detections.length > 0) {
            code = detections[0].rawValue;
            console.log('照相识别成功(原生):', code);
          }
        }
      } catch (e) {
        console.log('原生检测器失败:', e);
      }
      
      // 如果原生检测器失败，使用ZXing
      if (!code) {
        try {
          if (!readerRef.current) {
            const hints = new Map();
            hints.set(DecodeHintType.TRY_HARDER, true);
            hints.set(DecodeHintType.POSSIBLE_FORMATS, code93Mode ? [BarcodeFormat.CODE_93] : [
              BarcodeFormat.CODE_93, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
              BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E
            ]);
            readerRef.current = new BrowserMultiFormatReader(hints as any);
          }
          
          const result = await (readerRef.current as any).decodeFromCanvas(canvas);
          if (result) {
            code = result.getText();
            console.log('照相识别成功(ZXing):', code);
          }
        } catch (e) {
          console.log('ZXing检测失败:', e);
        }
      }
      
      if (code && !firedRef.current) {
        firedRef.current = true;
        stop();
        onDetected(code);
      } else {
        alert('照相识别失败，请调整角度和距离后重试。');
      }
      
    } catch (error) {
      console.error('照相识别失败:', error);
      alert('照相识别失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsCapturing(false);
    }
  };

  // 设置自动聚焦功能
  const setupAutoFocus = async (video: HTMLVideoElement, stream: MediaStream, formats?: string[]) => {
    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return;

      const capabilities = track.getCapabilities() as any;
      const settings = track.getSettings() as any;
      
      // 检查是否支持聚焦控制
      if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
        await track.applyConstraints({
          focusMode: 'continuous',
          focusDistance: 0.1
        } as any);
        setIsFocused(true);
        setDebugInfo(`自动聚焦已启用 - 原生检测器支持格式: ${formats?.join(', ') || '未知'}`);
      } else {
        setDebugInfo(`自动聚焦不支持 - 使用ZXing库进行识别`);
      }
    } catch (e) {
      console.warn('设置自动聚焦失败:', e);
      setDebugInfo(`自动聚焦失败 - 使用ZXing库进行识别`);
    }
  };

  // 触摸聚焦功能
  const handleVideoClick = async (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    try {
      const stream = video.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      
      if (track) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('manual')) {
          await track.applyConstraints({
            focusMode: 'manual',
            focusDistance: 0.1,
            pointsOfInterest: [{ x, y }]
          } as any);
          
          // 显示聚焦指示
          setIsFocused(true);
          setTimeout(() => setIsFocused(false), 1000);
        }
      }
    } catch (e) {
      console.warn('触摸聚焦失败:', e);
    }
  };

  // 缩放控制功能
  const handleZoomChange = async (newZoom: number) => {
    if (!videoRef.current) return;
    
    try {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      
      if (track) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.zoom && capabilities.zoom.max > 1) {
          const maxZoom = capabilities.zoom.max;
          const minZoom = capabilities.zoom.min || 1;
          const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
          
          await track.applyConstraints({
            zoom: clampedZoom
          } as any);
          
          setZoomLevel(clampedZoom);
          setIsZooming(true);
          setTimeout(() => setIsZooming(false), 500);
        }
      }
    } catch (e) {
      console.warn('缩放失败:', e);
    }
  };

  // 双击放大功能（三倍放大并聚焦）
  const handleVideoDoubleClick = async (e: React.MouseEvent<HTMLVideoElement>) => {
    e.preventDefault();
    const newZoom = zoomLevel === 1 ? 3 : 1; // 改为三倍放大
    await handleZoomChange(newZoom);
    
    // 放大时自动聚焦
    if (newZoom === 3) {
      const video = videoRef.current;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
            try {
              await track.applyConstraints({
                focusMode: 'continuous',
                focusDistance: 0.1
              } as any);
              setIsFocused(true);
              console.log('双击放大后自动聚焦');
            } catch (error) {
              console.log('自动聚焦失败:', error);
            }
          }
        }
      }
    }
  };

  // 验证条码代码格式（首位字母+数字/字母组合，最多12位）
  const validateBarcodeCode = (text: string): string | null => {
    // 清理文本，只保留字母和数字
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '');
    
    // 检查格式：首位字母+数字/字母组合，最多12位
    const barcodePattern = /^[A-Za-z][A-Za-z0-9]{0,11}$/;
    
    if (barcodePattern.test(cleaned) && cleaned.length >= 2) {
      return cleaned.toUpperCase(); // 转换为大写
    }
    
    return null;
  };

  const stop = useCallback(() => {
    try { stopRef.current?.(); } catch {}
    stopRef.current = null;
    clearRaf();
  }, []);

  /** 原生 BarcodeDetector 优先；失败则用 ZXing */
  const startNative = useCallback(async () => {
    const hasDetector = typeof (globalThis as any).BarcodeDetector === 'function';
    if (!hasDetector) return false;

    let fmts: string[] = [];
    try { fmts = await (globalThis as any).BarcodeDetector.getSupportedFormats?.() || []; } catch {}
    // 优先支持Code 93，然后是其他格式
    const desired = code93Mode 
      ? ['code_93'] // Code 93专用模式：只支持Code 93
      : [
          'code_93',  // 优先Code 93
          'code_128', 'code_39', 'codabar', 'code_11',
          'ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension',
          'qr_code', 'data_matrix', 'pdf417', 'aztec',
          'itf', 'rss_14', 'rss_expanded'
        ];
    const formats = desired.filter(f => fmts.includes(f));
    if (!formats.length) return false;
    
    const code93Supported = formats.includes('code_93');
    const modeText = code93Mode ? ' (Code 93专用模式)' : ' (兼容所有条码)';
    setDebugInfo(`原生检测器支持格式: ${formats.join(', ')}${code93Supported ? modeText : ' (Code 93不支持)'}`);

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: highPrecision ? 3840 : 2560 }, // 进一步提升到4K分辨率
        height: { ideal: highPrecision ? 2160 : 1440 }, // 进一步提升到4K分辨率
        frameRate: { ideal: 60 }, // 提高帧率到60fps
        // 添加自动聚焦支持
        focusMode: { ideal: 'continuous' },
        focusDistance: { ideal: 0.05 }, // 更近距离聚焦
        // 添加缩放支持
        zoom: { ideal: 1 },
        // 添加曝光控制
        exposureMode: { ideal: 'continuous' },
        whiteBalanceMode: { ideal: 'continuous' },
        // 添加图像稳定
        imageStabilization: { ideal: true },
        // 添加降噪
        noiseReduction: { ideal: true },
        // 添加对比度增强
        contrast: { ideal: 1.2 },
        // 添加锐化
        sharpness: { ideal: 1.5 },
        // 添加饱和度
        saturation: { ideal: 1.1 },
        // 添加亮度
        brightness: { ideal: 0.1 },
      } as any,
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    // 设置自动聚焦
    await setupAutoFocus(video, stream, formats);

    if (!canvasRef.current) {
      const c = document.createElement('canvas'); 
      c.style.display = 'none';
      canvasRef.current = c; 
      document.body.appendChild(c);
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const Detector = (globalThis as any).BarcodeDetector;
    const detector = new Detector({ formats });

    const loop = async () => {
      if (firedRef.current) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { 
        rafRef.current = requestAnimationFrame(loop); 
        return; 
      }

      // 中央 ROI
      const roiW = Math.floor(vw * 0.8), roiH = Math.floor(vh * 0.45);
      const sx = Math.floor((vw - roiW) / 2), sy = Math.floor((vh - roiH) / 2);
      canvas.width = roiW; 
      canvas.height = roiH;
      ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, roiW, roiH);

      // 应用图像后处理提高识别精度
      processImageForRecognition(canvas, ctx);

      // 检测图像质量
      const quality = calculateImageQuality(canvas, ctx);
      setImageQuality(quality);

      try {
        const codes = await detector.detect(canvas);
        const txt = codes?.[0]?.rawValue;
        if (txt) {
          console.log('原生检测器识别成功:', txt, '格式:', codes[0]?.format);
          firedRef.current = true; 
          stop(); 
          onDetected(String(txt)); 
          return;
        }
      } catch (e) {
        console.warn('原生检测器识别失败:', e);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    engineRef.current = 'native';
    loop();
    stopRef.current = () => { 
      if (stream) stream.getTracks().forEach(t => t.stop()); 
      clearRaf(); 
    };
    return true;
  }, [highPrecision, onDetected, stop]);

  const startZxing = useCallback(async () => {
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    
    // Code 93专门模式：只识别Code 93，避免误识别
    if (code93Mode) {
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_93  // 只识别Code 93
      ]);
    } else {
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_93,  // 优先Code 93
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODABAR,
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
        BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED
      ]);
    }
    
    // Code 93专门优化参数
    hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
    hints.set(DecodeHintType.ASSUME_GS1, false);
    hints.set(DecodeHintType.PURE_BARCODE, false); // Code 93需要静默区
    hints.set(DecodeHintType.NEED_RESULT_POINT_CALLBACK, false);
    hints.set(DecodeHintType.ALLOWED_LENGTHS, null);
    
    // 小码识别优化 - 增强参数
    hints.set(DecodeHintType.ASSUME_CODE_39_CHECK_DIGIT, false);
    hints.set(DecodeHintType.RETURN_CODABAR_START_END, false);
    hints.set(DecodeHintType.TRY_HARDER, true); // 更努力尝试识别
    hints.set(DecodeHintType.POSSIBLE_FORMATS, hints.get(DecodeHintType.POSSIBLE_FORMATS)); // 确保格式设置
    
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(hints as any);
    
    setDebugInfo(code93Mode ? '使用ZXing库进行识别 (Code 93专门模式)' : '使用ZXing库进行识别 (Code 93优先)');

    const size = highPrecision
      ? { 
          width: { ideal: 3840 }, 
          height: { ideal: 2160 },
          frameRate: { ideal: 60 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.05 },
          // 添加缩放支持
          zoom: { ideal: 1 },
          // 添加曝光控制
          exposureMode: { ideal: 'continuous' },
          whiteBalanceMode: { ideal: 'continuous' },
          // 添加图像稳定
          imageStabilization: { ideal: true },
          // 添加降噪
          noiseReduction: { ideal: true },
          // 添加对比度增强
          contrast: { ideal: 1.2 },
          // 添加锐化
          sharpness: { ideal: 1.5 },
          // 添加饱和度
          saturation: { ideal: 1.1 },
          // 添加亮度
          brightness: { ideal: 0.1 },
        } as any
      : { 
          width: { ideal: 2560 }, 
          height: { ideal: 1440 },
          frameRate: { ideal: 60 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.05 },
          // 添加缩放支持
          zoom: { ideal: 1 },
          // 添加曝光控制
          exposureMode: { ideal: 'continuous' },
          whiteBalanceMode: { ideal: 'continuous' },
          // 添加图像稳定
          imageStabilization: { ideal: true },
          // 添加降噪
          noiseReduction: { ideal: true },
          // 添加对比度增强
          contrast: { ideal: 1.2 },
          // 添加锐化
          sharpness: { ideal: 1.5 },
          // 添加饱和度
          saturation: { ideal: 1.1 },
          // 添加亮度
          brightness: { ideal: 0.1 },
        } as any;

    const video = videoRef.current!;
    const controls = await readerRef.current.decodeFromConstraints(
      { 
        video: { 
          facingMode: { ideal: 'environment' }, 
          ...size 
        }, 
        audio: false 
      } as any,
      video,
      (res: any) => {
        if (!res || firedRef.current) return;
        const text = res.getText?.() ?? res.text ?? '';
        console.log('ZXing识别成功:', text, '格式:', res.getBarcodeFormat?.());
        firedRef.current = true; 
        stop(); 
        onDetected(text);
      }
    );

    stopRef.current = () => controls.stop();
    engineRef.current = 'zxing';
    return true;
  }, [highPrecision, onDetected, stop]);

  const start = useCallback(async () => {
    try {
      setErr(''); 
      firedRef.current = false;
      const ok = await startNative(); 
      if (ok) return; 
      await startZxing();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        setErr('需要 HTTPS 才能启用摄像头（请用 https 访问）。');
      } else if (/NotAllowedError/i.test(msg)) {
        setErr('相机权限被拒绝，请在浏览器设置中允许使用相机。');
      } else if (/OverconstrainedError|NotFoundError|DevicesNotFound/i.test(msg)) {
        setErr('未检测到可用摄像头。');
      } else {
        setErr('启动摄像头失败：' + msg);
      }
    }
  }, [startNative, startZxing]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { 
      setErr('当前浏览器不支持摄像头 API'); 
      return; 
    }
    start();
    return () => { stop(); };
  }, [start, stop]);

  useEffect(() => {
    const vis = () => { 
      if (document.visibilityState === 'visible' && !firedRef.current) {
        start(); 
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [start]);


  async function detectNativeOn(source: ImageBitmap | HTMLCanvasElement): Promise<string> {
    try {
      const Detector = (globalThis as any).BarcodeDetector; 
      if (typeof Detector !== 'function') return '';
      
      const fmts = await Detector.getSupportedFormats?.() || [];
      const formats = code93Mode 
        ? ['code_93'].filter(f => fmts.includes(f)) // Code 93专用模式
        : [
            'code_93',  // 优先Code 93
            'code_128', 'code_39', 'codabar', 'code_11',
            'ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension',
            'qr_code', 'data_matrix', 'pdf417', 'aztec',
            'itf', 'rss_14', 'rss_expanded'
          ].filter(f => fmts.includes(f));
      
      if (!formats.length) return '';
      
      const res = await new Detector({ formats }).detect(source as any);
      return res?.[0]?.rawValue ? String(res[0].rawValue) : '';
    } catch { 
      return ''; 
    }
  }

  async function detectZxingFromBlob(blob: Blob): Promise<string> {
    try {
      const url = URL.createObjectURL(blob); 
      const img = new Image(); 
      img.src = url;
      
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = reject; 
      });

      if (!readerRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        
        // Code 93专门模式
        if (code93Mode) {
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_93  // 只识别Code 93
          ]);
        } else {
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_93,  // 优先Code 93
            BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODABAR,
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
            BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
            BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED
          ]);
        }
        
        hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
        hints.set(DecodeHintType.ASSUME_GS1, false);
        // Code 93专门优化
        hints.set(DecodeHintType.PURE_BARCODE, false); // Code 93需要静默区
        hints.set(DecodeHintType.NEED_RESULT_POINT_CALLBACK, false); // 不需要结果点回调
        hints.set(DecodeHintType.ALLOWED_LENGTHS, null); // 允许任意长度
        // 小码识别优化
        hints.set(DecodeHintType.ASSUME_CODE_39_CHECK_DIGIT, false);
        hints.set(DecodeHintType.RETURN_CODABAR_START_END, false);
        readerRef.current = new BrowserMultiFormatReader(hints as any);
      }

      let result: any;
      try { 
        result = await (readerRef.current as any).decodeFromImage(img); 
      } catch { 
        result = await (readerRef.current as any).decodeFromImageElement?.(img); 
      }
      
      URL.revokeObjectURL(url);
      return result?.getText ? result.getText() : (result?.text || '');
    } catch { 
      return ''; 
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; 
    if (!file) return;
    
    try {
      // 尝试条码识别
      const bmp = await createImageBitmap(file);
      let code = await detectNativeOn(bmp); 
      
      if (!code) code = await detectZxingFromBlob(file);
      
      if (code && !firedRef.current) { 
        firedRef.current = true; 
        stop(); 
        onDetected(code); 
      } else {
        alert('未识别到条码，请选择更清晰的照片重试。');
      }
    } catch (e: any) {
      console.error('图片识别失败:', e);
      alert('图片识别失败：' + (e?.message || String(e)));
    } finally {
      e.target.value = '';
    }
  }

  const btnStyle: React.CSSProperties = { 
    padding: '8px 12px', 
    borderRadius: 8, 
    border: '1px solid #ddd', 
    background: '#fff',
    fontSize: '14px',
    cursor: 'pointer'
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style jsx>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
      {/* 工具条 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px' }}>
        <label style={{ ...btnStyle, cursor: 'pointer', display: 'inline-block' }}>
          从相册选择
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={onPickFile}
          />
        </label>
        
        {/* 照相识别按钮 */}
        <button 
          style={{
            ...btnStyle,
            backgroundColor: isCapturing ? '#f59e0b' : '#3b82f6',
            color: '#fff',
            fontWeight: 600
          }}
          onClick={captureAndRecognize}
          disabled={isCapturing}
        >
          {isCapturing ? '深度处理中...' : '📷 照相识别'}
        </button>
        
        {/* Code 93模式切换 */}
        <button 
          style={{
            ...btnStyle,
            backgroundColor: code93Mode ? '#10b981' : '#fff',
            color: code93Mode ? '#fff' : '#000',
            fontWeight: code93Mode ? 600 : 400
          }}
          onClick={() => {
            setCode93Mode(!code93Mode);
            // 重新初始化识别器
            readerRef.current = null;
          }}
        >
          {code93Mode ? 'Code 93专用' : '兼容所有条码'}
        </button>
        
        {/* 缩放控制 */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button 
            style={btnStyle} 
            onClick={() => handleZoomChange(Math.max(1, zoomLevel - 0.5))}
            disabled={zoomLevel <= 1}
          >
            −
          </button>
          <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>
            {zoomLevel.toFixed(1)}×
          </span>
          <button 
            style={btnStyle} 
            onClick={() => handleZoomChange(zoomLevel + 0.5)}
            disabled={zoomLevel >= 3}
          >
            +
          </button>
        </div>
      </div>

      {/* 视频区域 */}
      <div style={{ 
        position: 'relative', 
        flex: '1 1 0', 
        minHeight: 0, 
        overflow: 'hidden', 
        borderRadius: 12,
        backgroundColor: '#000'
      }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          onClick={handleVideoClick}
          onDoubleClick={handleVideoDoubleClick}
          style={{ 
            position: 'absolute', 
            inset: 0, 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            cursor: 'pointer'
          }}
        />
        
        {/* 聚焦指示器 */}
        {isFocused && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 60,
            height: 60,
            border: '3px solid #10b981',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            pointerEvents: 'none',
            animation: 'pulse 1s ease-in-out'
          }} />
        )}
        
        {/* 缩放指示器 */}
        {isZooming && (
          <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            pointerEvents: 'none'
          }}>
            {zoomLevel.toFixed(1)}×
          </div>
        )}
        
        {/* 扫码框指示器 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '45%',
          border: '2px dashed rgba(255, 255, 255, 0.6)',
          borderRadius: 12,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '4px 8px',
            borderRadius: 4
          }}>
            将条码对准此区域<br/>
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              {code93Mode ? 'Code 93专用模式' : '兼容所有条码'} • 点击聚焦 • 双击3倍放大 • 小码用+按钮放大
            </span>
          </div>
        </div>
      </div>

      {err && (
        <div style={{ 
          color: '#dc2626', 
          fontSize: 14, 
          padding: '8px',
          textAlign: 'center'
        }}>
          {err}
        </div>
      )}
      
      {debugInfo && (
        <div style={{ 
          color: '#6b7280', 
          fontSize: 12, 
          padding: '4px 8px',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: 4
        }}>
          {debugInfo}
        </div>
      )}
      
      {imageQuality > 0 && (
        <div style={{ 
          color: imageQuality > 70 ? '#10b981' : imageQuality > 40 ? '#f59e0b' : '#ef4444',
          fontSize: 12, 
          padding: '4px 8px',
          textAlign: 'center',
          backgroundColor: imageQuality > 70 ? '#ecfdf5' : imageQuality > 40 ? '#fffbeb' : '#fef2f2',
          borderRadius: 4
        }}>
          图像质量: {imageQuality}% {imageQuality > 70 ? '(优秀)' : imageQuality > 40 ? '(良好)' : '(需改善)'}
        </div>
      )}
      
      {isCapturing && (
        <div style={{ 
          color: '#f59e0b', 
          fontSize: 12, 
          padding: '4px 8px',
          textAlign: 'center',
          backgroundColor: '#fffbeb',
          borderRadius: 4
        }}>
          正在进行深度图像处理，请稍候...
        </div>
      )}
    </div>
  );
}