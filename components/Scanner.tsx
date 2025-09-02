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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const boostedRef = useRef(false);
  const engineRef = useRef<'native' | 'zxing' | null>(null);
  const captureLockRef = useRef(false);

  const [err, setErr] = useState('');
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canZoom, setCanZoom] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);

  const clearRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const stop = useCallback(() => {
    try { stopRef.current?.(); } catch {}
    stopRef.current = null;
    clearRaf();
    try {
      if (trackRef.current) {
        try { trackRef.current.applyConstraints({ advanced: [{ torch: false }] as any }); } catch {}
        trackRef.current.stop();
      }
    } catch {}
    trackRef.current = null;
    setCanTorch(false); setTorchOn(false);
    setCanZoom(false); setZoom(null);
  }, []);

  const initTrackCapabilities = useCallback(() => {
    const track = (videoRef.current?.srcObject as MediaStream | undefined)?.getVideoTracks?.()[0];
    if (!track) return;
    trackRef.current = track;
    const caps: any = track.getCapabilities?.() || {};
    if (caps.torch) setCanTorch(true);
    if (typeof caps.zoom === 'number') {
      setCanZoom(true); setZoomMin(caps.zoom); setZoomMax(caps.zoom); setZoom(caps.zoom);
    } else if (caps.zoom?.min != null && caps.zoom?.max != null) {
      setCanZoom(true); setZoomMin(caps.zoom.min); setZoomMax(caps.zoom.max);
      setZoom(Math.max(1, caps.zoom.min));
    }
  }, []);

  const toggleTorch = async () => {
    if (!trackRef.current || !canTorch) return;
    const next = !torchOn;
    try { await trackRef.current.applyConstraints({ advanced: [{ torch: next }] as any }); setTorchOn(next); } catch {}
  };

  const applyZoom = async (z: number) => {
    setZoom(z);
    if (!trackRef.current || !canZoom) return;
    try { await trackRef.current.applyConstraints({ advanced: [{ zoom: z }] as any }); } catch {}
  };

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
        width:  { ideal: highPrecision ? 2560 : 1280 },
        height: { ideal: highPrecision ? 1440 : 720 },
        advanced: [{ focusMode: 'continuous' } as any],
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();
    trackRef.current = stream.getVideoTracks()[0];
    initTrackCapabilities();

    if (!canvasRef.current) {
      const c = document.createElement('canvas'); c.style.display = 'none';
      canvasRef.current = c; document.body.appendChild(c);
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const Detector = (globalThis as any).BarcodeDetector;
    const detector = new Detector({ formats });

    const loop = async () => {
      if (firedRef.current) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(loop); return; }

      // 中央 ROI + 超采样
      const roiW = Math.floor(vw * 0.8), roiH = Math.floor(vh * 0.45);
      const sx = Math.floor((vw - roiW) / 2), sy = Math.floor((vh - roiH) / 2);
      const targetW = Math.min(1600, roiW * 2), scale = targetW / roiW, targetH = Math.floor(roiH * scale);
      canvas.width = targetW; canvas.height = targetH;
      (ctx as any).imageSmoothingEnabled = false;
      ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, targetW, targetH);

      try {
        const codes = await detector.detect(canvas);
        const txt = codes?.[0]?.rawValue;
        if (txt) {
          firedRef.current = true; stop(); onDetected(String(txt)); return;
        }
      } catch {}

      if (!boostedRef.current) {
        boostedRef.current = true;
        setTimeout(() => {
          if (canZoom && zoom != null && zoomMax > zoom) {
            applyZoom(Math.min(zoom * 1.6, zoomMax));
          }
        }, 1500);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    engineRef.current = 'native';
    loop();
    stopRef.current = () => { if (stream) stream.getTracks().forEach(t => t.stop()); clearRaf(); };
    return true;
  }, [applyZoom, canZoom, highPrecision, initTrackCapabilities, onDetected, stop, zoom, zoomMax]);

  const startZxing = useCallback(async () => {
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE
    ]);
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(hints as any);

    const size = highPrecision
      ? { width: { ideal: 2560 }, height: { ideal: 1440 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    const video = videoRef.current!;
    const controls = await readerRef.current.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, ...size, advanced: [{ focusMode: 'continuous' } as any] }, audio: false } as any,
      video,
      (res: any) => {
        if (!res || firedRef.current) return;
        firedRef.current = true; stop(); onDetected(res.getText?.() ?? res.text ?? '');
      }
    );

    const track = (video.srcObject as MediaStream | undefined)?.getVideoTracks?.()[0];
    if (track) { trackRef.current = track; initTrackCapabilities(); }

    stopRef.current = () => controls.stop();
    engineRef.current = 'zxing';
    return true;
  }, [highPrecision, initTrackCapabilities, onDetected, stop]);

  const start = useCallback(async () => {
    try {
      setErr(''); firedRef.current = false; boostedRef.current = false;
      const ok = await startNative(); if (ok) return; await startZxing();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') setErr('需要 HTTPS 才能启用摄像头（请用 https 访问）。');
      else if (/NotAllowedError/i.test(msg)) setErr('相机权限被拒绝，请在浏览器设置中允许使用相机。');
      else if (/OverconstrainedError|NotFoundError|DevicesNotFound/i.test(msg)) setErr('未检测到可用摄像头。');
      else setErr('启动摄像头失败：' + msg);
    }
  }, [startNative, startZxing]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setErr('当前浏览器不支持摄像头 API'); return; }
    start();
    return () => { stop(); };
  }, [start, stop]);

  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible' && !firedRef.current) start(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [start]);

  // —— 拍照/上传识别 ——（保留）
  async function detectNativeOn(source: ImageBitmap | HTMLCanvasElement): Promise<string> {
    try {
      const Detector = (globalThis as any).BarcodeDetector; if (typeof Detector !== 'function') return '';
      const fmts = await Detector.getSupportedFormats?.() || [];
      const formats = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'].filter(f => fmts.includes(f));
      if (!formats.length) return '';
      const res = await new Detector({ formats }).detect(source as any);
      return res?.[0]?.rawValue ? String(res[0].rawValue) : '';
    } catch { return ''; }
  }
  async function detectZxingFromBlob(blob: Blob): Promise<string> {
    try {
      const url = URL.createObjectURL(blob); const img = new Image(); img.decoding = 'sync'; img.src = url;
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      let r: any;
      try { r = await (readerRef.current as any).decodeFromImage(img); }
      catch { r = await (readerRef.current as any).decodeFromImageElement?.(img); }
      URL.revokeObjectURL(url);
      return r?.getText ? r.getText() : (r?.text || '');
    } catch { return ''; }
  }
  async function snapAndDetect() {
    if (captureLockRef.current) return; captureLockRef.current = true;
    try {
      let blob: Blob | null = null;
      if (trackRef.current && typeof (globalThis as any).ImageCapture === 'function') {
        try { const cap = new (globalThis as any).ImageCapture(trackRef.current); blob = await cap.takePhoto(); } catch {}
      }
      if (!blob) {
        const video = videoRef.current!, vw = video.videoWidth, vh = video.videoHeight;
        if (!canvasRef.current) { const c = document.createElement('canvas'); c.style.display = 'none'; canvasRef.current = c; document.body.appendChild(c); }
        const canvas = canvasRef.current!; const targetW = Math.max(1280, Math.min(2200, vw * 2.2)); const scale = targetW / Math.max(1, vw); const targetH = Math.round(vh * scale);
        canvas.width = targetW; canvas.height = targetH; const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        (ctx as any).imageSmoothingEnabled = false; ctx.drawImage(video, 0, 0, vw, vh, 0, 0, targetW, targetH);
        blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.95));
      }
      if (!blob) throw new Error('无法获取照片');

      const bmp = await createImageBitmap(blob);
      let code = await detectNativeOn(bmp); if (!code) code = await detectZxingFromBlob(blob);
      if (code && !firedRef.current) { firedRef.current = true; stop(); onDetected(code); }
      else alert('未识别到条码，请靠近/补光/保持条码平直后重试。');
    } catch (e: any) {
      alert('拍照识别失败：' + (e?.message || String(e)));
    } finally {
      captureLockRef.current = false;
    }
  }
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (captureLockRef.current) return; captureLockRef.current = true;
    try {
      const bmp = await createImageBitmap(file);
      let code = await detectNativeOn(bmp); if (!code) code = await detectZxingFromBlob(file);
      if (code && !firedRef.current) { firedRef.current = true; stop(); onDetected(code); }
      else alert('未识别到条码，请选择更清晰的照片重试。');
    } catch (e: any) {
      alert('图片识别失败：' + (e?.message || String(e)));
    } finally {
      e.target.value = '';
      captureLockRef.current = false;
    }
  }

  const btnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' };

  // 关键：根容器 height:100%，视频外包一层 flex:1 的容器，视频绝对铺满
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 工具条 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {canTorch && <button style={btnStyle} onClick={toggleTorch}>{torchOn ? '关手电' : '开手电'}</button>}
        {canZoom && zoom !== null && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="small">Zoom</span>
            <input type="range" min={zoomMin} max={zoomMax} step={0.1} value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))} style={{ width: 160 }} />
            <span className="small">{zoom.toFixed(1)}x</span>
          </div>
        )}
        <button style={btnStyle} onClick={snapAndDetect}>拍照识别（高清）</button>
        <label style={{ ...btnStyle, cursor: 'pointer', display: 'inline-block' }}>
          相册/拍照上传
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPickFile} />
        </label>
        <span className="small" style={{ opacity: 0.7 }}>引擎：{engineRef.current || '…'}</span>
      </div>

      {/* 视频区域 */}
      <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0, overflow: 'hidden', borderRadius: 12 }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />
      </div>

      {err && <div style={{ color: '#dc2626', fontSize: 12 }}>{err}</div>}
    </div>
  );
}
