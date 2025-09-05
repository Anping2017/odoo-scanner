'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { createWorker } from 'tesseract.js';

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
  const [code93Mode, setCode93Mode] = useState(true); // Code 93专门模式
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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

  // 双击放大功能
  const handleVideoDoubleClick = async (e: React.MouseEvent<HTMLVideoElement>) => {
    e.preventDefault();
    const newZoom = zoomLevel === 1 ? 2 : 1;
    await handleZoomChange(newZoom);
  };

  // 检测条码位置
  const detectBarcodePosition = async (imageFile: File): Promise<{x: number, y: number, width: number, height: number} | null> => {
    try {
      // 使用ZXing检测条码位置
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = URL.createObjectURL(imageFile);
      });

      if (!readerRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_93, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E
        ]);
        readerRef.current = new BrowserMultiFormatReader(hints as any);
      }

      const result = await (readerRef.current as any).decodeFromImage(img);
      URL.revokeObjectURL(img.src);
      
      if (result && result.getResultPoints) {
        const points = result.getResultPoints();
        if (points && points.length >= 4) {
          // 计算条码边界框
          const xs = points.map((p: any) => p.getX());
          const ys = points.map((p: any) => p.getY());
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          
          return {
            x: Math.max(0, minX - 10),
            y: Math.max(0, minY - 10),
            width: Math.min(img.width - minX + 10, maxX - minX + 20),
            height: Math.min(img.height - minY + 10, maxY - minY + 20)
          };
        }
      }
      
      return null;
    } catch (error) {
      console.log('条码位置检测失败:', error);
      return null;
    }
  };

  // OCR文字识别功能 - 只识别条码下方的文字
  const performOCR = async (imageFile: File): Promise<string> => {
    try {
      setIsOcrProcessing(true);
      
      const worker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR进度: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      // 预处理图片以提高OCR准确率
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = URL.createObjectURL(imageFile);
      });

      // 尝试检测条码位置
      const barcodePos = await detectBarcodePosition(imageFile);
      
      if (barcodePos) {
        // 如果检测到条码，只处理条码下方的区域
        const cropHeight = Math.min(100, img.height - barcodePos.y - barcodePos.height); // 条码下方100像素
        const cropY = barcodePos.y + barcodePos.height;
        
        if (cropHeight > 20) { // 确保有足够的区域进行OCR
          canvas.width = img.width;
          canvas.height = cropHeight;
          ctx.drawImage(img, 0, cropY, img.width, cropHeight, 0, 0, img.width, cropHeight);
          console.log(`裁剪条码下方区域: y=${cropY}, height=${cropHeight}`);
        } else {
          // 如果条码下方区域太小，使用整个图片的下半部分
          canvas.width = img.width;
          canvas.height = img.height / 2;
          ctx.drawImage(img, 0, img.height / 2, img.width, img.height / 2, 0, 0, img.width, img.height / 2);
          console.log('使用图片下半部分进行OCR');
        }
      } else {
        // 如果没检测到条码，使用整个图片的下半部分
        canvas.width = img.width;
        canvas.height = img.height / 2;
        ctx.drawImage(img, 0, img.height / 2, img.width, img.height / 2, 0, 0, img.width, img.height / 2);
        console.log('未检测到条码，使用图片下半部分进行OCR');
      }
      
      // 增强对比度
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // 增强对比度
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.5 + 128));     // R
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.5 + 128)); // G
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.5 + 128)); // B
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // 转换为blob进行OCR
      const processedBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      });

      const { data: { text } } = await worker.recognize(processedBlob);
      
      await worker.terminate();
      URL.revokeObjectURL(img.src);
      
      // 清理识别结果
      const cleanedText = text
        .replace(/\s+/g, ' ') // 合并多个空格
        .replace(/[^\w\s]/g, '') // 移除特殊字符
        .trim();
      
      return cleanedText;
    } catch (error) {
      console.error('OCR识别失败:', error);
      return '';
    } finally {
      setIsOcrProcessing(false);
    }
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
    const modeText = code93Mode ? ' (Code 93专用模式)' : ' (Code 93优先)';
    setDebugInfo(`原生检测器支持格式: ${formats.join(', ')}${code93Supported ? modeText : ' (Code 93不支持)'}`);

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: highPrecision ? 1920 : 1280 }, // 提高分辨率
        height: { ideal: highPrecision ? 1080 : 720 },  // 提高分辨率
        // 添加自动聚焦支持
        focusMode: { ideal: 'continuous' },
        focusDistance: { ideal: 0.1 }, // 近距离聚焦，适合扫码
        // 添加缩放支持
        zoom: { ideal: 1 },
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
    
    // 小码识别优化
    hints.set(DecodeHintType.ASSUME_CODE_39_CHECK_DIGIT, false);
    hints.set(DecodeHintType.RETURN_CODABAR_START_END, false);
    
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(hints as any);
    
    setDebugInfo(code93Mode ? '使用ZXing库进行识别 (Code 93专门模式)' : '使用ZXing库进行识别 (Code 93优先)');

    const size = highPrecision
      ? { 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.1 },
          // 添加缩放支持
          zoom: { ideal: 1 }
        } as any
      : { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.1 },
          // 添加缩放支持
          zoom: { ideal: 1 }
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
      // 首先尝试条码识别
      const bmp = await createImageBitmap(file);
      let code = await detectNativeOn(bmp); 
      
      if (!code) code = await detectZxingFromBlob(file);
      
      if (code && !firedRef.current) { 
        firedRef.current = true; 
        stop(); 
        onDetected(code); 
        return;
      }
      
      // 条码识别失败，尝试OCR文字识别
      console.log('条码识别失败，尝试OCR文字识别...');
      const ocrText = await performOCR(file);
      
      if (ocrText && ocrText.length > 0 && !firedRef.current) {
        firedRef.current = true; 
        stop(); 
        onDetected(ocrText);
        console.log('OCR识别成功:', ocrText);
      } else {
        alert('未识别到条码或条码下方文字，请选择更清晰的照片重试。');
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
          {isOcrProcessing ? '识别条码下方文字中...' : '从相册选择(识别条码下方文字)'}
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={onPickFile}
            disabled={isOcrProcessing}
          />
        </label>
        
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
          Code 93{code93Mode ? '专用' : '优先'}
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
              {code93Mode ? 'Code 93专用模式 • 点击聚焦 • 双击放大 • 小码用+按钮放大' : '点击聚焦 • 双击放大 • 小码用+按钮放大'}
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
      
      {isOcrProcessing && (
        <div style={{ 
          color: '#10b981', 
          fontSize: 12, 
          padding: '4px 8px',
          textAlign: 'center',
          backgroundColor: '#ecfdf5',
          borderRadius: 4
        }}>
          正在识别条码下方的文字，请稍候...
        </div>
      )}
    </div>
  );
}