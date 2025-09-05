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
  const captureLockRef = useRef(false);

  const [err, setErr] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [isFocused, setIsFocused] = useState(false);

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
    const desired = [
      'code_93',  // 优先Code 93
      'code_128', 'code_39', 'codabar', 'code_11',
      'ean_13', 'ean_8', 'upc_a', 'upc_e', 'upc_ean_extension',
      'qr_code', 'data_matrix', 'pdf417', 'aztec',
      'itf', 'rss_14', 'rss_expanded'
    ];
    const formats = desired.filter(f => fmts.includes(f));
    if (!formats.length) return false;
    
    const code93Supported = formats.includes('code_93');
    setDebugInfo(`原生检测器支持格式: ${formats.join(', ')}${code93Supported ? ' (Code 93优先)' : ' (Code 93不支持)'}`);

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: highPrecision ? 1280 : 720 },
        height: { ideal: highPrecision ? 720 : 480 },
        // 添加自动聚焦支持
        focusMode: { ideal: 'continuous' },
        focusDistance: { ideal: 0.1 }, // 近距离聚焦，适合扫码
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
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_93,  // 优先Code 93
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODABAR,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
      BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED
    ]);
    // 添加更多识别提示，特别优化Code 93
    hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
    hints.set(DecodeHintType.ASSUME_GS1, false);
    // Code 93专门优化
    hints.set(DecodeHintType.PURE_BARCODE, false); // Code 93需要静默区
    hints.set(DecodeHintType.ALSO_INVERTED, true); // 支持反色条码
    
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(hints as any);
    
    setDebugInfo('使用ZXing库进行识别 (Code 93优先)');

    const size = highPrecision
      ? { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.1 }
        } as any
      : { 
          width: { ideal: 720 }, 
          height: { ideal: 480 },
          // 添加自动聚焦支持
          focusMode: { ideal: 'continuous' },
          focusDistance: { ideal: 0.1 }
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

  // 拍照识别功能
  async function snapAndDetect() {
    if (captureLockRef.current) return; 
    captureLockRef.current = true;
    try {
      const video = videoRef.current!;
      if (!video.videoWidth || !video.videoHeight) {
        alert('摄像头未就绪');
        return;
      }

      if (!canvasRef.current) {
        const c = document.createElement('canvas');
        c.style.display = 'none';
        canvasRef.current = c;
        document.body.appendChild(c);
      }
      
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>(res => 
        canvas.toBlob(b => res(b), 'image/jpeg', 0.9)
      );

      if (!blob) throw new Error('无法获取照片');

      // 尝试使用原生检测
      const bmp = await createImageBitmap(blob);
      let code = await detectNativeOn(bmp); 
      
      // 如果原生检测失败，尝试 ZXing
      if (!code) code = await detectZxingFromBlob(blob);
      
      if (code && !firedRef.current) { 
        firedRef.current = true; 
        stop(); 
        onDetected(code); 
      } else {
        alert('未识别到条码，请靠近/补光/保持条码平直后重试。');
      }
    } catch (e: any) {
      alert('拍照识别失败：' + (e?.message || String(e)));
    } finally {
      captureLockRef.current = false;
    }
  }

  async function detectNativeOn(source: ImageBitmap | HTMLCanvasElement): Promise<string> {
    try {
      const Detector = (globalThis as any).BarcodeDetector; 
      if (typeof Detector !== 'function') return '';
      
      const fmts = await Detector.getSupportedFormats?.() || [];
      const formats = [
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
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_93,  // 优先Code 93
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODABAR,
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
          BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED
        ]);
        hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
        hints.set(DecodeHintType.ASSUME_GS1, false);
        // Code 93专门优化
        hints.set(DecodeHintType.PURE_BARCODE, false); // Code 93需要静默区
        hints.set(DecodeHintType.ALSO_INVERTED, true); // 支持反色条码
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
    
    if (captureLockRef.current) return; 
    captureLockRef.current = true;
    
    try {
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
      alert('图片识别失败：' + (e?.message || String(e)));
    } finally {
      e.target.value = '';
      captureLockRef.current = false;
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
        <button style={btnStyle} onClick={snapAndDetect}>
          拍照识别
        </button>
        <label style={{ ...btnStyle, cursor: 'pointer', display: 'inline-block' }}>
          从相册选择
          <input 
            type="file" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={onPickFile} 
          />
        </label>
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
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '4px 8px',
            borderRadius: 4
          }}>
            将条码对准此区域
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
    </div>
  );
}