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

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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
    const desired = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'];
    const formats = desired.filter(f => fmts.includes(f));
    if (!formats.length) return false;

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: highPrecision ? 1280 : 720 },
        height: { ideal: highPrecision ? 720 : 480 },
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

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
          firedRef.current = true; 
          stop(); 
          onDetected(String(txt)); 
          return;
        }
      } catch {}

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
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE
    ]);
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(hints as any);

    const size = highPrecision
      ? { width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 720 }, height: { ideal: 480 } };

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
        firedRef.current = true; 
        stop(); 
        onDetected(res.getText?.() ?? res.text ?? '');
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
      const formats = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']
        .filter(f => fmts.includes(f));
      
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
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE
        ]);
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
          style={{ 
            position: 'absolute', 
            inset: 0, 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover' 
          }}
        />
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
    </div>
  );
}