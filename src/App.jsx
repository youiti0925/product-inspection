import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Layout, ClipboardList, Package, 
  PlayCircle, CheckCircle2, AlertTriangle, 
  Settings, Plus, Trash2, 
  BarChart3, Download,
  ArrowRight, Wifi, WifiOff,
  Clock, StopCircle, AlertOctagon,
  Map as MapIcon, Upload, Move,
  Camera, X, ChevronRight, ChevronLeft,
  Maximize2, Check, Play, SkipForward,
  FileText, Share2, FileSpreadsheet,
  Pencil, Save, ArrowUp, ArrowDown,
  Brush, Type, Square, Circle, MoveDiagonal, Undo2, Mic, Sparkles, Image as ImageIcon,
  FileUp, FileJson, DownloadCloud, RefreshCw,
  User, Calendar, LogOut, Users, Edit, Grip, LayoutGrid, MapPin, Eye, Filter, List,
  Bot, Zap, TrendingUp, Activity, Target, Timer, Layers, AlertCircle, Loader2, Database, ShieldCheck, HelpCircle, Copy, Radio, PenTool,
  Bell, BellRing, Megaphone, Search, CalendarDays, History, Palette, CheckSquare, LayoutList,
  ListChecks, ArrowUpDown, Calculator, Ruler, MicOff, Printer, Coffee, ChevronDown,
  Wrench, RotateCcw, XCircle
} from 'lucide-react';

// --- Firebase Imports (SDK v9) ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from "firebase/auth";

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// --- Global Constants & Config ---
// 修正: IDを固定化して、どの端末からでも同じデータを参照できるようにする
const APP_DATA_ID = "product-inspection-v1"; 

// ★★★ ここにあなたのFirebaseプロジェクトの設定値を貼り付けてください ★★★
const USER_DEFINED_CONFIG = {
  apiKey: "AIzaSyDiIS-TDH6MgXaLvG9T2VRioFDomQ_zQ9E",
  authDomain: "inspection-time-c4fd3.firebaseapp.com",
  projectId: "inspection-time-c4fd3",
  storageBucket: "inspection-time-c4fd3.firebasestorage.app",
  messagingSenderId: "750297489065",
  appId: "1:750297489065:web:b19e30920b2c68182fd3b8",
  measurementId: "G-MP8Z6ZFLZT"
};

// 環境変数（プレビュー用）またはユーザー定義の設定を使用
// ユーザー定義がある場合はそれを優先する
const FIREBASE_CONFIG = (USER_DEFINED_CONFIG.apiKey && USER_DEFINED_CONFIG.apiKey.length > 0)
  ? USER_DEFINED_CONFIG 
  : (typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {});


const COLORS = {
  primary: '#2563eb',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  slate: '#64748b'
};

const STAMPS = [
    { label: '①', val: '①' }, { label: '②', val: '②' }, { label: '③', val: '③' }, { label: '④', val: '④' }, { label: '⑤', val: '⑤' },
    { label: '✅', val: '✅' }, { label: '❌', val: '❌' }, { label: '⚠️', val: '⚠️' }, { label: '🔥', val: '🔥' }, { label: '⚡', val: '⚡' },
    { label: '👈', val: '👈' }, { label: '👉', val: '👉' }, { label: '🛑', val: '🛑' },
    { label: '確認', val: '確認' }, { label: 'ヨシ!', val: 'ヨシ!' }, { label: '危険', val: '危険' }, { label: 'OK', val: 'OK' }, { label: 'NG', val: 'NG' },
];

const INITIAL_MAP_ZONES = [
  // 上段
  { id: 'zone_inter_1', name: '中間分割1', x: 2, y: 5, w: 22, h: 40, color: 'bg-blue-50/80 border-blue-300' },
  { id: 'zone_inter_2', name: '中間分割2', x: 26, y: 5, w: 22, h: 40, color: 'bg-blue-50/80 border-blue-300' },
  { id: 'zone_inter_v', name: '中間分割縦', x: 50, y: 5, w: 22, h: 40, color: 'bg-indigo-50/80 border-indigo-300' },
  { id: 'zone_comp_v1', name: '完品分割縦1', x: 74, y: 5, w: 22, h: 40, color: 'bg-emerald-50/80 border-emerald-300' },
  // 下段
  { id: 'zone_assembly_1', name: '第一組立エリア', x: 2, y: 50, w: 22, h: 40, color: 'bg-amber-50/80 border-amber-300' },
  { id: 'zone_assembly_3', name: '第三組立エリア', x: 26, y: 50, w: 22, h: 40, color: 'bg-orange-50/80 border-orange-300' },
  { id: 'zone_comp_v2', name: '完品分割縦2', x: 50, y: 50, w: 22, h: 40, color: 'bg-emerald-50/80 border-emerald-300' },
  { id: 'zone_comp_h', name: '完品分割横', x: 74, y: 50, w: 22, h: 40, color: 'bg-emerald-50/80 border-emerald-300' },
];

const DEFAULT_DEFECT_PROCESS_OPTIONS = ['前班', '設計', '調達', '機械'];
const DEFAULT_COMPLAINT_OPTIONS = ['作業しづらい', '工具が不足', '手順が不明確', '品質に不安', 'その他'];
const DEFAULT_INDIRECT_CATEGORIES = ['改善', '準備', '会議', '教育', '片付け', '5S', 'その他'];

const ZONE_COLORS = [
  { name: 'ブルー', class: 'bg-blue-50/80 border-blue-300' },
  { name: 'アンバー', class: 'bg-amber-50/80 border-amber-300' },
  { name: 'スレート', class: 'bg-slate-50/80 border-slate-300' },
  { name: 'エメラルド', class: 'bg-emerald-50/80 border-emerald-300' },
  { name: 'インディゴ', class: 'bg-indigo-50/80 border-indigo-300' },
  { name: 'オレンジ', class: 'bg-orange-50/80 border-orange-300' },
];

// --- Font Size Configuration ---
const FONT_SIZE_AREAS = [
  { key: 'global', label: '全体ベース', default: 100, min: 70, max: 160, desc: 'アプリ全体の基準文字サイズ' },
  { key: 'header', label: 'ヘッダー・タブ', default: 100, min: 70, max: 160, desc: '上部ナビゲーション・タブ' },
  { key: 'dashboard', label: 'ダッシュボード', default: 100, min: 70, max: 160, desc: 'カード・マップ・ゾーン表示' },
  { key: 'execution', label: '作業実行画面', default: 100, min: 70, max: 160, desc: '作業モーダル・ボタン・タイマー' },
  { key: 'tables', label: 'テーブル・リスト', default: 100, min: 70, max: 160, desc: '検査リスト・完了履歴・分析' },
  { key: 'settings', label: '設定画面', default: 100, min: 70, max: 160, desc: 'マスタ設定・テンプレート編集' },
];

const applyFontSizes = (fontSizes = {}) => {
  const globalScale = (fontSizes.global || 100) / 100;
  document.documentElement.style.fontSize = (16 * globalScale) + 'px';
  const styleId = 'dynamic-font-sizes';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  const areas = ['header', 'dashboard', 'tables', 'settings'];
  const rules = areas.map(area => {
    const scale = (fontSizes[area] || 100) / 100;
    if (scale === 1) return '';
    return `[data-fs="${area}"] { zoom: ${scale}; }`;
  }).filter(Boolean);
  // execution: zoom on the fixed container, but compensate dimensions so it stays within viewport
  const execScale = (fontSizes.execution || 100) / 100;
  if (execScale !== 1) {
    rules.push(`[data-fs="execution"] { zoom: ${execScale}; width: ${100 / execScale}vw; height: ${100 / execScale}vh; left: 0; top: 0; transform-origin: top left; }`);
  }
  styleEl.textContent = rules.join('\n');
};

// --- Utilities ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatTime = (sec) => { 
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60); 
  const s = Math.floor(sec % 60); 
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; 
};
const toDatetimeLocal = (timestamp) => {
  const d = new Date(timestamp);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toDateShort = (timestamp) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return `${d.getMonth()+1}/${d.getDate()}`;
};
const formatDateSafe = (ts) => ts ? new Date(ts).toLocaleString() : '-';

const resizeImage = (file) => new Promise((resolve) => { const r = new FileReader(); r.onload = (e) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); const MAX = 1000; let w=i.width; let h=i.height; if(w>h){if(w>MAX){h*=MAX/w;w=MAX}}else{if(h>MAX){w*=MAX/h;h=MAX}} c.width=w; c.height=h; const ctx=c.getContext('2d'); if(ctx){ctx.drawImage(i,0,0,w,h); resolve(c.toDataURL('image/jpeg', 0.7));}else resolve(i.src); }; i.src = e.target?.result; }; r.readAsDataURL(file); });
const getBase64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => resolve(r.result); r.onerror = () => resolve(""); });

const calculateLotEstimatedTime = (lot) => {
  const perUnitTime = lot.steps.reduce((sum, step) => sum + (step.targetTime || 0), 0);
  return perUnitTime * (lot.quantity || 1);
};

// --- Measurement Utilities ---
const evaluateFormula = (formula, values) => {
  if (!formula) return null;
  try {
    let expr = formula;
    const vars = Object.keys(values).sort((a, b) => b.length - a.length);
    for (const v of vars) {
      const val = Number(values[v]);
      if (isNaN(val)) return null;
      expr = expr.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), val.toString());
    }
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
    return new Function('return ' + expr)();
  } catch { return null; }
};

// --- Block Gauge Preset Values ---
const BLOCK_GAUGE_PRESETS = [
  1.0, 1.001, 1.002, 1.003, 1.004, 1.005, 1.006, 1.007, 1.008, 1.009,
  1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09,
  1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
  2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
  20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0
];

const calculateMeasurementResult = (values, config) => {
  const entries = config.inputs.map(inp => ({ id: inp.id, val: Number(values[inp.id]) })).filter(e => !isNaN(e.val) && values[e.id] !== '' && values[e.id] != null);
  if (entries.length === 0) return null;
  const nums = entries.map(e => e.val);
  switch (config.calculation) {
    case 'max-min': return Math.max(...nums) - Math.min(...nums);
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'average': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'formula': return evaluateFormula(config.formula, values);
    case 'group-max-min': {
      const groups = {};
      entries.forEach(e => {
        const prefix = e.id.replace(/[0-9]/g, '');
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(e.val);
      });
      const groupMaxMins = Object.values(groups).map(g => Math.max(...g) - Math.min(...g));
      return Math.max(...groupMaxMins);
    }
    default: return null;
  }
};

const calculateSingleResult = (values, relevantInputs, calc) => {
  const entries = relevantInputs.map(inp => ({ id: inp.id, val: Number(values[inp.id]) })).filter(e => !isNaN(e.val) && values[e.id] !== '' && values[e.id] != null);
  if (entries.length === 0) return null;
  const nums = entries.map(e => e.val);
  switch (calc.method) {
    case 'max-min': return Math.max(...nums) - Math.min(...nums);
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'average': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'formula': return evaluateFormula(calc.formula, values);
    case 'group-max-min': {
      const groups = {};
      entries.forEach(e => {
        const inp = relevantInputs.find(i => i.id === e.id);
        const groupKey = inp?.group || e.id.replace(/[0-9]/g, '');
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(e.val);
      });
      const groupMaxMins = Object.values(groups).map(g => Math.max(...g) - Math.min(...g));
      return Math.max(...groupMaxMins);
    }
    default: return null;
  }
};

// --- Voice Assistant Utilities ---
// iOS Safari: speechSynthesisはユーザージェスチャーで一度アンロックが必要
let ttsUnlocked = false;
const unlockTTSForIOS = () => {
  if (ttsUnlocked || !window.speechSynthesis) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) { ttsUnlocked = true; return; }
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  u.lang = 'ja-JP';
  window.speechSynthesis.speak(u);
  ttsUnlocked = true;
};
// iOS Safari: speechSynthesisが15秒でポーズするバグ対策
let iosResumeInterval = null;
const startIOSResumeFix = () => {
  if (iosResumeInterval) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;
  iosResumeInterval = setInterval(() => {
    if (window.speechSynthesis?.speaking) window.speechSynthesis.resume();
  }, 5000);
};
const stopIOSResumeFix = () => {
  if (iosResumeInterval) { clearInterval(iosResumeInterval); iosResumeInterval = null; }
};

const speak = (text, onEnd, options = {}) => {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  startIOSResumeFix();
  const doSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = options.rate || 1.1;
    utterance.volume = options.volume ?? 1.0;
    // Use specified voice or find a Japanese voice
    if (options.voice) {
      utterance.voice = options.voice;
    } else if (options.voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const found = voices.find(v => v.name === options.voiceName);
      if (found) utterance.voice = found;
      else {
        const jaVoice = voices.find(v => v.lang.startsWith('ja'));
        if (jaVoice) utterance.voice = jaVoice;
      }
    } else {
      const voices = window.speechSynthesis.getVoices();
      const jaVoice = voices.find(v => v.lang.startsWith('ja'));
      if (jaVoice) utterance.voice = jaVoice;
    }
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = () => { console.warn('Speech error for:', text); onEnd?.(); };
    window.speechSynthesis.speak(utterance);
  };
  // Voices may not be loaded yet
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => { doSpeak(); window.speechSynthesis.onvoiceschanged = null; };
    // Fallback if voices never load
    setTimeout(() => { if (window.speechSynthesis.getVoices().length === 0) { doSpeak(); } }, 500);
  } else {
    doSpeak();
  }
};

let isSpeakingTTS = false;
const speakAsync = (text, options = {}) => new Promise(resolve => {
  isSpeakingTTS = true;
  speak(text, () => { isSpeakingTTS = false; resolve(); }, options);
});

// TTS再生が終わるまで待つ
const waitForTTSEnd = () => new Promise(resolve => {
  if (!isSpeakingTTS) { resolve(); return; }
  const check = setInterval(() => {
    if (!isSpeakingTTS) { clearInterval(check); setTimeout(resolve, 300); } // 300ms余裕
  }, 100);
  // 最大5秒で強制解除
  setTimeout(() => { clearInterval(check); isSpeakingTTS = false; resolve(); }, 5000);
});

const listenOnce = async (options = {}) => {
  // TTS再生中なら終わるまで待つ（自分の声を拾わないように）
  await waitForTTSEnd();

  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (options.onError) options.onError(isIOS
        ? '音声認識非対応: iOS/iPadOSではSafariの最新版（iOS 14.5以上）が必要です'
        : 'このブラウザは音声認識に対応していません（Chrome/Edgeを使用してください）');
      resolve(null); return;
    }
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;
    let resolved = false;
    const timeout = options.timeout || 10000;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; try { recognition.stop(); } catch {} resolve(options.defaultValue ?? null); }
    }, timeout);
    recognition.onaudiostart = () => {
      if (options.onListening) options.onListening();
    };
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(last[0].transcript); }
      } else {
        if (options.onInterim) options.onInterim(last[0].transcript);
      }
    };
    recognition.onerror = (e) => {
      console.warn('[listenOnce] error:', e.error, e.message);
      if (e.error === 'not-allowed') {
        if (options.onError) options.onError('マイクの使用が許可されていません。アドレスバーの🔒→サイトのアクセス許可→マイク→許可');
      } else if (e.error === 'no-speech') {
        // 無音 - 正常
      } else if (e.error === 'aborted') {
        // 中断 - 正常
      } else if (e.error === 'network') {
        if (options.onError) options.onError('音声認識サービスに接続できません。インターネット接続を確認してください');
      } else {
        if (options.onError) options.onError(`音声認識エラー: ${e.error}`);
      }
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
    };
    recognition.onend = () => { console.log('[listenOnce] onend, resolved:', resolved); if (!resolved) { resolved = true; clearTimeout(timer); resolve(options.defaultValue ?? null); } };
    try {
      recognition.start();
      console.log('[listenOnce] recognition.start() called, timeout:', timeout);
    } catch(e) {
      console.warn('Speech start failed:', e);
      if (options.onError) options.onError('音声認識の開始に失敗しました');
      resolve(null);
    }
  });
};

// Default voice command mappings
const DEFAULT_VOICE_COMMANDS = [
  { id: 'yes', label: 'はい（確認）', keywords: 'はい,うん,OK,オーケー,そう,イエス,yes', description: '確認・肯定の応答' },
  { id: 'no', label: 'いいえ（否定）', keywords: 'いいえ,いや,ダメ,違う,ノー,no', description: '否定の応答' },
  { id: 'complete', label: '完了', keywords: '完了,かんりょう,終わり,おわり,done', description: '現在の作業を完了' },
  { id: 'interrupt', label: '中断・不具合', keywords: '中断,ちゅうだん,止め,やめ,ストップ,stop', description: '不具合報告を開く' },
  { id: 'next', label: '次へ', keywords: '次,つぎ,next', description: '次の工程/台に進む' },
  { id: 'measurement', label: '測定入力', keywords: '測定入力,測定開始,そくてい', description: '測定の音声入力を開始' },
  { id: 'sequential', label: '通常モード', keywords: '通常,じゅんじょ,順序,ノーマル', description: '通常（順序）モードを選択' },
  { id: 'custom', label: 'カスタムモード', keywords: 'カスタム,自由,じゆう', description: 'カスタムモードを選択' },
  { id: 'batch', label: 'まとめて', keywords: 'まとめ,一括,バッチ', description: 'まとめて開始/完了' },
  { id: 'allComplete', label: '全作業完了', keywords: '全部完了,全作業完了,すべて完了', description: '全工程を完了する' },
];

// Build matcher from voice commands config
const buildVoiceMatcher = (voiceCommands) => {
  const map = {};
  const cmds = voiceCommands || DEFAULT_VOICE_COMMANDS;
  cmds.forEach(cmd => {
    const words = cmd.keywords.split(',').map(w => w.trim()).filter(Boolean);
    const pattern = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    map[cmd.id] = (text) => {
      if (!text) return false;
      return pattern.test(text) || pattern.test(normalizeVoiceText(text));
    };
  });
  return map;
};

// Fallback matchers (used when no settings loaded) - normalize input
const isYesResponse = (text) => { const t = normalizeVoiceText(text); return /はい|うん|OK|オーケー|そう|イエス|yes/i.test(t); };
const isNoResponse = (text) => { const t = normalizeVoiceText(text); return /いいえ|いや|ダメ|違う|ノー|no/i.test(t); };
const isCompleteCmd = (text) => { const t = normalizeVoiceText(text); return /完了|かんりょう|終わり|おわり|done/i.test(t); };
const isInterruptCmd = (text) => { const t = normalizeVoiceText(text); return /中断|ちゅうだん|止め|やめ|ストップ|stop/i.test(t); };
const isNextCmd = (text) => { const t = normalizeVoiceText(text); if (/次工程|次の工程/i.test(t)) return false; return /^(次|つぎ|next)$/i.test(t?.trim()) || /次へ|つぎへ/i.test(t); };
const isNextStepCmd = (text) => { const t = normalizeVoiceText(text); return /次工程|次の工程|つぎこうてい|つぎのこうてい/i.test(t); };
const isCancelCmd = (text) => { const t = normalizeVoiceText(text); return /キャンセル|取り消し|とりけし|cancel/i.test(t); };

const calculateMeasurementResults = (values, config) => {
  const calculations = config.calculations || [{
    id: 'default',
    label: '計算結果',
    method: config.calculation,
    formula: config.formula,
    inputIds: [],
    toleranceUpper: config.toleranceUpper,
    toleranceLower: config.toleranceLower,
    unit: config.unit
  }];

  return calculations.map(calc => {
    const relevantInputs = calc.inputIds?.length > 0
      ? config.inputs.filter(inp => calc.inputIds.includes(inp.id))
      : config.inputs;
    const result = calculateSingleResult(values, relevantInputs, calc);
    const isOk = result !== null
      ? result >= (calc.toleranceLower ?? -Infinity) && result <= (calc.toleranceUpper ?? Infinity)
      : null;
    return { ...calc, result, isOk };
  });
};

// 音声テキスト正規化: 誤変換補正 + 全角→半角 + 漢数字→数字
const normalizeVoiceText = (text) => {
  if (!text) return '';
  let t = text;
  // 音声認識の誤変換補正（同音異字）
  const homophones = {
    '皇帝': '工程', '号艇': '工程', '後程': '工程', '高低': '工程', '肯定': '工程', 'こうてい': '工程',
    '交代': '工程', '好転': '工程', '公定': '工程', '行程': '工程', '校庭': '工程', '口頭': '工程',
    '代目': '台目', 'だいめ': '台目', '大目': '台目', '題目': '台目',
    '完了': '完了', 'かんりょう': '完了',
    '中断': '中断', 'ちゅうだん': '中断',
    '測定': '測定', 'そくてい': '測定',
    '次': '次', 'つぎ': '次',
  };
  Object.entries(homophones).forEach(([k, v]) => {
    if (k !== v) t = t.replace(new RegExp(k, 'g'), v);
  });
  // 全角数字→半角
  t = t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // 全角英字→半角
  t = t.replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // 漢数字→半角 (位取り対応: 百/十)
  const kanjiMap = { '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100 };
  // ひらがな数字→半角
  const hiraMap = { 'いち': '1', 'に': '2', 'さん': '3', 'し': '4', 'よん': '4', 'ご': '5', 'ろく': '6', 'なな': '7', 'しち': '7', 'はち': '8', 'きゅう': '9', 'く': '9', 'じゅう': '10' };
  // ひらがな数字→数字 (長い順にマッチ)
  Object.entries(hiraMap).sort((a,b) => b[0].length - a[0].length).forEach(([k, v]) => {
    t = t.replace(new RegExp(k, 'g'), v);
  });
  // 漢数字の位取り変換: 二十三→23, 十五→15 etc
  t = t.replace(/([一二三四五六七八九]?)百([一二三四五六七八九]?十?[一二三四五六七八九]?)/g, (_, h, rest) => {
    let val = (h ? kanjiMap[h] : 1) * 100;
    const tenMatch = rest.match(/([一二三四五六七八九]?)十([一二三四五六七八九]?)/);
    if (tenMatch) {
      val += (tenMatch[1] ? kanjiMap[tenMatch[1]] : 1) * 10;
      if (tenMatch[2]) val += kanjiMap[tenMatch[2]];
    } else {
      // 残り1文字の漢数字
      for (const c of rest) { if (kanjiMap[c] !== undefined && kanjiMap[c] < 10) val += kanjiMap[c]; }
    }
    return String(val);
  });
  t = t.replace(/([一二三四五六七八九]?)十([一二三四五六七八九]?)/g, (_, tens, ones) => {
    return String((tens ? kanjiMap[tens] : 1) * 10 + (ones ? kanjiMap[ones] : 0));
  });
  // 残りの単独漢数字
  t = t.replace(/[零〇一二三四五六七八九]/g, c => String(kanjiMap[c]));
  // 連続数字を結合しない（"1 0" → そのまま）
  return t;
};

const parseJapaneseNumber = (text) => {
  if (!text) return null;
  const norm = normalizeVoiceText(text);
  const direct = norm.replace(/[,\s]/g, '');
  if (/^[+-]?\d+\.?\d*$/.test(direct)) return parseFloat(direct);
  let cleaned = norm.replace(/プラス/g, '+').replace(/マイナス/g, '-').replace(/てん|点/g, '.').replace(/ミリ|mm/g, '');
  const numMatch = cleaned.match(/[+-]?\d+\.?\d*/);
  if (numMatch) return parseFloat(numMatch[0]);
  return null;
};

const getPastMeasurementData = (lots, model, stepId) => {
  const results = [];
  lots.forEach(lot => {
    if (lot.status !== 'completed' || lot.model !== model || !lot.measurementResults) return;
    Object.entries(lot.measurementResults).forEach(([key, result]) => {
      if (key.startsWith(stepId + '-')) results.push(result);
    });
  });
  return results;
};

const getPastInputStats = (pastData, inputId) => {
  const vals = pastData.map(d => d.values?.[inputId]).filter(v => v != null && !isNaN(Number(v))).map(Number);
  if (vals.length === 0) return null;
  return {
    last: vals[vals.length - 1],
    avg: (vals.reduce((a, b) => a + b, 0) / vals.length),
    count: vals.length
  };
};

// --- Measurement Layout Presets ---
const MEASUREMENT_LAYOUTS = {
  'circle-4point': {
    label: '円形4点',
    inputs: [
      { id: 'p0', label: '0°', x: 50, y: 8 },
      { id: 'p90', label: '90°', x: 88, y: 50 },
      { id: 'p180', label: '180°', x: 50, y: 88 },
      { id: 'p270', label: '270°', x: 8, y: 50 }
    ]
  },
  'grid-4x4': {
    label: 'グリッド4x4',
    inputs: ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4'].map((id, i) => ({
      id, label: id, x: 15 + (i % 4) * 25, y: 15 + Math.floor(i / 4) * 25
    }))
  },
  'linear-horizontal': {
    label: '直線(横)',
    inputs: [
      { id: 'l1', label: '①', x: 15, y: 50 },
      { id: 'l2', label: '②', x: 38, y: 50 },
      { id: 'l3', label: '③', x: 62, y: 50 },
      { id: 'l4', label: '④', x: 85, y: 50 }
    ]
  },
  'linear-vertical': {
    label: '直線(縦)',
    inputs: [
      { id: 'l1', label: '①', x: 50, y: 15 },
      { id: 'l2', label: '②', x: 50, y: 38 },
      { id: 'l3', label: '③', x: 50, y: 62 },
      { id: 'l4', label: '④', x: 50, y: 85 }
    ]
  },
  'height-comparison': {
    label: '高さ比較測定',
    inputs: [
      { id: 'block', label: 'ブロックゲージ', x: 30, y: 30 },
      { id: 'dial', label: 'ダイヤルゲージ', x: 70, y: 30 }
    ]
  },
  'center-height': {
    label: 'センターハイト',
    inputs: [
      { id: 'a', label: '穴上部(a)', x: 50, y: 20 },
      { id: 'b', label: '穴下部(b)', x: 50, y: 50 },
      { id: 'c', label: '反対側(c)', x: 50, y: 70 },
      { id: 'd', label: '穴径(d)', x: 80, y: 35 }
    ]
  },
  'custom': { label: 'カスタム', inputs: [] }
};

const CALCULATION_METHODS = [
  { value: 'max-min', label: '最大-最小', desc: '入力値の最大と最小の差' },
  { value: 'sum', label: '合計', desc: '全入力値の合計 (例: ブロックゲージ+ダイヤルゲージ)' },
  { value: 'average', label: '平均', desc: '入力値の平均' },
  { value: 'group-max-min', label: 'グループ別最大差', desc: 'グループ(A,B,C,D)内の最大差→最大' },
  { value: 'formula', label: 'カスタム数式', desc: '自由な計算式 例: (b+c)/2+d/2' }
];

// --- Mock Data ---
const DEMO_STEPS = [
  { id: 's1', title: '外観確認', description: 'キズ、汚れがないか目視で確認してください。', type: 'normal', executionMode: 'individual', targetTime: 30, images: [] },
  { id: 's2', title: '自動加工', description: 'マシンにセットして開始ボタンを押してください。\n※加工中は他の作業が可能です。', type: 'normal', executionMode: 'batch', targetTime: 120, images: [] },
  { id: 's3', title: '梱包', description: '付属品を確認して梱包してください。', type: 'normal', executionMode: 'individual', targetTime: 60, images: [] },
];

// --- 1. Basic Components ---

const WorkerBadge = ({ id, workers }) => {
  const w = workers.find(w => w.id === id);
  if (!w) return <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded">未割当</span>;
  return (
    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1 rounded flex items-center gap-1 border border-slate-200 truncate max-w-[80px]">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>{w.name}
    </span>
  );
};

const LotCard = ({ lot, workers, templates, mapZones, onOpenExecution, saveData, setDraggedLotId, draggedLotId, variant = 'full', onEdit, onDelete, onMove }) => {
  const touchRef = useRef({ timer: null, dragging: false, ghost: null, startX: 0, startY: 0 });
  const cardRef = useRef(null);

  const handleTouchStart = (e) => {
    if (lot.status === 'completed') return;
    const touch = e.touches[0];
    const t = touchRef.current;
    t.startX = touch.clientX; t.startY = touch.clientY; t.dragging = false;
    t.timer = setTimeout(() => {
      t.dragging = true;
      try { if (navigator.vibrate) navigator.vibrate(50); } catch(ex) {}
      if (setDraggedLotId) setDraggedLotId(lot.id);
      // ゴースト作成
      const rect = cardRef.current?.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.id = 'touch-drag-ghost';
      ghost.innerHTML = `<div style="font-weight:bold;font-size:14px">${lot.orderNo}</div><div style="font-size:12px">${lot.model || ''}</div>`;
      ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;background:#fff;border:2px solid #3b82f6;border-radius:12px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0.9;transform:translate(-50%,-50%);left:${touch.clientX}px;top:${touch.clientY}px;min-width:80px;text-align:center;`;
      document.body.appendChild(ghost);
      t.ghost = ghost;
      // ドロップゾーンをハイライト
      document.querySelectorAll('[data-drop-zone]').forEach(el => {
        el.style.outline = '3px dashed #3b82f6';
        el.style.outlineOffset = '-3px';
      });
    }, 400);
  };

  const handleTouchMove = (e) => {
    const t = touchRef.current;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - t.startX), dy = Math.abs(touch.clientY - t.startY);
    if (!t.dragging && (dx > 10 || dy > 10)) { clearTimeout(t.timer); t.timer = null; return; }
    if (!t.dragging) return;
    e.preventDefault();
    if (t.ghost) { t.ghost.style.left = touch.clientX + 'px'; t.ghost.style.top = touch.clientY + 'px'; }
    // ホバー中のゾーンをハイライト
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    document.querySelectorAll('[data-drop-zone]').forEach(z => z.style.background = '');
    const zone = el?.closest?.('[data-drop-zone]');
    if (zone) zone.style.background = 'rgba(59,130,246,0.15)';
  };

  const handleTouchEnd = (e) => {
    const t = touchRef.current;
    if (t.timer) { clearTimeout(t.timer); t.timer = null; }
    // ゴースト削除 & ハイライト解除
    if (t.ghost) { t.ghost.remove(); t.ghost = null; }
    document.querySelectorAll('[data-drop-zone]').forEach(el => { el.style.outline = ''; el.style.outlineOffset = ''; el.style.background = ''; });
    if (!t.dragging) return;
    t.dragging = false;
    if (setDraggedLotId) setDraggedLotId(null);
    // ドロップ先検出
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = el?.closest?.('[data-drop-zone]');
    if (zone) {
      const zoneId = zone.getAttribute('data-drop-zone');
      const workerId = zone.getAttribute('data-worker-id') || null;
      if (window.__handleMoveLot) window.__handleMoveLot(lot.id, zoneId, workerId);
    }
  };

  const touchProps = lot.status !== 'completed' ? {
    onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd, onTouchMove: handleTouchMove, onTouchCancel: handleTouchEnd,
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'auto' }
  } : {};
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    let interval;
    if (lot.status === 'processing' && lot.workStartTime) {
      setElapsed(Date.now() - lot.workStartTime);
      interval = setInterval(() => {
        setElapsed(Date.now() - lot.workStartTime);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [lot.status, lot.workStartTime]);

  const totalSeconds = Math.floor(((lot.totalWorkTime || 0) + elapsed) / 1000);
  const timeDisplay = formatTime(totalSeconds);
  const currentStep = lot.steps?.[lot.currentStepIndex];
  const stepName = currentStep ? currentStep.title : '完了';
  
  let progress = 0;
  if (lot.tasks) {
      const totalTasks = lot.steps.length * lot.quantity;
      const completedTasks = Object.values(lot.tasks).filter(t => t.status === 'completed').length;
      progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  } else {
      progress = lot.steps ? (lot.currentStepIndex / lot.steps.length) * 100 : 0;
  }
  
  const templateName = templates?.find(t => t.id === lot.templateId)?.name || '';
  const zoneName = mapZones?.find(z => z.id === lot.mapZoneId)?.name || '';
  
  const styleClass = `relative w-full cursor-grab active:cursor-grabbing mb-2 shadow-sm bg-white border transition-all rounded-xl`;
  const borderClass = lot.status === 'processing' ? 'border-blue-500 ring-2 ring-blue-100' : lot.status === 'error' ? 'border-rose-400 bg-rose-50' : lot.status === 'completed' ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-blue-400';

  if (variant === 'dashboard-arrival') {
    return (
      <div ref={cardRef}
        draggable={lot.status !== 'completed'}
        onDragStart={(e) => { e.dataTransfer.setData('lotId', lot.id); setDraggedLotId(lot.id); e.stopPropagation(); }}
        onDragEnd={() => setDraggedLotId(null)}
        onClick={() => onEdit(lot)}
        {...touchProps}
        className={`${styleClass} ${borderClass} p-3 hover:shadow-md`}
      >
        <div className="flex justify-between items-start">
           <div>
             <div className="text-xs text-slate-500 font-bold mb-0.5">指図: {lot.orderNo}</div>
             <div className="text-lg font-black text-slate-800 leading-tight">{lot.model}</div>
           </div>
           <div className="text-right">
             <div className="text-xl font-black text-blue-600">{lot.quantity}<span className="text-xs text-slate-500 font-normal ml-0.5">台</span></div>
             <div className="text-xs text-slate-400">{toDateShort(lot.entryAt)}入庫</div>
           </div>
        </div>
      </div>
    );
  }

  if (variant === 'dashboard-map') {
    return (
      <div ref={cardRef}
        draggable={lot.status !== 'completed'}
        onDragStart={(e) => { e.dataTransfer.setData('lotId', lot.id); setDraggedLotId(lot.id); e.stopPropagation(); }}
        onDragEnd={() => setDraggedLotId(null)}
        onClick={() => lot.mapZoneId && lot.status !== 'completed' && onOpenExecution(lot)}
        {...touchProps}
        className={`${styleClass} ${borderClass} p-1.5 hover:scale-105 transition-transform`}
      >
        <div className="flex flex-col">
           <div className="text-[10px] text-slate-500 font-bold leading-none mb-0.5">{lot.orderNo}</div>
           <div className="text-sm font-black text-slate-800 leading-tight truncate">{lot.model}</div>
           {lot.status === 'processing' && <div className="mt-1 h-1 bg-blue-100 rounded overflow-hidden"><div className="h-full bg-blue-500 animate-pulse" style={{width: '100%'}}></div></div>}
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef}
      draggable={lot.status !== 'completed'}
      onDragStart={(e) => { e.dataTransfer.setData('lotId', lot.id); setDraggedLotId(lot.id); e.stopPropagation(); }}
      onDragEnd={() => setDraggedLotId(null)}
      onClick={() => lot.mapZoneId && lot.status !== 'completed' && onOpenExecution(lot)}
      {...touchProps}
      className={`${styleClass} ${borderClass} ${draggedLotId === lot.id ? 'opacity-50' : 'opacity-100'} group`}
    >
      <div className="absolute top-1 right-1 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e)=>{e.stopPropagation(); onEdit(lot);}} className="p-1 bg-white rounded border hover:bg-blue-50 text-slate-500"><Pencil className="w-3 h-3"/></button>
        <button onClick={(e)=>{e.stopPropagation(); onDelete(lot.id);}} className="p-1 bg-white rounded border hover:bg-red-50 text-red-400"><Trash2 className="w-3 h-3"/></button>
      </div>

      <div className="px-1.5 py-1">
        <div className="flex items-baseline gap-1.5 flex-wrap leading-none">
          <span className="font-black text-base text-slate-800">{lot.orderNo}</span>
          <span className="font-bold text-base text-slate-700">{lot.model}</span>
          <span className="text-sm font-bold text-slate-500 shrink-0 ml-auto">{lot.quantity}台</span>
        </div>
        <div className="flex items-baseline gap-1.5 leading-none mt-0.5">
          {templateName && <span className="text-xs text-slate-600 font-medium truncate">{templateName}</span>}
          {lot.entryAt && <span className="text-xs text-slate-500 shrink-0 ml-auto">{new Date(lot.entryAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        {(lot.workerId || lot.mapZoneId) && variant !== 'simple' && (
          <div className="flex items-center justify-between leading-none mt-0.5">
             <WorkerBadge id={lot.workerId} workers={workers} />
             <span className={`text-xs font-mono ${lot.status === 'processing' ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{timeDisplay}</span>
          </div>
        )}
        {variant !== 'simple' && (lot.workerId || lot.mapZoneId) && (
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
            <div className={`h-full transition-all ${lot.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${lot.status === 'completed' ? 100 : progress}%` }} />
          </div>
        )}
        {lot.status === 'error' && (
          <button onClick={(e) => { e.stopPropagation(); saveData('lots', lot.id, { status: 'waiting' }); }} className="w-full mt-0.5 bg-white border border-rose-300 text-rose-600 text-[10px] py-0.5 rounded hover:bg-rose-50 font-medium z-20 relative">復帰</button>
        )}
      </div>
    </div>
  );
};

const WorkerSummaryCard = ({ worker, lots }) => {
  const plannedLots = lots.filter(l => l.location === 'planned' && l.workerId === worker.id);
  const plannedTime = plannedLots.reduce((acc, lot) => acc + calculateLotEstimatedTime(lot), 0);
  const completedLots = lots.filter(l => l.location === 'completed' && l.workerId === worker.id);
  const completedTime = completedLots.reduce((acc, lot) => acc + (lot.totalWorkTime || 0)/1000, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b pb-2">
         <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            <User className="w-5 h-5"/>
         </div>
         <span className="font-bold text-lg text-slate-800">{worker.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
         <div className="bg-blue-50 rounded p-2">
            <div className="text-[10px] text-blue-500 font-bold mb-1">予定(残)</div>
            <div className="text-base font-black text-blue-700 font-mono">{formatTime(plannedTime)}</div>
         </div>
         <div className="bg-emerald-50 rounded p-2">
            <div className="text-[10px] text-emerald-500 font-bold mb-1">実績(済)</div>
            <div className="text-base font-black text-emerald-700 font-mono">{formatTime(completedTime)}</div>
         </div>
      </div>
    </div>
  );
};

const ZoneList = ({ id, title, icon: Icon, color, border, children, onDropLot, onClickHeader, active = false }) => (
  <div
    data-drop-zone={id}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      const lotId = e.dataTransfer.getData('lotId');
      if (lotId) onDropLot(lotId, id);
    }}
    className={`rounded-xl border-2 flex flex-col transition-all duration-300 ${color} ${border} h-full ${active ? 'ring-4 ring-blue-200 shadow-xl scale-[1.01]' : 'hover:shadow-md'}`}
  >
    <div 
      onClick={onClickHeader}
      className={`p-3 border-b border-black/5 flex justify-between items-center bg-white/60 rounded-t-[10px] backdrop-blur-sm cursor-pointer hover:bg-white/80 group`}
    >
      <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm group-hover:text-blue-600 transition-colors">
        <Icon className="w-4 h-4 opacity-70" /> {title}
        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
           <Maximize2 className="w-3 h-3"/> Clickで拡大
        </span>
      </h2>
      <span className="text-xs font-bold bg-white/80 px-2 py-0.5 rounded text-slate-500 border border-black/5">{React.Children.count(children)}</span>
    </div>
    <div className="flex-1 p-2 overflow-y-auto min-h-[100px]">
      {children}
    </div>
  </div>
);

// ----------------------------------------------------------------------
// 2. Complex & Functional Components
// ----------------------------------------------------------------------

const InteractiveMap = ({ lots, workers, templates, handleMoveLot, saveData, setDraggedLotId, draggedLotId, onEditLot, onDeleteLot, setExecutionLotId, settings, handleImageUpload, saveSettings, mapZones, isDashboard = false }) => {
  const [isLayoutMode, setIsLayoutMode] = useState(false);
  const [localZones, setLocalZones] = useState(mapZones);
  const mapRef = useRef(null);

  // エリアフィルター: localStorage から復元
  const storageKey = 'areaFilter_hidden';
  const [hiddenZones, setHiddenZones] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [showFilterBar, setShowFilterBar] = useState(false);
  const toggleZoneFilter = (zoneId) => {
    setHiddenZones(prev => {
      const next = prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };
  const visibleZones = localZones.filter(z => !hiddenZones.includes(z.id));
  const isFiltered = hiddenZones.length > 0;

  useEffect(() => {
    setLocalZones(mapZones);
  }, [mapZones]);

  const handleZoneDragStart = (e, zoneId) => {
    if (!isLayoutMode) return;
    e.dataTransfer.setData('zoneId', zoneId);
    e.stopPropagation();
  };

  const handleMapDrop = (e) => {
    e.preventDefault();
    if (!mapRef.current) return;
    
    const zoneId = e.dataTransfer.getData('zoneId');
    if (zoneId && isLayoutMode) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const newZones = localZones.map(z => z.id === zoneId ? { ...z, x: Math.max(0, Math.min(100-z.w, x)), y: Math.max(0, Math.min(100-z.h, y)) } : z);
      setLocalZones(newZones);
    }
  };

  const saveLayout = () => {
    saveSettings({ mapZones: localZones });
    setIsLayoutMode(false);
  };

  const headerContent = (
      <div className="shrink-0 z-20">
        <div className="p-3 bg-white/90 backdrop-blur border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-slate-800 flex items-center gap-2"><MapIcon className="w-5 h-5 text-blue-600" /> 作業エリア</h2>
          <div className="flex items-center gap-2">
             <button onClick={() => setShowFilterBar(v => !v)} className={`text-xs flex items-center gap-1 px-2 py-1 rounded border font-bold transition-colors ${isFiltered ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
               <Filter className="w-3 h-3" /> 表示{isFiltered ? `(${visibleZones.length}/${localZones.length})` : ''}
             </button>
             <label className="text-xs flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded border">
                <Upload className="w-3 h-3" /> 背景
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
             </label>
             <button onClick={() => isLayoutMode ? saveLayout() : setIsLayoutMode(true)} className={`text-xs flex items-center gap-1 px-3 py-1 rounded border font-bold transition-colors ${isLayoutMode ? 'bg-green-600 text-white border-green-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
               {isLayoutMode ? <><Save className="w-3 h-3"/> レイアウト保存</> : <><LayoutGrid className="w-3 h-3"/> レイアウト編集</>}
             </button>
          </div>
        </div>
        {showFilterBar && (
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-slate-500 font-bold mr-1">エリア:</span>
            {localZones.map(zone => {
              const isVisible = !hiddenZones.includes(zone.id);
              const lotCount = lots.filter(l => l.mapZoneId === zone.id && l.location !== 'completed').length;
              return (
                <button key={zone.id} onClick={() => toggleZoneFilter(zone.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-bold border transition-all flex items-center gap-1 ${isVisible ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                >
                  {zone.name}
                  {lotCount > 0 && <span className={`text-[9px] px-1 rounded-full ${isVisible ? 'bg-white/20' : 'bg-slate-100'}`}>{lotCount}</span>}
                </button>
              );
            })}
            {isFiltered && (
              <button onClick={() => { setHiddenZones([]); localStorage.removeItem(storageKey); }} className="text-[10px] text-slate-400 hover:text-red-500 ml-1 underline">全表示</button>
            )}
          </div>
        )}
      </div>
  );

  return (
    <div className={`rounded-xl border-2 border-blue-400 h-full shadow-lg relative bg-white overflow-hidden flex flex-col ${isDashboard ? 'cursor-pointer' : ''}`}>
       {!isDashboard && headerContent}
       {isDashboard && (
         <div className="absolute top-2 left-2 z-30 bg-white/80 backdrop-blur px-3 py-1 rounded-full border shadow-sm pointer-events-none">
           <span className="text-xs font-bold text-blue-800 flex items-center gap-1"><MapIcon className="w-3 h-3"/> 作業エリア (Clickで拡大)</span>
         </div>
       )}
       <div ref={mapRef} onDragOver={(e) => e.preventDefault()} onDrop={handleMapDrop}
         className={`flex-1 bg-slate-50 overflow-hidden ${isFiltered && !isLayoutMode ? 'grid gap-2 p-2' : 'relative'}`}
         style={isFiltered && !isLayoutMode
           ? { gridTemplateColumns: `repeat(auto-fit, minmax(${visibleZones.length === 1 ? '100%' : visibleZones.length === 2 ? '45%' : '280px'}, 1fr))` }
           : { backgroundImage: settings.mapImage ? `url(${settings.mapImage})` : 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: settings.mapImage ? 'contain' : '20px 20px', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
         }
       >
         {(isFiltered && !isLayoutMode ? visibleZones : localZones).map(zone => (
           <div key={zone.id} data-drop-zone={zone.id} draggable={isLayoutMode} onDragStart={(e) => handleZoneDragStart(e, zone.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const lotId = e.dataTransfer.getData('lotId'); if (lotId && !isLayoutMode) { handleMoveLot(lotId, zone.id); }}}
             className={`border-2 rounded-lg flex flex-col overflow-hidden transition-all ${zone.color || 'bg-white/80 border-slate-300'} ${isLayoutMode ? 'absolute cursor-move border-dashed border-blue-500 z-50' : isFiltered ? 'min-h-[200px]' : 'absolute z-10'}`}
             style={isLayoutMode || !isFiltered ? { left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` } : {}}
           >
             <div className="bg-black/10 px-2 py-1 text-[10px] font-bold text-slate-700 truncate select-none flex justify-between shrink-0"><span>{zone.name}</span><span className="bg-white/50 px-1 rounded">{lots.filter(l => l.mapZoneId === zone.id && l.location !== 'completed').length}</span></div>
             <div className="flex-1 overflow-y-auto p-1 space-y-1">
               {lots.filter(l => l.mapZoneId === zone.id && l.location !== 'completed').map(lot => (
                 <LotCard
                   key={lot.id} lot={lot} workers={workers} templates={templates} mapZones={mapZones}
                   onOpenExecution={(l) => setExecutionLotId(l.id)}
                   saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId}
                   onEdit={onEditLot} onDelete={onDeleteLot}
                   variant={isDashboard ? 'dashboard-map' : 'full'}
                 />
               ))}
               {lots.filter(l => l.mapZoneId === zone.id && l.location !== 'completed').length === 0 && !isLayoutMode && !isDashboard && (<div className="h-full flex items-center justify-center text-black/10 text-[10px]">Drop Here</div>)}
             </div>
             {isLayoutMode && <div className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-nwse-resize rounded-tl"/>}
           </div>
         ))}
       </div>
    </div>
  );
};

// --- Note Modal ---
// --- Indirect Work Modal ---
const IndirectWorkModal = ({ categories, activeIndirect, onStart, onStop, onClose }) => {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2"><Coffee className="w-5 h-5"/> 間接作業</h2>
          <button onClick={onClose}><X className="w-5 h-5"/></button>
        </div>
        {activeIndirect ? (
          <div className="p-6 text-center">
            <div className="text-sm text-slate-500 mb-1">実行中</div>
            <div className="text-2xl font-black text-amber-700 mb-4">{activeIndirect.category}</div>
            <div className="text-4xl font-mono font-black text-amber-600 mb-6" id="indirect-timer">計測中...</div>
            <button onClick={onStop} className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-lg">停止して記録</button>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 gap-3">
            {categories.map(cat => (
              <button key={cat} onClick={() => onStart(cat)} className="py-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 rounded-xl font-bold text-amber-800 text-sm transition-all hover:scale-105">{cat}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Daily Summary Modal ---
const DailySummaryModal = ({ lots, indirectWork, currentUserName, workers, settings, saveData, onClose }) => {
  const today = new Date().toISOString().split('T')[0];
  const [tab, setTab] = useState('daily'); // 'daily' | 'analysis'
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedWorkers, setSelectedWorkers] = useState(currentUserName ? [currentUserName] : []);
  const [searchText, setSearchText] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addDuration, setAddDuration] = useState('');
  const [addNote, setAddNote] = useState('');
  const categories = settings?.indirectCategories || DEFAULT_INDIRECT_CATEGORIES;
  const allWorkerNames = [...new Set([...workers.map(w => w.name), ...indirectWork.map(w => w.workerName).filter(Boolean)])];

  const toggleWorker = (name) => setSelectedWorkers(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const selectAll = () => setSelectedWorkers(allWorkerNames);
  const isAllSelected = selectedWorkers.length === allWorkerNames.length;

  const fromTs = new Date(dateFrom); fromTs.setHours(0,0,0,0);
  const toTs = new Date(dateTo); toTs.setHours(23,59,59,999);
  const isSingleDay = dateFrom === dateTo;

  // 直工集計
  const directDetails = [];
  lots.forEach(lot => {
    if (!lot.tasks) return;
    Object.entries(lot.tasks).forEach(([key, task]) => {
      if (selectedWorkers.length > 0 && !selectedWorkers.includes(task.workerName)) return;
      if (!task.duration || task.duration <= 0) return;
      const taskEnd = (task.startTime || lot.workStartTime || lot.createdAt || 0) + (task.duration * 1000);
      if (taskEnd < fromTs.getTime() || taskEnd > toTs.getTime() + 86400000) return;
      const step = lot.steps?.find(s => key.startsWith(s.id + '-')) || lot.steps?.[parseInt(key.split('-')[0])];
      const detail = { lot: lot.orderNo, model: lot.model, step: step?.title || key, duration: task.duration, worker: task.workerName, date: new Date(taskEnd).toISOString().split('T')[0] };
      if (searchText && !`${detail.model} ${detail.lot} ${detail.step}`.includes(searchText)) return;
      directDetails.push(detail);
    });
  });
  const directSeconds = directDetails.reduce((a, d) => a + d.duration, 0);

  // 間接集計
  const filteredIndirect = indirectWork.filter(w => {
    if (selectedWorkers.length > 0 && !selectedWorkers.includes(w.workerName)) return false;
    if (w.startTime < fromTs.getTime() || w.startTime > toTs.getTime() + 86400000) return false;
    if (searchText && !`${w.category} ${w.note || ''}`.includes(searchText)) return false;
    return true;
  });
  const indirectSeconds = filteredIndirect.reduce((a, w) => a + (w.duration || 0), 0);

  const totalHours = (directSeconds + indirectSeconds) / 3600;
  const directRatio = totalHours > 0 ? (directSeconds / (directSeconds + indirectSeconds)) * 100 : 0;

  // 間接ジャンル別集計
  const catBreakdown = {};
  filteredIndirect.forEach(w => { catBreakdown[w.category] = (catBreakdown[w.category] || 0) + (w.duration || 0); });
  const catEntries = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]);
  const maxCatSec = catEntries.length > 0 ? catEntries[0][1] : 1;

  // 作業者別集計（分析用）
  const workerBreakdown = {};
  directDetails.forEach(d => { if (!workerBreakdown[d.worker]) workerBreakdown[d.worker] = { direct: 0, indirect: 0 }; workerBreakdown[d.worker].direct += d.duration; });
  filteredIndirect.forEach(w => { if (!workerBreakdown[w.workerName]) workerBreakdown[w.workerName] = { direct: 0, indirect: 0 }; workerBreakdown[w.workerName].indirect += (w.duration || 0); });

  const handleAddManual = () => {
    if (!addCategory || !addDuration || selectedWorkers.length !== 1) return;
    const dur = parseFloat(addDuration) * 60;
    const id = `iw_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const d = new Date(dateFrom); d.setHours(12,0,0,0);
    saveData('indirectWork', id, { workerName: selectedWorkers[0], category: addCategory, duration: Math.round(dur), startTime: d.getTime(), note: addNote || '手動追加', manual: true, createdAt: Date.now() });
    setAddDuration(''); setAddNote(''); setAddCategory('');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white p-3 flex justify-between items-center shrink-0">
          <h2 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5"/> 時間集計</h2>
          <div className="flex items-center gap-2">
            {['daily', 'analysis'].map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded text-xs font-bold ${tab === t ? 'bg-white text-slate-800' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{t === 'daily' ? '日次明細' : '直間分析'}</button>)}
            <button onClick={onClose}><X className="w-5 h-5"/></button>
          </div>
        </div>
        {/* フィルタ */}
        <div className="px-4 py-2 bg-slate-50 border-b shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded px-2 py-1 text-sm"/>
            <span className="text-slate-400 text-xs">〜</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded px-2 py-1 text-sm"/>
            <button onClick={() => { setDateFrom(today); setDateTo(today); }} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-200">本日</button>
            <div className="h-4 w-px bg-slate-300 mx-1"/>
            <input value={searchText} onChange={e => setSearchText(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" placeholder="検索..."/>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-slate-500 font-bold mr-1">作業者:</span>
            <button onClick={() => isAllSelected ? setSelectedWorkers([]) : selectAll()} className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${isAllSelected ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>全員</button>
            {allWorkerNames.map(name => (
              <button key={name} onClick={() => toggleWorker(name)} className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${selectedWorkers.includes(name) ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-400 border-slate-200'}`}>{name}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 合計カード */}
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-center"><div className="text-[10px] text-blue-500 font-bold">直工</div><div className="text-xl font-black text-blue-700 font-mono">{(directSeconds/3600).toFixed(2)}<span className="text-[10px]">h</span></div></div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-center"><div className="text-[10px] text-amber-500 font-bold">間接</div><div className="text-xl font-black text-amber-700 font-mono">{(indirectSeconds/3600).toFixed(2)}<span className="text-[10px]">h</span></div></div>
            <div className={`border rounded-xl p-2 text-center ${totalHours >= 7.75 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><div className="text-[10px] font-bold text-slate-500">合計</div><div className={`text-xl font-black font-mono ${totalHours >= 7.75 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalHours.toFixed(2)}<span className="text-[10px]">h</span></div></div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-2 text-center"><div className="text-[10px] text-purple-500 font-bold">直工比率</div><div className="text-xl font-black text-purple-700 font-mono">{directRatio.toFixed(0)}<span className="text-[10px]">%</span></div></div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center"><div className="text-[10px] text-slate-500 font-bold">目標</div><div className="text-xl font-black text-slate-700 font-mono">{isSingleDay ? '7.75' : '-'}<span className="text-[10px]">h</span></div></div>
          </div>

          {tab === 'daily' && (<>
            {/* 直工明細 */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-blue-600 text-white px-3 py-1.5 text-sm font-bold flex justify-between"><span>直工作業 ({directDetails.length}件)</span><span className="font-mono">{formatTime(directSeconds)}</span></div>
              {directDetails.length > 0 ? (
                <div className="divide-y max-h-48 overflow-y-auto">
                  {directDetails.map((d, i) => (
                    <div key={i} className="px-3 py-1 text-xs flex justify-between items-center">
                      <span className="text-slate-600"><span className="font-bold text-blue-700">{d.worker}</span> <span className="font-bold">{d.model}</span> {d.lot} — {d.step} {!isSingleDay && <span className="text-slate-400 ml-1">{d.date}</span>}</span>
                      <span className="font-mono font-bold text-blue-600">{formatTime(d.duration)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="p-3 text-center text-slate-400 text-xs">データなし</div>}
            </div>
            {/* 間接明細 */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-amber-600 text-white px-3 py-1.5 text-sm font-bold flex justify-between"><span>間接作業 ({filteredIndirect.length}件)</span><span className="font-mono">{formatTime(indirectSeconds)}</span></div>
              {filteredIndirect.length > 0 ? (
                <div className="divide-y max-h-48 overflow-y-auto">
                  {filteredIndirect.map((w, i) => (
                    <div key={i} className="px-3 py-1 text-xs flex justify-between items-center">
                      <span><span className="font-bold text-amber-700 mr-1">{w.workerName}</span><span className="bg-amber-100 text-amber-700 px-1.5 rounded font-bold mr-1">{w.category}</span>{w.note && <span className="text-slate-400">{w.note}</span>}{w.manual && <span className="text-purple-400 ml-1">(手動)</span>}</span>
                      <span className="font-mono font-bold text-amber-600">{formatTime(w.duration || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="p-3 text-center text-slate-400 text-xs">データなし</div>}
            </div>
            {/* 追加登録 */}
            {isSingleDay && selectedWorkers.length === 1 && (
              <div className="border-2 border-dashed border-purple-300 rounded-xl p-3 bg-purple-50">
                <div className="text-xs font-bold text-purple-700 mb-2 flex items-center gap-1"><Plus className="w-3 h-3"/> 間接作業を追加登録（{selectedWorkers[0]}）</div>
                <div className="flex gap-2 flex-wrap">
                  <select value={addCategory} onChange={e => setAddCategory(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1 min-w-[100px]"><option value="">ジャンル</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <input type="number" value={addDuration} onChange={e => setAddDuration(e.target.value)} className="border rounded px-2 py-1 text-xs w-16" placeholder="分"/>
                  <input value={addNote} onChange={e => setAddNote(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1 min-w-[80px]" placeholder="備考"/>
                  <button onClick={handleAddManual} className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-purple-700">追加</button>
                </div>
              </div>
            )}
          </>)}

          {tab === 'analysis' && (<>
            {/* 直間比率バー */}
            <div className="border rounded-xl p-4">
              <div className="text-sm font-bold text-slate-700 mb-2">直間比率</div>
              <div className="flex h-8 rounded-lg overflow-hidden">
                {directSeconds > 0 && <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold" style={{width: `${directRatio}%`}}>直工 {directRatio.toFixed(0)}%</div>}
                {indirectSeconds > 0 && <div className="bg-amber-500 flex items-center justify-center text-white text-xs font-bold" style={{width: `${100-directRatio}%`}}>間接 {(100-directRatio).toFixed(0)}%</div>}
              </div>
            </div>
            {/* 間接ジャンル別 */}
            <div className="border rounded-xl p-4">
              <div className="text-sm font-bold text-slate-700 mb-3">間接作業 ジャンル別内訳</div>
              {catEntries.length > 0 ? catEntries.map(([cat, sec]) => (
                <div key={cat} className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-600 w-16 text-right shrink-0">{cat}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden"><div className="h-full bg-amber-500 rounded-full flex items-center pl-2" style={{width: `${(sec/maxCatSec)*100}%`}}><span className="text-[9px] text-white font-bold">{formatTime(sec)}</span></div></div>
                  <span className="text-[10px] text-slate-400 w-10 text-right font-mono">{((sec/3600)).toFixed(1)}h</span>
                </div>
              )) : <div className="text-center text-slate-400 text-xs py-4">データなし</div>}
            </div>
            {/* 作業者別直間比 */}
            {Object.keys(workerBreakdown).length > 1 && (
              <div className="border rounded-xl p-4">
                <div className="text-sm font-bold text-slate-700 mb-3">作業者別 直間比率</div>
                {Object.entries(workerBreakdown).map(([name, wb]) => {
                  const total = wb.direct + wb.indirect;
                  const dr = total > 0 ? (wb.direct / total) * 100 : 0;
                  return (
                    <div key={name} className="mb-2">
                      <div className="flex justify-between text-xs mb-0.5"><span className="font-bold">{name}</span><span className="text-slate-400">直工{dr.toFixed(0)}% / 合計{(total/3600).toFixed(2)}h</span></div>
                      <div className="flex h-4 rounded overflow-hidden">
                        {wb.direct > 0 && <div className="bg-blue-500" style={{width: `${dr}%`}}/>}
                        {wb.indirect > 0 && <div className="bg-amber-500" style={{width: `${100-dr}%`}}/>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
};

const NoteModal = ({ notes, templates, workers, selectedWorker, saveData, deleteData, onClose, currentUserName = '' }) => {
  const [tab, setTab] = useState('my'); // 'my' | 'shared' | 'create'
  const [model, setModel] = useState('');
  const [stepTitle, setStepTitle] = useState('');
  const [content, setContent] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [noteImage, setNoteImage] = useState(null);
  const workerName = currentUserName;

  const myNotes = notes.filter(n => n.isPersonal && n.author === workerName);
  const sharedNotes = notes.filter(n => !n.isPersonal);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setNoteImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!content.trim() && !noteImage) { alert('内容を入力してください'); return; }
    if (!workerName) { alert('作業者を選択してください'); return; }
    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    saveData('notes', id, {
      author: workerName, model: model.trim(), stepTitle: stepTitle.trim(),
      content: content.trim(), image: noteImage || null,
      isPersonal: !isShared, createdAt: Date.now()
    });
    setContent(''); setModel(''); setStepTitle(''); setNoteImage(null); setIsShared(false);
    setTab(isShared ? 'shared' : 'my');
  };

  const allModels = [...new Set(notes.map(n => n.model).filter(Boolean))];
  const templateSteps = templates.flatMap(t => (t.steps || []).map(s => s.title));
  const allSteps = [...new Set([...templateSteps, ...notes.map(n => n.stepTitle).filter(Boolean)])];

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5"/> ノート</h2>
          <button onClick={onClose}><X className="w-5 h-5"/></button>
        </div>
        <div className="flex bg-slate-100 p-1 mx-4 mt-3 rounded-lg">
          {[{id:'my',label:'個人メモ'},{id:'shared',label:'共有情報'},{id:'create',label:'＋新規'}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${tab === t.id ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'create' && (
            <div className="space-y-3">
              {!workerName && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs font-bold text-red-500 text-center">⚠ ヘッダー左上から使用者を選択してください</div>}
              <div className="flex gap-2">
                <div className="flex-1"><label className="text-xs font-bold text-slate-500">型式 (任意)</label><input value={model} onChange={e=>setModel(e.target.value)} list="noteModels" className="w-full border rounded p-2 text-sm" placeholder="例: RW-200"/><datalist id="noteModels">{allModels.map(m => <option key={m} value={m}/>)}</datalist></div>
                <div className="flex-1"><label className="text-xs font-bold text-slate-500">工程 (任意)</label><input value={stepTitle} onChange={e=>setStepTitle(e.target.value)} list="noteSteps" className="w-full border rounded p-2 text-sm" placeholder="例: 外観検査"/><datalist id="noteSteps">{allSteps.map(s => <option key={s} value={s}/>)}</datalist></div>
              </div>
              <div><label className="text-xs font-bold text-slate-500">内容</label><textarea value={content} onChange={e=>setContent(e.target.value)} className="w-full border rounded p-2 text-sm h-24" placeholder="メモを入力..."/></div>
              <div className="flex items-center gap-3">
                <label className="text-xs flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded border"><Camera className="w-4 h-4"/> 画像<input type="file" accept="image/*" onChange={handleImageChange} className="hidden"/></label>
                {noteImage && <img src={noteImage} alt="" className="w-12 h-12 object-cover rounded border"/>}
              </div>
              <label className="flex items-center gap-2 cursor-pointer p-2 bg-amber-50 rounded-lg border border-amber-200">
                <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} className="rounded"/>
                <div><span className="text-sm font-bold text-amber-700">みんなに共有する</span><div className="text-[10px] text-amber-500">該当する型式・工程の作業時に表示されます</div></div>
              </label>
              <button onClick={handleSave} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">保存</button>
            </div>
          )}
          {tab === 'my' && (
            <div className="space-y-3">
              {myNotes.length === 0 && <div className="text-center py-10 text-slate-400">個人メモはありません</div>}
              {myNotes.map(n => (
                <div key={n.id} className="border rounded-lg p-3 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[10px] text-slate-400">{n.model && <span className="bg-blue-100 text-blue-700 px-1.5 rounded mr-1">{n.model}</span>}{n.stepTitle && <span className="bg-emerald-100 text-emerald-700 px-1.5 rounded">{n.stepTitle}</span>}</div>
                    <button onClick={() => deleteData('notes', n.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</div>
                  {n.image && <img src={n.image} alt="" className="mt-2 max-h-32 rounded border"/>}
                  <div className="text-[9px] text-slate-300 mt-1">{new Date(n.createdAt).toLocaleString('ja-JP')}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'shared' && (
            <div className="space-y-3">
              {sharedNotes.length === 0 && <div className="text-center py-10 text-slate-400">共有情報はありません</div>}
              {sharedNotes.map(n => (
                <div key={n.id} className="border-2 border-amber-300 rounded-lg p-3 bg-amber-50">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[10px]">{n.model && <span className="bg-blue-100 text-blue-700 px-1.5 rounded mr-1">{n.model}</span>}{n.stepTitle && <span className="bg-emerald-100 text-emerald-700 px-1.5 rounded">{n.stepTitle}</span>}</div>
                    <span className="text-[10px] text-amber-600 font-bold">{n.author}</span>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap font-medium">{n.content}</div>
                  {n.image && <img src={n.image} alt="" className="mt-2 max-h-32 rounded border"/>}
                  <div className="text-[9px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString('ja-JP')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Announcement Modal ---
const AnnouncementModal = ({ announcements, workers, selectedWorker, saveData, deleteData, onClose, currentUserName = '' }) => {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail' | 'edit'
  const [selectedAnn, setSelectedAnn] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [annImage, setAnnImage] = useState(null);
  const [notifyTime1, setNotifyTime1] = useState('');
  const [notifyTime2, setNotifyTime2] = useState('');
  const [annMode, setAnnMode] = useState('confirm'); // 'confirm' (確認モード) | 'alarm' (アラームモード)
  const [newComment, setNewComment] = useState('');
  const workerName = currentUserName;

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAnnImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePost = () => {
    if (!title.trim()) { alert('タイトルを入力してください'); return; }
    if (!workerName) { alert('投稿者を入力してください'); return; }
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const notifyTimes = [notifyTime1, notifyTime2].filter(Boolean);
    saveData('announcements', id, {
      author: workerName, title: title.trim(), content: content.trim(),
      image: annImage || null, comments: [], confirmedBy: [], createdAt: Date.now(),
      notifyTimes: notifyTimes.length > 0 ? notifyTimes : null,
      mode: annMode // 'confirm' or 'alarm'
    });
    setTitle(''); setContent(''); setAnnImage(null); setNotifyTime1(''); setNotifyTime2('');
    setView('list');
  };

  const handleUpdate = () => {
    if (!selectedAnn) return;
    const notifyTimes = [notifyTime1, notifyTime2].filter(Boolean);
    saveData('announcements', selectedAnn.id, {
      title: title.trim(), content: content.trim(),
      image: annImage ?? selectedAnn.image ?? null,
      notifyTimes: notifyTimes.length > 0 ? notifyTimes : null
    });
    setView('detail');
  };

  const handleConfirm = (ann) => {
    if (!workerName) { alert('名前を入力してください'); return; }
    const confirmed = [...(ann.confirmedBy || [])];
    if (!confirmed.includes(workerName)) confirmed.push(workerName);
    saveData('announcements', ann.id, { confirmedBy: confirmed });
  };

  const addComment = (ann) => {
    const text = newComment.trim();
    if (!text || !workerName) { if (!workerName) alert('名前を入力してください'); return; }
    const comments = [...(ann.comments || []), { author: workerName, text, createdAt: Date.now() }];
    saveData('announcements', ann.id, { comments });
    setNewComment('');
  };

  const openDetail = (ann) => { setSelectedAnn(ann); setView('detail'); };
  const openEdit = (ann) => {
    setSelectedAnn(ann); setTitle(ann.title); setContent(ann.content || '');
    setAnnImage(ann.image || null);
    setNotifyTime1(ann.notifyTimes?.[0] || ''); setNotifyTime2(ann.notifyTimes?.[1] || '');
    setView('edit');
  };

  // 未確認カウント
  const unconfirmedCount = announcements.filter(a => !(a.confirmedBy || []).includes(workerName)).length;

  // 最新のannデータを使う
  const currentAnn = selectedAnn ? announcements.find(a => a.id === selectedAnn.id) || selectedAnn : null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-purple-700 text-white p-4 flex justify-between items-center shrink-0">
          <h2 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5"/> お知らせ</h2>
          <div className="flex items-center gap-2">
            {view === 'list' && <button onClick={() => { setTitle(''); setContent(''); setAnnImage(null); setNotifyTime1(''); setNotifyTime2(''); setView('create'); }} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-bold">＋ 投稿</button>}
            {(view === 'detail' || view === 'edit' || view === 'create') && <button onClick={() => setView('list')} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-bold">← 一覧</button>}
            <button onClick={onClose}><X className="w-5 h-5"/></button>
          </div>
        </div>

        {/* 使用者表示 */}
        {workerName && (
          <div className="px-4 py-1.5 bg-purple-50 border-b flex items-center gap-2 shrink-0">
            <User className="w-3.5 h-3.5 text-purple-500"/>
            <span className="text-sm font-bold text-purple-700">{workerName}</span>
          </div>
        )}
        {!workerName && (
          <div className="px-4 py-2 bg-red-50 border-b text-center shrink-0">
            <span className="text-xs font-bold text-red-500">⚠ ヘッダー左上から使用者を選択してください</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {/* 一覧 */}
          {view === 'list' && (
            <div className="space-y-2">
              {announcements.length === 0 && <div className="text-center py-10 text-slate-400">お知らせはありません</div>}
              {announcements.map(ann => {
                const confirmed = (ann.confirmedBy || []).includes(workerName);
                return (
                  <div key={ann.id} onClick={() => openDetail(ann)} className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${confirmed ? 'bg-white border-slate-200' : 'bg-purple-50 border-purple-300 ring-1 ring-purple-200'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {!confirmed && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">未読</span>}
                          <h3 className="font-black text-slate-800 truncate">{ann.title}</h3>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="font-bold text-purple-500">{ann.author}</span>
                          <span>{new Date(ann.createdAt).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                          {(ann.comments || []).length > 0 && <span className="text-blue-500">💬{ann.comments.length}</span>}
                          <span className="text-emerald-500">✓{(ann.confirmedBy || []).length}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1"/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 詳細画面 */}
          {view === 'detail' && currentAnn && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-black text-slate-800 mb-1">{currentAnn.title}</h3>
                <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-purple-500">{currentAnn.author}</span>
                  <span>{new Date(currentAnn.createdAt).toLocaleString('ja-JP')}</span>
                  {currentAnn.notifyTimes?.length > 0 && <span className="bg-blue-100 text-blue-600 px-1.5 rounded font-bold flex items-center gap-0.5"><Bell className="w-3 h-3"/> {currentAnn.notifyTimes.join(', ')}</span>}
                </div>
              </div>
              {currentAnn.content && <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border">{currentAnn.content}</p>}
              {currentAnn.image && <img src={currentAnn.image} alt="" className="max-h-60 rounded-lg border"/>}

              {/* モード表示 */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${(currentAnn.mode || 'confirm') === 'confirm' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {(currentAnn.mode || 'confirm') === 'confirm' ? '✓ 確認モード' : '🔔 アラームモード'}
                </span>
              </div>

              {/* 確認ボタン（確認モードのみ） */}
              {(currentAnn.mode || 'confirm') === 'confirm' && workerName && (
                <div className="flex items-center gap-3">
                  {!(currentAnn.confirmedBy || []).includes(workerName) ? (
                    <button onClick={() => handleConfirm(currentAnn)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Check className="w-5 h-5"/> 確認しました</button>
                  ) : (
                    <div className="flex-1 py-3 bg-emerald-50 border-2 border-emerald-300 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5"/> 確認済み</div>
                  )}
                </div>
              )}
              {(currentAnn.mode || 'confirm') === 'confirm' && (currentAnn.confirmedBy || []).length > 0 && (
                <div className="text-xs text-slate-500">
                  <span className="font-bold">確認済み ({(currentAnn.confirmedBy || []).length}名): </span>
                  {(currentAnn.confirmedBy || []).join(', ')}
                </div>
              )}

              {/* 編集・削除 */}
              <div className="flex gap-2 border-t pt-3">
                <button onClick={() => openEdit(currentAnn)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-1"><Pencil className="w-3.5 h-3.5"/> 編集</button>
                <button onClick={() => { if(confirm('このお知らせを削除しますか？')) { deleteData('announcements', currentAnn.id); setView('list'); } }} className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold text-xs flex items-center justify-center gap-1"><Trash2 className="w-3.5 h-3.5"/> 削除</button>
              </div>

              {/* コメント欄（確認モードのみ） */}
              {(currentAnn.mode || 'confirm') === 'confirm' && (
              <div className="border-t pt-3">
                <div className="text-xs font-bold text-slate-500 mb-2">コメント ({(currentAnn.comments || []).length})</div>
                <div className="space-y-2 mb-3">
                  {(currentAnn.comments || []).map((c, ci) => (
                    <div key={ci} className="bg-slate-50 rounded-lg p-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-bold text-blue-600">{c.author}</span>
                        <span className="text-[9px] text-slate-300">{new Date(c.createdAt).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      <div className="text-sm text-slate-700">{c.text}</div>
                    </div>
                  ))}
                </div>
                {workerName && <div className="flex gap-2">
                  <input value={newComment} onChange={e => setNewComment(e.target.value)} className="flex-1 border rounded px-3 py-2 text-sm" placeholder="コメントを書く..." onKeyDown={e => { if (e.key === 'Enter') addComment(currentAnn); }}/>
                  <button onClick={() => addComment(currentAnn)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700">送信</button>
                </div>}
              </div>
              )}
            </div>
          )}

          {/* 新規投稿 / 編集 */}
          {(view === 'create' || view === 'edit') && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">お知らせモード</label>
                <div className="flex gap-2">
                  <button onClick={() => setAnnMode('confirm')} className={`flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 border-2 transition-all ${annMode === 'confirm' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-500 border-slate-200'}`}><CheckCircle2 className="w-4 h-4"/> 確認モード</button>
                  <button onClick={() => setAnnMode('alarm')} className={`flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 border-2 transition-all ${annMode === 'alarm' ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200'}`}><Bell className="w-4 h-4"/> アラームモード</button>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{annMode === 'confirm' ? '全員に「確認しました」ボタンとコメント欄が表示されます' : '通知時間にバナー表示のみ。確認ボタンは表示されません'}</div>
              </div>
              <div><label className="text-xs font-bold text-slate-500">タイトル</label><input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border rounded p-2 text-sm font-bold" placeholder="例: 明日の全体会議について"/></div>
              <div><label className="text-xs font-bold text-slate-500">内容</label><textarea value={content} onChange={e=>setContent(e.target.value)} className="w-full border rounded p-2 text-sm h-24" placeholder="詳細を入力..."/></div>
              <div className="flex items-center gap-3">
                <label className="text-xs flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded border"><Camera className="w-4 h-4"/> 画像<input type="file" accept="image/*" onChange={handleImageChange} className="hidden"/></label>
                {annImage && <img src={annImage} alt="" className="w-12 h-12 object-cover rounded border"/>}
                {annImage && <button onClick={() => setAnnImage(null)} className="text-xs text-red-400 hover:text-red-600">削除</button>}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label className="text-xs font-bold text-blue-700 flex items-center gap-1 mb-2"><Bell className="w-3.5 h-3.5"/> 通知時間（画面上部にバナー表示）</label>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="text-[10px] text-blue-500">通知1</label><input type="time" value={notifyTime1} onChange={e=>setNotifyTime1(e.target.value)} className="w-full border rounded p-1.5 text-sm"/></div>
                  <div className="flex-1"><label className="text-[10px] text-blue-500">通知2</label><input type="time" value={notifyTime2} onChange={e=>setNotifyTime2(e.target.value)} className="w-full border rounded p-1.5 text-sm"/></div>
                </div>
              </div>
              <button onClick={view === 'edit' ? handleUpdate : handlePost} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700">{view === 'edit' ? '更新する' : '投稿する'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TemplateEditor = ({ template, onSave, onCancel, customLayouts = {}, onSaveLayouts, comboPresets = [] }) => {
  const [name, setName] = useState(template?.name || '');
  const [steps, setSteps] = useState(template?.steps || []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('normal');
  const [targetTime, setTargetTime] = useState(0);
  const [images, setImages] = useState([]);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [pdfData, setPdfData] = useState(null);
  const [editingStepId, setEditingStepId] = useState(null);
  const [measurementConfig, setMeasurementConfig] = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [editingPresetKey, setEditingPresetKey] = useState(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  // Drawing State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawTool, setDrawTool] = useState('pen');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [selectedStampVal, setSelectedStampVal] = useState('⚠️');
  const [textToDraw, setTextToDraw] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    if (isDrawingMode && images[activeImgIdx] && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = images[activeImgIdx];
      img.onload = () => { canvas.width = img.width; canvas.height = img.height; ctx?.drawImage(img, 0, 0); };
    }
  }, [isDrawingMode, activeImgIdx]);

  const startDrawing = (e) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current?.getBoundingClientRect();
    if(!ctx || !rect) return;
    const getPos = (evt) => {
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      return { x: (clientX - rect.left) * (ctx.canvas.width / rect.width), y: (clientY - rect.top) * (ctx.canvas.height / rect.height) };
    };
    const pos = getPos(e);
    if (drawTool === 'stamp') {
      ctx.font = 'bold 60px sans-serif'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(selectedStampVal, pos.x, pos.y); setIsDrawing(false);
    } else if (drawTool === 'text') {
      if (!textToDraw) return; ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = drawColor; ctx.fillText(textToDraw, pos.x, pos.y); setIsDrawing(false);
    } else {
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.strokeStyle = drawColor; ctx.lineWidth = 5; ctx.lineCap = 'round';
    }
  };

  const draw = (e) => {
    if(!isDrawing || !canvasRef.current || drawTool === 'stamp' || drawTool === 'text') return;
    const ctx = canvasRef.current.getContext('2d');
    const rect = canvasRef.current.getBoundingClientRect();
    const getPos = (evt) => {
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
        return { x: (clientX - rect.left) * (ctx.canvas.width / rect.width), y: (clientY - rect.top) * (ctx.canvas.height / rect.height) };
    };
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const saveDrawing = () => { if(canvasRef.current) { const newImg = canvasRef.current.toDataURL('image/jpeg', 0.8); const n = [...images]; n[activeImgIdx] = newImg; setImages(n); } setIsDrawingMode(false); };
  const handleImageUpload = async (e) => { const file = e.target.files?.[0]; if (file) { const img = await resizeImage(file); setImages(prev => [...prev, img]); setActiveImgIdx(images.length); } };
  const handlePdfUpload = async (e) => { const file = e.target.files?.[0]; if (file) { try { const base64 = await getBase64(file); setPdfData(base64); alert('PDF添付'); } catch { alert('PDFエラー'); } } };
  const toggleListening = () => { const SR = (window).SpeechRecognition || (window).webkitSpeechRecognition; if (!SR) return alert('非対応'); const r = new SR(); r.lang = 'ja-JP'; r.onresult = (e) => setDescription(p => p + e.results[0][0].transcript); r.start(); };
  const addStep = () => { if (!title) return alert('工程名入力'); const newStep = { id: editingStepId || generateId(), title, description, type, targetTime, images, pdfData, ...(type === 'measurement' && measurementConfig ? { measurementConfig } : {}) }; if (editingStepId) { setSteps(steps.map(s => s.id === editingStepId ? newStep : s)); } else { setSteps([...steps, newStep]); } resetInput(); };
  const resetInput = () => { setTitle(''); setDescription(''); setType('normal'); setTargetTime(0); setImages([]); setPdfData(null); setEditingStepId(null); setMeasurementConfig(null); };
  const editStep = (s) => { setEditingStepId(s.id); setTitle(s.title); setDescription(s.description); setType(s.type); setTargetTime(s.targetTime); setImages(s.images || []); setPdfData(s.pdfData || null); setMeasurementConfig(s.measurementConfig || null); };
  const deleteStep = (id) => setSteps(steps.filter(s => s.id !== id));
  const moveStep = (index, direction) => { const newSteps = [...steps]; if (direction === 'up' && index > 0) { [newSteps[index-1], newSteps[index]] = [newSteps[index], newSteps[index-1]]; } else if (direction === 'down' && index < steps.length-1) { [newSteps[index+1], newSteps[index]] = [newSteps[index], newSteps[index+1]]; } setSteps(newSteps); };
  const handleSave = () => { 
    if (!name.trim()) return alert('テンプレート名を入力してください');
    if (steps.length === 0) return alert('少なくとも1つの工程を追加してください');
    onSave({ id: template?.id, name, steps }); 
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 rounded-xl overflow-hidden relative">
      {isDrawingMode && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
           <div className="flex justify-between items-center p-4 text-white bg-black/50">
             <span className="font-bold">画像編集</span><div className="flex gap-2"><button onClick={()=>setIsDrawingMode(false)} className="px-4 py-2 bg-white/20 rounded">キャンセル</button><button onClick={saveDrawing} className="px-4 py-2 bg-blue-600 rounded font-bold">完了</button></div>
           </div>
           <div className="flex-1 bg-gray-900 flex items-center justify-center touch-none overflow-hidden">
             <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={()=>{setIsDrawing(false)}} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={()=>{setIsDrawing(false)}} className="max-w-full max-h-full object-contain" />
           </div>
           <div className="bg-white p-2 pb-6 flex flex-col gap-2">
             <div className="flex gap-2 justify-center pb-2">
               <button onClick={()=>setDrawTool('pen')} className={`p-3 rounded-lg flex flex-col items-center ${drawTool==='pen'?'bg-blue-100 text-blue-600':'bg-slate-100'}`}><Brush/><span className="text-[10px]">ペン</span></button>
               <button onClick={()=>setDrawTool('stamp')} className={`p-3 rounded-lg flex flex-col items-center ${drawTool==='stamp'?'bg-blue-100 text-blue-600':'bg-slate-100'}`}><AlertTriangle/><span className="text-[10px]">スタンプ</span></button>
               <button onClick={()=>setDrawTool('text')} className={`p-3 rounded-lg flex flex-col items-center ${drawTool==='text'?'bg-blue-100 text-blue-600':'bg-slate-100'}`}><Type/><span className="text-[10px]">文字</span></button>
             </div>
             {drawTool==='stamp' && ( <div className="flex gap-2 overflow-x-auto pb-2">{STAMPS.map(s=><button key={s.label} onClick={()=>setSelectedStampVal(s.val)} className={`flex-none px-3 py-2 rounded border text-lg ${selectedStampVal===s.val?'bg-blue-100 border-blue-500':'bg-white'}`}>{s.label}</button>)}</div> )}
             {drawTool==='text' && ( <div className="flex gap-2 p-2"><input value={textToDraw} onChange={e=>setTextToDraw(e.target.value)} placeholder="文字を入力" className="border p-2 rounded flex-1"/></div> )}
             {drawTool!=='stamp' && ( <div className="flex gap-4 mx-auto">{['#FF0000','#FFFF00','#0000FF','#00FF00','#FFFFFF'].map(c=><button key={c} onClick={()=>setDrawColor(c)} className={`w-8 h-8 rounded-full border-2 ${drawColor===c?'border-slate-800 scale-110':'border-transparent'}`} style={{backgroundColor:c}}/>)}</div> )}
           </div>
        </div>
      )}
      <div className="bg-white p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-2 flex-1"><button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full"><ArrowRight className="w-5 h-5 rotate-180"/></button><input value={name} onChange={e => setName(e.target.value)} placeholder="テンプレート名" className="text-lg font-bold border-none focus:ring-0 w-full"/></div>
        {/* Fixed: button type explicitly set to button */}
        <button type="button" onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 z-50 relative"><Save className="w-4 h-4"/> 保存</button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/3 p-4 overflow-y-auto border-r bg-white">
          <div className="space-y-2">{steps.map((s, i) => (<div key={s.id} className={`p-3 border rounded-lg flex gap-3 cursor-pointer ${editingStepId===s.id ? 'border-blue-500 bg-blue-50' : 'hover:border-slate-300'}`} onClick={() => editStep(s)}><div className="flex flex-col gap-1 justify-center"><button onClick={(e)=>{e.stopPropagation();moveStep(i,'up')}} disabled={i===0} className="text-slate-300 hover:text-slate-600"><ArrowUp className="w-4 h-4"/></button><span className="text-xs font-bold text-slate-400 text-center">{i+1}</span><button onClick={(e)=>{e.stopPropagation();moveStep(i,'down')}} disabled={i===steps.length-1} className="text-slate-300 hover:text-slate-600"><ArrowDown className="w-4 h-4"/></button></div><div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{s.title}</div><p className="text-xs text-slate-500 truncate">{s.description}</p></div><div className="flex flex-col gap-1"><button onClick={(e)=>{e.stopPropagation();const dup={...s,id:generateId(),title:s.title+' (コピー)'};setSteps(prev=>[...prev.slice(0,i+1),dup,...prev.slice(i+1)]);}} className="text-slate-300 hover:text-blue-500" title="複製"><Copy className="w-4 h-4"/></button><button onClick={(e)=>{e.stopPropagation();deleteStep(s.id)}} className="text-slate-300 hover:text-red-500" title="削除"><Trash2 className="w-4 h-4"/></button></div></div>))}</div>
        </div>
        <div className="w-2/3 p-6 bg-slate-50 overflow-y-auto flex gap-6">
          <div className="flex-1 space-y-4">
            <div><label className="block text-xs font-bold text-slate-500 mb-1">工程タイトル</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded"/></div>
            <div className="flex gap-4"><div className="flex-1"><label className="block text-xs font-bold text-slate-500 mb-1">タイプ</label><div className="flex gap-1">{['normal', 'important', 'danger'].map(t => (<button key={t} onClick={() => { setType(t); if (t !== 'measurement') setMeasurementConfig(null); }} className={`flex-1 py-1.5 text-xs rounded border ${type===t ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}>{t}</button>))}<button onClick={() => { setType('measurement'); if (!measurementConfig) setMeasurementConfig({ layout: 'circle-4point', inputs: [...MEASUREMENT_LAYOUTS['circle-4point'].inputs.map(inp => ({ ...inp, inputType: 'number', presetValues: [], group: '' }))], calculations: [{ id: 'calc1', label: '計算結果', method: 'max-min', formula: '', inputIds: [], toleranceUpper: 0.05, toleranceLower: -0.05, unit: 'mm' }] }); }} className={`flex-1 py-1.5 text-xs rounded border ${type==='measurement' ? 'bg-teal-600 text-white' : 'bg-white text-teal-600 border-teal-300'}`}><Calculator className="w-3 h-3 inline mr-0.5"/>測定</button></div></div><div className="w-24"><label className="block text-xs font-bold text-slate-500 mb-1">目標(秒)</label><input type="number" value={targetTime} onChange={e => setTargetTime(Number(e.target.value))} className="w-full p-2 border rounded text-right"/></div></div>
            <div className="relative"><label className="block text-xs font-bold text-slate-500 mb-1">詳細・注意事項</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border rounded h-32"/><button onClick={toggleListening} className="absolute bottom-2 right-2 p-1.5 bg-slate-100 rounded-full hover:bg-slate-200"><Mic className="w-4 h-4 text-slate-600"/></button></div>
            {type === 'measurement' && measurementConfig && (() => {
              const mcCalcs = measurementConfig.calculations || [{ id: 'default', label: '計算結果', method: measurementConfig.calculation || 'max-min', formula: measurementConfig.formula || '', inputIds: [], toleranceUpper: measurementConfig.toleranceUpper ?? 0.05, toleranceLower: measurementConfig.toleranceLower ?? -0.05, unit: measurementConfig.unit || 'mm' }];
              const updateInput = (idx, patch) => { const ni = [...measurementConfig.inputs]; ni[idx] = { ...ni[idx], ...patch }; setMeasurementConfig({ ...measurementConfig, inputs: ni }); };
              const updateCalc = (cIdx, patch) => { const nc = [...mcCalcs]; nc[cIdx] = { ...nc[cIdx], ...patch }; setMeasurementConfig({ ...measurementConfig, calculations: nc }); };
              const removeCalc = (cIdx) => { const nc = mcCalcs.filter((_, i) => i !== cIdx); setMeasurementConfig({ ...measurementConfig, calculations: nc }); };
              const addCalc = () => { if (mcCalcs.length >= 10) return; const nc = [...mcCalcs, { id: `calc${mcCalcs.length + 1}`, label: `計算${mcCalcs.length + 1}`, method: 'max-min', formula: '', inputIds: [], toleranceUpper: 0.05, toleranceLower: -0.05, unit: 'mm' }]; setMeasurementConfig({ ...measurementConfig, calculations: nc }); };
              const allLayouts = { ...MEASUREMENT_LAYOUTS, ...Object.fromEntries(Object.entries(customLayouts).map(([k, v]) => [`custom_${k}`, v])) };
              const handleApplyLayout = (lay) => {
                if (lay === 'custom') { setMeasurementConfig({ ...measurementConfig, layout: lay }); return; }
                const preset = allLayouts[lay];
                if (preset) setMeasurementConfig({ ...measurementConfig, layout: lay, inputs: [...preset.inputs.map(inp => ({ ...inp, inputType: inp.inputType || 'number', presetValues: inp.presetValues || [], comboPresetId: inp.comboPresetId || '' }))] });
              };
              const handleSaveAsPreset = () => {
                const presetName = prompt('プリセット名を入力してください:');
                if (!presetName || !presetName.trim()) return;
                const key = generateId();
                const newLayouts = { ...customLayouts, [key]: { label: presetName.trim(), inputs: measurementConfig.inputs.map(inp => ({ id: inp.id, label: inp.label, x: inp.x, y: inp.y, inputType: inp.inputType || 'number', presetValues: inp.presetValues || [], comboPresetId: inp.comboPresetId || '' })) } };
                onSaveLayouts?.(newLayouts);
                setMeasurementConfig({ ...measurementConfig, layout: `custom_${key}` });
              };
              const handleDeleteCustomPreset = (key) => {
                if (!confirm('このカスタムプリセットを削除しますか？')) return;
                const newLayouts = { ...customLayouts };
                delete newLayouts[key];
                onSaveLayouts?.(newLayouts);
                if (measurementConfig.layout === `custom_${key}`) setMeasurementConfig({ ...measurementConfig, layout: 'custom' });
              };
              const handleRenameCustomPreset = (key, newName) => {
                if (!newName || !newName.trim()) return;
                const newLayouts = { ...customLayouts, [key]: { ...customLayouts[key], label: newName.trim() } };
                onSaveLayouts?.(newLayouts);
                setEditingPresetKey(null);
                setEditingPresetName('');
              };
              return (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-3">
                <div className="text-xs font-bold text-teal-700 flex items-center gap-1"><Ruler className="w-3 h-3"/> 測定設定</div>
                {/* Layout Preset */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-500">レイアウトプリセット</label>
                    <button onClick={() => setShowPresetManager(!showPresetManager)} className="text-[10px] text-teal-600 font-bold hover:text-teal-800 flex items-center gap-0.5">
                      <Settings className="w-3 h-3"/> プリセット管理
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select value={measurementConfig.layout} onChange={e => handleApplyLayout(e.target.value)} className="flex-1 border rounded p-1.5 text-sm">
                      <optgroup label="組み込みプリセット">
                        {Object.entries(MEASUREMENT_LAYOUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </optgroup>
                      {Object.keys(customLayouts).length > 0 && (
                        <optgroup label="カスタムプリセット">
                          {Object.entries(customLayouts).map(([k, v]) => <option key={`custom_${k}`} value={`custom_${k}`}>{v.label}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <button onClick={handleSaveAsPreset} title="現在の入力ポイントをプリセットとして保存" className="bg-teal-500 hover:bg-teal-600 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-0.5 whitespace-nowrap">
                      <Save className="w-3 h-3"/> 保存
                    </button>
                  </div>
                  {/* Preset Manager Panel */}
                  {showPresetManager && (
                    <div className="mt-2 bg-white border border-teal-200 rounded-lg p-2 space-y-2">
                      <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1 border-b pb-1"><Layers className="w-3 h-3"/> プリセット一覧</div>
                      {/* Built-in presets (read-only) */}
                      {Object.entries(MEASUREMENT_LAYOUTS).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 text-[10px] py-1 px-1.5 bg-slate-50 rounded">
                          <ShieldCheck className="w-3 h-3 text-slate-400 flex-none"/>
                          <span className="flex-1 text-slate-500">{v.label}</span>
                          <span className="text-[9px] text-slate-400">組み込み</span>
                        </div>
                      ))}
                      {/* Custom presets (editable) */}
                      {Object.entries(customLayouts).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1 text-[10px] py-1 px-1.5 bg-teal-50 rounded border border-teal-100">
                          {editingPresetKey === k ? (
                            <>
                              <input value={editingPresetName} onChange={e => setEditingPresetName(e.target.value)} className="flex-1 border rounded px-1 py-0.5 text-[10px]" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleRenameCustomPreset(k, editingPresetName); if (e.key === 'Escape') { setEditingPresetKey(null); setEditingPresetName(''); } }}/>
                              <button onClick={() => handleRenameCustomPreset(k, editingPresetName)} className="text-teal-600 hover:text-teal-800"><Check className="w-3 h-3"/></button>
                              <button onClick={() => { setEditingPresetKey(null); setEditingPresetName(''); }} className="text-slate-400 hover:text-slate-600"><X className="w-3 h-3"/></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 font-medium text-teal-700">{v.label}</span>
                              <span className="text-[9px] text-teal-500">{v.inputs?.length || 0}点</span>
                              <button onClick={() => { setEditingPresetKey(k); setEditingPresetName(v.label); }} className="text-slate-400 hover:text-teal-600" title="名前を変更"><Pencil className="w-3 h-3"/></button>
                              <button onClick={() => handleDeleteCustomPreset(k)} className="text-slate-400 hover:text-red-500" title="削除"><Trash2 className="w-3 h-3"/></button>
                            </>
                          )}
                        </div>
                      ))}
                      {Object.keys(customLayouts).length === 0 && (
                        <div className="text-[10px] text-slate-400 text-center py-2">カスタムプリセットはまだありません。上の「保存」ボタンで現在の設定を保存できます。</div>
                      )}
                    </div>
                  )}
                </div>
                {/* Input Points */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">入力ポイント ({measurementConfig.inputs.length}点)</label>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {measurementConfig.inputs.map((inp, idx) => (
                      <div key={idx} className="bg-white rounded p-2 border space-y-1">
                        <div className="flex items-center gap-1 text-xs">
                          <input value={inp.id} onChange={e => updateInput(idx, { id: e.target.value })} className="w-14 border rounded px-1 py-0.5 text-xs" placeholder="ID"/>
                          <input value={inp.label} onChange={e => updateInput(idx, { label: e.target.value })} className="flex-1 border rounded px-1 py-0.5 text-xs" placeholder="ラベル"/>
                          <div className="relative group">
                            <select value={inp.inputType || 'number'} onChange={e => updateInput(idx, { inputType: e.target.value })} className="w-28 border rounded px-1 py-0.5 text-[10px] pr-4">
                              <option value="number">数値入力</option>
                              <option value="combobox">選択式(コンボ)</option>
                            </select>
                            <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 bg-slate-800 text-white text-[9px] p-1.5 rounded shadow-lg whitespace-nowrap z-50">
                              {(inp.inputType || 'number') === 'number' ? '直接数値を入力します' : 'ブロックゲージ等のプリセット値から選択できます'}
                            </div>
                          </div>
                          <button onClick={() => { const ni = measurementConfig.inputs.filter((_, i) => i !== idx); setMeasurementConfig({ ...measurementConfig, inputs: ni }); }} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>X:</span>
                          <input type="range" min="0" max="100" value={Math.round(inp.x)} onChange={e => updateInput(idx, { x: Number(e.target.value) })} className="flex-1 h-1 accent-teal-500"/>
                          <span className="w-8 text-right">{Math.round(inp.x)}%</span>
                          <span>Y:</span>
                          <input type="range" min="0" max="100" value={Math.round(inp.y)} onChange={e => updateInput(idx, { y: Number(e.target.value) })} className="flex-1 h-1 accent-teal-500"/>
                          <span className="w-8 text-right">{Math.round(inp.y)}%</span>
                        </div>
                        {(inp.inputType === 'combobox') && (
                          <div className="space-y-1 pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 font-bold">プリセットリスト:</span>
                              <select value={inp.comboPresetId || ''} onChange={e => updateInput(idx, { comboPresetId: e.target.value })} className="flex-1 border rounded px-1 py-0.5 text-[10px]">
                                <option value="">-- 選択してください --</option>
                                {comboPresets.map(cp => <option key={cp.id} value={cp.id}>{cp.name} ({cp.values?.length || 0}件)</option>)}
                              </select>
                            </div>
                            {(() => { const selectedPreset = comboPresets.find(cp => cp.id === inp.comboPresetId); return selectedPreset ? (
                              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto bg-slate-50 p-1 rounded">
                                {(selectedPreset.values || []).map((pv, pi) => (
                                  <span key={pi} className="inline-flex items-center bg-white text-[9px] px-1.5 py-0.5 rounded border border-slate-200">{pv}</span>
                                ))}
                              </div>
                            ) : null; })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setMeasurementConfig({ ...measurementConfig, inputs: [...measurementConfig.inputs, { id: `p${measurementConfig.inputs.length + 1}`, label: `P${measurementConfig.inputs.length + 1}`, x: 50, y: 50, inputType: 'number', presetValues: [], comboPresetId: '' }] })} className="mt-2 w-full py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors"><Plus className="w-4 h-4"/> 入力ポイント追加</button>
                  {/* Diagram Image Upload */}
                  <div className="mt-3 border-t pt-3">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">測定図面画像</label>
                    <div className="flex gap-2">
                      <button onClick={() => document.getElementById('diagram-image-upload')?.click()} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded flex items-center justify-center gap-1 border"><ImageIcon className="w-3 h-3"/> 画像を選択</button>
                      {measurementConfig.diagramImage && <button onClick={() => setMeasurementConfig({ ...measurementConfig, diagramImage: null })} className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-500 text-[10px] font-bold rounded flex items-center justify-center gap-1 border border-red-200"><Trash2 className="w-3 h-3"/> 削除</button>}
                    </div>
                    <input id="diagram-image-upload" type="file" className="hidden" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const img = await resizeImage(file); setMeasurementConfig({ ...measurementConfig, diagramImage: img }); } e.target.value = ''; }}/>
                    {measurementConfig.diagramImage && <img src={measurementConfig.diagramImage} className="mt-2 w-full h-24 object-contain rounded border" alt="diagram"/>}
                  </div>
                </div>
                {/* Calculations Section */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-500">計算設定 ({mcCalcs.length}件)</label>
                    <button onClick={addCalc} disabled={mcCalcs.length >= 10} className="mt-2 w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><Plus className="w-4 h-4"/> 計算を追加</button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {mcCalcs.map((calc, cIdx) => (
                      <div key={calc.id || cIdx} className="bg-white rounded p-2 border space-y-1.5">
                        <div className="flex items-center gap-1">
                          <input value={calc.label} onChange={e => updateCalc(cIdx, { label: e.target.value })} className="flex-1 border rounded px-1 py-0.5 text-xs font-bold" placeholder="ラベル"/>
                          {mcCalcs.length > 1 && <button onClick={() => removeCalc(cIdx)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>}
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400">計算方法</label>
                          <select value={calc.method} onChange={e => updateCalc(cIdx, { method: e.target.value })} className="w-full border rounded p-1 text-[11px]">
                            {CALCULATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label} - {m.desc}</option>)}
                          </select>
                        </div>
                        {calc.method === 'formula' && (
                          <div>
                            <label className="block text-[10px] text-slate-400">数式 (変数名はID)</label>
                            <input value={calc.formula || ''} onChange={e => updateCalc(cIdx, { formula: e.target.value })} className="w-full border rounded p-1 text-[11px] font-mono" placeholder="例: (b+c)/2+d/2"/>
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] text-slate-400">対象入力 (空=全て)</label>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {measurementConfig.inputs.map(inp => {
                              const selected = (calc.inputIds || []).includes(inp.id);
                              return (
                                <button key={inp.id} onClick={() => {
                                  const ids = calc.inputIds || [];
                                  const newIds = selected ? ids.filter(id => id !== inp.id) : [...ids, inp.id];
                                  updateCalc(cIdx, { inputIds: newIds });
                                }} className={`text-[9px] px-1.5 py-0.5 rounded border ${selected ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-500 border-slate-200'}`}>
                                  {inp.label || inp.id}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div><label className="block text-[10px] text-slate-400">上限公差</label><input type="number" step="0.001" value={calc.toleranceUpper} onChange={e => updateCalc(cIdx, { toleranceUpper: Number(e.target.value) })} className="w-full border rounded p-1 text-[11px] text-right"/></div>
                          <div><label className="block text-[10px] text-slate-400">下限公差</label><input type="number" step="0.001" value={calc.toleranceLower} onChange={e => updateCalc(cIdx, { toleranceLower: Number(e.target.value) })} className="w-full border rounded p-1 text-[11px] text-right"/></div>
                          <div><label className="block text-[10px] text-slate-400">単位</label><select value={calc.unit} onChange={e => updateCalc(cIdx, { unit: e.target.value })} className="w-full border rounded p-1 text-[11px]"><option value="mm">mm</option><option value="μm">μm</option><option value="°">°</option></select></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Preview */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">プレビュー</label>
                  <div className="relative w-full h-48 bg-white border rounded overflow-hidden" style={measurementConfig.diagramImage ? { backgroundImage: `url(${measurementConfig.diagramImage})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}}>
                    {!measurementConfig.diagramImage && measurementConfig.layout === 'circle-4point' && (
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                        <circle cx="50" cy="50" r="35" fill="none" stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2"/>
                      </svg>
                    )}
                    {measurementConfig.inputs.map((inp, idx) => (
                      <div key={idx} className="absolute flex flex-col items-center" style={{ left: `${inp.x}%`, top: `${inp.y}%`, transform: 'translate(-50%, -50%)' }}>
                        <div className={`w-3 h-3 rounded-full border-2 border-white shadow ${inp.inputType === 'combobox' ? 'bg-amber-500' : 'bg-teal-500'}`}/>
                        <span className="text-[8px] font-bold text-slate-600 mt-0.5 bg-white/80 px-0.5 rounded">{inp.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })()}
            <div className="pt-2 flex gap-2">{editingStepId && <button onClick={resetInput} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded font-bold">キャンセル</button>}<button onClick={addStep} className="flex-1 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">{editingStepId ? '更新' : 'リストに追加'}</button></div>
          </div>
          <div className="w-64 flex-none">
             <label className="block text-xs font-bold text-slate-500 mb-1">画像</label>
             <div className="border-2 border-dashed h-48 rounded bg-white relative flex items-center justify-center overflow-hidden mb-2">
               {images.length > 0 ? (<div className="w-full h-full relative group"><img src={images[activeImgIdx]} className="w-full h-full object-contain" /><div className="absolute top-2 left-2"><button onClick={()=>setIsDrawingMode(true)} className="bg-white/90 p-1.5 rounded shadow text-xs flex gap-1 items-center font-bold text-slate-700"><Brush className="w-3 h-3"/> 編集</button></div></div>) : (<div onClick={()=>fileInputRef.current?.click()} className="text-center text-slate-400 cursor-pointer hover:text-blue-500"><Camera className="w-8 h-8 mx-auto mb-1"/><span className="text-xs">追加</span></div>)}
               <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
             </div>
             {images.length > 0 && (<div className="flex gap-2 overflow-x-auto pb-1 mb-2">{images.map((img, i) => (<div key={i} onClick={()=>setActiveImgIdx(i)} className={`w-12 h-12 flex-none border rounded overflow-hidden cursor-pointer ${activeImgIdx===i?'ring-2 ring-blue-500':''}`}><img src={img} className="w-full h-full object-cover"/></div>))}</div>)}
             <div className="mt-2 border-t pt-2"><label className="block text-xs font-bold text-slate-500 mb-1">PDF資料</label><button onClick={()=>pdfInputRef.current?.click()} className={`w-full py-2 border rounded text-xs flex items-center justify-center gap-2 ${pdfData ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-slate-50 text-slate-500'}`}><FileText className="w-4 h-4"/> {pdfData ? '添付済' : '選択'}</button><input type="file" ref={pdfInputRef} className="hidden" accept="application/pdf" onChange={handlePdfUpload}/></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MeasurementInputPanel = ({ config, values, onChange, onComplete, pastData, lot, comboPresets = [], voiceAssistantActive = false }) => {
  const [activeInputIdx, setActiveInputIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef(null);
  const inputRefs = useRef({});

  const inputs = config?.inputs || [];
  const activeInput = inputs[activeInputIdx];

  // Multi-calculation results (backward compatible)
  const calcResults = useMemo(() => {
    if (!config) return [];
    return calculateMeasurementResults(values, config);
  }, [values, config]);

  // Legacy single result for backward compat
  const result = useMemo(() => {
    if (!config) return null;
    return calculateMeasurementResult(values, config);
  }, [values, config]);

  const isOk = useMemo(() => {
    if (calcResults.length === 0) return null;
    return calcResults.every(cr => cr.isOk === true || cr.isOk === null);
  }, [calcResults]);

  const advanceInput = () => {
    if (activeInputIdx < inputs.length - 1) {
      setActiveInputIdx(prev => prev + 1);
      setTimeout(() => inputRefs.current[inputs[activeInputIdx + 1]?.id]?.focus(), 50);
    }
  };

  const previousInput = () => {
    if (activeInputIdx > 0) {
      setActiveInputIdx(prev => prev - 1);
      setTimeout(() => inputRefs.current[inputs[activeInputIdx - 1]?.id]?.focus(), 50);
    }
  };

  const handleInputChange = (inputId, val) => {
    onChange({ ...values, [inputId]: val });
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (idx < inputs.length - 1) {
        setActiveInputIdx(idx + 1);
        setTimeout(() => inputRefs.current[inputs[idx + 1]?.id]?.focus(), 50);
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      advanceInput();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      previousInput();
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('このブラウザは音声入力に対応していません'); return; }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      setVoiceTranscript(transcript);
      if (/次へ|次|つぎ/.test(transcript)) { advanceInput(); return; }
      if (/戻る|もどる|前/.test(transcript)) { previousInput(); return; }
      if (/完了|かんりょう|OK|オーケー/.test(transcript)) { if (onComplete) onComplete(); return; }
      const num = parseJapaneseNumber(transcript);
      if (num !== null && activeInput) {
        handleInputChange(activeInput.id, num);
        setTimeout(advanceInput, 500);
      }
    };
    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };
    recognition.start();
    setIsListening(true);
  };

  useEffect(() => {
    return () => { if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} } };
  }, []);

  if (!config || !inputs.length) return <div className="text-slate-400 text-center p-8">測定設定がありません</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Visual Layout Area */}
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[300px] overflow-hidden" style={config.diagramImage ? { backgroundImage: `url(${config.diagramImage})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}}>
        {!config.diagramImage && config.layout === 'circle-4point' && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r="35" fill="none" stroke="#cbd5e1" strokeWidth="0.3" strokeDasharray="1.5,1.5"/>
          </svg>
        )}
        {inputs.map((inp, idx) => {
          const val = values[inp.id];
          const isActive = idx === activeInputIdx;
          const pastStats = pastData ? getPastInputStats(pastData, inp.id) : null;
          const presetData = inp.comboPresetId ? comboPresets.find(cp => cp.id === inp.comboPresetId) : null;
          const comboValues = presetData?.values || inp.presetValues || [];
          const isCombobox = inp.inputType === 'combobox' && comboValues.length > 0;
          const isFilled = isCombobox ? (val !== '' && val != null) : (val !== '' && val != null && !isNaN(Number(val)));
          return (
            <div key={inp.id} className="absolute flex flex-col items-center" style={{ left: `${inp.x}%`, top: `${inp.y}%`, transform: 'translate(-50%, -50%)', zIndex: isActive ? 20 : 10 }}>
              <span className="text-[10px] font-bold text-slate-500 mb-0.5 bg-white/80 px-1 rounded whitespace-nowrap">{inp.label}</span>
              {isCombobox ? (
                <div className="flex flex-col items-center gap-0.5">
                  <select
                    ref={el => { inputRefs.current[inp.id] = el; }}
                    value={comboValues.includes(val) ? val : ''}
                    onChange={e => handleInputChange(inp.id, e.target.value)}
                    onFocus={() => setActiveInputIdx(idx)}
                    onKeyDown={e => handleKeyDown(e, idx)}
                    className={`w-24 h-8 text-center text-sm font-mono font-bold rounded border-2 shadow-sm outline-none transition-all ${isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-white' : isFilled ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}
                  >
                    <option value="">--</option>
                    {comboValues.map((pv, pi) => <option key={pi} value={pv}>{pv}</option>)}
                  </select>
                  <input
                    type="text"
                    value={val ?? ''}
                    onChange={e => handleInputChange(inp.id, e.target.value)}
                    onFocus={() => setActiveInputIdx(idx)}
                    placeholder="直接入力"
                    className={`w-24 h-6 text-center text-[10px] font-mono rounded border shadow-sm outline-none ${isActive ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50'}`}
                  />
                </div>
              ) : (
                <input
                  ref={el => { inputRefs.current[inp.id] = el; }}
                  type="number"
                  step="any"
                  value={val ?? ''}
                  onChange={e => handleInputChange(inp.id, e.target.value)}
                  onFocus={() => setActiveInputIdx(idx)}
                  onKeyDown={e => handleKeyDown(e, idx)}
                  className={`w-20 h-8 text-center text-sm font-mono font-bold rounded border-2 shadow-sm outline-none transition-all ${isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-white' : isFilled ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}
                />
              )}
              {pastStats && (
                <span className="text-[8px] text-slate-400 mt-0.5 whitespace-nowrap bg-white/80 px-0.5 rounded">
                  前回:{pastStats.last?.toFixed(3)} | 平均:{pastStats.avg?.toFixed(3)} (N={pastStats.count})
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Multi-Calculation Results Display */}
      <div className="mt-3 space-y-2">
        {calcResults.map((cr, crIdx) => {
          const methodLabel = CALCULATION_METHODS.find(m => m.value === cr.method)?.label || cr.method;
          return (
            <div key={cr.id || crIdx} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-slate-500"/>
                  <span className="text-sm font-bold text-slate-700">{cr.label} ({methodLabel}):</span>
                  <span className="text-xl font-mono font-black text-slate-800">
                    {cr.result !== null ? cr.result.toFixed(4) : '---'}
                  </span>
                  <span className="text-sm text-slate-500">{cr.unit}</span>
                </div>
                {cr.result !== null && cr.isOk !== null && (
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${cr.isOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {cr.isOk ? 'OK' : 'NG'}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                公差: {cr.toleranceLower} ~ {cr.toleranceUpper} {cr.unit}
                {cr.inputIds?.length > 0 && <span className="ml-2">対象: {cr.inputIds.join(', ')}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Voice Input */}
      <div className="mt-3 flex items-center gap-3">
        {voiceAssistantActive ? (
          <button disabled className="flex-1 py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 bg-blue-100 text-blue-400 border border-blue-200 cursor-not-allowed">
            <Bot className="w-5 h-5"/> 音声アシスタント制御中
          </button>
        ) : (
          <button onClick={startVoice} className={`flex-1 py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${isListening ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-500/30' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'}`}>
            {isListening ? <><Mic className="w-5 h-5"/> 音声認識中...</> : <><Mic className="w-5 h-5"/> 音声入力</>}
          </button>
        )}
        {isListening && voiceTranscript && (
          <div className="text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded border flex-1 truncate">{voiceTranscript}</div>
        )}
      </div>
    </div>
  );
};

const WorkExecutionModal = ({ lot, onClose, onSave, onFinish, defectProcessOptions, complaintOptions, lots, comboPresets = [], voiceSettingsConfig = {}, voiceCommandsConfig = null, undoTimeout = 5, sharedNotes = [] }) => {
  const [executionType, setExecutionType] = useState('initial');
  const [currentStepIdx, setCurrentStepIdx] = useState(lot.currentStepIndex || 0);
  const [currentUnitIdx, setCurrentUnitIdx] = useState(lot.currentUnitIndex || 0);
  const totalUnits = lot.quantity || 1;
  const [localSteps, setLocalSteps] = useState(lot.steps || []);
  // 該当する共有ノート（型式 or 工程タイトルが一致）
  const getStepNotes = (stepTitle) => sharedNotes.filter(n =>
    (n.model && n.model === lot.model && (!n.stepTitle || n.stepTitle === stepTitle)) ||
    (n.stepTitle && n.stepTitle === stepTitle && !n.model)
  );
  const lotNotes = sharedNotes.filter(n => n.model && n.model === lot.model && !n.stepTitle);
  const [tasks, setTasks] = useState(lot.tasks || {});
  const tasksRef = useRef(lot.tasks || {});
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const [stepTimes, setStepTimes] = useState(lot.stepTimes || {});
  
  // Timer for Sequential Mode
  const [startTime, setStartTime] = useState(lot.workStartTime || null);
  const [elapsed, setElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(lot.status === 'processing');
  
  // Batch processing state for custom mode
  const [batchStartTimes, setBatchStartTimes] = useState({});

  // Force re-render counter for custom mode timer display
  const [timerTick, setTimerTick] = useState(0);
  
  // Interruptions (Defects/Monitoring)
  const [interruptions, setInterruptions] = useState(lot.interruptions || []);
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [defectLabel, setDefectLabel] = useState('');
  const [defectCauseProcess, setDefectCauseProcess] = useState('');
  const [defectPhotos, setDefectPhotos] = useState([]);
  const defectPhotoRef = useRef(null);

  // Complaint (observation) state
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintLabel, setComplaintLabel] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('');

  // Confirmation state
  const [isConfirming, setIsConfirming] = useState(false);

  // Undo state
  const [pendingUndo, setPendingUndo] = useState(null); // { key, type, previousTasks, previousBatchStartTimes, timer }
  const pendingUndoTimerRef = useRef(null);
  const pendingUndoCountdownRef = useRef(null);
  const [undoCountdown, setUndoCountdown] = useState(0);

  const commitPendingUndo = () => {
    if (pendingUndoTimerRef.current) clearTimeout(pendingUndoTimerRef.current);
    if (pendingUndoCountdownRef.current) clearInterval(pendingUndoCountdownRef.current);
    setPendingUndo(null);
    setUndoCountdown(0);
  };

  const handleUndo = () => {
    if (!pendingUndo) return;
    if (pendingUndoTimerRef.current) clearTimeout(pendingUndoTimerRef.current);
    if (pendingUndoCountdownRef.current) clearInterval(pendingUndoCountdownRef.current);
    setTasks(pendingUndo.previousTasks);
    if (pendingUndo.previousBatchStartTimes !== undefined) {
      setBatchStartTimes(pendingUndo.previousBatchStartTimes);
    }
    onSave({ tasks: pendingUndo.previousTasks, status: 'processing' });
    setPendingUndo(null);
    setUndoCountdown(0);
  };

  const startUndoTimer = (undoData) => {
    if (pendingUndoTimerRef.current) clearTimeout(pendingUndoTimerRef.current);
    if (pendingUndoCountdownRef.current) clearInterval(pendingUndoCountdownRef.current);
    setUndoCountdown(undoTimeout);
    setPendingUndo(undoData);
    pendingUndoCountdownRef.current = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) { clearInterval(pendingUndoCountdownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    pendingUndoTimerRef.current = setTimeout(() => {
      clearInterval(pendingUndoCountdownRef.current);
      setPendingUndo(null);
      setUndoCountdown(0);
    }, undoTimeout * 1000);
  };

  // Measurement state
  const [measurementResults, setMeasurementResults] = useState(lot.measurementResults || {});

  const [showPdf, setShowPdf] = useState(false);
  const [activeCustomTaskKey, setActiveCustomTaskKey] = useState(null);

  // Voice Assistant
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceBarOpen, setVoiceBarOpen] = useState(false);
  const voiceActiveRef = useRef(false);
  const voiceRunningRef = useRef(false);

  // Voice log for transcript display
  const [voiceLog, setVoiceLog] = useState([]);
  const [seqVoiceLogOpen, setSeqVoiceLogOpen] = useState(false);
  const addVoiceLog = (type, text) => {
    setVoiceLog(prev => [...prev.slice(-19), { type, text, time: Date.now() }]);
  };

  // Voice settings (read from app settings passed via props)
  const voiceSettings = useMemo(() => ({
    voiceName: voiceSettingsConfig?.voiceName || null,
    rate: voiceSettingsConfig?.rate || 1.1,
    volume: voiceSettingsConfig?.volume ?? 1.0,
  }), [voiceSettingsConfig]);

  // Voice command matchers (built from user-configured mappings)
  const vcm = useMemo(() => buildVoiceMatcher(voiceCommandsConfig), [voiceCommandsConfig]);
  const matchYes = (t) => (vcm.yes || isYesResponse)(t);
  const matchNo = (t) => (vcm.no || isNoResponse)(t);
  const matchComplete = (t) => (vcm.complete || isCompleteCmd)(t);
  const matchInterrupt = (t) => (vcm.interrupt || isInterruptCmd)(t);
  const matchNext = (t) => (vcm.next || isNextCmd)(t);
  const matchNextStep = (t) => isNextStepCmd(t);
  const matchCancel = (t) => isCancelCmd(t);
  const matchMeasurement = (t) => (vcm.measurement || ((x) => /測定入力|測定開始|そくてい/i.test(x || '')))(t);
  const matchSequential = (t) => (vcm.sequential || ((x) => /通常|じゅんじょ|順序|ノーマル/i.test(x || '')))(t);
  const matchCustom = (t) => (vcm.custom || ((x) => /カスタム|自由|じゆう/i.test(x || '')))(t);
  const matchBatch = (t) => (vcm.batch || ((x) => /まとめ|一括|バッチ/i.test(x || '')))(t);
  const matchAllComplete = (t) => (vcm.allComplete || ((x) => /全部完了|全作業完了|すべて完了/i.test(x || '')))(t);

  // Wrapped speak that logs and applies settings
  const speakWithLog = (text, onEnd) => {
    addVoiceLog('assistant', text);
    isSpeakingTTS = true;
    speak(text, () => { isSpeakingTTS = false; onEnd?.(); }, voiceSettings);
  };
  const speakAsyncWithLog = (text) => {
    addVoiceLog('assistant', text);
    return speakAsync(text, voiceSettings);
  };
  const [interimText, setInterimText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [isListeningNow, setIsListeningNow] = useState(false);
  const listenOnceWithLog = async (options) => {
    setInterimText('');
    setVoiceError('');
    setIsListeningNow(true);
    const result = await listenOnce({
      ...options,
      onInterim: (text) => setInterimText(text),
      onError: (msg) => { setVoiceError(msg); addVoiceLog('assistant', '⚠️ ' + msg); },
      onListening: () => setIsListeningNow(true),
    });
    setInterimText('');
    setIsListeningNow(false);
    if (result) addVoiceLog('user', result);
    return result;
  };

  // Initialize
  useEffect(() => {
    if (lot.tasks && Object.keys(lot.tasks).length > 0) {
       setExecutionType('custom');
    }
    setElapsed(lot.totalWorkTime || 0);
  }, []);

  // Timer Tick (Global & Interruption)
  useEffect(() => {
    let interval;
    const now = Date.now();

    const hasActiveInterruption = interruptions.some(i => i.status === 'active');
    if ((executionType === 'sequential' && isTimerRunning) || executionType === 'custom' || hasActiveInterruption) {
       if (!startTime) setStartTime(now);
       interval = setInterval(() => {
         const currentNow = Date.now();

         // Main Timer (Sequential)
         if (executionType === 'sequential' && isTimerRunning) {
             const start = startTime || currentNow;
             setElapsed((lot.totalWorkTime || 0) + (currentNow - start));
         }

         // Update Interruption durations
         setInterruptions(prev => prev.map(i => {
             if (i.status === 'active') {
                 return { ...i, duration: Math.floor((currentNow - i.startTime) / 1000) };
             }
             return i;
         }));

         // Custom Tasks: use functional update to avoid stale closure
         if (executionType === 'custom') {
           setTasks(prev => ({...prev}));
           setTimerTick(prev => prev + 1);
         }
       }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, executionType, startTime, interruptions.length]);

  // --- Defect & Monitor Logic ---
  const startInterruption = (type, label, causeProcess, photos) => {
      const curStep = localSteps[currentStepIdx] || localSteps[0];
      const newInt = {
          id: generateId(),
          type,
          label,
          timestamp: Date.now(),
          startTime: Date.now(),
          duration: 0,
          status: 'active',
          workerName: lot.workerId || '',
          stepInfo: curStep ? { stepId: curStep.id, title: curStep.title } : null,
          causeProcess: causeProcess || '',
          photos: photos || []
      };
      const updated = [...interruptions, newInt];
      setInterruptions(updated);
      onSave({ interruptions: updated });
      if (type === 'defect') {
        setShowDefectModal(false);
        setDefectLabel('');
        setDefectCauseProcess('');
        setDefectPhotos([]);
      }
  };

  const stopInterruption = (id) => {
      const updated = interruptions.map(i => i.id === id ? { ...i, status: 'completed' } : i);
      setInterruptions(updated);
      onSave({ interruptions: updated });
  };

  // --- Break Logic ---
  const isOnBreak = interruptions.some(i => i.type === 'break' && i.status === 'active');
  const breakInterruption = interruptions.find(i => i.type === 'break' && i.status === 'active');
  const breakDuration = breakInterruption?.duration || 0;

  const toggleBreak = () => {
    if (isOnBreak) {
      stopInterruption(breakInterruption.id);
    } else {
      startInterruption('break', '中断', '', []);
    }
  };

  // --- Mode Switching ---
  const switchToCustom = () => {
    voiceRunningRef.current = false;
    setExecutionType('custom');
    if (!isTimerRunning) handleStart();
  };
  const switchToSequential = () => {
    voiceRunningRef.current = false;
    // カスタムで完了済みのタスクをスキップして、最初の未完了工程×台に飛ぶ
    let foundIncomplete = false;
    for (let sIdx = 0; sIdx < localSteps.length; sIdx++) {
      for (let uIdx = 0; uIdx < totalUnits; uIdx++) {
        const t = tasks[`${sIdx}-${uIdx}`];
        if (!t || t.status !== 'completed') {
          setCurrentStepIdx(sIdx);
          setCurrentUnitIdx(uIdx);
          foundIncomplete = true;
          break;
        }
      }
      if (foundIncomplete) break;
    }
    if (!foundIncomplete) {
      // 全部完了済み → 最終工程の最終台に設定
      setCurrentStepIdx(localSteps.length - 1);
      setCurrentUnitIdx(totalUnits - 1);
    }
    setExecutionType('sequential');
    if (!isTimerRunning) handleStart();
    stepUnitStartRef.current = Date.now();
  };

  // --- Sequential Handlers ---
  const currentStep = localSteps[currentStepIdx];
  const handleStart = () => { setIsTimerRunning(true); setStartTime(Date.now()); stepUnitStartRef.current = Date.now(); onSave({ status: 'processing', workStartTime: Date.now() }); };
  const handlePause = () => { setIsTimerRunning(false); onSave({ status: 'paused', totalWorkTime: elapsed, workStartTime: null }); };
  // stepUnitTimes: { "stepId-unitIdx": seconds } 各工程×各台の個別時間
  const [stepUnitTimes, setStepUnitTimes] = useState(lot.stepUnitTimes || {});
  const stepUnitStartRef = useRef(Date.now());

  // カスタムで完了済みかチェック
  const isTaskCompleted = (sIdx, uIdx) => {
    const t = tasks[`${sIdx}-${uIdx}`];
    return t && t.status === 'completed';
  };

  // 次の未完了タスクを探す（現在位置の次から）
  const findNextIncomplete = (fromStep, fromUnit) => {
    let sIdx = fromStep, uIdx = fromUnit;
    // 次の位置から探す
    uIdx++;
    while (sIdx < localSteps.length) {
      while (uIdx < totalUnits) {
        if (!isTaskCompleted(sIdx, uIdx)) return { step: sIdx, unit: uIdx };
        uIdx++;
      }
      sIdx++;
      uIdx = 0;
    }
    return null; // 全部完了
  };

  const handleNext = () => {
    // 現在の工程×台の作業時間を記録
    const now = Date.now();
    const unitDuration = Math.floor((now - stepUnitStartRef.current) / 1000);
    const unitKey = `${currentStep.id}-${currentUnitIdx}`;
    const newStepUnitTimes = { ...stepUnitTimes, [unitKey]: unitDuration };
    setStepUnitTimes(newStepUnitTimes);
    stepUnitStartRef.current = now;

    // カスタムモードのtasksにも完了を記録（モード切替時に整合性を保つ）
    const taskKey = `${currentStepIdx}-${currentUnitIdx}`;
    if (!tasks[taskKey] || tasks[taskKey].status !== 'completed') {
      const newTasks = { ...tasks, [taskKey]: { status: 'completed', duration: unitDuration, startTime: null } };
      setTasks(newTasks);
      tasksRef.current = newTasks;
    }

    // 工程全体の合計時間を計算して保存
    let stepTotal = 0;
    for (let u = 0; u < totalUnits; u++) {
      stepTotal += newStepUnitTimes[`${currentStep.id}-${u}`] || 0;
    }
    const newStepTimes = { ...stepTimes, [currentStep.id]: stepTotal };
    setStepTimes(newStepTimes);

    // 次の未完了タスクを探す（カスタムで完了済みはスキップ）
    const next = findNextIncomplete(currentStepIdx, currentUnitIdx);
    if (next) {
      setCurrentStepIdx(next.step);
      setCurrentUnitIdx(next.unit);
      onSave({ currentStepIndex: next.step, currentUnitIndex: next.unit, totalWorkTime: elapsed, stepTimes: newStepTimes, stepUnitTimes: newStepUnitTimes, measurementResults, tasks: tasksRef.current });
    } else {
      // 全工程×全台完了
      onSave({ totalWorkTime: elapsed, stepTimes: newStepTimes, stepUnitTimes: newStepUnitTimes, measurementResults, tasks: tasksRef.current });
      handleCompleteTrigger();
    }
  };
  
  // --- Voice Assistant Logic ---
  const runMicTest = async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addVoiceLog('assistant', '❌ SpeechRecognition API非対応'); return false; }
    addVoiceLog('assistant', '✅ SpeechRecognition API検出');
    // 軽量チェック: SRインスタンスを作って即停止（5秒テストは省略、PCで干渉するため）
    return new Promise((resolve) => {
      const r = new SR();
      r.lang = 'ja-JP';
      r.continuous = false;
      r.interimResults = false;
      let done = false;
      r.onerror = (e) => {
        if (done) return; done = true;
        if (e.error === 'not-allowed') {
          addVoiceLog('assistant', '❌ マイク権限が拒否されています');
          resolve(false);
        } else if (e.error === 'aborted' || e.error === 'no-speech') {
          addVoiceLog('assistant', '✅ マイクOK');
          resolve(true);
        } else if (e.error === 'network') {
          addVoiceLog('assistant', '❌ ネットワーク接続を確認してください');
          resolve(false);
        } else {
          addVoiceLog('assistant', `⚠️ マイクチェック: ${e.error}`);
          resolve(true); // 不明なエラーでも続行
        }
      };
      r.onend = () => { if (!done) { done = true; addVoiceLog('assistant', '✅ マイクOK'); resolve(true); } };
      r.onaudiostart = () => { if (!done) { done = true; addVoiceLog('assistant', '✅ マイクOK'); try { r.stop(); } catch {} resolve(true); } };
      try {
        r.start();
        // 1.5秒で切り上げ（長時間ブロックしない）
        setTimeout(() => { if (!done) { done = true; try { r.stop(); } catch {} addVoiceLog('assistant', '✅ マイクOK（タイムアウト）'); resolve(true); } }, 1500);
      } catch(e) {
        addVoiceLog('assistant', `❌ 開始失敗: ${e.message}`);
        resolve(false);
      }
    });
  };

  const toggleVoice = async () => {
    const newVal = !voiceEnabled;
    // iOS: ユーザータップのコンテキストでTTSをアンロック
    unlockTTSForIOS();
    setVoiceEnabled(newVal);
    voiceActiveRef.current = newVal;
    if (newVal) {
      setVoiceBarOpen(true); // テスト結果を見えるように展開
      const micOk = await runMicTest();
      if (!micOk) {
        addVoiceLog('assistant', '⚠️ マイクが動作していません。音声認識なしで続行します');
      }
      if (!voiceActiveRef.current) return; // テスト中にOFFにされた場合
      if (executionType === 'initial') {
        speakWithLog('音声アシスタントON。通常かカスタム、どちらにしますか？');
        runVoiceInitialFlow();
      } else if (executionType === 'custom') {
        speakWithLog('音声アシスタントON。どの工程から始めますか？');
        runVoiceCustomListenLoop();
      } else if (executionType === 'sequential') {
        speakWithLog('音声アシスタントON。通常モードで進めます');
        if (!isTimerRunning) handleStart();
        runVoiceSequentialFlow(currentStepIdx);
      }
    } else {
      window.speechSynthesis?.cancel();
      stopIOSResumeFix();
      setVoiceStatus('');
      addVoiceLog('assistant', '音声アシスタントOFF');
    }
  };

  // Voice: Initial mode selection flow
  const runVoiceInitialFlow = async () => {
    if (voiceRunningRef.current) return;
    voiceRunningRef.current = true;
    try {
      setVoiceStatus('🎤 「通常」or「カスタム」と言ってください');
      while (voiceActiveRef.current) {
        const cmd = await listenOnceWithLog({ timeout: 15000 });
        if (!voiceActiveRef.current) return;
        if (!cmd) continue;
        if (matchSequential(cmd)) {
          await speakAsyncWithLog('通常モードで開始します');
          setExecutionType('sequential');
          // タイマー未開始なら自動開始
          if (!isTimerRunning) handleStart();
          return;
        }
        if (matchCustom(cmd)) {
          await speakAsyncWithLog('カスタムモードで開始します');
          setExecutionType('custom');
          return;
        }
        await speakAsyncWithLog('通常かカスタム、どちらにしますか？');
      }
    } finally { voiceRunningRef.current = false; }
  };

  // Voice: Custom mode - listen for commands and auto-operate UI
  const runVoiceCustomListenLoop = async () => {
    if (voiceRunningRef.current) return;
    voiceRunningRef.current = true;
    try {
      const stepNames = localSteps.map((s, i) => ({ idx: i, title: s.title, num: i + 1 }));
      setVoiceStatus('🎤 工程名・番号と台数を言ってください');

      while (voiceActiveRef.current) {
        const rawCmd = await listenOnceWithLog({ timeout: 15000 });
        if (!voiceActiveRef.current) return;
        if (!rawCmd) continue;
        const cmd = normalizeVoiceText(rawCmd);

        // Check for completion command
        if (matchAllComplete(cmd) || matchAllComplete(rawCmd)) {
          await speakAsyncWithLog('全作業を完了しますか？');
          const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
          if (matchYes(confirm) || confirm === null) {
            handleCompleteTrigger();
            return;
          }
          continue;
        }

        // --- キャンセル（取り消し）コマンド ---
        if (matchCancel(cmd) || matchCancel(rawCmd)) {
          handleUndo();
          await speakAsyncWithLog('取り消しました');
          continue;
        }

        // --- 次工程コマンド（同じ台数で次の工程へ）---
        if ((matchNextStep(cmd) || matchNextStep(rawCmd)) && activeCustomTaskKey) {
          const [sI, uI] = activeCustomTaskKey.split('-').map(Number);
          voiceToggleTask(sI, uI); // 現在を完了
          const nextS = sI + 1;
          if (nextS < localSteps.length) {
            voiceToggleTask(nextS, uI); // 次工程の同じ台数を開始
            setActiveCustomTaskKey(`${nextS}-${uI}`);
            await speakAsyncWithLog(`${nextS+1}工程、${uI+1}台目を開始しました`);
            await runVoiceCustomTaskFlow(nextS, uI);
          } else {
            await speakAsyncWithLog('最後の工程です。全作業完了しますか？');
            const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
            if (matchYes(confirm) || confirm === null) { handleCompleteTrigger(); return; }
          }
          continue;
        }

        // Parse step number and unit number from normalized speech
        // Pattern: "XのY" or "X-Y" → X工程Y台目 (e.g. "1の1", "3の2", "5-1")
        const shortMatch = cmd.match(/(\d+)\s*[のノ\-ー]\s*(\d+)/);
        // Patterns: "1工程", "工程1", "ステップ1", "第1工程"
        const stepMatch = shortMatch ? null : (cmd.match(/(\d+)\s*工程/) || cmd.match(/工程\s*(\d+)/) || cmd.match(/ステップ\s*(\d+)/) || cmd.match(/第\s*(\d+)/));
        // Patterns: "1台目", "1台め", "1番", "台目1"
        const unitMatch = shortMatch ? null : (cmd.match(/(\d+)\s*台[目め]?/) || cmd.match(/(\d+)\s*番/));
        // Also try step name matching
        let stepByName = null;
        if (!stepMatch && !shortMatch) {
          for (const sn of stepNames) {
            if (cmd.includes(sn.title)) { stepByName = sn.num; break; }
          }
        }

        let stepNum = shortMatch ? parseInt(shortMatch[1]) : (stepMatch ? parseInt(stepMatch[1]) : stepByName);
        let unitNum = shortMatch ? parseInt(shortMatch[2]) : (unitMatch ? parseInt(unitMatch[1]) : null);

        // 工程番号だけ認識した場合（台目なし）→ 台数を聞く
        if (stepNum !== null && unitNum === null && !matchBatch(cmd)) {
          const sIdx = stepNum - 1;
          if (sIdx >= 0 && sIdx < localSteps.length) {
            await speakAsyncWithLog(`${stepNum}工程、何台目ですか？`);
            const unitCmd = await listenOnceWithLog({ timeout: 10000 });
            if (unitCmd) {
              const normUnit = normalizeVoiceText(unitCmd);
              const uMatch = normUnit.match(/(\d+)/);
              if (uMatch) unitNum = parseInt(uMatch[1]);
            }
          }
        }

        if (stepNum !== null && unitNum !== null) {
          const sIdx = stepNum - 1;
          const uIdx = unitNum - 1;
          if (sIdx >= 0 && sIdx < localSteps.length && uIdx >= 0 && uIdx < lot.quantity) {
            const taskKey = `${sIdx}-${uIdx}`;
            const curTask = tasksRef.current[taskKey] || { status: 'waiting', duration: 0 };
            if (curTask.status === 'waiting' || curTask.status === 'paused') {
              voiceToggleTask(sIdx, uIdx);
              await speakAsyncWithLog(`${stepNum}工程、${unitNum}台目を開始しました`);
              setActiveCustomTaskKey(taskKey);
              await runVoiceCustomTaskFlow(sIdx, uIdx);
            } else if (curTask.status === 'processing') {
              await speakAsyncWithLog(`${stepNum}工程${unitNum}台目を完了しますか？`);
              const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
              if (matchYes(confirm) || confirm === null) {
                voiceToggleTask(sIdx, uIdx);
                await speakAsyncWithLog('完了しました。次はどうしますか？');
              }
            } else {
              await speakAsyncWithLog(`${stepNum}工程${unitNum}台目は既に完了済みです`);
            }
          } else {
            await speakAsyncWithLog('その工程または台数は存在しません');
          }
        } else if (matchComplete(cmd)) {
          if (activeCustomTaskKey) {
            const [sI, uI] = activeCustomTaskKey.split('-').map(Number);
            voiceToggleTask(sI, uI);
            await speakAsyncWithLog(`${sI+1}工程${uI+1}台目を完了しました。次はどうしますか？`);
          }
        } else if (matchMeasurement(cmd)) {
          if (activeCustomTaskKey) {
            const [sI] = activeCustomTaskKey.split('-').map(Number);
            const step = localSteps[sI];
            if (step?.type === 'measurement' && step.measurementConfig) {
              await runVoiceMeasurementFlow(step, sI);
            } else {
              await speakAsyncWithLog('この工程に測定項目はありません');
            }
          } else {
            await speakAsyncWithLog('先に工程を開始してください');
          }
        } else if (matchInterrupt(cmd)) {
          toggleBreak();
          await speakAsyncWithLog('中断しました');
        } else if (matchNext(cmd) && activeCustomTaskKey) {
          const [sI, uI] = activeCustomTaskKey.split('-').map(Number);
          voiceToggleTask(sI, uI); // 現在を完了
          let nextS = sI, nextU = uI + 1;
          if (nextU >= lot.quantity) { nextS++; nextU = 0; }
          if (nextS < localSteps.length) {
            voiceToggleTask(nextS, nextU); // 次を開始
            setActiveCustomTaskKey(`${nextS}-${nextU}`);
            await speakAsyncWithLog(`${nextS+1}工程、${nextU+1}台目を開始しました`);
            await runVoiceCustomTaskFlow(nextS, nextU);
          } else {
            await speakAsyncWithLog('全工程が終了しました。全作業完了しますか？');
            const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
            if (matchYes(confirm) || confirm === null) {
              handleCompleteTrigger();
              return;
            }
          }
        } else {
          setVoiceStatus('🎤 工程と台数を言ってください（例:「1の1」「1工程1台目」）');
        }
      }
    } finally { voiceRunningRef.current = false; }
  };

  // Voice: Handle a single custom task (measurement input etc.)
  // 音声フロー用: stale closure回避でRefからtoggle
  const voiceToggleTask = (sIdx, uIdx) => {
    const key = `${sIdx}-${uIdx}`;
    setTasks(prev => {
      const cur = prev[key] || { status: 'waiting', duration: 0, startTime: null };
      if (cur.status === 'waiting' || cur.status === 'paused') {
        const updated = { ...prev, [key]: { ...cur, status: 'processing', startTime: Date.now() } };
        onSave({ tasks: updated, status: 'processing' });
        startUndoTimer({ key, type: 'task', previousTasks: prev });
        return updated;
      } else if (cur.status === 'processing') {
        const now = Date.now();
        const dur = cur.startTime ? Math.floor((now - cur.startTime) / 1000) : 0;
        const updated = { ...prev, [key]: { ...cur, status: 'completed', duration: cur.duration + dur, startTime: null } };
        onSave({ tasks: updated, status: 'processing' });
        startUndoTimer({ key, type: 'task', previousTasks: prev });
        return updated;
      }
      return prev;
    });
  };

  const runVoiceCustomTaskFlow = async (sIdx, uIdx) => {
    const step = localSteps[sIdx];
    if (!step || !voiceActiveRef.current) return;

    if (step.type === 'measurement' && step.measurementConfig) {
      await speakAsyncWithLog('測定入力しますか？');
      const answer = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
      if (matchYes(answer) || answer === null) {
        await runVoiceMeasurementFlow(step, sIdx);
      }
    }
    // 完了/次/次工程/中断/キャンセルを待つループ
    setVoiceStatus('🎤 「完了」「次」「次工程」「キャンセル」「中断」');
    while (voiceActiveRef.current) {
      const cmd = await listenOnceWithLog({ timeout: 15000 });
      if (!voiceActiveRef.current) return;
      if (!cmd) continue;
      const norm = normalizeVoiceText(cmd);

      // キャンセル（取り消し）
      if (matchCancel(norm) || matchCancel(cmd)) {
        handleUndo();
        await speakAsyncWithLog('取り消しました');
        continue;

      } else if (matchComplete(norm) || matchComplete(cmd)) {
        voiceToggleTask(sIdx, uIdx); // 完了（Ref経由で最新state使用）
        await speakAsyncWithLog(`${sIdx+1}工程${uIdx+1}台目を完了しました。次はどうしますか？`);
        return; // メインループに戻る

      // 次工程（同じ台数で次の工程）— "次"より先にチェック
      } else if (matchNextStep(norm) || matchNextStep(cmd)) {
        voiceToggleTask(sIdx, uIdx); // 現在を完了
        const nextS = sIdx + 1;
        if (nextS < localSteps.length) {
          voiceToggleTask(nextS, uIdx); // 次工程の同じ台数
          setActiveCustomTaskKey(`${nextS}-${uIdx}`);
          await speakAsyncWithLog(`${nextS+1}工程、${uIdx+1}台目を開始しました`);
          await runVoiceCustomTaskFlow(nextS, uIdx);
        } else {
          await speakAsyncWithLog('最後の工程です。全作業完了しますか？');
          const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
          if (matchYes(confirm) || confirm === null) { handleCompleteTrigger(); return; }
        }
        return;

      } else if (matchNext(norm) || matchNext(cmd)) {
        voiceToggleTask(sIdx, uIdx); // 現在を完了
        // 次のユニット/ステップを探す
        let nextS = sIdx, nextU = uIdx + 1;
        if (nextU >= lot.quantity) { nextS++; nextU = 0; }
        if (nextS < localSteps.length) {
          voiceToggleTask(nextS, nextU); // 次を開始
          setActiveCustomTaskKey(`${nextS}-${nextU}`);
          await speakAsyncWithLog(`${nextS+1}工程、${nextU+1}台目を開始しました`);
          await runVoiceCustomTaskFlow(nextS, nextU);
        } else {
          await speakAsyncWithLog('全工程が終了しました');
          handleCompleteTrigger();
        }
        return;

      } else if (matchInterrupt(norm) || matchInterrupt(cmd)) {
        toggleBreak(); // 一時停止のみ（不具合報告は開かない）
        await speakAsyncWithLog('中断しました。再開するときは中断ボタンを押してください');
        return;

      } else if (matchAllComplete(norm) || matchAllComplete(cmd)) {
        await speakAsyncWithLog('全作業を完了しますか？');
        const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
        if (matchYes(confirm) || confirm === null) {
          handleCompleteTrigger();
          return;
        }
      }
      // 認識できないコマンド → 再度待機
      setVoiceStatus('🎤 「完了」「次」「次工程」「キャンセル」「中断」');
    }
  };

  const runVoiceSequentialFlow = async (stepIdx) => {
    if (voiceRunningRef.current || !voiceActiveRef.current) return;
    voiceRunningRef.current = true;
    try {
      const step = localSteps[stepIdx];
      if (!step) return;
      const unitLabel = totalUnits > 1 ? `${currentUnitIdx + 1}台目、` : '';
      await speakAsyncWithLog(`工程${stepIdx + 1}、${unitLabel}${step.title}です。`);
      if (!voiceActiveRef.current) return;

      if (step.type === 'measurement' && step.measurementConfig) {
        await runVoiceMeasurementFlow(step, stepIdx);
      } else {
        const nextLabel = currentUnitIdx < totalUnits - 1
          ? `「完了」で次の台、「次工程」で次工程に進みます`
          : `「完了」で次に進みます`;
        setVoiceStatus(`🎤 ${nextLabel}`);
        while (voiceActiveRef.current) {
          const cmd = await listenOnceWithLog({ timeout: 15000 });
          if (!voiceActiveRef.current) return;
          if (matchComplete(cmd) || matchNext(cmd)) {
            handleNext(); return;
          } else if (matchInterrupt(cmd)) {
            await speakAsyncWithLog('中断します');
            handlePause(); return;
          } else if (isCancelCmd && isCancelCmd(cmd)) {
            // 取り消し
            if (undoItem) { handleUndo(); await speakAsyncWithLog('取り消しました'); }
          }
        }
      }
    } finally { voiceRunningRef.current = false; }
  };

  const runVoiceMeasurementFlow = async (step, stepIdx) => {
    const config = step.measurementConfig;
    const inputs = config?.inputs || [];
    if (inputs.length === 0) return;

    await speakAsyncWithLog('測定入力を開始します');
    const currentValues = { ...(measurementResults[`${step.id}-values`] || {}) };

    for (let i = 0; i < inputs.length; i++) {
      if (!voiceActiveRef.current) return;
      const inp = inputs[i];
      setVoiceStatus(`🎤 ${inp.label}の入力待ち... (${i + 1}/${inputs.length})`);
      await speakAsyncWithLog(`${inp.label}の結果をお願いします`);

      let retry = 0;
      while (retry < 3 && voiceActiveRef.current) {
        const response = await listenOnceWithLog({ timeout: 12000 });
        if (!voiceActiveRef.current) return;

        if (matchComplete(response)) {
          await speakAsyncWithLog('測定を完了しますか？');
          const c = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });
          if (matchYes(c) || c === null) {
            handleNext(); return;
          }
          retry = 0; continue;
        }
        if (matchInterrupt(response)) {
          await speakAsyncWithLog('中断します');
          handlePause(); return;
        }

        const num = parseJapaneseNumber(response);
        if (num !== null) {
          setVoiceStatus(`🎤 ${inp.label}: ${num} — 確認中 (5秒で自動確定)`);
          await speakAsyncWithLog(`${num}ですね`);
          const confirm = await listenOnceWithLog({ timeout: 5000, defaultValue: 'はい' });

          if (matchNo(confirm)) {
            await speakAsyncWithLog('もう一度お願いします');
            retry = 0; continue;
          }
          // Confirmed (explicit yes or 5s timeout auto-confirm)
          currentValues[inp.id] = num;
          // Update measurement results (per-step + per-unit for report)
          const stepKey = step.id;
          const newMR = { ...measurementResults };
          newMR[`${stepKey}-values`] = currentValues;
          const calcResults = calculateMeasurementResults(currentValues, config);
          const measData = { values: currentValues, calcResults, timestamp: Date.now() };
          newMR[stepKey] = measData;
          // Also store per-unit (unit 0 for sequential mode)
          newMR[`${stepKey}-0`] = measData;
          newMR[`${stepKey}-0-values`] = currentValues;
          setMeasurementResults(newMR);

          if (i < inputs.length - 1) {
            await speakAsyncWithLog('次へ');
          }
          break;
        } else {
          retry++;
          if (retry < 3) await speakAsyncWithLog('聞き取れませんでした。もう一度お願いします');
          else await speakAsyncWithLog('入力をスキップします');
        }
      }
    }

    // All inputs done - announce results
    if (!voiceActiveRef.current) return;
    const finalResults = calculateMeasurementResults(currentValues, config);
    if (finalResults.length > 0) {
      const announcements = finalResults.map(r => {
        const okng = r.isOk ? 'OK' : 'NG';
        return `${r.label}、${r.result?.toFixed(3)}${r.unit}、判定${okng}`;
      }).join('。');
      setVoiceStatus(`🎤 結果発表中...`);
      await speakAsyncWithLog(`計算結果。${announcements}。次工程に進みますか？`);
      const confirm = await listenOnceWithLog({ timeout: 8000, defaultValue: 'はい' });
      if (matchYes(confirm) || confirm === null) {
        handleNext();
      }
    }
  };

  // Start voice flow when step changes and voice is enabled
  useEffect(() => {
    if (voiceEnabled && executionType === 'sequential' && isTimerRunning && currentStep) {
      runVoiceSequentialFlow(currentStepIdx);
    }
    if (voiceEnabled && executionType === 'custom' && !voiceRunningRef.current) {
      runVoiceCustomListenLoop();
    }
    return () => { voiceRunningRef.current = false; };
  }, [voiceEnabled, currentStepIdx, currentUnitIdx, executionType, isTimerRunning]);

  const handleCompleteTrigger = () => {
      setIsTimerRunning(false);
      onSave({ status: 'paused', totalWorkTime: elapsed, workStartTime: null, stepTimes, measurementResults });
      setIsConfirming(true);
  };

  const finalizeComplete = () => {
      onSave({ status: 'completed', location: 'completed', totalWorkTime: elapsed, workStartTime: null, currentStepIndex: localSteps.length, stepTimes, stepUnitTimes, tasks: tasksRef.current, interruptions, measurementResults });
      onFinish();
  };

  const handleNG = () => { setIsTimerRunning(false); onSave({ status: 'error', totalWorkTime: elapsed, workStartTime: null }); onClose(); };

  // --- Custom Mode Handlers ---
  const isManualTaskRunning = useMemo(() => {
    return Object.keys(tasks).some(key => {
       const [stepIdx] = key.split('-').map(Number);
       const step = localSteps[stepIdx];
       return step && !step.title.includes('自動') && tasks[key].status === 'processing';
    });
  }, [tasks, localSteps]);

  const [completedTaskMenu, setCompletedTaskMenu] = useState(null); // { key, stepIdx, unitIdx }

  const toggleTask = (stepIdx, unitIdx) => {
    const key = `${stepIdx}-${unitIdx}`;
    const newTasks = { ...tasks };
    const currentTask = tasks[key] || { status: 'waiting', duration: 0, startTime: null };

    if (currentTask.status === 'completed' || currentTask.status === 'ng') {
      // 完了済み/NG → ポップアップメニュー表示
      setCompletedTaskMenu({ key, stepIdx, unitIdx });
      return;
    }
    if (currentTask.status === 'reworking') {
      // 修正作業中 → 修正完了 → 自動的にcompletedに戻す
      const previousTasks = { ...tasks };
      const now = Date.now();
      const dur = currentTask.reworkStartTime ? Math.floor((now - currentTask.reworkStartTime) / 1000) : 0;
      const reworks = [...(currentTask.reworks || [])];
      reworks[reworks.length - 1] = { ...reworks[reworks.length - 1], duration: dur, endTime: now };
      newTasks[key] = { ...currentTask, status: 'completed', reworkStartTime: null, reworks };
      setTasks(newTasks);
      onSave({ tasks: newTasks, status: 'processing' });
      startUndoTimer({ key, type: 'task', previousTasks });
      return;
    }
    if (currentTask.status === 'rework-done') {
      // 修正完了 → メニュー表示（さらに修正 or OK）
      setCompletedTaskMenu({ key, stepIdx, unitIdx });
      return;
    }

    if (currentTask.status === 'waiting' || currentTask.status === 'paused') {
      const previousTasks = { ...tasks };
      newTasks[key] = { ...currentTask, status: 'processing', startTime: Date.now() };
      setActiveCustomTaskKey(key);
      setTasks(newTasks);
      onSave({ tasks: newTasks, status: 'processing' });
      startUndoTimer({ key, type: 'task', previousTasks });
    } else if (currentTask.status === 'processing') {
      const previousTasks = { ...tasks };
      const now = Date.now();
      const sessionDuration = currentTask.startTime ? Math.floor((now - currentTask.startTime) / 1000) : 0;
      newTasks[key] = { ...currentTask, status: 'completed', duration: currentTask.duration + sessionDuration, startTime: null };
      setTasks(newTasks);
      onSave({ tasks: newTasks, status: 'processing' });
      startUndoTimer({ key, type: 'task', previousTasks });
    }
  };

  // 完了タスクメニューのアクション（メニュー経由 or 直接呼び出し両対応）
  const handleTaskMenuAction = (action, directKey = null) => {
    const key = directKey || completedTaskMenu?.key;
    if (!key) return;
    const previousTasks = { ...tasks };
    const newTasks = { ...tasks };
    const currentTask = tasks[key] || {};

    if (action === 'continue') {
      newTasks[key] = { ...currentTask, status: 'processing', startTime: Date.now() };
      setActiveCustomTaskKey(key);
    } else if (action === 'restart') {
      newTasks[key] = { status: 'processing', duration: 0, startTime: Date.now(), reworks: currentTask.reworks };
      setActiveCustomTaskKey(key);
    } else if (action === 'ng') {
      newTasks[key] = { ...currentTask, status: 'ng', ngAt: Date.now(), reworks: currentTask.reworks || [] };
    } else if (action === 'rework') {
      const reworks = [...(currentTask.reworks || []), { startTime: Date.now(), duration: 0, round: (currentTask.reworks?.length || 0) + 1 }];
      newTasks[key] = { ...currentTask, status: 'reworking', reworkStartTime: Date.now(), reworks };
    } else if (action === 'rework-ok') {
      newTasks[key] = { ...currentTask, status: 'completed' };
    }

    setTasks(newTasks);
    onSave({ tasks: newTasks, status: 'processing' });
    startUndoTimer({ key, type: 'task', previousTasks });
    setCompletedTaskMenu(null);
  };

  const toggleBatch = (stepIdx) => {
    const isBatchStarted = !!batchStartTimes[stepIdx];
    const newTasks = { ...tasks };
    const now = Date.now();

    if (!isBatchStarted) {
        const previousTasks = { ...tasks };
        const previousBatchStartTimes = { ...batchStartTimes };
        Array.from({ length: lot.quantity }).forEach((_, uIdx) => {
            const key = `${stepIdx}-${uIdx}`;
            const currentTask = newTasks[key] || { status: 'waiting', duration: 0, startTime: null };
            if (currentTask.status !== 'completed') {
                newTasks[key] = { ...currentTask, status: 'processing', startTime: now };
            }
        });
        setBatchStartTimes({ ...batchStartTimes, [stepIdx]: now });
        setTasks(newTasks);
        onSave({ tasks: newTasks, status: 'processing' });
        startUndoTimer({ key: `batch-start-${stepIdx}`, type: 'batch', previousTasks, previousBatchStartTimes });
    } else {
        const previousTasks = { ...tasks };
        const previousBatchStartTimes = { ...batchStartTimes };
        const batchStart = batchStartTimes[stepIdx];
        const totalDuration = Math.floor((now - batchStart) / 1000);
        let processedCount = 0;
        Array.from({ length: lot.quantity }).forEach((_, uIdx) => {
            const key = `${stepIdx}-${uIdx}`;
            if (newTasks[key]?.status === 'processing' && newTasks[key]?.startTime === batchStart) {
                processedCount++;
            }
        });
        const perUnitTime = processedCount > 0 ? Math.floor(totalDuration / processedCount) : 0;

        Array.from({ length: lot.quantity }).forEach((_, uIdx) => {
            const key = `${stepIdx}-${uIdx}`;
            const currentTask = newTasks[key];
            if (currentTask && currentTask.status === 'processing') {
                newTasks[key] = { ...currentTask, status: 'completed', duration: currentTask.duration + perUnitTime, startTime: null };
            }
        });
        const newBatchStartTimes = { ...batchStartTimes };
        delete newBatchStartTimes[stepIdx];
        setBatchStartTimes(newBatchStartTimes);
        setTasks(newTasks);
        onSave({ tasks: newTasks, status: 'processing' });
        startUndoTimer({ key: `batch-${stepIdx}`, type: 'batch', previousTasks, previousBatchStartTimes });
    }
  };
  
  const getTaskStatusColor = (status) => {
    switch(status) {
      case 'processing': return 'bg-blue-600 text-white animate-pulse';
      case 'completed': return 'bg-emerald-500 text-white';
      case 'paused': return 'bg-amber-100 text-amber-700';
      case 'ng': return 'bg-red-600 text-white';
      case 'reworking': return 'bg-orange-500 text-white animate-pulse';
      case 'rework-done': return 'bg-orange-300 text-orange-900';
      default: return 'bg-slate-100 text-slate-500 hover:bg-slate-200';
    }
  };

  // --- Confirmation Screen ---
  // 完了タスク再クリック時のポップアップメニュー
  const completedTaskMenuModal = completedTaskMenu && (() => {
    const { key } = completedTaskMenu;
    const task = tasks[key] || {};
    const isNG = task.status === 'ng';
    const isReworkDone = task.status === 'rework-done';
    return (
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4" onClick={() => setCompletedTaskMenu(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-800 text-white p-3 text-center font-bold">#{completedTaskMenu.unitIdx + 1} — {isNG ? 'NG判定済み' : isReworkDone ? '修正完了' : '完了済み'}</div>
          <div className="p-4 space-y-2">
            {(task.status === 'completed') && (
              <>
                <button onClick={() => handleTaskMenuAction('continue')} className="w-full py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 font-bold text-sm flex items-center justify-center gap-2"><PlayCircle className="w-5 h-5"/> 作業の続き</button>
                <button onClick={() => handleTaskMenuAction('restart')} className="w-full py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm flex items-center justify-center gap-2"><RotateCcw className="w-5 h-5"/> 最初から作業</button>
                <button onClick={() => handleTaskMenuAction('ng')} className="w-full py-3 bg-red-600 hover:bg-red-700 border border-red-700 rounded-xl text-white font-black text-lg flex items-center justify-center gap-2"><XCircle className="w-6 h-6"/> NG</button>
              </>
            )}
            {(isNG || isReworkDone) && (
              <>
                <button onClick={() => handleTaskMenuAction('rework')} className="w-full py-3 bg-orange-500 hover:bg-orange-600 border border-orange-600 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"><Wrench className="w-5 h-5"/> 修正作業 開始 {task.reworks?.length > 0 ? `(${task.reworks.length + 1}回目)` : ''}</button>
                {isReworkDone && <button onClick={() => handleTaskMenuAction('rework-ok')} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5"/> 修正OK → 完了</button>}
                {task.reworks?.length > 0 && (
                  <div className="mt-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-xs font-bold text-orange-700 mb-1">修正履歴</div>
                    {task.reworks.map((r, i) => (
                      <div key={i} className="text-xs text-orange-600 flex justify-between"><span>{i+1}回目</span><span className="font-mono">{formatTime(r.duration || 0)}</span></div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-3 border-t text-center"><button onClick={() => setCompletedTaskMenu(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">閉じる</button></div>
        </div>
      </div>
    );
  })();

  if (isConfirming) {
      const summary = localSteps.map((step, idx) => {
          let incompleteCount = 0;
          let duration = 0;
          if (executionType === 'sequential') {
              duration = stepTimes[step.id] || 0;
              // 各台の完了状態をstepUnitTimesで判定
              let completedUnits = 0;
              for (let u = 0; u < totalUnits; u++) {
                if (stepUnitTimes[`${step.id}-${u}`] != null) completedUnits++;
              }
              incompleteCount = totalUnits - completedUnits;
          } else {
              let completeCount = 0;
              let totalDur = 0;
              Array.from({length: lot.quantity}).forEach((_, uIdx) => {
                  const t = tasks[`${idx}-${uIdx}`];
                  if (t?.status === 'completed') { completeCount++; totalDur += t.duration; }
              });
              incompleteCount = lot.quantity - completeCount;
              duration = completeCount > 0 ? totalDur / completeCount : 0;
          }
          return { ...step, duration, incompleteCount };
      });
      const totalIncomplete = summary.reduce((a,b) => a + b.incompleteCount, 0);

      return (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600"/> 作業完了確認
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">作業を完了し、次工程（完了済エリア）へ移動しますか？</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    {totalIncomplete > 0 && (
                        <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 items-start animate-pulse">
                            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0"/>
                            <div><div className="font-bold text-amber-800">未完了の作業があります</div></div>
                        </div>
                    )}
                    <div className="space-y-3">{summary.map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${s.incompleteCount > 0 ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-600'}`}>{i+1}</div>
                                <div><div className="font-bold text-slate-800">{s.title}</div><div className="text-xs text-slate-500">平均: {Math.round(s.duration)}s</div></div>
                            </div>
                            <div>{s.incompleteCount > 0 ? <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">未完了 ({s.incompleteCount})</span> : <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded flex items-center gap-1"><Check className="w-3 h-3"/> 完了</span>}</div>
                        </div>
                    ))}</div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={() => setIsConfirming(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold">戻る</button>
                    <button onClick={finalizeComplete} className="px-6 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold shadow-lg">確定</button>
                </div>
            </div>
        </div>
      );
  }

  if (executionType === 'initial') {
    return (
      <div data-fs="execution" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
           <h2 className="text-xl font-bold mb-6">作業モードを選択してください</h2>
           {/* Voice Assistant Toggle */}
           <div className="flex items-center justify-center mb-5">
             <button onClick={toggleVoice} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${voiceEnabled ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
               {voiceEnabled ? <Mic className="w-4 h-4 animate-pulse"/> : <MicOff className="w-4 h-4"/>}
               音声アシスタント {voiceEnabled ? 'ON' : 'OFF'}
             </button>
           </div>
           {voiceEnabled && (
             <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
               <div className="font-bold mb-1">🎤 音声で操作できます</div>
               <div>「通常」「カスタム」と言うだけでモードが切り替わります。作業中は「1工程の1台目」のように指示すると自動で操作します。</div>
             </div>
           )}
           <div className="flex flex-col gap-4">
             <button onClick={() => setExecutionType('sequential')} className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 transition-colors text-left group">
               <div className="font-bold text-blue-800 text-lg group-hover:underline">順序通りに進める (通常)</div>
               <div className="text-sm text-slate-600 mt-1">手順書に従って、Step 1から順番に作業を行います。</div>
             </button>
             <button onClick={() => setExecutionType('custom')} className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors text-left group">
               <div className="font-bold text-emerald-800 text-lg group-hover:underline">自由に工程を選ぶ (カスタム)</div>
               <div className="text-sm text-slate-600 mt-1">好きな工程を選んで作業できます。台数分のボタンが配置されます。</div>
             </button>
           </div>
           <button onClick={onClose} className="mt-6 text-slate-400 hover:text-slate-600">キャンセル</button>
        </div>
      </div>
    );
  }

  // --- Custom Mode Variables Definition (Fixed) ---
  const isCustom = executionType === 'custom';
  let displayStepIdx = 0;
  let displayUnitIdx = 0;
  if (activeCustomTaskKey) {
     const parts = activeCustomTaskKey.split('-');
     displayStepIdx = parseInt(parts[0]);
     displayUnitIdx = parseInt(parts[1]) || 0;
  }
  // Safeguard against empty steps or invalid index
  const displayStep = localSteps[displayStepIdx] || localSteps[0] || { title: 'No Step', description: '', images: [] };

  // --- Custom Mode with Monitoring & Defects ---
  if (isCustom) {
    return (
      <div data-fs="execution" className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-2 overflow-auto">
        {showDefectModal && (
            <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-rose-600"><AlertCircle className="w-5 h-5"/> 不具合報告</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">不具合内容</label>
                        <textarea className="w-full border rounded-lg p-2" rows={3} placeholder="不具合の内容を入力..." value={defectLabel} onChange={e=>setDefectLabel(e.target.value)}/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">原因工程</label>
                        <select className="w-full border rounded-lg p-2" value={defectCauseProcess} onChange={e=>setDefectCauseProcess(e.target.value)}>
                          <option value="">選択してください</option>
                          {(defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">写真添付</label>
                        <div className="flex gap-2 flex-wrap">
                          {defectPhotos.map((p, i) => (
                            <div key={i} className="w-16 h-16 border rounded overflow-hidden relative group/ph">
                              <img src={p} className="w-full h-full object-cover"/>
                              <button onClick={()=>setDefectPhotos(prev=>prev.filter((_,idx)=>idx!==i))} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover/ph:opacity-100"><X className="w-3 h-3"/></button>
                            </div>
                          ))}
                          <button onClick={()=>defectPhotoRef.current?.click()} className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300">
                            <Camera className="w-5 h-5"/>
                          </button>
                          <input type="file" ref={defectPhotoRef} className="hidden" accept="image/*" onChange={async(e)=>{const file=e.target.files?.[0]; if(file){const img=await resizeImage(file); setDefectPhotos(prev=>[...prev, img]);} e.target.value='';}}/>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={()=>{setShowDefectModal(false);setDefectLabel('');setDefectCauseProcess('');setDefectPhotos([]);}} className="px-4 py-2 text-slate-500">キャンセル</button>
                        <button onClick={()=>startInterruption('defect', defectLabel, defectCauseProcess, defectPhotos)} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold">対応開始</button>
                    </div>
                </div>
            </div>
        )}

        {showComplaintModal && (
            <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-600"><Megaphone className="w-5 h-5"/> 気づき・改善提案</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">カテゴリ</label>
                        <div className="flex flex-wrap gap-2">
                          {(complaintOptions || DEFAULT_COMPLAINT_OPTIONS).map(opt => (
                            <button key={opt} onClick={() => setComplaintCategory(complaintCategory === opt ? '' : opt)}
                              className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${complaintCategory === opt ? 'bg-purple-600 text-white border-purple-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">詳細内容</label>
                        <textarea className="w-full border rounded-lg p-2" rows={3} placeholder="気づいたことや改善提案を入力..." value={complaintLabel} onChange={e=>setComplaintLabel(e.target.value)}/>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={()=>{setShowComplaintModal(false);setComplaintLabel('');setComplaintCategory('');}} className="px-4 py-2 text-slate-500">キャンセル</button>
                        <button onClick={()=>{
                          const label = complaintCategory ? `${complaintCategory} : ${complaintLabel}` : complaintLabel;
                          startInterruption('complaint', label, '', []);
                          setShowComplaintModal(false);
                          setComplaintLabel('');
                          setComplaintCategory('');
                        }} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold">報告する</button>
                    </div>
                </div>
            </div>
        )}

        <div className="bg-white w-full max-w-6xl h-full max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
          <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0">
             <div><h2 className="text-lg font-bold flex items-center gap-2"><button onClick={switchToSequential} className="bg-emerald-600 hover:bg-blue-600 px-2 py-0.5 rounded text-xs transition-colors" title="通常モードに切替">カスタム実行 ⇄</button>{lot.model} <span className="font-mono opacity-70">#{lot.serialNo}</span> ({lot.quantity}台)</h2></div>
             <div className="flex gap-4">
                 <button onClick={toggleVoice} className={`p-2 rounded-full transition-all ${voiceEnabled ? 'bg-blue-500 text-white animate-pulse ring-2 ring-blue-300' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} title={voiceEnabled ? '音声OFF' : '音声ON'}>
                   {voiceEnabled ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
                 </button>
                 <button onClick={()=>setShowComplaintModal(true)} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold text-sm flex items-center gap-1"><Megaphone className="w-4 h-4"/> 気づき報告</button>
                 <button onClick={()=>setShowDefectModal(true)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 rounded font-bold text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> 不具合報告</button>
                 <button onClick={toggleBreak} className={`px-3 py-2 ${isOnBreak ? 'bg-amber-500 hover:bg-amber-600 animate-pulse' : 'bg-amber-600 hover:bg-amber-700'} rounded font-bold text-sm flex items-center gap-1`}>
                   <Coffee className="w-4 h-4"/> {isOnBreak ? `中断中 ${formatTime(breakDuration)}` : '中断'}
                 </button>
                 <button onClick={handleCompleteTrigger} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-bold text-sm">全作業完了</button>
                 <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-6 h-6"/></button>
             </div>
          </div>
          
          {/* 共有ノート警告バナー */}
          {lotNotes.length > 0 && (
            <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-start gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
              <div className="flex-1">
                <div className="text-xs font-bold text-amber-700 mb-0.5">この型式に関する共有情報があります</div>
                {lotNotes.map(n => (
                  <div key={n.id} className="text-xs text-amber-800 mb-0.5">• {n.content} <span className="text-amber-500">— {n.author}</span></div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto p-6 bg-slate-50 pb-4">
               <div className="grid gap-6">
                 {localSteps.map((step, sIdx) => {
                   const isAuto = step.title.includes('自動');
                   const isBatch = !!batchStartTimes[sIdx];
                   const isMonitoring = interruptions.some(i => i.type === 'monitoring' && i.status === 'active' && i.label === step.title);
                   const stepSpecificNotes = getStepNotes(step.title).filter(n => n.stepTitle);
                   
                   return (
                     <div key={step.id} className={`bg-white rounded-xl shadow-sm border p-4 ${sIdx === displayStepIdx ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="flex justify-between items-center mb-3">
                           <div className="flex items-center gap-2">
                             <span className="bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded text-xs">Step {sIdx+1}</span>
                             <span className="font-bold text-lg text-slate-800">{step.title}</span>
                             {isAuto && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1"><Bot className="w-3 h-3"/> 自動</span>}
                           </div>
                           <div className="flex gap-2">
                               {isAuto && (
                                   <button onClick={() => isMonitoring ? stopInterruption(interruptions.find(i=>i.label===step.title && i.status==='active')?.id) : startInterruption('monitoring', step.title, '', [])} className={`px-3 py-1 text-xs font-bold rounded border flex items-center gap-1 ${isMonitoring ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white text-slate-600'}`}>
                                       <Eye className="w-3 h-3"/> {isMonitoring ? '監視中...' : '監視'}
                                   </button>
                               )}
                               <button 
                                 onClick={() => toggleBatch(sIdx)}
                                 className={`px-3 py-1 text-xs font-bold rounded border flex items-center gap-1 transition-colors ${isBatch ? 'bg-orange-500 text-white border-orange-600 animate-pulse' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                               >
                                 {isBatch ? <><StopCircle className="w-3 h-3"/> まとめて完了</> : <><PlayCircle className="w-3 h-3"/> まとめて開始</>}
                               </button>
                               <button onClick={() => setActiveCustomTaskKey(`${sIdx}-0`)} className="text-xs text-blue-600 underline">詳細を表示</button>
                           </div>
                        </div>
                        {stepSpecificNotes.length > 0 && (
                          <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
                            <div className="text-xs text-amber-800">{stepSpecificNotes.map(n => <div key={n.id}>• {n.content} {n.image && '📷'} <span className="text-amber-500">— {n.author}</span></div>)}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2">
                           {Array.from({ length: lot.quantity }).map((_, uIdx) => {
                             const key = `${sIdx}-${uIdx}`;
                             const task = tasks[key] || { status: 'waiting', duration: 0 };
                             const isNG = task.status === 'ng' || task.status === 'reworking';
                             const reworks = task.reworks || [];
                             return (
                               <div key={uIdx} className="flex flex-col gap-1">
                                 {/* メインボタン（通常 or NG表示） */}
                                 <button onClick={() => toggleTask(sIdx, uIdx)} className={`h-20 rounded-lg flex flex-col items-center justify-center border transition-all relative ${isNG ? 'bg-red-600 text-white' : getTaskStatusColor(task.status)} ${!isAuto && isManualTaskRunning && task.status === 'waiting' && !isBatch ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={isNG || (!isAuto && isManualTaskRunning && task.status === 'waiting' && !isBatch)}>
                                   <span className="text-sm font-bold">#{uIdx+1}</span>
                                   {isNG ? (
                                     <>
                                       <span className="text-xs font-black bg-white/20 px-1.5 rounded">NG</span>
                                       <span className="text-xs font-mono mt-0.5">{formatTime(task.duration)}</span>
                                     </>
                                   ) : (
                                     <span className="text-sm font-mono font-bold mt-1">{formatTime(task.status === 'processing' && task.startTime ? task.duration + Math.floor((Date.now() - task.startTime) / 1000) : task.duration)}</span>
                                   )}
                                   {task.status === 'processing' && <span className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full animate-ping"/>}
                                 </button>
                                 {/* 修正作業ボタン群（NG時 or 修正履歴あり） */}
                                 {(isNG || reworks.length > 0) && reworks.map((rw, rIdx) => (
                                   <button key={rIdx} onClick={() => {
                                     if (rw.endTime) return; // 完了済み修正は押せない
                                     if (task.status === 'reworking' && rIdx === reworks.length - 1) {
                                       // 修正中 → 修正完了
                                       toggleTask(sIdx, uIdx);
                                     }
                                   }} className={`h-14 rounded-lg flex flex-col items-center justify-center border text-xs font-bold transition-all ${rw.endTime ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-orange-500 text-white border-orange-600 animate-pulse'}`}>
                                     <span>修正{rIdx + 1}</span>
                                     <span className="font-mono text-[11px]">{formatTime(rw.endTime ? rw.duration : (task.reworkStartTime ? Math.floor((Date.now() - task.reworkStartTime) / 1000) : 0))}</span>
                                   </button>
                                 ))}
                                 {/* 新しい修正作業開始ボタン（NG直後） */}
                                 {task.status === 'ng' && (
                                   <button onClick={() => handleTaskMenuAction('rework', key)} className="h-10 rounded-lg flex items-center justify-center border border-dashed border-orange-400 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-bold gap-1">
                                     <Wrench className="w-3 h-3"/> 修正{reworks.length + 1}
                                   </button>
                                 )}
                               </div>
                             );
                           })}
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>
            
            {/* Right Panel: Step Detail & PDF or Measurement */}
            <div className="w-96 bg-white border-l border-slate-200 flex flex-col p-6 overflow-y-auto shrink-0">
               <h3 className="font-bold text-slate-800 text-lg mb-4 border-b pb-2">工程詳細 <span className="text-sm font-normal text-slate-500">— 機番 #{displayUnitIdx + 1} {lot.unitSerialNumbers?.[displayUnitIdx] ? `(${lot.unitSerialNumbers[displayUnitIdx]})` : ''}</span></h3>
               {displayStep.type === 'measurement' && displayStep.measurementConfig ? (
                 <MeasurementInputPanel
                   config={displayStep.measurementConfig}
                   values={measurementResults[`${displayStep.id}-${displayUnitIdx}-values`] || measurementResults[`${displayStep.id}-values`] || {}}
                   onChange={(newValues) => {
                     const unitKey = `${displayStep.id}-${displayUnitIdx}`;
                     const resultVal = calculateMeasurementResult(newValues, displayStep.measurementConfig);
                     const calcResults = calculateMeasurementResults(newValues, displayStep.measurementConfig);
                     const newResults = { ...measurementResults, [`${unitKey}-values`]: newValues, [unitKey]: { values: newValues, result: resultVal, calcResults, timestamp: Date.now() } };
                     setMeasurementResults(newResults);
                     onSave({ measurementResults: newResults });
                   }}
                   onComplete={null}
                   pastData={lots ? getPastMeasurementData(lots, lot.model, displayStep.id) : []}
                   lot={lot}
                   comboPresets={comboPresets}
                   voiceAssistantActive={voiceEnabled}
                 />
               ) : (
                 <>
                   <div className="bg-slate-100 rounded-xl overflow-hidden mb-4 border border-slate-200 aspect-video flex items-center justify-center">
                      {displayStep.images && displayStep.images.length > 0 ? ( <img src={displayStep.images[0]} className="w-full h-full object-contain" /> ) : ( <div className="text-slate-300 flex flex-col items-center"><Camera className="w-12 h-12 mb-2"/><span>画像なし</span></div> )}
                   </div>
                   <div className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500">作業名</label><div className="text-base font-bold text-slate-800">{displayStep.title}</div></div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 flex items-center justify-between">内容・注意点 <button onClick={() => { const el = document.getElementById('custom-desc-edit'); if(el) el.style.display = el.style.display === 'none' ? '' : 'none'; }} className="text-xs text-blue-500 hover:text-blue-700"><Pencil className="w-3 h-3 inline"/> 編集</button></label>
                        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">{displayStep.description}</div>
                        <textarea id="custom-desc-edit" style={{display:'none'}} defaultValue={displayStep.description || ''} className="w-full border rounded p-2 text-sm mt-2 h-24" onBlur={(e) => {
                          const sIdx = localSteps.findIndex(s => s.id === displayStep.id);
                          if (sIdx >= 0) { const newSteps = localSteps.map((s,i) => i === sIdx ? {...s, description: e.target.value} : s); setLocalSteps(newSteps); onSave({ steps: newSteps }); }
                        }}/>
                      </div>
                      {displayStep.pdfData && ( <button onClick={() => setShowPdf(true)} className="w-full py-2 border border-orange-200 bg-orange-50 text-orange-700 rounded-lg flex items-center justify-center gap-2 text-sm font-bold hover:bg-orange-100"><FileText className="w-4 h-4"/> PDF資料を確認</button> )}
                   </div>
                 </>
               )}
            </div>
          </div>
          
          {/* Voice & Interruptions Bottom Bar (non-overlapping, compact) */}
          {(voiceEnabled || interruptions.some(i => i.status === 'active')) && (
            <div className="shrink-0 border-t border-slate-200">
              {/* Voice: thin single-line bar with expand toggle */}
              {voiceEnabled && (
                <div className="bg-slate-800 text-white">
                  <button onClick={() => setVoiceBarOpen(prev => !prev)} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-700 transition-colors">
                    <div className="flex items-center gap-2 text-[11px] min-w-0 flex-1">
                      <Mic className={`w-3.5 h-3.5 shrink-0 ${interimText ? 'text-green-400 animate-pulse' : isListeningNow ? 'text-amber-400 animate-pulse' : 'text-blue-400 animate-pulse'}`}/>
                      {voiceError ? (
                        <span className="text-rose-400 font-bold truncate">⚠️ {voiceError}</span>
                      ) : interimText ? (
                        <span className="text-green-300 font-bold truncate">🎤 {interimText}</span>
                      ) : isListeningNow ? (
                        <span className="text-amber-300 font-bold shrink-0">🎤 聞いています...</span>
                      ) : (
                        <>
                          <span className="text-blue-300 font-bold shrink-0">音声待機中</span>
                          {voiceLog.length > 0 && <span className="text-slate-400 truncate">— {voiceLog[voiceLog.length-1]?.text?.slice(0,40)}</span>}
                        </>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${voiceBarOpen ? 'rotate-180' : ''}`}/>
                  </button>
                  {voiceBarOpen && (
                    <div className="flex border-t border-slate-700">
                      <div className="w-64 p-2 shrink-0 border-r border-slate-700">
                        <div className="text-[10px] font-bold text-blue-300 mb-1 flex items-center gap-1"><HelpCircle className="w-3 h-3"/> コマンド例</div>
                        <div className="space-y-0.5 text-[10px]">
                          {activeCustomTaskKey ? (
                            <>
                              <div className="text-slate-300"><span className="text-emerald-300 font-bold">「完了」</span> 作業完了 / <span className="text-emerald-300 font-bold">「次」</span> 次へ</div>
                              <div className="text-slate-300"><span className="text-rose-300 font-bold">「中断」</span> 不具合報告</div>
                            </>
                          ) : (
                            <>
                              <div className="text-slate-300"><span className="text-emerald-300 font-bold">「1工程1台目」</span> 開始 / <span className="text-emerald-300 font-bold">「全作業完了」</span></div>
                            </>
                          )}
                        </div>
                      </div>
                      {voiceLog.length > 0 && (
                        <div className="flex-1 p-2 max-h-20 overflow-y-auto">
                          <div className="text-[10px] font-bold text-blue-300 mb-0.5">ログ</div>
                          {voiceLog.slice(-3).map((log, i) => (
                            <div key={i} className={`text-[10px] py-0.5 ${log.type === 'assistant' ? 'text-blue-200' : 'text-green-200'}`}>
                              {log.type === 'assistant' ? '🔊' : '🎤'} {log.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Active Interruptions Footer */}
              {interruptions.some(i => i.status === 'active') && (
                <div className="bg-slate-900/90 text-white p-3 flex items-center gap-4">
                    <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">進行中の割り込み</span>
                    <div className="flex-1 flex gap-3 overflow-x-auto">
                        {interruptions.filter(i => i.status === 'active').map(i => (
                            <div key={i.id} className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${i.type === 'defect' ? 'bg-rose-600' : i.type === 'break' ? 'bg-amber-600' : 'bg-indigo-600'}`}>
                                {i.type === 'defect' ? <AlertTriangle className="w-3 h-3"/> : i.type === 'break' ? <Coffee className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                                {i.label} <span className="font-mono">{formatTime(i.duration)}</span>
                                <button onClick={() => stopInterruption(i.id)} className="ml-2 hover:text-slate-200"><CheckCircle2 className="w-4 h-4"/></button>
                            </div>
                        ))}
                    </div>
                </div>
              )}
            </div>
          )}
          {/* Undo Bar */}
          {pendingUndo && (
            <div className="shrink-0 bg-amber-500 text-white p-3 flex items-center justify-between z-50 shadow-lg">
              <span className="font-bold">完了しました ({undoCountdown}秒以内に取り消し可能)</span>
              <button onClick={handleUndo} className="px-4 py-1 bg-white text-amber-700 rounded font-bold">取り消し</button>
            </div>
          )}
          {completedTaskMenuModal}
        </div>
      </div>
    );
  }

  // --- Sequential Mode UI (Same as before) ---
  return (
    <div data-fs="execution" className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
      {showPdf && currentStep.pdfData ? (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col p-4">
          <div className="flex justify-between items-center text-white mb-2"><span className="font-bold">参考資料</span><button onClick={()=>setShowPdf(false)}><X className="w-8 h-8"/></button></div>
          <iframe src={currentStep.pdfData} className="flex-1 bg-white rounded-lg"/>
        </div>
      ) : null}

      {showDefectModal && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-rose-600"><AlertCircle className="w-5 h-5"/> 不具合報告</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">不具合内容</label>
                <textarea className="w-full border rounded-lg p-2" rows={3} placeholder="不具合の内容を入力..." value={defectLabel} onChange={e=>setDefectLabel(e.target.value)}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">原因工程</label>
                <select className="w-full border rounded-lg p-2" value={defectCauseProcess} onChange={e=>setDefectCauseProcess(e.target.value)}>
                  <option value="">選択してください</option>
                  {(defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">写真添付</label>
                <div className="flex gap-2 flex-wrap">
                  {defectPhotos.map((p, i) => (
                    <div key={i} className="w-16 h-16 border rounded overflow-hidden relative group/ph">
                      <img src={p} className="w-full h-full object-cover"/>
                      <button onClick={()=>setDefectPhotos(prev=>prev.filter((_,idx)=>idx!==i))} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover/ph:opacity-100"><X className="w-3 h-3"/></button>
                    </div>
                  ))}
                  <button onClick={()=>defectPhotoRef.current?.click()} className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300">
                    <Camera className="w-5 h-5"/>
                  </button>
                  <input type="file" ref={defectPhotoRef} className="hidden" accept="image/*" onChange={async(e)=>{const file=e.target.files?.[0]; if(file){const img=await resizeImage(file); setDefectPhotos(prev=>[...prev, img]);} e.target.value='';}}/>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>{setShowDefectModal(false);setDefectLabel('');setDefectCauseProcess('');setDefectPhotos([]);}} className="px-4 py-2 text-slate-500">キャンセル</button>
              <button onClick={()=>startInterruption('defect', defectLabel, defectCauseProcess, defectPhotos)} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold">対応開始</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-slate-800 text-white p-4 flex justify-between items-center shrink-0">
          <div><h2 className="text-lg font-bold flex items-center gap-2"><button onClick={switchToCustom} className="bg-blue-600 hover:bg-emerald-600 px-2 py-0.5 rounded text-xs transition-colors" title="カスタムモードに切替">順序実行 ⇄</button>{lot.model} <span className="font-mono opacity-70">#{lot.serialNo}</span></h2><p className="text-xs text-slate-400 mt-1">工程 {currentStepIdx + 1} / {localSteps.length}: {currentStep.title}{totalUnits > 1 ? ` — ${currentUnitIdx + 1}/${totalUnits}台目` : ''}</p></div>
          <div className="flex items-center gap-2">
            {voiceEnabled && voiceStatus && <div className="bg-blue-500/30 text-blue-100 text-xs px-3 py-1 rounded-full max-w-xs truncate animate-pulse">{voiceStatus}</div>}
            <button onClick={toggleVoice} className={`p-2 rounded-full transition-all ${voiceEnabled ? 'bg-blue-500 text-white animate-pulse ring-2 ring-blue-300' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} title={voiceEnabled ? '音声OFF' : '音声ON'}>
              {voiceEnabled ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-6 h-6"/></button>
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-slate-100 p-4 flex flex-col relative overflow-y-auto">
             {currentStep.type === 'measurement' && currentStep.measurementConfig ? (
               <MeasurementInputPanel
                 config={currentStep.measurementConfig}
                 values={measurementResults[`${currentStep.id}-0-values`] || measurementResults[`${currentStep.id}-values`] || {}}
                 onChange={(newValues) => {
                   const resultVal = calculateMeasurementResult(newValues, currentStep.measurementConfig);
                   const calcResults = calculateMeasurementResults(newValues, currentStep.measurementConfig);
                   const measData = { values: newValues, result: resultVal, calcResults, timestamp: Date.now() };
                   const newResults = { ...measurementResults, [`${currentStep.id}-values`]: newValues, [`${currentStep.id}-result`]: measData, [`${currentStep.id}-0-values`]: newValues, [`${currentStep.id}-0`]: measData };
                   setMeasurementResults(newResults);
                 }}
                 onComplete={() => handleNext()}
                 pastData={lots ? getPastMeasurementData(lots, lot.model, currentStep.id) : []}
                 lot={lot}
                 comboPresets={comboPresets}
                 voiceAssistantActive={voiceEnabled}
               />
             ) : (
               <>
                 <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden relative">
                    {currentStep.images && currentStep.images.length > 0 ? ( <img src={currentStep.images[0]} className="w-full h-full object-contain" /> ) : ( <div className="text-slate-300 flex flex-col items-center"><Camera className="w-16 h-16 mb-2"/><span>画像なし</span></div> )}
                    {currentStep.type === 'danger' && ( <div className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2"><AlertOctagon className="w-5 h-5"/> 危険</div> )}
                    {currentStep.type === 'important' && ( <div className="absolute top-4 right-4 bg-amber-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> 重要</div> )}
                 </div>
                 {currentStep.pdfData && ( <button onClick={() => setShowPdf(true)} className="mt-2 w-full bg-orange-50 text-orange-700 border border-orange-200 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-orange-100"><FileText className="w-4 h-4"/> PDF資料を開く</button> )}
                 <div className="mt-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                   <h3 className="text-sm font-bold text-slate-500 mb-1 flex items-center justify-between">作業内容 / 注意事項 <button onClick={() => { const el = document.getElementById('seq-desc-edit'); if(el) el.style.display = el.style.display === 'none' ? '' : 'none'; }} className="text-xs text-blue-500 hover:text-blue-700"><Pencil className="w-3 h-3 inline"/> 編集</button></h3>
                   <p className="text-lg text-slate-800 whitespace-pre-wrap">{currentStep.description}</p>
                   <textarea id="seq-desc-edit" style={{display:'none'}} defaultValue={currentStep.description || ''} className="w-full border rounded p-2 text-sm mt-2 h-24" onBlur={(e) => {
                     const newSteps = localSteps.map((s,i) => i === currentStepIdx ? {...s, description: e.target.value} : s);
                     setLocalSteps(newSteps); onSave({ steps: newSteps });
                   }}/>
                 </div>
               </>
             )}
          </div>
          <div className="w-80 bg-white border-l border-slate-200 flex flex-col p-6 shrink-0">
             <div className="text-center mb-8"><div className="text-sm text-slate-500 mb-1">経過時間</div><div className={`text-4xl font-mono font-black ${currentStep.targetTime && elapsed/1000 > currentStep.targetTime ? 'text-rose-500' : 'text-slate-800'}`}>{formatTime(Math.floor(elapsed / 1000))}</div>{currentStep.targetTime > 0 && (<div className="text-xs text-slate-400 mt-1">目標: {formatTime(currentStep.targetTime)}</div>)}</div>
             <div className="flex-1 flex flex-col gap-4 justify-center">
               {!isTimerRunning ? ( <button onClick={handleStart} className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-105"><Play className="w-6 h-6 fill-current"/> 作業開始</button> ) : ( <>
                {totalUnits > 1 && <div className="text-center text-sm font-bold text-blue-600 mb-2">{currentUnitIdx + 1} / {totalUnits} 台目</div>}
                <button onClick={handleNext} className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-105"><CheckCircle2 className="w-6 h-6"/> {currentUnitIdx < totalUnits - 1 ? `次の台 (${currentUnitIdx + 2}台目)` : currentStepIdx < localSteps.length - 1 ? '次工程へ' : '作業完了'}</button>
                <button onClick={handleCompleteTrigger} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-2"><Check className="w-5 h-5"/> 全作業完了</button></> )}
             </div>
             <div className="mt-8 border-t pt-6 space-y-2">
               <button onClick={()=>setShowDefectModal(true)} className="w-full py-3 border-2 border-rose-100 text-rose-500 hover:bg-rose-50 rounded-xl font-bold flex items-center justify-center gap-2"><AlertOctagon className="w-5 h-5"/> 不適合報告 (NG)</button>
               <button onClick={()=>setShowComplaintModal(true)} className="w-full py-2 border-2 border-purple-100 text-purple-500 hover:bg-purple-50 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><Megaphone className="w-4 h-4"/> 気づき報告</button>
               <button onClick={toggleBreak} className={`w-full py-3 ${isOnBreak ? 'bg-amber-500 text-white animate-pulse' : 'border-2 border-amber-100 text-amber-500 hover:bg-amber-50'} rounded-xl font-bold flex items-center justify-center gap-2`}>
                 <Coffee className="w-5 h-5"/> {isOnBreak ? `中断中 ${formatTime(breakDuration)}` : '中断'}
               </button>
             </div>
          </div>
        </div>
        {/* Voice Log Panel (Sequential) - collapsible */}
        {voiceEnabled && voiceLog.length > 0 && (
          <div className="bg-slate-900/90 text-white shrink-0 cursor-pointer" onClick={() => setSeqVoiceLogOpen(prev => !prev)}>
            <div className="p-2 flex items-center gap-2 text-[10px] font-bold text-blue-300">
              <HelpCircle className="w-3 h-3"/> 音声ログ {seqVoiceLogOpen ? '(クリックで閉じる)' : `(${voiceLog.length}件 - クリックで開く)`}
            </div>
            {seqVoiceLogOpen && (
              <div className="px-3 pb-2 max-h-24 overflow-y-auto">
                {voiceLog.slice(-5).map((log, i) => (
                  <div key={i} className={`text-xs py-0.5 ${log.type === 'assistant' ? 'text-blue-200' : 'text-green-200'}`}>
                    {log.type === 'assistant' ? '\uD83D\uDD0A' : '\uD83C\uDFA4'} {log.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Undo Bar (Sequential) */}
        {pendingUndo && (
          <div className="shrink-0 bg-amber-500 text-white p-3 flex items-center justify-between z-50 shadow-lg">
            <span className="font-bold">完了しました ({undoCountdown}秒以内に取り消し可能)</span>
            <button onClick={handleUndo} className="px-4 py-1 bg-white text-amber-700 rounded font-bold">取り消し</button>
          </div>
        )}
        <div className="h-2 bg-slate-100"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((currentStepIdx + (lot.status==='completed'?1:0)) / localSteps.length) * 100}%` }} /></div>
      </div>
    </div>
  );
};

// --- Break Alert Settings Component ---
const BreakAlertSettings = ({ alerts, onChange }) => {
  const addAlert = () => { onChange([...alerts, { id: generateId(), time: '12:00', enabled: true, message: '休憩の時間です。作業を一時停止してください。' }]); };
  const updateAlert = (id, field, value) => { onChange(alerts.map(a => a.id === id ? { ...a, [field]: value } : a)); };
  const deleteAlert = (id) => { onChange(alerts.filter(a => a.id !== id)); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><BellRing className="w-5 h-5 text-orange-500" /> 休憩・終了アラート設定</h3>
        <button onClick={addAlert} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-bold hover:bg-blue-100">+ 追加</button>
      </div>
      <p className="text-xs text-slate-500 mb-4">設定した時間の10分前に画面上部に通知を表示します。</p>
      <div className="space-y-3">
        {alerts.map(alert => (
          <div key={alert.id} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
            <input type="time" value={alert.time} onChange={(e) => updateAlert(alert.id, 'time', e.target.value)} className="border rounded p-1 font-bold text-lg" />
            <div className="flex-1"><input type="text" value={alert.message} onChange={(e) => updateAlert(alert.id, 'message', e.target.value)} className="w-full border rounded p-1 text-sm" placeholder="通知メッセージ" /></div>
            <label className="flex items-center gap-2 cursor-pointer"><span className="text-xs font-bold text-slate-500">有効</span><input type="checkbox" checked={alert.enabled} onChange={(e) => updateAlert(alert.id, 'enabled', e.target.checked)} className="w-5 h-5 accent-blue-600" /></label>
            <button onClick={() => deleteAlert(alert.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {alerts.length === 0 && <div className="text-center text-slate-400 text-sm py-4">アラート設定はありません</div>}
      </div>
    </div>
  );
};

// --- View Definitions (DashboardView Defined Here) ---

const DashboardView = ({ onSetMode, lots, workers, handleMoveLot, saveData, setDraggedLotId, draggedLotId, setExecutionLotId, settings, templates, onEditLot, onDeleteLot, handleImageUpload, saveSettings, mapZones, currentUserName = '' }) => (
  <div data-fs="dashboard" className="grid grid-cols-12 gap-4 h-full overflow-hidden">
    <div className="col-span-3 flex flex-col gap-4 overflow-y-auto">
      <ZoneList id="arrival" title="入荷待ち" icon={Package} color="bg-white" border="border-slate-300" 
        onClickHeader={() => onSetMode('arrival-planning')} 
        onDropLot={(id) => handleMoveLot(id, 'arrival')}>
        {lots.filter(l => l.location === 'arrival').map(lot => <LotCard key={lot.id} lot={lot} workers={workers} templates={templates} mapZones={mapZones} onOpenExecution={()=>{}} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} onEdit={onEditLot} onDelete={onDeleteLot} 
          variant='dashboard-arrival' 
        />)}
      </ZoneList>
      <ZoneList id="buffer" title={`作業予定${currentUserName && !['フリー','管理者'].includes(currentUserName) ? ` (${currentUserName})` : ''}`} icon={Calendar} color="bg-amber-50" border="border-amber-200"
        onClickHeader={() => onSetMode('planning-execution')}
        onDropLot={(id) => handleMoveLot(id, 'buffer')}>
        {(currentUserName && !['フリー','管理者'].includes(currentUserName)
          ? workers.filter(w => w.name === currentUserName)
          : workers
        ).map(worker => (
          <WorkerSummaryCard key={worker.id} worker={worker} lots={lots} />
        ))}
        {workers.length === 0 && <div className="text-center text-slate-400 p-4">作業者が登録されていません</div>}
      </ZoneList>
    </div>
    <div className="col-span-9 flex flex-col">
      <div className="flex-1 h-full" onClick={() => onSetMode('map-only')}>
        <InteractiveMap
          lots={lots} workers={workers} templates={templates}
          handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId}
          onEditLot={onEditLot} onDeleteLot={onDeleteLot} setExecutionLotId={setExecutionLotId}
          settings={settings} handleImageUpload={handleImageUpload} saveSettings={saveSettings} mapZones={mapZones}
          isDashboard={true}
        />
      </div>
    </div>
  </div>
);

const ArrivalPlanningView = ({ onBack, lots, workers, templates, handleMoveLot, saveData, setDraggedLotId, draggedLotId, handleAddWorker, onEditLot, onDeleteLot, mapZones }) => {
  const calculateWorkerLoad = (workerId) => {
    const workerLots = lots.filter(l => l.location === 'planned' && l.workerId === workerId && l.status !== 'completed');
    const totalSeconds = workerLots.reduce((acc, lot) => acc + calculateLotEstimatedTime(lot), 0);
    return formatTime(totalSeconds);
  };

  return (
    <div data-fs="dashboard" className="grid grid-cols-12 gap-6 h-full">
      <div className="col-span-3 flex flex-col h-full border-r pr-4 min-h-0">
        <button onClick={onBack} className="mb-2 text-slate-500 hover:text-slate-800 flex items-center gap-1"><ArrowRight className="w-4 h-4 rotate-180"/> 戻る</button>
        <ZoneList id="arrival" title="入荷待ちリスト" icon={Package} color="bg-white" border="border-slate-300" onDropLot={(id) => handleMoveLot(id, 'arrival')} active={true}>
          {lots.filter(l => l.location === 'arrival').map(lot => <LotCard key={lot.id} lot={lot} workers={workers} templates={templates} mapZones={mapZones} onOpenExecution={()=>{}} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} onEdit={onEditLot} onDelete={onDeleteLot} minimal={false}/>)}
        </ZoneList>
      </div>
      <div className="col-span-9 flex flex-col h-full">
        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 h-full flex flex-col shadow-xl">
          <div className="p-3 border-b border-amber-200 bg-amber-100/50 flex justify-between items-center rounded-t-xl">
            <h2 className="font-bold text-amber-900 flex items-center gap-2"><Calendar className="w-5 h-5"/> 作業予定 (作業者割当)</h2>
            <button onClick={handleAddWorker} className="text-xs bg-white border border-amber-300 text-amber-700 px-2 py-1 rounded hover:bg-amber-50">+ 作業者追加</button>
          </div>
          <div className="flex-1 overflow-x-auto p-4 flex gap-4">
            <div className="min-w-[200px] flex-1 border border-amber-200 bg-white rounded-lg p-3 flex flex-col" data-drop-zone="planned" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault(); const id=e.dataTransfer.getData('lotId'); if(id) handleMoveLot(id, 'planned', null);}}>
              <div className="text-xs font-bold text-slate-400 mb-2 border-b pb-1">未割当</div>
              <div className="flex-1 overflow-y-auto space-y-2">{lots.filter(l => l.location === 'planned' && !l.workerId).map(lot => <LotCard key={lot.id} lot={lot} workers={workers} templates={templates} mapZones={mapZones} onOpenExecution={()=>{}} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} onEdit={onEditLot} onDelete={onDeleteLot} minimal={false}/>)}</div>
            </div>
            {workers.map(w => {
              const wPlannedLots = lots.filter(l => l.location === 'planned' && l.workerId === w.id);
              const wPlannedTime = wPlannedLots.reduce((acc, lot) => acc + calculateLotEstimatedTime(lot), 0);
              const wCompletedLots = lots.filter(l => l.location === 'completed' && l.workerId === w.id);
              const wCompletedTime = wCompletedLots.reduce((acc, lot) => acc + (lot.totalWorkTime || 0) / 1000, 0);
              return (
              <div key={w.id} data-drop-zone="planned" data-worker-id={w.id} className="min-w-[200px] flex-1 border border-blue-100 bg-blue-50/30 rounded-lg p-3 flex flex-col" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault(); const id=e.dataTransfer.getData('lotId'); if(id) handleMoveLot(id, 'planned', w.id);}}>
                <div className="text-sm font-bold text-blue-800 mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1"><User className="w-4 h-4"/> {w.name}</div>
                  <div className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded font-mono">{formatTime(wPlannedTime)}</div>
                </div>
                <div className="flex gap-3 text-sm mb-2 border-b pb-1">
                  <span className="text-blue-600">予定: <span className="font-black font-mono text-base">{formatTime(wPlannedTime)}</span></span>
                  <span className="text-emerald-600">実績: <span className="font-black font-mono text-base">{formatTime(wCompletedTime)}</span></span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">{lots.filter(l => l.location === 'planned' && l.workerId === w.id).map(lot => <LotCard key={lot.id} lot={lot} workers={workers} templates={templates} mapZones={mapZones} onOpenExecution={()=>{}} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} onEdit={onEditLot} onDelete={onDeleteLot} minimal={false}/>)}</div>
              </div>
            )})}
          </div>
        </div>
      </div>
    </div>
  );
};

const PlanningExecutionView = ({ onBack, workers, lots, templates, handleMoveLot, saveData, setDraggedLotId, draggedLotId, setSelectedWorker, handleImageUpload, settings, mapRef, handleDropOnMap, setExecutionLotId, onEditLot, onDeleteLot, saveSettings, mapZones, currentUserName = '' }) => {
  const isWorker = currentUserName && !['フリー','管理者'].includes(currentUserName);
  const matchedWorker = isWorker ? workers.find(w => w.name === currentUserName) : null;
  const [filterWorkerId, setFilterWorkerId] = useState(matchedWorker?.id || null);

  return (
    <div data-fs="dashboard" className="grid grid-cols-10 gap-4 h-full">
      {/* Left: Planning (30% -> 3/10 cols) */}
      <div className="col-span-3 flex flex-col h-full border-r pr-4 min-h-0">
        <button onClick={onBack} className="mb-2 text-slate-500 hover:text-slate-800 flex items-center gap-1 shrink-0"><ArrowRight className="w-4 h-4 rotate-180"/> 戻る</button>
        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 h-full flex flex-col shadow-md overflow-hidden min-h-0">
          <div className="p-3 border-b border-amber-200 bg-amber-100/50 flex justify-between items-center shrink-0">
             <h2 className="font-bold text-amber-900 flex items-center gap-2"><Calendar className="w-5 h-5"/> 作業予定 (担当別)</h2>
             {filterWorkerId && <button onClick={() => setFilterWorkerId(null)} className="text-xs bg-white px-2 py-1 rounded border shadow-sm flex items-center gap-1"><X className="w-3 h-3"/>解除</button>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
             {workers.map(w => {
               if (filterWorkerId && filterWorkerId !== w.id) return null;
               const workerLots = lots.filter(l => l.location === 'planned' && l.workerId === w.id);
               const wPlanTime = workerLots.reduce((acc, lot) => acc + calculateLotEstimatedTime(lot), 0);
               const wDoneTime = lots.filter(l => l.location === 'completed' && l.workerId === w.id).reduce((acc, lot) => acc + (lot.totalWorkTime || 0) / 1000, 0);
               return (
                 <div key={w.id} className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden shrink-0">
                   <div
                     onClick={() => setFilterWorkerId(filterWorkerId === w.id ? null : w.id)}
                     className={`bg-slate-50 px-3 py-1.5 font-bold text-slate-700 text-sm border-b cursor-pointer hover:bg-slate-100 transition-colors ${filterWorkerId === w.id ? 'bg-blue-100 text-blue-800' : ''}`}
                   >
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2"><User className="w-4 h-4"/> {w.name}</div>
                       <span className="text-xs font-normal text-slate-500">({workerLots.length}件)</span>
                     </div>
                     <div className="flex gap-3 text-[10px] font-normal mt-0.5">
                       <span className="text-blue-600">予定: <span className="font-bold font-mono">{formatTime(wPlanTime)}</span></span>
                       <span className="text-emerald-600">実績: <span className="font-bold font-mono">{formatTime(wDoneTime)}</span></span>
                     </div>
                   </div>
                   <div className="p-1.5 space-y-0.5 min-h-[40px] bg-slate-50/50">
                     {workerLots.map(lot => {
                       const tpl = templates?.find(t => t.id === lot.templateId);
                       const entryTime = lot.entryAt ? new Date(lot.entryAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
                       return (
                         <div key={lot.id} draggable onDragStart={(e)=>{e.dataTransfer.setData('lotId', lot.id); setDraggedLotId(lot.id);}}
                           className="bg-white border border-slate-200 rounded px-2 py-1 cursor-grab hover:border-blue-300 transition-all flex items-center gap-1.5 text-xs"
                         >
                           <span className="font-bold text-slate-800 shrink-0">{lot.orderNo}</span>
                           <span className="text-slate-500 shrink-0">{lot.model}</span>
                           <span className="text-blue-600 font-medium shrink-0">{lot.quantity}台</span>
                           {tpl && <span className="text-slate-400 truncate">{tpl.name}</span>}
                           {entryTime && <span className="text-slate-400 shrink-0 ml-auto">{entryTime}</span>}
                         </div>
                       );
                     })}
                     {workerLots.length === 0 && <div className="text-center text-slate-300 text-xs py-2">予定なし</div>}
                   </div>
                 </div>
               );
             })}
             {!filterWorkerId && lots.filter(l => l.location === 'planned' && !l.workerId).length > 0 && (
               <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden shrink-0">
                 <div className="bg-slate-50 px-3 py-2 font-bold text-slate-400 text-xs border-b">未割当</div>
                 <div className="p-2 space-y-1 min-h-[50px]">
                   {lots.filter(l => l.location === 'planned' && !l.workerId).map(lot => {
                     const tpl = templates?.find(t => t.id === lot.templateId);
                     const entryTime = lot.entryAt ? new Date(lot.entryAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
                     return (
                       <div key={lot.id} draggable onDragStart={(e)=>{e.dataTransfer.setData('lotId', lot.id); setDraggedLotId(lot.id);}}
                         className="bg-white border border-slate-200 rounded px-2 py-1 cursor-grab hover:border-blue-300 transition-all flex items-center gap-1.5 text-xs"
                       >
                         <span className="font-bold text-slate-800 shrink-0">{lot.orderNo}</span>
                         <span className="text-slate-500 shrink-0">{lot.model}</span>
                         <span className="text-blue-600 font-medium shrink-0">{lot.quantity}台</span>
                         {tpl && <span className="text-slate-400 truncate">{tpl.name}</span>}
                         {entryTime && <span className="text-slate-400 shrink-0 ml-auto">{entryTime}</span>}
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
      
      {/* Right: Map (70%) - Full Height */}
      <div className="col-span-7 flex flex-col h-full min-h-0">
        <InteractiveMap 
          lots={lots} workers={workers} templates={templates}
          handleMoveLot={handleMoveLot} saveData={saveData} 
          setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId}
          onEditLot={onEditLot} onDeleteLot={onDeleteLot}
          setExecutionLotId={setExecutionLotId}
          settings={settings} handleImageUpload={handleImageUpload} saveSettings={saveSettings}
          mapZones={mapZones}
          isDashboard={false} // 詳細モードなので通常表示
        />
      </div>
    </div>
  );
};

// New View: Map Only
const MapOnlyView = ({ onBack, lots, workers, templates, handleMoveLot, saveData, setDraggedLotId, draggedLotId, setExecutionLotId, settings, handleImageUpload, saveSettings, mapZones, onEditLot, onDeleteLot }) => (
    <div data-fs="dashboard" className="h-full flex flex-col">
       <div className="mb-2 flex items-center justify-between shrink-0">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-1"><ArrowRight className="w-4 h-4 rotate-180"/> 戻る</button>
          <h2 className="font-bold text-blue-800 flex items-center gap-2"><MapIcon className="w-5 h-5"/> 作業エリア全体図</h2>
       </div>
       <InteractiveMap 
          lots={lots} workers={workers} templates={templates} 
          handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} 
          onEditLot={onEditLot} onDeleteLot={onDeleteLot} setExecutionLotId={setExecutionLotId} 
          settings={settings} handleImageUpload={handleImageUpload} saveSettings={saveSettings} mapZones={mapZones} 
          isDashboard={false} 
        />
    </div>
);

// --- Process Improvement Optimization ---

const calculateStats = (times) => {
    if (!times || times.length === 0) return null;
    const sorted = [...times].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 4)];
    const q3 = sorted[Math.floor(sorted.length * (3 / 4))];
    const iqr = q3 - q1;
    const validTimes = sorted.filter(t => t >= q1 - 1.5 * iqr && t <= q3 + 1.5 * iqr);
    if (validTimes.length === 0) return null;
    const validSorted = [...validTimes].sort((a, b) => a - b);
    const sum = validSorted.reduce((a, b) => a + b, 0);
    const mean = sum / validSorted.length;
    const variance = validSorted.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validSorted.length;
    const stdDev = Math.sqrt(variance);
    return {
        rawCount: times.length,
        validCount: validSorted.length,
        min: Math.min(...validSorted),
        max: Math.max(...validSorted),
        mean: Math.round(mean),
        median: validSorted[Math.floor(validSorted.length / 2)],
        stdDev: Math.round(stdDev),
        p25: validSorted[Math.floor(validSorted.length * 0.25)],
        p75: validSorted[Math.floor(validSorted.length * 0.75)]
    };
};

const TargetTimeHistoryPanel = ({ history }) => {
    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
    return (
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {sorted.length === 0 && <div className="text-center text-slate-400 py-10 bg-white rounded-xl border border-slate-200 shadow-sm">変更履歴はありません</div>}
            {sorted.map((h, hIdx) => (
                <div key={h.timestamp || hIdx} className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex justify-between items-start mb-4 border-b pb-3">
                        <div>
                            <div className="text-xs text-slate-500 font-bold mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(h.timestamp).toLocaleString()} に変更</div>
                            <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <Target className="w-5 h-5 text-indigo-500" />
                                型式: <span className="bg-slate-100 px-2 rounded">{h.targetValue}</span>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {h.updates.map((u, i) => (
                            <div key={i} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="font-bold text-sm text-slate-700">
                                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded mr-2 font-normal">{u.category}</span>
                                        {u.title}
                                    </div>
                                    <div className="flex items-center gap-3 font-mono text-sm bg-white px-3 py-1 rounded shadow-sm border">
                                        <span className="text-slate-400 line-through">{u.oldTime}s</span>
                                        <ArrowRight className="w-4 h-4 text-slate-300" />
                                        <span className="font-bold text-blue-600 text-base">{u.newTime}s</span>
                                    </div>
                                </div>
                                <div className="text-[10px] flex flex-wrap gap-2 text-slate-500 items-center">
                                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-100">{u.strategyName}</span>
                                    <span className="bg-white px-2 py-0.5 rounded border">集計期間: <span className="font-bold">{u.evidence.periodLabel}</span></span>
                                    <span className="bg-white px-2 py-0.5 rounded border">有効データ: <span className="font-bold">{u.evidence.validCount}件</span></span>
                                    <span className="bg-white px-2 py-0.5 rounded border">実績: 平均 <span className="font-bold">{u.evidence.mean}s</span> / バラつき <span className="font-bold">{u.evidence.stdDev !== undefined ? `\u00B1${u.evidence.stdDev}s` : '-'}</span></span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const ProcessInsightsTab = ({ lots, workers, customTargetTimes, onSaveSettings, targetTimeHistory, settings }) => {
    const [targetValue, setTargetValue] = useState('');
    const [bulkStrategy, setBulkStrategy] = useState('standard');
    const [period, setPeriod] = useState('3m');
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        const d = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [showHistory, setShowHistory] = useState(false);

    const getPeriodDates = () => {
        let start = 0;
        let end = Infinity;
        if (period === 'custom') {
            if (customStartDate) start = new Date(customStartDate).getTime();
            if (customEndDate) { const ed = new Date(customEndDate); ed.setHours(23, 59, 59, 999); end = ed.getTime(); }
        } else {
            const d = new Date();
            if (period === '1m') d.setMonth(d.getMonth() - 1);
            else if (period === '3m') d.setMonth(d.getMonth() - 3);
            else if (period === '6m') d.setMonth(d.getMonth() - 6);
            else return { start: 0, end: Infinity };
            start = d.getTime();
        }
        return { start, end };
    };

    const availableModels = useMemo(() => {
        const models = new Set();
        lots.filter(l => l.status === 'completed' || l.location === 'completed').forEach(l => {
            if (l.model) models.add(l.model);
        });
        return Array.from(models).sort();
    }, [lots]);

    const insightsData = useMemo(() => {
        if (!targetValue) return [];
        const { start: startDate, end: endDate } = getPeriodDates();

        const targetLots = lots.filter(l => {
            if (l.status !== 'completed' && l.location !== 'completed') return false;
            if (l.model !== targetValue) return false;
            const completedAt = l.updatedAt || l.createdAt || 0;
            const ts = typeof completedAt === 'number' ? completedAt : new Date(completedAt).getTime();
            if (ts < startDate || ts > endDate) return false;
            return true;
        });

        if (targetLots.length === 0) return [];

        const stepTimes = {};
        const workerTimesByStep = {};

        targetLots.forEach(lot => {
            (lot.steps || []).forEach((step, idx) => {
                const stepKey = `${step.category || ''}_${step.title}`;
                if (!stepTimes[stepKey]) {
                    stepTimes[stepKey] = { title: step.title, category: step.category || '', times: [], originalTarget: step.targetTime };
                    workerTimesByStep[stepKey] = {};
                }

                for (let i = 0; i < (lot.quantity || 1); i++) {
                    const task = lot.tasks?.[`${idx}-${i}`];
                    if (task && task.status === 'completed' && task.duration > 0) {
                        stepTimes[stepKey].times.push(task.duration);
                        const worker = task.workerName || workers.find(w => w.id === task.workerId)?.name || '不明';
                        if (!workerTimesByStep[stepKey][worker]) workerTimesByStep[stepKey][worker] = [];
                        workerTimesByStep[stepKey][worker].push(task.duration);
                    }
                }
            });
        });

        const results = [];
        Object.keys(stepTimes).forEach(key => {
            const data = stepTimes[key];
            const stats = calculateStats(data.times);
            if (!stats) return;

            let bestWorker = null;
            let bestWorkerAvg = Infinity;
            Object.entries(workerTimesByStep[key]).forEach(([worker, times]) => {
                const wStats = calculateStats(times);
                if (wStats && wStats.validCount >= 3 && wStats.mean < bestWorkerAvg) {
                    bestWorkerAvg = wStats.mean;
                    bestWorker = worker;
                }
            });

            const insights = [];
            const coeffVariation = stats.stdDev / stats.mean;
            const savedKey = `model_${targetValue}`;
            const currentTarget = customTargetTimes[savedKey]?.[key] || data.originalTarget;

            if (coeffVariation > 0.4) {
                insights.push({ type: 'warning', text: '作業者や日による時間のバラつきが大きいです。手順の標準化や見直しを推奨します。' });
            }
            if (stats.mean > currentTarget * 1.3) {
                insights.push({ type: 'danger', text: `平均実績(${stats.mean}秒)が現在の目標(${currentTarget}秒)を大幅に超えています。目標が厳しすぎる可能性があります。` });
            } else if (stats.mean < currentTarget * 0.7) {
                insights.push({ type: 'info', text: `平均実績(${stats.mean}秒)が目標(${currentTarget}秒)を下回っています。目標を引き下げることで計画精度が向上します。` });
            }
            if (bestWorker && bestWorkerAvg < stats.mean * 0.8) {
                insights.push({ type: 'success', text: `ベストプラクティス: ${bestWorker}さんが安定して早く(${Math.round(bestWorkerAvg)}秒)作業しています。ノウハウ共有が有効です。` });
            }

            const strategies = [
                { id: 'standard', name: '標準バランス型', desc: '全体の平均。標準的なスキル想定。', value: stats.mean, color: 'text-blue-800 bg-blue-50 border-blue-200 hover:bg-blue-100' },
                { id: 'aggressive', name: bestWorker ? `効率型 (${bestWorker}基準)` : '効率追求型 (上位25%)', desc: '最も速い人のペースを基準。', value: bestWorkerAvg !== Infinity ? Math.round(bestWorkerAvg) : stats.p25, color: 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
                { id: 'conservative', name: '余裕確保型', desc: 'バラつきを考慮した余裕あるペース。', value: Math.round(stats.mean + stats.stdDev), color: 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100' }
            ];

            results.push({ key, ...data, stats, currentTarget, insights, strategies });
        });

        return results.sort((a, b) => b.stats.mean - a.stats.mean);
    }, [lots, targetValue, customTargetTimes, period, customStartDate, customEndDate, workers]);

    const applySuggestedTarget = (itemKey, strat, data) => {
        const savedKey = `model_${targetValue}`;
        const currentCustoms = customTargetTimes[savedKey] || {};
        const newCustomTimes = { ...customTargetTimes, [savedKey]: { ...currentCustoms, [itemKey]: strat.value } };
        const periodLabel = period === 'custom' ? `${customStartDate}~${customEndDate}` : period === '1m' ? '過去1ヶ月' : period === '3m' ? '過去3ヶ月' : period === '6m' ? '過去6ヶ月' : '全期間';
        const historyEntry = {
            timestamp: Date.now(), targetType: 'model', targetValue,
            updates: [{ key: itemKey, category: data.category, title: data.title, oldTime: data.currentTarget, newTime: strat.value, strategyName: strat.name,
                evidence: { periodLabel, validCount: data.stats.validCount, mean: data.stats.mean, stdDev: data.stats.stdDev } }]
        };
        const newHistory = [...(targetTimeHistory || []), historyEntry];
        onSaveSettings({ customTargetTimes: newCustomTimes, targetTimeHistory: newHistory });
        alert('指定の目標時間をマスタに適用しました。次回以降のロットから反映されます。');
    };

    const applyAllSuggestedTargets = () => {
        const savedKey = `model_${targetValue}`;
        const currentCustoms = customTargetTimes[savedKey] || {};
        const newUpdates = {};
        const historyUpdates = [];
        const periodLabel = period === 'custom' ? `${customStartDate}~${customEndDate}` : period === '1m' ? '過去1ヶ月' : period === '3m' ? '過去3ヶ月' : period === '6m' ? '過去6ヶ月' : '全期間';

        insightsData.forEach(data => {
            const selectedStrat = data.strategies.find(s => s.id === bulkStrategy);
            if (selectedStrat && data.currentTarget !== selectedStrat.value) {
                newUpdates[data.key] = selectedStrat.value;
                historyUpdates.push({ key: data.key, category: data.category, title: data.title, oldTime: data.currentTarget, newTime: selectedStrat.value, strategyName: selectedStrat.name,
                    evidence: { periodLabel, validCount: data.stats.validCount, mean: data.stats.mean, stdDev: data.stats.stdDev } });
            }
        });

        if (historyUpdates.length === 0) { alert('更新する項目がありません。'); return; }

        const newCustomTimes = { ...customTargetTimes, [savedKey]: { ...currentCustoms, ...newUpdates } };
        const historyEntry = { timestamp: Date.now(), targetType: 'model', targetValue, updates: historyUpdates };
        const newHistory = [...(targetTimeHistory || []), historyEntry];
        onSaveSettings({ customTargetTimes: newCustomTimes, targetTimeHistory: newHistory });
        alert(`表示されている全項目に「${bulkStrategy === 'standard' ? '標準バランス型' : bulkStrategy === 'aggressive' ? '効率追求型' : '余裕確保型'}」の目標時間を適用しました。`);
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Zap className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">工程改善・目標時間最適化</h3>
                        <p className="text-xs text-slate-500">実績データからエビデンスを算出し、状況に応じた最適な目標時間を提案します。</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowHistory(false)} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${!showHistory ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        最適化提案
                    </button>
                    <button onClick={() => setShowHistory(true)} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1 ${showHistory ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        <History className="w-4 h-4" /> 変更履歴
                    </button>
                </div>
            </div>

            {!showHistory ? (
                <>
                    <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-lg border shadow-sm shrink-0">
                        <select value={targetValue} onChange={e => setTargetValue(e.target.value)} className="border border-indigo-200 rounded px-3 py-1.5 font-bold text-slate-700 outline-none focus:border-indigo-500 min-w-[200px]">
                            <option value="">型式を選択...</option>
                            {availableModels.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>

                        <div className="h-6 w-px bg-slate-300 mx-2"></div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-600">集計期間:</span>
                            <select value={period} onChange={e => setPeriod(e.target.value)} className="border rounded px-3 py-1.5 text-sm font-bold text-slate-700 bg-slate-50 outline-none">
                                <option value="1m">過去1ヶ月</option>
                                <option value="3m">過去3ヶ月</option>
                                <option value="6m">過去6ヶ月</option>
                                <option value="all">全期間</option>
                                <option value="custom">期間指定(カスタム)</option>
                            </select>
                            {period === 'custom' && (
                                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded border ml-2">
                                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none" />
                                    <span className="text-slate-400">~</span>
                                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none" />
                                </div>
                            )}
                        </div>
                    </div>

                    {targetValue ? (
                        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-2">
                            {insightsData.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-2 mb-2 items-center bg-white p-3 rounded-lg border shadow-sm">
                                    <span className="text-sm font-bold text-slate-600">一括適用:</span>
                                    <select value={bulkStrategy} onChange={(e) => setBulkStrategy(e.target.value)} className="border rounded px-3 py-1.5 text-sm font-bold bg-slate-50">
                                        <option value="standard">標準バランス型の値を適用</option>
                                        <option value="aggressive">効率追求型の値を適用</option>
                                        <option value="conservative">余裕確保型の値を適用</option>
                                    </select>
                                    <button onClick={applyAllSuggestedTargets} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded font-bold shadow flex items-center gap-2 text-sm">
                                        <Bot className="w-4 h-4" /> 実行
                                    </button>
                                </div>
                            )}

                            {insightsData.map((data, idx) => (
                                <div key={idx} className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
                                    <div className="p-4 border-b md:border-b-0 md:border-r bg-slate-50 md:w-1/3 flex flex-col justify-center">
                                        <div className="text-xs font-bold text-slate-400 mb-1">{data.category}</div>
                                        <div className="font-bold text-lg text-slate-800 mb-3">{data.title}</div>

                                        <div className="flex justify-between items-center text-sm bg-white border p-2 rounded mb-2">
                                            <span className="text-slate-500 font-bold">現在の設定目標:</span>
                                            <span className="font-mono font-black text-slate-800 text-lg">{data.currentTarget}秒</span>
                                        </div>

                                        <div className="text-xs font-bold text-indigo-600 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> 状況に応じた推奨目標</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {data.strategies.map(strat => (
                                                <div key={strat.id} className={`p-2 rounded border flex flex-col justify-between transition-colors ${strat.color}`}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="text-xs font-bold mb-0.5">{strat.name}</div>
                                                            <div className="text-[10px] opacity-80 leading-tight pr-2">{strat.desc}</div>
                                                        </div>
                                                        <div className="font-mono font-black text-lg shrink-0">{strat.value}s</div>
                                                    </div>
                                                    {data.currentTarget !== strat.value && (
                                                        <button
                                                            onClick={() => applySuggestedTarget(data.key, strat, data)}
                                                            className="w-full mt-2 py-1 bg-white/60 hover:bg-white border border-current/20 rounded text-xs font-bold transition-colors shadow-sm"
                                                        >
                                                            この目標を採用する
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-4 flex-1 flex flex-col">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-bold text-slate-600 flex items-center gap-1"><Activity className="w-4 h-4" /> 統計エビデンス</h4>
                                            <span className="text-xs text-slate-400">有効データ: {data.stats.validCount}件 (除外: {data.stats.rawCount - data.stats.validCount}件)</span>
                                        </div>

                                        <div className="mb-4 bg-slate-100 rounded-full h-8 relative flex items-center px-2 shadow-inner overflow-hidden border border-slate-200">
                                            <span className="absolute left-2 text-[10px] text-slate-400">{data.stats.min}s (最速)</span>
                                            <span className="absolute right-2 text-[10px] text-slate-400">{data.stats.max}s (最遅)</span>
                                            <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500" style={{ left: '50%', transform: 'translateX(-50%)' }}></div>
                                            <div className="absolute top-1 -mt-5 bg-blue-600 text-white text-[10px] px-1.5 rounded font-bold" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                                平均 {data.stats.mean}s
                                            </div>
                                            <div className="absolute h-2 bg-blue-400/40 rounded-full" style={{ left: '25%', right: '25%', top: '50%', transform: 'translateY(-50%)' }}></div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                            <div className="bg-slate-50 p-2 rounded border">
                                                <div className="text-[10px] text-slate-500 font-bold mb-0.5">平均値</div>
                                                <div className="font-mono text-sm font-bold">{data.stats.mean}秒</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded border">
                                                <div className="text-[10px] text-slate-500 font-bold mb-0.5">中央値</div>
                                                <div className="font-mono text-sm font-bold">{data.stats.median}秒</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded border">
                                                <div className="text-[10px] text-slate-500 font-bold mb-0.5">バラつき(標準偏差)</div>
                                                <div className="font-mono text-sm font-bold">{'\u00B1'}{data.stats.stdDev}秒</div>
                                            </div>
                                        </div>

                                        {data.insights.length > 0 && (
                                            <div className="mt-auto space-y-1.5">
                                                <div className="text-xs font-bold text-slate-500 mb-1">自動インサイト:</div>
                                                {data.insights.map((insight, i) => {
                                                    let colors = 'bg-slate-50 text-slate-700 border-slate-200';
                                                    let Icon = AlertCircle;
                                                    if (insight.type === 'warning') { colors = 'bg-amber-50 text-amber-800 border-amber-200'; Icon = AlertTriangle; }
                                                    if (insight.type === 'danger') { colors = 'bg-rose-50 text-rose-800 border-rose-200'; Icon = AlertOctagon; }
                                                    if (insight.type === 'info') { colors = 'bg-blue-50 text-blue-800 border-blue-200'; Icon = HelpCircle; }
                                                    if (insight.type === 'success') { colors = 'bg-emerald-50 text-emerald-800 border-emerald-200'; Icon = TrendingUp; }
                                                    return (
                                                        <div key={i} className={`flex gap-2 p-2 rounded border text-xs font-bold ${colors}`}>
                                                            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                                                            <span>{insight.text}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {insightsData.length === 0 && (
                                <div className="text-center py-10 bg-white rounded-xl border border-slate-200 text-slate-400">
                                    指定された期間の完了実績データが不足しているため、分析できません。
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-400 font-bold p-6">
                            <Target className="w-12 h-12 mb-3 opacity-20" />
                            <p>上部のメニューから分析対象の「型式」を選択してください。</p>
                            <p className="text-xs mt-2 font-normal text-slate-500">十分な完了実績がある型式ほど、正確なエビデンスと提案が生成されます。</p>
                        </div>
                    )}
                </>
            ) : (
                <TargetTimeHistoryPanel history={targetTimeHistory || []} />
            )}
        </div>
    );
};

// Advanced Analysis View
const AnalysisView = ({ lots, logs, workers, saveData, settings, saveSettings, currentUserName = '', indirectWork = [] }) => {
  const [activeMode, setActiveMode] = useState('daily');
  const [selectedModel, setSelectedModel] = useState('all');
  const [targetTolerance, setTargetTolerance] = useState(20); // % for USL/LSL
  const [dateRange, setDateRange] = useState('week');
  const [filterMode, setFilterMode] = useState('month');
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const isInFilterPeriod = (timestamp) => {
    if (!timestamp) return true;
    const d = new Date(timestamp);
    if (filterMode === 'month') {
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    const start = new Date(filterStartDate);
    const end = new Date(filterEndDate);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  };

  // --- Step Analysis Data ---
  const stepAnalysisData = useMemo(() => {
    if (selectedModel === 'all') return null;

    // Filter lots by model and completed status
    const targetLots = lots.filter(l => l.model === selectedModel && (l.status === 'completed' || l.location === 'completed'));
    if (targetLots.length === 0) return null;

    // Use the steps definition from the first lot (assuming consistency for same model)
    const steps = targetLots[0].steps || [];
    
    // Aggregators
    const stepStats = steps.map((step, idx) => {
        let totalDuration = 0;
        let count = 0;
        const durations = [];

        targetLots.forEach(lot => {
            // Check Custom Tasks
            if (lot.tasks) {
                // Sum all units for this step
                let stepSum = 0;
                let unitCount = 0;
                Object.keys(lot.tasks).forEach(key => {
                    if (key.startsWith(`${idx}-`) && lot.tasks[key].status === 'completed') {
                        stepSum += lot.tasks[key].duration;
                        unitCount++;
                    }
                });
                if (unitCount > 0) {
                    // Average per unit for this lot
                    const avgPerUnit = stepSum / unitCount;
                    totalDuration += avgPerUnit;
                    durations.push(avgPerUnit);
                    count++;
                }
            } 
            // Check Sequential Step Times (if available)
            else if (lot.stepTimes && lot.stepTimes[step.id]) {
                const d = lot.stepTimes[step.id] / 1000; // ms to sec
                totalDuration += d;
                durations.push(d);
                count++;
            }
        });

        const avg = count > 0 ? totalDuration / count : 0;
        return { 
            stepName: step.title, 
            avg, 
            target: step.targetTime || 0,
            count,
            durations // for min/max/scatter later if needed
        };
    });

    return stepStats;
  }, [lots, selectedModel]);

  const analysisData = useMemo(() => {
    // Basic filtering
    let filtered = lots.filter(l => (l.status === 'completed' || l.location === 'completed') && isInFilterPeriod(l.updatedAt || l.createdAt));
    if (selectedModel !== 'all') {
        filtered = filtered.filter(l => l.model === selectedModel);
    }
    
    // Group by Model for Distribution
    const modelStats = {};
    filtered.forEach(lot => {
        if (!modelStats[lot.model]) modelStats[lot.model] = { times: [], target: 0 };
        
        const totalQty = lot.quantity || 1;
        let unitTimes = [];

        if (lot.tasks) {
            // Custom Mode: Sum up durations for each unit across all steps
            // structure: "stepIdx-unitIdx": { duration: ... }
            const unitTotals = {};
            Object.entries(lot.tasks).forEach(([key, task]) => {
                if (task.status === 'completed') {
                    const [_, uIdx] = key.split('-');
                    unitTotals[uIdx] = (unitTotals[uIdx] || 0) + task.duration;
                }
            });
            unitTimes = Object.values(unitTotals);
        } else {
            // Sequential Mode: Total time / Quantity (Distributed equally)
            const totalTimeSec = (lot.totalWorkTime || 0) / 1000;
            const avgTime = totalTimeSec / totalQty;
            unitTimes = Array(totalQty).fill(avgTime);
        }

        // Add to stats
        const target = calculateLotEstimatedTime(lot) / totalQty; // Target per unit
        
        if (target > 0) {
            modelStats[lot.model].target = target;
            modelStats[lot.model].times.push(...unitTimes);
        }
    });

    // Calculate CPK & Histogram
    const reports = Object.keys(modelStats).map(model => {
        const { times, target } = modelStats[model];
        if (times.length < 2) return null;

        const avg = times.reduce((a,b)=>a+b,0) / times.length;
        const variance = times.reduce((a,b)=>a + Math.pow(b-avg, 2), 0) / (times.length - 1);
        const stdDev = Math.sqrt(variance);
        
        const usl = target * (1 + targetTolerance/100);
        const lsl = target * (1 - targetTolerance/100);
        
        const cpu = (usl - avg) / (3 * stdDev);
        const cpl = (avg - lsl) / (3 * stdDev);
        const cpk = Math.min(cpu, cpl);

        // Histogram buckets
        const min = Math.min(...times);
        const max = Math.max(...times);
        const step = (max - min) / 10 || 1;
        const buckets = Array(10).fill(0);
        times.forEach(t => {
            const idx = Math.min(Math.floor((t - min) / step), 9);
            buckets[idx]++;
        });

        return { model, avg, stdDev, cpk, target, count: times.length, buckets, min, max, step };
    }).filter(Boolean);

    return reports;
  }, [lots, selectedModel, targetTolerance]);

  // Daily Worker Progress
  const workerProgress = useMemo(() => {
     return workers.map(w => {
         const todayPlanned = lots.filter(l => l.location === 'planned' && l.workerId === w.id);
         const todayDone = lots.filter(l => l.location === 'completed' && l.workerId === w.id); // In reality, filter by date
         
         const plannedSec = todayPlanned.reduce((a,l) => a + calculateLotEstimatedTime(l), 0);
         const doneSec = todayDone.reduce((a,l) => a + calculateLotEstimatedTime(l), 0); // Use estimated for progress base
         const actualDoneSec = todayDone.reduce((a,l) => a + (l.totalWorkTime||0)/1000, 0);

         return { ...w, plannedSec, doneSec, actualDoneSec };
     });
  }, [lots, workers]);

  // --- Defect Analysis ---
  const [defectFilterMonth, setDefectFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [defectFilterMode, setDefectFilterMode] = useState('month');
  const [defectFilterStart, setDefectFilterStart] = useState(new Date().toISOString().split('T')[0].slice(0, 8) + '01');
  const [defectFilterEnd, setDefectFilterEnd] = useState(new Date().toISOString().split('T')[0]);
  const [expandedDefectImage, setExpandedDefectImage] = useState(null);
  const [editModal, setEditModal] = useState({ isOpen: false, type: null, data: null, lotId: null });
  const [editLabel, setEditLabel] = useState('');
  const [editCauseProcess, setEditCauseProcess] = useState('');
  const [editPhotos, setEditPhotos] = useState([]);
  const defectProcessOptions = settings?.defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS;

  const isInDefectPeriod = (timestamp) => {
    if (!timestamp) return false;
    const d = new Date(timestamp);
    if (defectFilterMode === 'month') {
      try { return d.toISOString().slice(0, 7) === defectFilterMonth; } catch { return false; }
    }
    const startMs = new Date(defectFilterStart + 'T00:00:00').getTime();
    const endMs = new Date(defectFilterEnd + 'T23:59:59').getTime();
    return d.getTime() >= startMs && d.getTime() <= endMs;
  };

  const defectStats = useMemo(() => {
    let totalCompletedLots = 0;
    let defectLotCount = 0;
    const defects = [];
    const modelCounts = {};
    const stepCounts = {};
    const workerCounts = {};
    const processCounts = {};

    lots.forEach(lot => {
      const lotTime = lot.updatedAt || lot.entryAt || lot.createdAt;
      if (!isInDefectPeriod(lotTime)) return;
      if (lot.status === 'completed' || lot.location === 'completed') totalCompletedLots++;
      const lotDefects = (lot.interruptions || []).filter(i => i.type === 'defect');
      if (lotDefects.length > 0) {
        defectLotCount++;
        lotDefects.forEach(d => {
          defects.push({ ...d, lot });
          const m = lot.model || '不明';
          modelCounts[m] = (modelCounts[m] || 0) + 1;
          const st = d.stepInfo ? d.stepInfo.title : '全体';
          stepCounts[st] = (stepCounts[st] || 0) + 1;
          const w = d.workerName || '不明';
          workerCounts[w] = (workerCounts[w] || 0) + 1;
          const cp = d.causeProcess || '未指定';
          processCounts[cp] = (processCounts[cp] || 0) + 1;
        });
      }
    });

    const defectRate = totalCompletedLots > 0 ? ((defectLotCount / totalCompletedLots) * 100).toFixed(1) : 0;
    const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return { totalCompletedLots, defectLotCount, totalDefects: defects.length, defectRate, defects: defects.sort((a, b) => b.timestamp - a.timestamp), models: sortObj(modelCounts), steps: sortObj(stepCounts), workers: sortObj(workerCounts), processes: sortObj(processCounts) };
  }, [lots, defectFilterMonth, defectFilterMode, defectFilterStart, defectFilterEnd]);

  const complaintStats = useMemo(() => {
    const complaints = [];
    const labelCounts = {};
    const stepCounts = {};
    const workerCounts = {};

    lots.forEach(lot => {
      const lotComplaints = (lot.interruptions || []).filter(i => i.type === 'complaint');
      lotComplaints.forEach(c => {
        if (isInDefectPeriod(c.timestamp)) {
          complaints.push({ ...c, lot });
          const mainLabel = (c.label || '').split(' : ')[0] || 'その他';
          labelCounts[mainLabel] = (labelCounts[mainLabel] || 0) + 1;
          const st = c.stepInfo ? c.stepInfo.title : '全体';
          stepCounts[st] = (stepCounts[st] || 0) + 1;
          const w = c.workerName || '不明';
          workerCounts[w] = (workerCounts[w] || 0) + 1;
        }
      });
    });

    const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return { totalComplaints: complaints.length, complaints: complaints.sort((a, b) => b.timestamp - a.timestamp), labels: sortObj(labelCounts), steps: sortObj(stepCounts), workers: sortObj(workerCounts) };
  }, [lots, defectFilterMonth, defectFilterMode, defectFilterStart, defectFilterEnd]);

  const defectFilterLabel = defectFilterMode === 'month' ? defectFilterMonth : `${defectFilterStart} ~ ${defectFilterEnd}`;
  const defectFilterSuffix = defectFilterMode === 'month' ? defectFilterMonth : `${defectFilterStart}_${defectFilterEnd}`;

  const triggerDeleteInterruption = (interruptionId, lotId, typeName) => {
    if (!confirm(`この${typeName}を削除しますか？`)) return;
    const lot = lots.find(l => l.id === lotId);
    if (lot) {
      const newInterruptions = (lot.interruptions || []).filter(i => i.id !== interruptionId);
      saveData('lots', lotId, { interruptions: newInterruptions });
    }
  };

  const triggerEditInterruption = (data, lotId, type) => {
    setEditLabel(data.label || '');
    setEditCauseProcess(data.causeProcess || '');
    setEditPhotos(data.photos ? [...data.photos] : []);
    setEditModal({ isOpen: true, type, data, lotId });
  };

  const saveEditInterruption = () => {
    const { data, lotId, type } = editModal;
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return;
    const updatedInterruptions = (lot.interruptions || []).map(i => {
      if (i.id !== data.id) return i;
      if (type === 'defect') {
        const updated = { ...i, label: editLabel };
        if (editCauseProcess) updated.causeProcess = editCauseProcess; else delete updated.causeProcess;
        if (editPhotos.length > 0) updated.photos = editPhotos; else delete updated.photos;
        return updated;
      }
      return { ...i, label: editLabel };
    });
    saveData('lots', lotId, { interruptions: updatedInterruptions });
    setEditModal({ isOpen: false, type: null, data: null, lotId: null });
  };

  const handleDefectExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('不具合分析');
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const allBorder = { top: thin, bottom: thin, left: thin, right: thin };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    let R = 1;
    ws.mergeCells(R, 1, R, 8);
    ws.getRow(R).getCell(1).value = `不具合分析レポート (${defectFilterLabel})`;
    ws.getRow(R).getCell(1).font = { size: 14, bold: true };
    R += 2;
    [['完了ロット数', defectStats.totalCompletedLots], ['不具合発生ロット数', defectStats.defectLotCount], ['不具合発生率', `${defectStats.defectRate}%`], ['不具合総数', defectStats.totalDefects]].forEach(([label, value]) => {
      const r = ws.getRow(R); r.getCell(1).value = label; r.getCell(1).font = { bold: true }; r.getCell(1).border = allBorder; r.getCell(1).fill = headerFill;
      r.getCell(2).value = value; r.getCell(2).border = allBorder; R++;
    });
    R += 1;
    [{ title: '型式別 ワースト', data: defectStats.models }, { title: '項目別 ワースト', data: defectStats.steps }, { title: '原因工程別 ワースト', data: defectStats.processes }, { title: '報告者別', data: defectStats.workers }].forEach(({ title, data }) => {
      ws.getRow(R).getCell(1).value = title; ws.getRow(R).getCell(1).font = { bold: true }; R++;
      data.forEach(({ name, count }) => { ws.getRow(R).getCell(1).value = name; ws.getRow(R).getCell(1).border = allBorder; ws.getRow(R).getCell(2).value = `${count}件`; ws.getRow(R).getCell(2).border = allBorder; R++; });
      R++;
    });
    ws.getRow(R).getCell(1).value = '報告履歴'; ws.getRow(R).getCell(1).font = { bold: true, size: 12 }; R++;
    ['日時', '型式', '指図番号', '報告項目', '内容', '原因工程', '写真枚数', '報告者'].forEach((h, i) => {
      const c = ws.getRow(R).getCell(i + 1); c.value = h; c.font = { bold: true }; c.border = allBorder; c.fill = headerFill;
    });
    R++;
    defectStats.defects.forEach(d => {
      const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleString() : '-';
      [dateStr, d.lot?.model || '', d.lot?.orderNo || '', d.stepInfo?.title || '全体', d.label || '', d.causeProcess || '', d.photos ? d.photos.length : 0, d.workerName || ''].forEach((v, i) => {
        const c = ws.getRow(R).getCell(i + 1); c.value = v; c.border = allBorder;
      });
      R++;
    });
    [20, 15, 15, 25, 30, 12, 10, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `不具合分析_${defectFilterSuffix}.xlsx`; link.click();
  };

  const renderDefectFilterUI = () => (
    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border shadow-sm flex-wrap">
      <div className="flex bg-slate-100 rounded p-0.5">
        <button onClick={() => setDefectFilterMode('month')} className={`px-2 py-1 text-xs font-bold rounded ${defectFilterMode === 'month' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>月単位</button>
        <button onClick={() => setDefectFilterMode('range')} className={`px-2 py-1 text-xs font-bold rounded ${defectFilterMode === 'range' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>期間指定</button>
      </div>
      {defectFilterMode === 'month' ? (
        <div className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-slate-500" /><input type="month" value={defectFilterMonth} onChange={(e) => setDefectFilterMonth(e.target.value)} className="font-bold text-slate-700 bg-transparent outline-none" /></div>
      ) : (
        <div className="flex items-center gap-2 text-sm"><CalendarDays className="w-5 h-5 text-slate-500" /><input type="date" value={defectFilterStart} onChange={(e) => setDefectFilterStart(e.target.value)} className="font-bold text-slate-700 bg-transparent outline-none border rounded px-2 py-1" /><span className="text-slate-400">~</span><input type="date" value={defectFilterEnd} onChange={(e) => setDefectFilterEnd(e.target.value)} className="font-bold text-slate-700 bg-transparent outline-none border rounded px-2 py-1" /></div>
      )}
    </div>
  );

  return (
    <div data-fs="tables" className="h-full flex flex-col bg-slate-50 overflow-hidden">
       {/* Edit Modal */}
       {editModal.isOpen && (
         <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEditModal({ isOpen: false, type: null, data: null, lotId: null })}>
           <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
             <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-blue-600"><Pencil className="w-5 h-5" /> {editModal.type === 'defect' ? '不具合報告の編集' : '気づきの編集'}</h3>
             {editModal.type === 'defect' && defectProcessOptions.length > 0 && (
               <div className="mb-4"><div className="text-sm font-bold text-slate-700 mb-2">原因工程</div><div className="flex flex-wrap gap-2">
                 {defectProcessOptions.map(opt => (<button key={opt} onClick={() => setEditCauseProcess(editCauseProcess === opt ? '' : opt)} className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${editCauseProcess === opt ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-rose-50'}`}>{opt}</button>))}
               </div></div>
             )}
             <div className="mb-4"><div className="text-sm font-bold text-slate-700 mb-2">内容</div><textarea className="w-full border rounded p-3 h-28 text-sm" value={editLabel} onChange={e => setEditLabel(e.target.value)} /></div>
             <div className="flex justify-end gap-2">
               <button onClick={() => setEditModal({ isOpen: false, type: null, data: null, lotId: null })} className="px-4 py-2 border rounded font-bold text-slate-600 hover:bg-slate-50">キャンセル</button>
               <button onClick={saveEditInterruption} className="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700">保存</button>
             </div>
           </div>
         </div>
       )}
       {/* Expanded Defect Image */}
       {expandedDefectImage && (
         <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col p-4 items-center justify-center cursor-pointer" onClick={() => setExpandedDefectImage(null)}>
           <div className="absolute top-4 right-4 text-white hover:text-slate-300"><X className="w-10 h-10" /></div>
           <div className="flex gap-4 flex-wrap justify-center items-center max-w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
             {(Array.isArray(expandedDefectImage) ? expandedDefectImage : [expandedDefectImage]).map((src, idx) => (
               <img key={idx} src={src} className="max-h-[80vh] max-w-[45vw] object-contain rounded-lg shadow-lg" />
             ))}
           </div>
         </div>
       )}
       {/* Header Tabs */}
       <div className="bg-white border-b px-6 py-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="w-6 h-6"/> 生産性分析</h2>
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-200 p-1 rounded-lg">
                 <button onClick={()=>setActiveMode('daily')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='daily' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Activity className="w-4 h-4"/> 本日の生産状況</button>
                 <button onClick={()=>setActiveMode('process')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='process' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp className="w-4 h-4"/> 工程改善分析</button>
                 <button onClick={()=>setActiveMode('defects')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='defects' ? 'bg-white shadow text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}><AlertTriangle className="w-4 h-4"/> 不具合分析</button>
                 <button onClick={()=>setActiveMode('complaints')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='complaints' ? 'bg-white shadow text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}><Megaphone className="w-4 h-4"/> 気づき・改善提案</button>
                 <button onClick={()=>setActiveMode('direct-indirect')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='direct-indirect' ? 'bg-white shadow text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}><Activity className="w-4 h-4"/> 直間分析</button>
                 {currentUserName === '管理者' && <button onClick={()=>setActiveMode('worker-eval')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${activeMode==='worker-eval' ? 'bg-white shadow text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}><Users className="w-4 h-4"/> 作業者評価</button>}
              </div>
              <div className="flex gap-1 border rounded-lg overflow-hidden">
                <button onClick={()=>{ const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('分析データ'); ws.addRow(['型式','平均時間(s)','目標時間(s)','標準偏差','Cpk','サンプル数']); analysisData.forEach(r=>ws.addRow([r.model,r.avg.toFixed(1),r.target,r.stdDev.toFixed(1),r.cpk.toFixed(2),r.count])); ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}; ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'}}; wb.xlsx.writeBuffer().then(buf=>{const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='analysis_'+new Date().toISOString().slice(0,10)+'.xlsx'; a.click();}); }} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3"/> Excel</button>
                <button onClick={() => {
                  const pw = window.open('', '_blank');
                  if (!pw) { alert('ポップアップがブロックされています'); return; }
                  const now = new Date().toLocaleString('ja-JP');
                  const period = filterMode === 'month' ? filterMonth : `${filterStartDate} 〜 ${filterEndDate}`;
                  // 生産性データ
                  const prodRows = analysisData.map(r => `<tr><td>${r.model}</td><td style="text-align:right">${r.avg.toFixed(1)}s</td><td style="text-align:right">${r.target}s</td><td style="text-align:right">${r.stdDev.toFixed(1)}</td><td style="text-align:right">${r.cpk.toFixed(2)}</td><td style="text-align:right">${r.count}</td></tr>`).join('');
                  // 直間データ
                  let directTotal = 0, indirectTotal = 0;
                  const catBreak = {};
                  lots.forEach(lot => { if (!lot.tasks) return; Object.values(lot.tasks).forEach(t => { if (t.duration > 0) directTotal += t.duration; }); });
                  indirectWork.forEach(w => { if (w.duration > 0) { indirectTotal += w.duration; catBreak[w.category] = (catBreak[w.category]||0) + w.duration; } });
                  const diRatio = (directTotal+indirectTotal) > 0 ? ((directTotal/(directTotal+indirectTotal))*100).toFixed(1) : '0';
                  const catRows = Object.entries(catBreak).sort((a,b)=>b[1]-a[1]).map(([c,s]) => `<tr><td>${c}</td><td style="text-align:right">${formatTime(s)}</td><td style="text-align:right">${(s/3600).toFixed(1)}h</td></tr>`).join('');
                  pw.document.write(`<!DOCTYPE html><html><head><title>分析レポート</title>
                  <style>
                    @page { size: A4; margin: 15mm; }
                    body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #1e293b; max-width: 210mm; margin: 0 auto; padding: 20px; }
                    h1 { font-size: 18px; border-bottom: 3px solid #3b82f6; padding-bottom: 8px; margin-bottom: 16px; }
                    h2 { font-size: 14px; color: #3b82f6; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #3b82f6; padding-left: 8px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
                    th { background: #1e293b; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
                    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
                    tr:nth-child(even) { background: #f8fafc; }
                    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
                    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
                    .kpi-val { font-size: 24px; font-weight: 900; }
                    .kpi-label { font-size: 9px; color: #64748b; margin-top: 2px; }
                    .bar-container { background: #f1f5f9; border-radius: 4px; height: 16px; margin: 2px 0; overflow: hidden; }
                    .bar-direct { background: #3b82f6; height: 100%; display: inline-block; }
                    .bar-indirect { background: #d97706; height: 100%; display: inline-block; }
                    .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
                    @media print { body { padding: 0; } }
                  </style></head><body>
                  <h1>📊 製品検査 分析レポート</h1>
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:16px">
                    <span>期間: ${period}</span><span>出力日時: ${now}</span>
                  </div>
                  <h2>工程分析 サマリー</h2>
                  <div class="kpi-grid">
                    <div class="kpi"><div class="kpi-val" style="color:#3b82f6">${analysisData.length}</div><div class="kpi-label">分析型式数</div></div>
                    <div class="kpi"><div class="kpi-val" style="color:#059669">${analysisData.reduce((a,r)=>a+r.count,0)}</div><div class="kpi-label">総サンプル数</div></div>
                    <div class="kpi"><div class="kpi-val" style="color:#7c3aed">${diRatio}%</div><div class="kpi-label">直工比率</div></div>
                    <div class="kpi"><div class="kpi-val" style="color:#d97706">${((directTotal+indirectTotal)/3600).toFixed(1)}h</div><div class="kpi-label">総作業時間</div></div>
                  </div>
                  <h2>型式別 工程分析</h2>
                  <table><thead><tr><th>型式</th><th style="text-align:right">平均(s)</th><th style="text-align:right">目標(s)</th><th style="text-align:right">σ</th><th style="text-align:right">Cpk</th><th style="text-align:right">N</th></tr></thead><tbody>${prodRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">データなし</td></tr>'}</tbody></table>
                  <h2>直間比率</h2>
                  <div style="display:flex;height:24px;border-radius:6px;overflow:hidden;margin-bottom:8px">
                    <div class="bar-direct" style="width:${diRatio}%"></div>
                    <div class="bar-indirect" style="width:${100-parseFloat(diRatio)}%"></div>
                  </div>
                  <div style="display:flex;gap:16px;font-size:10px;margin-bottom:12px">
                    <span style="color:#3b82f6">■ 直工 ${(directTotal/3600).toFixed(1)}h (${diRatio}%)</span>
                    <span style="color:#d97706">■ 間接 ${(indirectTotal/3600).toFixed(1)}h (${(100-parseFloat(diRatio)).toFixed(1)}%)</span>
                  </div>
                  ${catRows ? `<h2>間接作業 ジャンル別内訳</h2><table><thead><tr><th>ジャンル</th><th style="text-align:right">時間</th><th style="text-align:right">時間(h)</th></tr></thead><tbody>${catRows}</tbody></table>` : ''}
                  <div class="footer">製品検査Webアプリ — 分析レポート</div>
                  </body></html>`);
                  pw.document.close();
                  setTimeout(() => pw.print(), 500);
                }} className="px-3 py-1.5 text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1"><Printer className="w-3 h-3"/> PDF</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={()=>setFilterMode('month')} className={`px-3 py-1 rounded text-xs font-bold ${filterMode==='month'?'bg-white shadow text-blue-600':'text-slate-500'}`}>今月</button>
              <button onClick={()=>setFilterMode('range')} className={`px-3 py-1 rounded text-xs font-bold ${filterMode==='range'?'bg-white shadow text-blue-600':'text-slate-500'}`}>期間指定</button>
            </div>
            {filterMode === 'range' && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={filterStartDate} onChange={e=>setFilterStartDate(e.target.value)} className="border rounded px-2 py-1 text-xs"/>
                <span className="text-slate-400">〜</span>
                <input type="date" value={filterEndDate} onChange={e=>setFilterEndDate(e.target.value)} className="border rounded px-2 py-1 text-xs"/>
              </div>
            )}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-6">
          {activeMode === 'daily' ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workerProgress.map(w => {
                   const total = w.plannedSec + w.doneSec;
                   const progress = total > 0 ? (w.doneSec / total) * 100 : 0;
                   return (
                     <div key={w.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-3 mb-4">
                           <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">{w.name[0]}</div>
                           <div>
                              <div className="font-bold text-lg">{w.name}</div>
                              <div className="text-xs text-slate-500">本日のタスク</div>
                           </div>
                           <div className="ml-auto text-right">
                              <div className="text-2xl font-black text-slate-800">{Math.round(progress)}%</div>
                           </div>
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-4">
                           <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-center">
                           <div className="bg-slate-50 p-2 rounded">
                              <div className="text-xs text-slate-500 font-bold">完了(実績)</div>
                              <div className="text-lg font-mono font-bold text-emerald-600">{formatTime(w.actualDoneSec)}</div>
                           </div>
                           <div className="bg-slate-50 p-2 rounded">
                              <div className="text-xs text-slate-500 font-bold">残り予定</div>
                              <div className="text-lg font-mono font-bold text-blue-600">{formatTime(w.plannedSec)}</div>
                           </div>
                        </div>
                     </div>
                   );
                })}
             </div>
          ) : (
             <div className="space-y-8">
                {/* Controls */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">対象型式</label>
                      <select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)} className="border rounded p-2 text-sm min-w-[150px]">
                         <option value="all">全型式</option>
                         {Array.from(new Set(lots.map(l=>l.model))).map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">許容公差 (±%)</label>
                      <input type="number" value={targetTolerance} onChange={e=>setTargetTolerance(Number(e.target.value))} className="border rounded p-2 text-sm w-24"/>
                   </div>
                </div>

                {/* Reports */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   {/* Overall Report */}
                   {analysisData.map((report, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <div className="text-sm font-bold text-slate-500">総合評価</div>
                               <div className="text-xl font-black text-slate-800">{report.model}</div>
                            </div>
                            <div className="text-right">
                               <div className="text-xs text-slate-400">サンプル数: {report.count}</div>
                               <div className={`text-lg font-bold px-2 rounded ${report.cpk < 1.0 ? 'bg-rose-100 text-rose-600' : report.cpk < 1.33 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                  Cpk: {report.cpk.toFixed(2)}
                               </div>
                            </div>
                         </div>
                         
                         <div className="grid grid-cols-4 gap-2 mb-6 text-center text-sm">
                            <div className="bg-slate-50 p-2 rounded"><div className="text-[10px] text-slate-400">平均時間</div><div className="font-bold">{report.avg.toFixed(1)}s</div></div>
                            <div className="bg-slate-50 p-2 rounded"><div className="text-[10px] text-slate-400">目標時間</div><div className="font-bold">{report.target}s</div></div>
                            <div className="bg-slate-50 p-2 rounded"><div className="text-[10px] text-slate-400">標準偏差(σ)</div><div className="font-bold">{report.stdDev.toFixed(1)}</div></div>
                            <div className="bg-slate-50 p-2 rounded"><div className="text-[10px] text-slate-400">目標差</div><div className={`${report.avg > report.target ? 'text-rose-500':'text-emerald-500'} font-bold`}>{(report.avg - report.target).toFixed(1)}s</div></div>
                         </div>

                         {/* Histogram Visualization (Simple CSS Bars) */}
                         <div className="h-40 flex items-end gap-1 border-b border-l border-slate-300 relative pt-4">
                            {report.buckets.map((count, bIdx) => {
                                const maxCount = Math.max(...report.buckets);
                                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                return (
                                   <div key={bIdx} className="flex-1 bg-blue-500/80 hover:bg-blue-600 transition-all relative group rounded-t-sm" style={{ height: `${height}%` }}>
                                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">{count}</div>
                                   </div>
                                );
                             })}
                          </div>
                          <div className="flex justify-between text-xs text-slate-400 mt-1">
                             <span>{report.min.toFixed(0)}s</span>
                             <span>{report.max.toFixed(0)}s</span>
                          </div>
                          
                          {/* Improvement Suggestion */}
                          <div className="mt-4 bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex gap-3 items-start">
                              <Target className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5"/>
                              <div>
                                 <div className="text-xs font-bold text-yellow-700">改善提案</div>
                                 <div className="text-sm text-slate-700">
                                    {report.avg > report.target * 1.1 
                                      ? `目標時間(${report.target}s)に対して実績が大幅に遅れています。工程の見直しまたは目標時間の修正(推奨: ${Math.round(report.avg)}s)を検討してください。`
                                      : report.stdDev > report.avg * 0.2
                                      ? `作業時間のバラつきが大きいです(変動係数: ${(report.stdDev/report.avg*100).toFixed(0)}%)。作業手順の標準化が必要です。`
                                      : `工程は安定しています。さらなる短縮が可能か検討してください。`
                                    }
                                 </div>
                              </div>
                          </div>
                       </div>
                    ))}
 
                    {/* Step Breakdown Chart */}
                    {stepAnalysisData && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-1 lg:col-span-2">
                            <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><Layers className="w-5 h-5"/> 工程別 所要時間分析 ({selectedModel})</h3>
                            <div className="flex items-end gap-4 h-64 border-b border-slate-200 pb-2 overflow-x-auto">
                                {stepAnalysisData.map((step, idx) => {
                                    const maxTime = Math.max(...stepAnalysisData.map(s => Math.max(s.avg, s.target))) * 1.2;
                                    const height = maxTime > 0 ? (step.avg / maxTime) * 100 : 0;
                                    const targetHeight = maxTime > 0 ? (step.target / maxTime) * 100 : 0;
                                    
                                    return (
                                        <div key={idx} className="flex-1 min-w-[80px] h-full flex flex-col justify-end relative group">
                                            {/* Target Line Marker */}
                                            <div className="absolute w-full border-t-2 border-dashed border-slate-300 z-10" style={{ bottom: `${targetHeight}%` }}></div>
                                            
                                            {/* Bar */}
                                            <div 
                                              className={`w-full rounded-t-md transition-all duration-500 relative ${step.avg > step.target ? 'bg-rose-400' : 'bg-blue-400'} hover:opacity-80`} 
                                              style={{ height: `${height}%` }}
                                            >
                                                <div className="absolute -top-6 w-full text-center text-xs font-bold text-slate-700">{step.avg.toFixed(0)}s</div>
                                            </div>
                                            <div className="text-center mt-2">
                                                <div className="text-xs font-bold text-slate-700 truncate px-1" title={step.stepName}>{step.stepName}</div>
                                                <div className="text-[10px] text-slate-400">目標: {step.target}s</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="mt-4 text-xs text-slate-500 flex gap-4">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-400 rounded"></div>目標内</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-rose-400 rounded"></div>目標超過 (改善ポイント)</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-1 border-t-2 border-dashed border-slate-300"></div>目標時間</div>
                            </div>
                        </div>
                    )}
 
                    {/* Process Optimization Insights */}
                    {stepAnalysisData && stepAnalysisData.length > 0 && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-1 lg:col-span-2">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-indigo-600" /> 工程別インサイト ({selectedModel})</h3>
                            <div className="space-y-3">
                                {stepAnalysisData.map((step, idx) => {
                                    const durations = step.durations || [];
                                    const mean = step.avg;
                                    const target = step.target;
                                    let stdDev = 0;
                                    if (durations.length > 1) {
                                        const variance = durations.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) / (durations.length - 1);
                                        stdDev = Math.sqrt(variance);
                                    }
                                    const cv = mean > 0 ? stdDev / mean : 0;
                                    const cvColor = cv > 0.5 ? 'text-rose-600 bg-rose-50 border-rose-200' : cv > 0.3 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200';
                                    const cvMessage = cv > 0.5 ? 'バラつきが大きいです。手順の標準化を推奨します。' : cv > 0.3 ? 'やや不安定です。改善の余地があります。' : '安定しています。';

                                    // Strategies
                                    const sorted = [...durations].sort((a, b) => a - b);
                                    const p25 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.25)] : mean;
                                    const strategies = [
                                        { id: 'standard', name: '標準バランス型', desc: '全体の平均値を目標に設定', value: Math.round(mean), color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100' },
                                        { id: 'aggressive', name: '効率追求型', desc: '上位25%のペースを基準', value: Math.round(p25), color: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' },
                                        { id: 'conservative', name: '余裕確保型', desc: 'バラつきを考慮した余裕あるペース', value: Math.round(mean + stdDev), color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100' },
                                    ];

                                    return (
                                        <div key={idx} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="font-bold text-slate-800">{step.stepName}</div>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cvColor}`}>
                                                    変動係数: {(cv * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3 text-center text-sm mb-3">
                                                <div className="bg-slate-50 p-2 rounded">
                                                    <div className="text-[10px] text-slate-400">現在の目標</div>
                                                    <div className="font-bold">{target}s</div>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded">
                                                    <div className="text-[10px] text-slate-400">実績平均</div>
                                                    <div className="font-bold">{mean.toFixed(1)}s</div>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded">
                                                    <div className="text-[10px] text-slate-400">標準偏差</div>
                                                    <div className="font-bold">{stdDev.toFixed(1)}s</div>
                                                </div>
                                            </div>
                                            <div className={`text-xs p-2 rounded border mb-3 ${cvColor}`}>
                                                <AlertCircle className="w-3 h-3 inline mr-1" />{cvMessage}
                                            </div>
                                            {step.count >= 2 && (
                                                <div>
                                                    <div className="text-xs font-bold text-slate-500 mb-2">最適化提案:</div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {strategies.map(strat => (
                                                            <div key={strat.id} className={`border rounded-lg p-2 text-center ${strat.color} cursor-default`}>
                                                                <div className="text-xs font-bold">{strat.name}</div>
                                                                <div className="text-lg font-black">{strat.value}s</div>
                                                                <div className="text-[10px] opacity-70">{strat.desc}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {analysisData.length === 0 && <div className="col-span-full text-center py-20 text-slate-400">分析可能なデータがありません</div>}
                 </div>
              </div>
           )}

           {/* Defect Analysis Tab */}
           {activeMode === 'defects' && (
             <div className="space-y-6">
               <div className="flex justify-between items-center flex-wrap gap-2">
                 <div className="font-bold text-slate-600 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> 不具合集計</div>
                 {renderDefectFilterUI()}
               </div>

               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <div className="bg-white p-6 rounded-xl border shadow-sm">
                   <div className="text-sm font-bold text-slate-500 mb-2">完了ロット数</div>
                   <div className="text-3xl font-black text-slate-800">{defectStats.totalCompletedLots} <span className="text-base font-normal">件</span></div>
                 </div>
                 <div className="bg-rose-50 border-rose-200 p-6 rounded-xl border shadow-sm">
                   <div className="text-sm font-bold text-rose-600 mb-2">不具合発生ロット数</div>
                   <div className="text-3xl font-black text-rose-700">{defectStats.defectLotCount} <span className="text-base font-normal">件</span></div>
                 </div>
                 <div className="bg-amber-50 border-amber-200 p-6 rounded-xl border shadow-sm">
                   <div className="text-sm font-bold text-amber-600 mb-2">不具合発生率(%)</div>
                   <div className="text-3xl font-black text-amber-700">{defectStats.defectRate} <span className="text-base font-normal">%</span></div>
                 </div>
                 <div className="bg-white p-6 rounded-xl border shadow-sm">
                   <div className="text-sm font-bold text-slate-500 mb-2">不具合総数</div>
                   <div className="text-3xl font-black text-slate-700">{defectStats.totalDefects} <span className="text-base font-normal">件</span></div>
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Package className="w-4 h-4" /> 型式別 ワースト</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {defectStats.models.map((m, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-sm text-slate-800 truncate pr-2">{m.name}</span><span className="text-rose-600 font-bold bg-rose-100 px-2 py-0.5 rounded text-xs shrink-0">{m.count}件</span></div>))}
                     {defectStats.models.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><CheckSquare className="w-4 h-4" /> 項目別 ワースト</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {defectStats.steps.map((s, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-xs text-slate-800 truncate pr-2" title={s.name}>{s.name}</span><span className="text-rose-600 font-bold bg-rose-100 px-2 py-0.5 rounded text-xs shrink-0">{s.count}件</span></div>))}
                     {defectStats.steps.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> 原因工程別 ワースト</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {defectStats.processes.map((p, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-sm text-slate-800 truncate pr-2">{p.name}</span><span className="text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded text-xs shrink-0">{p.count}件</span></div>))}
                     {defectStats.processes.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><User className="w-4 h-4" /> 報告者別</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {defectStats.workers.map((w, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-sm text-slate-800 truncate pr-2">{w.name}</span><span className="text-amber-600 font-bold bg-amber-100 px-2 py-0.5 rounded text-xs shrink-0">{w.count}件</span></div>))}
                     {defectStats.workers.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
               </div>

               <div className="bg-white rounded-xl shadow-sm border flex flex-col min-h-[15rem] overflow-hidden">
                 <div className="p-4 border-b font-bold text-slate-700 bg-slate-50 flex justify-between items-center">
                   <span>報告履歴</span>
                   <div className="flex items-center gap-2">
                     <button onClick={handleDefectExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
                   </div>
                 </div>
                 <div className="overflow-y-auto p-0 flex-1">
                   <table className="w-full text-left border-collapse text-sm">
                     <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 text-slate-500">
                       <tr className="border-b">
                         <th className="p-3 font-bold">日時</th>
                         <th className="p-3 font-bold">型式</th>
                         <th className="p-3 font-bold">指図番号</th>
                         <th className="p-3 font-bold">報告項目</th>
                         <th className="p-3 font-bold">内容</th>
                         <th className="p-3 font-bold">原因工程</th>
                         <th className="p-3 font-bold">写真</th>
                         <th className="p-3 font-bold">報告者</th>
                         <th className="p-3 font-bold text-center">操作</th>
                       </tr>
                     </thead>
                     <tbody>
                       {defectStats.defects.map((d, i) => (
                         <tr key={i} className="border-b hover:bg-rose-50 transition-colors">
                           <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{d.timestamp ? new Date(d.timestamp).toLocaleString() : '-'}</td>
                           <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{d.lot?.model || ''}</td>
                           <td className="p-3 text-xs text-slate-400">{d.lot?.orderNo || ''}</td>
                           <td className="p-3 text-xs">{d.stepInfo?.title || '全体'}</td>
                           <td className="p-3 text-rose-600 font-bold whitespace-pre-wrap">{d.label || ''}</td>
                           <td className="p-3 text-xs font-bold whitespace-nowrap">{d.causeProcess ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">{d.causeProcess}</span> : '-'}</td>
                           <td className="p-3 text-center">{d.photos && d.photos.length > 0 ? <button onClick={() => setExpandedDefectImage(d.photos)} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold hover:bg-blue-200">{d.photos.length}枚</button> : '-'}</td>
                           <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{d.workerName || ''}</td>
                           <td className="p-3 text-center">
                             <div className="flex items-center justify-center gap-1">
                               <button onClick={() => triggerEditInterruption(d, d.lot.id, 'defect')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編集"><Pencil className="w-4 h-4" /></button>
                               <button onClick={() => triggerDeleteInterruption(d.id, d.lot.id, '不具合報告')} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="削除"><Trash2 className="w-4 h-4" /></button>
                             </div>
                           </td>
                         </tr>
                       ))}
                       {defectStats.defects.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-slate-400">不具合報告はありません</td></tr>}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
           )}

           {/* Complaints / Observations Tab */}
           {activeMode === 'complaints' && (
             <div className="space-y-6">
               <div className="flex justify-between items-center flex-wrap gap-2">
                 <div className="font-bold text-slate-600 flex items-center gap-2"><Megaphone className="w-5 h-5 text-purple-600" /> 気づき・改善提案集計</div>
                 {renderDefectFilterUI()}
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-purple-50 border-purple-200 p-6 rounded-xl border shadow-sm">
                   <div className="text-sm font-bold text-purple-600 mb-2">報告された気づき総数</div>
                   <div className="text-3xl font-black text-purple-700">{complaintStats.totalComplaints} <span className="text-base font-normal">件</span></div>
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Megaphone className="w-4 h-4" /> 内容別 ワースト</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {complaintStats.labels.map((m, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-sm text-slate-800 truncate pr-2" title={m.name}>{m.name}</span><span className="text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded text-xs shrink-0">{m.count}件</span></div>))}
                     {complaintStats.labels.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><CheckSquare className="w-4 h-4" /> 項目別 ワースト</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {complaintStats.steps.map((s, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-xs text-slate-800 truncate pr-2" title={s.name}>{s.name}</span><span className="text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded text-xs shrink-0">{s.count}件</span></div>))}
                     {complaintStats.steps.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
                 <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col h-64">
                   <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><User className="w-4 h-4" /> 報告者別</h3>
                   <div className="flex-1 overflow-y-auto space-y-2">
                     {complaintStats.workers.map((w, i) => (<div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded"><span className="font-bold text-sm text-slate-800 truncate pr-2">{w.name}</span><span className="text-amber-600 font-bold bg-amber-100 px-2 py-0.5 rounded text-xs shrink-0">{w.count}件</span></div>))}
                     {complaintStats.workers.length === 0 && <div className="text-center text-slate-400 text-sm mt-4">データなし</div>}
                   </div>
                 </div>
               </div>

               <div className="bg-white rounded-xl shadow-sm border flex flex-col min-h-[15rem] overflow-hidden">
                 <div className="p-4 border-b font-bold text-slate-700 bg-slate-50 flex justify-between items-center">
                   <span>気づき・改善提案 報告履歴</span>
                 </div>
                 <div className="overflow-y-auto p-0 flex-1">
                   <table className="w-full text-left border-collapse text-sm">
                     <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 text-slate-500">
                       <tr className="border-b">
                         <th className="p-3 font-bold">日時</th>
                         <th className="p-3 font-bold">型式 / 指図</th>
                         <th className="p-3 font-bold">報告項目</th>
                         <th className="p-3 font-bold">内容</th>
                         <th className="p-3 font-bold">報告者</th>
                         <th className="p-3 font-bold text-center">操作</th>
                       </tr>
                     </thead>
                     <tbody>
                       {complaintStats.complaints.map((d, i) => (
                         <tr key={i} className="border-b hover:bg-purple-50 transition-colors">
                           <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{d.timestamp ? new Date(d.timestamp).toLocaleString() : '-'}</td>
                           <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{d.lot?.model || ''} <span className="text-xs text-slate-400 ml-1 font-normal">{d.lot?.orderNo || ''}</span></td>
                           <td className="p-3 text-xs">{d.stepInfo?.title || '全体'}</td>
                           <td className="p-3 text-purple-700 font-bold whitespace-pre-wrap">{d.label || ''}</td>
                           <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{d.workerName || ''}</td>
                           <td className="p-3 text-center">
                             <div className="flex items-center justify-center gap-1">
                               <button onClick={() => triggerEditInterruption(d, d.lot.id, 'complaint')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編集"><Pencil className="w-4 h-4" /></button>
                               <button onClick={() => triggerDeleteInterruption(d.id, d.lot.id, '気づき')} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="削除"><Trash2 className="w-4 h-4" /></button>
                             </div>
                           </td>
                         </tr>
                       ))}
                       {complaintStats.complaints.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400">報告はありません</td></tr>}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
           )}

           {activeMode === 'process' && (
             <ProcessInsightsTab
               lots={lots}
               workers={workers}
               customTargetTimes={settings.customTargetTimes || {}}
               onSaveSettings={saveSettings}
               targetTimeHistory={settings.targetTimeHistory || []}
               settings={settings}
             />
           )}

           {activeMode === 'direct-indirect' && (() => {
             const [diDateFrom, setDiDateFrom] = [filterStartDate, setFilterStartDate];
             const [diDateTo, setDiDateTo] = [filterEndDate, setFilterEndDate];
             const fromTs = new Date(diDateFrom); fromTs.setHours(0,0,0,0);
             const toTs = new Date(diDateTo); toTs.setHours(23,59,59,999);

             // 直工集計（作業者別）
             const workerDirect = {};
             lots.forEach(lot => {
               if (!lot.tasks) return;
               Object.entries(lot.tasks).forEach(([key, task]) => {
                 if (!task.duration || task.duration <= 0 || !task.workerName) return;
                 const taskEnd = (task.startTime || lot.workStartTime || lot.createdAt || 0) + (task.duration * 1000);
                 if (taskEnd < fromTs.getTime() || taskEnd > toTs.getTime() + 86400000) return;
                 workerDirect[task.workerName] = (workerDirect[task.workerName] || 0) + task.duration;
               });
             });
             // 間接集計（作業者別・ジャンル別）
             const workerIndirect = {};
             const catTotals = {};
             indirectWork.forEach(w => {
               if (!w.workerName || !w.duration) return;
               if (w.startTime < fromTs.getTime() || w.startTime > toTs.getTime() + 86400000) return;
               workerIndirect[w.workerName] = (workerIndirect[w.workerName] || 0) + w.duration;
               catTotals[w.category] = (catTotals[w.category] || 0) + w.duration;
             });
             const allNames = [...new Set([...Object.keys(workerDirect), ...Object.keys(workerIndirect)])];
             const totalDirect = Object.values(workerDirect).reduce((a, b) => a + b, 0);
             const totalIndirect = Object.values(workerIndirect).reduce((a, b) => a + b, 0);
             const totalAll = totalDirect + totalIndirect;
             const directRatio = totalAll > 0 ? (totalDirect / totalAll) * 100 : 0;
             const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
             const maxCat = catEntries.length > 0 ? catEntries[0][1] : 1;

             return (
               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 <div className="flex items-center gap-3 flex-wrap">
                   <input type="date" value={diDateFrom} onChange={e => setDiDateFrom(e.target.value)} className="border rounded px-2 py-1 text-sm"/>
                   <span className="text-slate-400">〜</span>
                   <input type="date" value={diDateTo} onChange={e => setDiDateTo(e.target.value)} className="border rounded px-2 py-1 text-sm"/>
                 </div>
                 {/* 全体直間比率 */}
                 <div className="bg-white rounded-xl border shadow-sm p-5">
                   <h3 className="font-bold text-slate-800 mb-3">全体の直間比率</h3>
                   <div className="flex h-10 rounded-lg overflow-hidden mb-3">
                     {totalDirect > 0 && <div className="bg-blue-500 flex items-center justify-center text-white text-sm font-bold" style={{width: `${directRatio}%`}}>直工 {directRatio.toFixed(0)}%</div>}
                     {totalIndirect > 0 && <div className="bg-amber-500 flex items-center justify-center text-white text-sm font-bold" style={{width: `${100-directRatio}%`}}>間接 {(100-directRatio).toFixed(0)}%</div>}
                     {totalAll === 0 && <div className="bg-slate-200 flex-1 flex items-center justify-center text-slate-400 text-sm">データなし</div>}
                   </div>
                   <div className="grid grid-cols-3 gap-3 text-center">
                     <div className="bg-blue-50 rounded-lg p-2"><div className="text-xs text-blue-500 font-bold">直工合計</div><div className="text-lg font-black text-blue-700 font-mono">{(totalDirect/3600).toFixed(1)}h</div></div>
                     <div className="bg-amber-50 rounded-lg p-2"><div className="text-xs text-amber-500 font-bold">間接合計</div><div className="text-lg font-black text-amber-700 font-mono">{(totalIndirect/3600).toFixed(1)}h</div></div>
                     <div className="bg-purple-50 rounded-lg p-2"><div className="text-xs text-purple-500 font-bold">直工比率</div><div className="text-lg font-black text-purple-700 font-mono">{directRatio.toFixed(1)}%</div></div>
                   </div>
                 </div>
                 {/* 間接ジャンル別 */}
                 <div className="bg-white rounded-xl border shadow-sm p-5">
                   <h3 className="font-bold text-slate-800 mb-3">間接作業 ジャンル別内訳</h3>
                   {catEntries.length > 0 ? catEntries.map(([cat, sec]) => (
                     <div key={cat} className="flex items-center gap-2 mb-2">
                       <span className="text-xs font-bold text-slate-600 w-16 text-right shrink-0">{cat}</span>
                       <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden"><div className="h-full bg-amber-500 rounded-full flex items-center pl-2" style={{width: `${(sec/maxCat)*100}%`}}><span className="text-[10px] text-white font-bold">{formatTime(sec)}</span></div></div>
                       <span className="text-xs text-slate-400 w-12 text-right font-mono">{(sec/3600).toFixed(1)}h</span>
                     </div>
                   )) : <div className="text-center text-slate-400 text-sm py-4">データなし</div>}
                 </div>
                 {/* 作業者別 */}
                 <div className="bg-white rounded-xl border shadow-sm p-5">
                   <h3 className="font-bold text-slate-800 mb-3">作業者別 直間比率</h3>
                   {allNames.map(name => {
                     const d = workerDirect[name] || 0, ind = workerIndirect[name] || 0, t = d + ind;
                     const dr = t > 0 ? (d / t) * 100 : 0;
                     return (
                       <div key={name} className="mb-3">
                         <div className="flex justify-between text-xs mb-1"><span className="font-bold">{name}</span><span className="text-slate-400">直工{dr.toFixed(0)}% / 合計{(t/3600).toFixed(2)}h</span></div>
                         <div className="flex h-5 rounded overflow-hidden">{d > 0 && <div className="bg-blue-500" style={{width: `${dr}%`}}/>}{ind > 0 && <div className="bg-amber-500" style={{width: `${100-dr}%`}}/>}</div>
                       </div>
                     );
                   })}
                   {allNames.length === 0 && <div className="text-center text-slate-400 text-sm py-4">データなし</div>}
                 </div>
               </div>
             );
           })()}

           {activeMode === 'worker-eval' && (() => {
             // 作業者別の評価データ生成
             const completedLots = lots.filter(l => l.status === 'completed');
             const workerStats = workers.map(w => {
               const wLots = completedLots.filter(l => l.workerId === w.id);
               let totalTasks = 0, completedTasks = 0, totalDuration = 0, championCount = 0;
               let parallelScore = 0, parallelOpportunities = 0;
               let ngCount = 0, reworkTime = 0;
               const stepTimes = {}; // model-step → [durations]

               wLots.forEach(lot => {
                 const tasks = lot.tasks || {};
                 const steps = lot.steps || [];
                 const qty = lot.quantity || 1;

                 // タスク別分析
                 steps.forEach((step, sIdx) => {
                   const isAuto = step.title?.includes('自動');
                   const stepKey = `${lot.model}-${step.title}`;
                   if (!stepTimes[stepKey]) stepTimes[stepKey] = [];

                   let autoRunning = false;
                   let autoStartTime = null, autoEndTime = null;
                   let manualDuringAuto = 0;

                   for (let uIdx = 0; uIdx < qty; uIdx++) {
                     const key = `${sIdx}-${uIdx}`;
                     const task = tasks[key];
                     if (!task) continue;
                     totalTasks++;
                     if (task.status === 'completed' || task.status === 'ng') completedTasks++;
                     totalDuration += task.duration || 0;
                     stepTimes[stepKey].push(task.duration || 0);

                     // NG/修正集計
                     if (task.reworks?.length > 0) {
                       ngCount += 1;
                       reworkTime += (task.reworks || []).reduce((a, r) => a + (r.duration || 0), 0);
                     }

                     // 自動工程の時間帯を記録
                     if (isAuto && task.startTime) {
                       autoStartTime = autoStartTime ? Math.min(autoStartTime, task.startTime) : task.startTime;
                       const endT = task.startTime + (task.duration || 0) * 1000;
                       autoEndTime = autoEndTime ? Math.max(autoEndTime, endT) : endT;
                     }
                   }

                   // 自動工程中に他の手動工程をやっていたか分析
                   if (isAuto && autoStartTime && autoEndTime) {
                     parallelOpportunities++;
                     steps.forEach((otherStep, oIdx) => {
                       if (oIdx === sIdx || otherStep.title?.includes('自動')) return;
                       for (let uIdx = 0; uIdx < qty; uIdx++) {
                         const oTask = tasks[`${oIdx}-${uIdx}`];
                         if (!oTask || !oTask.startTime) continue;
                         const oStart = oTask.startTime;
                         const oEnd = oStart + (oTask.duration || 0) * 1000;
                         // 重なり判定
                         if (oStart < autoEndTime && oEnd > autoStartTime) {
                           manualDuringAuto += oTask.duration || 0;
                         }
                       }
                     });
                     if (manualDuringAuto > 0) parallelScore++;
                   }
                 });

                 // チャンピオンタイム: ロット全体の作業時間が目標以下
                 const lotTime = (lot.totalWorkTime || 0) / 1000;
                 const targetKey = `${lot.model}-${lot.templateId}`;
                 const target = settings?.customTargetTimes?.[targetKey];
                 if (target && lotTime > 0 && lotTime <= target) championCount++;
               });

               // 工程別のチャンピオンタイム（最速記録を持ってるか）
               let bestTimeCount = 0;
               Object.entries(stepTimes).forEach(([key, times]) => {
                 if (times.length === 0) return;
                 const myBest = Math.min(...times);
                 // 全作業者の同じ工程のタイムと比較
                 let globalBest = myBest;
                 completedLots.forEach(l => {
                   const t = l.tasks || {};
                   const s = l.steps || [];
                   s.forEach((step, sI) => {
                     const sk = `${l.model}-${step.title}`;
                     if (sk !== key) return;
                     for (let u = 0; u < (l.quantity || 1); u++) {
                       const dur = t[`${sI}-${u}`]?.duration;
                       if (dur && dur > 0) globalBest = Math.min(globalBest, dur);
                     }
                   });
                 });
                 if (myBest <= globalBest && myBest > 0) bestTimeCount++;
               });

               const avgTime = completedTasks > 0 ? totalDuration / completedTasks : 0;
               const parallelRate = parallelOpportunities > 0 ? (parallelScore / parallelOpportunities) * 100 : 0;
               // 総合スコア（100点満点）
               const speedScore = Math.min(40, avgTime > 0 ? Math.max(0, 40 - (avgTime / 60) * 2) : 0);
               const parallelBonus = Math.min(30, parallelRate * 0.3);
               const championBonus = Math.min(20, championCount * 5 + bestTimeCount * 3);
               const qualityScore = Math.min(10, ngCount * 3); // NG発見が多いほど高評価（品質意識が高い）
               const totalScore = Math.round(Math.max(0, speedScore + parallelBonus + championBonus + Math.max(0, qualityScore)));

               return {
                 ...w, lotCount: wLots.length, totalTasks, completedTasks, avgTime, totalDuration,
                 parallelRate, parallelScore, parallelOpportunities,
                 championCount, bestTimeCount, ngCount, reworkTime,
                 totalScore, speedScore, parallelBonus, championBonus, qualityScore
               };
             }).sort((a, b) => b.totalScore - a.totalScore);

             const medalColors = ['text-amber-500', 'text-slate-400', 'text-orange-600'];
             const medalLabels = ['🥇', '🥈', '🥉'];

             return (
               <div className="space-y-6">
                 {/* ランキングカード */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {workerStats.map((w, idx) => (
                     <div key={w.id} className={`bg-white rounded-xl shadow-sm border-2 p-5 ${idx === 0 ? 'border-amber-400 ring-2 ring-amber-100' : idx === 1 ? 'border-slate-300' : idx === 2 ? 'border-orange-300' : 'border-slate-200'}`}>
                       <div className="flex items-center gap-3 mb-4">
                         <div className="text-3xl">{idx < 3 ? medalLabels[idx] : `#${idx+1}`}</div>
                         <div className="flex-1">
                           <div className="font-black text-lg text-slate-800">{w.name}</div>
                           <div className="text-xs text-slate-500">{w.lotCount}ロット / {w.completedTasks}タスク完了</div>
                         </div>
                         <div className="text-right">
                           <div className={`text-3xl font-black ${idx === 0 ? 'text-amber-500' : 'text-blue-600'}`}>{w.totalScore}</div>
                           <div className="text-[10px] text-slate-400 font-bold">総合スコア</div>
                         </div>
                       </div>

                       {/* スコア内訳 */}
                       <div className="space-y-2 mb-4">
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-slate-500 w-20">作業速度</span>
                           <div className="flex-1 bg-slate-100 rounded-full h-3"><div className="h-full bg-blue-500 rounded-full" style={{width: `${(w.speedScore/40)*100}%`}}/></div>
                           <span className="text-xs font-mono font-bold w-8 text-right">{Math.round(w.speedScore)}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-slate-500 w-20">並行作業</span>
                           <div className="flex-1 bg-slate-100 rounded-full h-3"><div className="h-full bg-emerald-500 rounded-full" style={{width: `${(w.parallelBonus/30)*100}%`}}/></div>
                           <span className="text-xs font-mono font-bold w-8 text-right">{Math.round(w.parallelBonus)}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-slate-500 w-20">最速記録</span>
                           <div className="flex-1 bg-slate-100 rounded-full h-3"><div className="h-full bg-amber-500 rounded-full" style={{width: `${(w.championBonus/20)*100}%`}}/></div>
                           <span className="text-xs font-mono font-bold w-8 text-right">{Math.round(w.championBonus)}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-slate-500 w-20">品質発見</span>
                           <div className="flex-1 bg-slate-100 rounded-full h-3"><div className="h-full bg-rose-500 rounded-full" style={{width: `${(Math.max(0,w.qualityScore)/10)*100}%`}}/></div>
                           <span className="text-xs font-mono font-bold w-8 text-right">{Math.round(Math.max(0,w.qualityScore))}</span>
                         </div>
                       </div>

                       {/* 詳細データ */}
                       <div className="grid grid-cols-2 gap-2 text-xs">
                         <div className="bg-blue-50 p-2 rounded-lg">
                           <div className="text-blue-500 font-bold mb-0.5">平均作業時間</div>
                           <div className="font-black text-blue-700 text-lg">{formatTime(Math.round(w.avgTime))}</div>
                         </div>
                         <div className="bg-emerald-50 p-2 rounded-lg">
                           <div className="text-emerald-500 font-bold mb-0.5">並行作業率</div>
                           <div className="font-black text-emerald-700 text-lg">{w.parallelRate.toFixed(0)}%</div>
                           <div className="text-emerald-500">{w.parallelScore}/{w.parallelOpportunities}回</div>
                         </div>
                         <div className="bg-amber-50 p-2 rounded-lg">
                           <div className="text-amber-500 font-bold mb-0.5">チャンピオン</div>
                           <div className="font-black text-amber-700 text-lg">{w.championCount}回</div>
                           <div className="text-amber-500">最速{w.bestTimeCount}工程</div>
                         </div>
                         <div className="bg-rose-50 p-2 rounded-lg">
                           <div className="text-rose-500 font-bold mb-0.5">NG/修正</div>
                           <div className="font-black text-rose-700 text-lg">{w.ngCount}件</div>
                           <div className="text-rose-500">修正{formatTime(w.reworkTime)}</div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>

                 {workerStats.length === 0 && <div className="text-center py-20 text-slate-400">評価データがありません（完了済みロットが必要です）</div>}

                 {/* 評価基準の説明 */}
                 <div className="bg-slate-50 rounded-xl p-4 border">
                   <div className="text-sm font-bold text-slate-700 mb-2">評価基準</div>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-600">
                     <div><span className="font-bold text-blue-600">作業速度 (40点)</span><br/>1タスクあたりの平均所要時間が短いほど高得点</div>
                     <div><span className="font-bold text-emerald-600">並行作業 (30点)</span><br/>自動測定中に別の手動工程を進めた割合</div>
                     <div><span className="font-bold text-amber-600">最速記録 (20点)</span><br/>目標タイム達成回数 + 全作業者中の最速工程数</div>
                     <div><span className="font-bold text-rose-600">品質発見力 (10点)</span><br/>NG判定を多く見つけるほど高得点（品質意識が高い）</div>
                   </div>
                 </div>
               </div>
             );
           })()}
        </div>
     </div>
   );
 };

 const CompletedListView = ({ onBack, lots, workers, templates, mapZones, saveData, onEditLot, onDeleteLot }) => {
   const handleExportCSV = () => {
     // 詳細な工程別データ出力
     const headers = [
         'ロットID', 'ワークNo.', '型式', '指図番号', '数量', '状態', '場所', '作業者', '入庫日時', '作業開始日時', '完了日時',
         '工程名/イベント', '目標時間(秒)', '実績時間(秒)', '達成率(%)', '備考'
     ];
     
     let rows = [];
 
     const completedLots = lots.filter(l => l.location === 'completed' || l.status === 'completed');
     
     completedLots.forEach(lot => {
         const zoneName = mapZones?.find(z => z.id === lot.mapZoneId)?.name || lot.location;
         const workStartTimeStr = lot.workStartTime ? new Date(lot.workStartTime).toLocaleString() : '-';
 
         const baseRow = [
             lot.id, '', // Placeholder for Work No
             lot.model, lot.orderNo, lot.quantity, lot.status, zoneName,
             workers.find(w => w.id === lot.workerId)?.name || '未割当',
             lot.entryAt ? formatDateSafe(lot.entryAt) : '-',
             workStartTimeStr,
             formatDateSafe(lot.updatedAt)
         ];
 
         // 1. 各ワークごとの工程実績
         Array.from({ length: lot.quantity || 1 }).forEach((_, unitIdx) => {
             const workNo = unitIdx + 1;
             
             if (lot.steps && lot.steps.length > 0) {
                 lot.steps.forEach((step, idx) => {
                     let actualDuration = 0;
                     
                     // 実績時間の算出
                     if (lot.tasks) {
                         const taskKey = `${idx}-${unitIdx}`;
                         const task = lot.tasks[taskKey];
                         if (task && task.status === 'completed') {
                             actualDuration = task.duration;
                         }
                     } else if (lot.stepTimes && lot.stepTimes[step.id]) {
                         actualDuration = Math.floor((lot.stepTimes[step.id] / 1000) / (lot.quantity || 1));
                     }
 
                     const achievementRate = actualDuration > 0 ? Math.round((step.targetTime / actualDuration) * 100) : 0;
                     
                     rows.push([
                         lot.id,
                         `#${workNo}`, 
                         lot.model, lot.orderNo, lot.quantity, lot.status, zoneName,
                         workers.find(w => w.id === lot.workerId)?.name || '未割当',
                         lot.entryAt ? formatDateSafe(lot.entryAt) : '-',
                         workStartTimeStr,
                         formatDateSafe(lot.updatedAt),
                         step.title,
                         step.targetTime,
                         actualDuration,
                         achievementRate + '%',
                         actualDuration > step.targetTime ? '目標超過' : ''
                     ]);
                 });
             } else {
                  rows.push([lot.id, `#${workNo}`, ...baseRow.slice(2), '-', '-', '-', '-', '-']);
             }
         });
 
         // 2. 監視・不具合イベントの出力 (ワークNoは「全体」扱い)
         if (lot.interruptions && lot.interruptions.length > 0) {
             lot.interruptions.forEach(i => {
                 rows.push([
                     lot.id,
                     '全体', // Work No
                     lot.model, lot.orderNo, lot.quantity, lot.status, zoneName,
                     workers.find(w => w.id === lot.workerId)?.name || '未割当',
                     lot.entryAt ? formatDateSafe(lot.entryAt) : '-',
                     workStartTimeStr,
                     formatDateSafe(lot.updatedAt),
                     i.type === 'monitoring' ? `監視: ${i.label}` : `不具合対応: ${i.label}`,
                     '0', // 目標なし
                     i.duration,
                     '-',
                     i.type === 'monitoring' ? '監視作業' : '不具合対応'
                 ]);
             });
         }
     });
 
     const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
     const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `product_inspection_detailed_${new Date().toISOString().slice(0,10)}.csv`;
     link.click();
   };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('完了ロット一覧');
    const headers = [
        'ロットID', 'ワークNo.', '型式', '指図番号', '数量', '状態', '場所', '作業者', '入庫日時', '作業開始日時', '完了日時',
        '工程名/イベント', '目標時間(秒)', '実績時間(秒)', '達成率(%)', '備考'
    ];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.eachCell(cell => { cell.border = { bottom: { style: 'thin' } }; });
    const completedLots = lots.filter(l => l.location === 'completed' || l.status === 'completed');
    completedLots.forEach(lot => {
        const zoneName = mapZones?.find(z => z.id === lot.mapZoneId)?.name || lot.location;
        const workStartTimeStr = lot.workStartTime ? new Date(lot.workStartTime).toLocaleString() : '-';
        Array.from({ length: lot.quantity || 1 }).forEach((_, unitIdx) => {
            const workNo = unitIdx + 1;
            if (lot.steps && lot.steps.length > 0) {
                lot.steps.forEach((step, idx) => {
                    let actualDuration = 0;
                    if (lot.tasks) {
                        const taskKey = `${idx}-${unitIdx}`;
                        const task = lot.tasks[taskKey];
                        if (task && task.status === 'completed') actualDuration = task.duration;
                    } else if (lot.stepTimes && lot.stepTimes[step.id]) {
                        actualDuration = Math.floor((lot.stepTimes[step.id] / 1000) / (lot.quantity || 1));
                    }
                    const achievementRate = actualDuration > 0 ? Math.round((step.targetTime / actualDuration) * 100) : 0;
                    const row = ws.addRow([
                        lot.id, `#${workNo}`, lot.model, lot.orderNo, lot.quantity, lot.status, zoneName,
                        workers.find(w => w.id === lot.workerId)?.name || '未割当',
                        lot.entryAt ? formatDateSafe(lot.entryAt) : '-', workStartTimeStr, formatDateSafe(lot.updatedAt),
                        step.title, step.targetTime, actualDuration, achievementRate + '%',
                        actualDuration > step.targetTime ? '目標超過' : ''
                    ]);
                    if (actualDuration > step.targetTime) {
                      row.getCell(16).font = { color: { argb: 'FFEF4444' }, bold: true };
                    }
                });
            }
        });
        if (lot.interruptions && lot.interruptions.length > 0) {
            lot.interruptions.forEach(i => {
                ws.addRow([
                    lot.id, '全体', lot.model, lot.orderNo, lot.quantity, lot.status, zoneName,
                    workers.find(w => w.id === lot.workerId)?.name || '未割当',
                    lot.entryAt ? formatDateSafe(lot.entryAt) : '-', workStartTimeStr, formatDateSafe(lot.updatedAt),
                    i.type === 'monitoring' ? `監視: ${i.label}` : `不具合対応: ${i.label}`,
                    '0', i.duration, '-', i.type === 'monitoring' ? '監視作業' : '不具合対応'
                ]);
            });
        }
    });
    ws.columns.forEach(col => { col.width = 16; });
    ws.getColumn(1).width = 12;
    ws.getColumn(3).width = 20;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `product_inspection_report_${new Date().toISOString().slice(0,10)}.xlsx`;
    link.click();
  };

  const handleExportPDF = () => {
    const completedLots = lots.filter(l => l.location === 'completed' || l.status === 'completed');
    if (completedLots.length === 0) { alert('完了済みロットがありません'); return; }

    const printWindow = window.open('', '_blank');
    const rows = completedLots.map(lot => {
      const tpl = templates.find(t => t.id === lot.templateId);
      const steps = tpl?.steps || [];
      const worker = workers.find(w => w.id === lot.workerId);
      const totalTime = lot.totalWorkTime ? Math.round(lot.totalWorkTime / 1000) : 0;
      const formatSec = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

      const stepRows = steps.map((step, idx) => {
        let duration = 0;
        if (lot.stepTimes && lot.stepTimes[step.id]) {
          duration = Math.round(lot.stepTimes[step.id] / 1000);
        } else if (lot.tasks) {
          let total = 0, count = 0;
          Array.from({ length: lot.quantity || 1 }).forEach((_, uIdx) => {
            const task = lot.tasks[`${idx}-${uIdx}`];
            if (task && task.status === 'completed') { total += task.duration; count++; }
          });
          duration = count > 0 ? Math.round(total / count) : 0;
        }
        const target = step.targetTime || 0;
        const rate = target > 0 ? Math.round((target / Math.max(duration, 1)) * 100) : '-';
        return `<tr><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:11px">${idx+1}</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${step.title}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-size:11px">${target > 0 ? formatSec(target) : '-'}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-size:11px">${formatSec(duration)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-size:11px;${typeof rate === 'number' && rate < 80 ? 'color:red;font-weight:bold' : ''}">${typeof rate === 'number' ? rate + '%' : rate}</td></tr>`;
      }).join('');

      const defects = (lot.interruptions || []).filter(i => i.type === 'defect');
      const defectRows = defects.length > 0 ? defects.map(d => `<tr><td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${d.label || '-'}</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${d.causeProcess || '-'}</td><td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${d.stepInfo?.title || '-'}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-size:11px">${d.duration || 0}s</td></tr>`).join('') : '<tr><td colspan="4" style="padding:8px;text-align:center;color:#999;font-size:11px">なし</td></tr>';

      return `
        <div style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #ccc;border-radius:8px;padding:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <div><strong style="font-size:16px">${lot.workNumber || lot.id}</strong> <span style="color:#666">${lot.model || ''}</span></div>
            <div style="color:#666;font-size:12px">${lot.completedAt ? new Date(lot.completedAt).toLocaleString('ja-JP') : ''}</div>
          </div>
          <div style="display:flex;gap:24px;margin-bottom:12px;font-size:12px;color:#555">
            <div>型式: <strong>${lot.model || '-'}</strong></div>
            <div>台数: <strong>${lot.quantity || 1}</strong></div>
            <div>作業者: <strong>${worker?.name || '未割当'}</strong></div>
            <div>合計: <strong>${formatSec(totalTime)}</strong></div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
            <thead><tr style="background:#1e293b;color:white"><th style="padding:6px 8px;text-align:center;font-size:11px">No</th><th style="padding:6px 8px;text-align:left;font-size:11px">工程名</th><th style="padding:6px 8px;text-align:right;font-size:11px">目標</th><th style="padding:6px 8px;text-align:right;font-size:11px">実績</th><th style="padding:6px 8px;text-align:center;font-size:11px">達成率</th></tr></thead>
            <tbody>${stepRows}</tbody>
          </table>
          <div style="font-size:12px;font-weight:bold;margin-bottom:4px;color:#b91c1c">不具合・中断</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#fef2f2"><th style="padding:4px 8px;font-size:11px;text-align:left">内容</th><th style="padding:4px 8px;font-size:11px;text-align:left">原因工程</th><th style="padding:4px 8px;font-size:11px;text-align:left">発生工程</th><th style="padding:4px 8px;font-size:11px;text-align:right">時間</th></tr></thead>
            <tbody>${defectRows}</tbody>
          </table>
        </div>`;
    }).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>製品検査レポート</title><style>@media print{body{margin:0}}</style></head><body style="font-family:'Segoe UI',sans-serif;padding:24px;max-width:900px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:3px solid #1e293b;padding-bottom:12px">
        <h1 style="margin:0;font-size:20px;color:#1e293b">製品検査 完了レポート</h1>
        <div style="color:#666;font-size:12px">出力日: ${new Date().toLocaleDateString('ja-JP')} | 件数: ${completedLots.length}件</div>
      </div>
      ${rows}
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

   return (
     <div className="grid grid-cols-12 gap-6 h-full">
       <div className="col-span-12 flex flex-col h-full">
         <div className="mb-2 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-1"><ArrowRight className="w-4 h-4 rotate-180"/> 戻る</button>
                <h2 className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-6 h-6"/> 完了済みロット一覧 (全件表示)</h2>
             </div>
             <div className="flex gap-2">
               <button onClick={handleExportCSV} className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-sm text-sm"><Download className="w-4 h-4"/> CSV</button>
               <button onClick={handleExportExcel} className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm text-sm"><FileSpreadsheet className="w-4 h-4"/> Excel</button>
               <button onClick={handleExportPDF} className="bg-rose-600 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-rose-700 shadow-sm text-sm"><FileText className="w-4 h-4"/> PDF</button>
             </div>
         </div>
         <div className="flex-1 bg-emerald-50 rounded-xl border-2 border-emerald-200 shadow-xl overflow-hidden flex flex-col">
           <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
              {lots.filter(l => l.location === 'completed').map(lot => (
                <div key={lot.id}>
                  <LotCard lot={lot} workers={workers} templates={templates} mapZones={mapZones} onOpenExecution={()=>{}} saveData={saveData} setDraggedLotId={()=>{}} draggedLotId={null} onEdit={onEditLot} onDelete={onDeleteLot} minimal={false}/>
                </div>
              ))}
              {lots.filter(l => l.location === 'completed').length === 0 && <div className="col-span-full text-center py-10 text-slate-400">完了したロットはありません</div>}
           </div>
         </div>
       </div>
     </div>
   );
 };
 
 const TemplatesView = ({ editingTemplate, setEditingTemplate, handleSaveTemplate, workers, saveData, deleteData, templates, handleExcelImport, handleExcelDownload, handleBackupExport, handleBackupImport, excelInputRef, backupInputRef, settings, saveSettings, mapZones }) => {
  const [newProcessOpt, setNewProcessOpt] = useState('');
  const defectProcessOptions = settings?.defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS;
  const [localZones, setLocalZones] = useState(mapZones || INITIAL_MAP_ZONES);
  const [localBreakAlerts, setLocalBreakAlerts] = useState(settings?.breakAlerts || []);
  const [complaintOptionsText, setComplaintOptionsText] = useState((settings?.complaintOptions || DEFAULT_COMPLAINT_OPTIONS).join('\n'));
  const [localComboPresets, setLocalComboPresets] = useState(settings?.comboPresets || []);
  const [expandedPresetId, setExpandedPresetId] = useState(null);

  // Voice settings
  const [localVoiceSettings, setLocalVoiceSettings] = useState({
    voiceName: settings?.voiceSettings?.voiceName || '',
    rate: settings?.voiceSettings?.rate || 1.1,
    volume: settings?.voiceSettings?.volume ?? 1.0,
  });
  const [availableVoices, setAvailableVoices] = useState([]);
  const [localVoiceCommands, setLocalVoiceCommands] = useState(settings?.voiceCommands || DEFAULT_VOICE_COMMANDS);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
      setAvailableVoices(jaVoices);
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    if (settings?.voiceSettings) {
      setLocalVoiceSettings({
        voiceName: settings.voiceSettings.voiceName || '',
        rate: settings.voiceSettings.rate || 1.1,
        volume: settings.voiceSettings.volume ?? 1.0,
      });
    }
  }, [settings?.voiceSettings]);

  useEffect(() => { setLocalComboPresets(settings?.comboPresets || []); }, [settings?.comboPresets]);
  useEffect(() => { setLocalZones(mapZones || INITIAL_MAP_ZONES); }, [mapZones]);
  useEffect(() => { setLocalBreakAlerts(settings?.breakAlerts || []); }, [settings?.breakAlerts]);
  useEffect(() => { setComplaintOptionsText((settings?.complaintOptions || DEFAULT_COMPLAINT_OPTIONS).join('\n')); }, [settings?.complaintOptions]);
  useEffect(() => { setLocalVoiceCommands(settings?.voiceCommands || DEFAULT_VOICE_COMMANDS); }, [settings?.voiceCommands]);

  const handleAddZone = () => {
    const newZone = { id: `zone_${generateId()}`, name: '新しいエリア', x: 10, y: 10, w: 20, h: 30, color: ZONE_COLORS[0].class };
    setLocalZones([...localZones, newZone]);
  };
  const handleUpdateZone = (id, field, value) => { setLocalZones(localZones.map(z => z.id === id ? { ...z, [field]: value } : z)); };
  const handleDeleteZone = (id) => { if (confirm('このエリアを削除しますか？')) setLocalZones(localZones.filter(z => z.id !== id)); };
  const handleSaveZoneSettings = () => {
    const newComplaintOptions = complaintOptionsText.split('\n').map(s => s.trim()).filter(Boolean);
    saveSettings({ mapZones: localZones, breakAlerts: localBreakAlerts, complaintOptions: newComplaintOptions, comboPresets: localComboPresets, voiceSettings: localVoiceSettings, voiceCommands: localVoiceCommands });
    alert('設定を保存しました');
  };

  return (
   <div data-fs="settings" className="p-8 max-w-5xl mx-auto space-y-6 h-full flex flex-col overflow-y-auto">
     {editingTemplate ? (
       <TemplateEditor template={editingTemplate} onSave={handleSaveTemplate} onCancel={() => setEditingTemplate(null)} customLayouts={settings?.customLayouts || {}} onSaveLayouts={(layouts) => saveSettings({ customLayouts: layouts })} comboPresets={settings?.comboPresets || []} />
     ) : (
       <>
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> 作業者マスタ</h3>
           <div className="flex gap-2 mb-4">
             <input id="workerInput" className="border rounded px-3 py-2 text-sm flex-1" placeholder="新しい作業者名" />
             <button onClick={() => { const input = document.getElementById('workerInput'); if(input && input.value) { saveData('workers', generateId(), { name: input.value }); input.value = ''; } }} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold">追加</button>
           </div>
           <div className="flex flex-wrap gap-2">
             {workers.map(w => (<div key={w.id} className="bg-slate-50 border px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">{w.name}<button onClick={() => deleteData('workers', w.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button></div>))}
           </div>
         </div>
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardList className="w-5 h-5" /> 工程テンプレート管理</h3>
             <div className="flex gap-2">
               <label className="text-xs flex items-center gap-1 cursor-pointer bg-green-50 text-green-700 px-3 py-2 rounded border border-green-200 hover:bg-green-100"><FileUp className="w-4 h-4"/> Excel取込<input type="file" ref={excelInputRef} accept=".xlsx" onChange={handleExcelImport} className="hidden"/></label>
               <button onClick={handleBackupExport} className="text-xs flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-2 rounded border hover:bg-slate-200"><DownloadCloud className="w-4 h-4"/> バックアップ</button>
               <label className="text-xs flex items-center gap-1 cursor-pointer bg-slate-100 text-slate-600 px-3 py-2 rounded border hover:bg-slate-200"><RefreshCw className="w-4 h-4"/> 復元<input type="file" ref={backupInputRef} accept=".json" onChange={handleBackupImport} className="hidden"/></label>
             </div>
           </div>
           <button onClick={() => setEditingTemplate({ id: '', name: '', steps: [] })} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 font-bold mb-4">+ 新規テンプレート作成</button>
           <div className="flex-1 overflow-y-auto space-y-3">
             {templates.map(t => (
               <div key={t.id} className="border rounded-lg p-4 flex justify-between items-center group hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setEditingTemplate(t)}>
                 <div><div className="font-bold text-slate-800 group-hover:text-blue-600">{t.name}</div><div className="text-xs text-slate-500 mt-1">全 {t.steps?.length || 0} 工程</div></div>
                 <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); handleExcelDownload(t); }} className="p-2 text-slate-400 hover:text-emerald-600 bg-slate-50 rounded" title="Excel出力"><FileSpreadsheet className="w-4 h-4"/></button><button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ ...t, id: '', name: t.name + ' (コピー)', steps: t.steps?.map(s => ({...s, id: generateId()})) || [] }); }} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded" title="複製"><Copy className="w-4 h-4"/></button><button onClick={(e) => { e.stopPropagation(); setEditingTemplate(t); }} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded" title="編集"><Pencil className="w-4 h-4"/></button><button onClick={(e) => { e.stopPropagation(); deleteData('templates', t.id); }} className="p-2 text-slate-400 hover:text-rose-600 bg-slate-50 rounded" title="削除"><Trash2 className="w-4 h-4" /></button></div>
               </div>
             ))}
           </div>
         </div>

         {/* 間接作業ジャンルマスタ */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Coffee className="w-5 h-5 text-amber-500" /> 間接作業ジャンルマスタ</h3>
           <div className="flex gap-2 mb-4">
             <input id="indirectCatInput" className="border rounded px-3 py-2 text-sm flex-1" placeholder="新しいジャンル名（例: 朝礼）"/>
             <button onClick={() => {
               const input = document.getElementById('indirectCatInput');
               if (input?.value?.trim()) {
                 const cats = [...(settings.indirectCategories || DEFAULT_INDIRECT_CATEGORIES), input.value.trim()];
                 saveSettings({ indirectCategories: cats });
                 input.value = '';
               }
             }} className="bg-amber-600 text-white px-4 py-2 rounded text-sm font-bold">追加</button>
           </div>
           <div className="flex flex-wrap gap-2">
             {(settings.indirectCategories || DEFAULT_INDIRECT_CATEGORIES).map((cat, i) => (
               <div key={i} className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-bold text-amber-800">
                 {cat}
                 <button onClick={() => {
                   const cats = (settings.indirectCategories || DEFAULT_INDIRECT_CATEGORIES).filter((_, j) => j !== i);
                   saveSettings({ indirectCategories: cats });
                 }} className="text-amber-400 hover:text-rose-500"><Trash2 className="w-3 h-3"/></button>
               </div>
             ))}
           </div>
         </div>

         {/* 不具合原因工程マスタ */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500" /> 不具合原因工程マスタ</h3>
           <div className="flex gap-2 mb-4">
             <input
               value={newProcessOpt}
               onChange={e => setNewProcessOpt(e.target.value)}
               className="border rounded px-3 py-2 text-sm flex-1"
               placeholder="新しい原因工程名"
             />
             <button onClick={() => {
               if (newProcessOpt.trim()) {
                 const updated = [...defectProcessOptions, newProcessOpt.trim()];
                 saveSettings({ defectProcessOptions: updated });
                 setNewProcessOpt('');
               }
             }} className="bg-slate-800 text-white px-4 py-2 rounded text-sm font-bold">追加</button>
           </div>
           <div className="flex flex-wrap gap-2">
             {defectProcessOptions.map((opt, idx) => (
               <div key={idx} className="bg-slate-50 border px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">
                 {opt}
                 <button onClick={() => {
                   const updated = defectProcessOptions.filter((_, i) => i !== idx);
                   saveSettings({ defectProcessOptions: updated });
                 }} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
               </div>
             ))}
           </div>
         </div>

         {/* 気づき・不満の報告オプション */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Megaphone className="w-5 h-5 text-purple-500" /> 気づき・不満の報告オプション</h3>
           <p className="text-xs text-slate-500 mb-3">作業中に気づきや改善提案を報告する際のカテゴリを設定します。(1行1項目)</p>
           <textarea
             value={complaintOptionsText}
             onChange={e => setComplaintOptionsText(e.target.value)}
             className="w-full border rounded p-3 text-sm h-32"
             placeholder="作業しづらい&#10;工具が不足&#10;手順が不明確"
           />
         </div>

         {/* コンボボックスプリセット管理 */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><List className="w-5 h-5 text-amber-500" /> コンボボックスプリセット管理</h3>
           <p className="text-xs text-slate-500 mb-3">測定入力のコンボボックスで使用するプリセット値リストを管理します。テンプレートの測定設定で選択できます。</p>
           <button onClick={() => {
             const newPreset = { id: `cp_${generateId()}`, name: '新規プリセット', values: [] };
             setLocalComboPresets([...localComboPresets, newPreset]);
             setExpandedPresetId(newPreset.id);
           }} className="w-full py-2 border-2 border-dashed border-amber-300 rounded-lg text-amber-600 hover:border-amber-500 font-bold mb-4 flex items-center justify-center gap-2 text-sm"><Plus className="w-4 h-4"/> 新規プリセット追加</button>
           <div className="space-y-3">
             {localComboPresets.map((preset, pIdx) => (
               <div key={preset.id} className="border rounded-lg overflow-hidden">
                 <div className="flex items-center gap-2 p-3 bg-slate-50 cursor-pointer hover:bg-slate-100" onClick={() => setExpandedPresetId(expandedPresetId === preset.id ? null : preset.id)}>
                   <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedPresetId === preset.id ? 'rotate-90' : ''}`}/>
                   <input value={preset.name} onClick={e => e.stopPropagation()} onChange={e => { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], name: e.target.value }; setLocalComboPresets(np); }} className="flex-1 bg-transparent font-bold text-sm border-none outline-none focus:bg-white focus:border focus:rounded focus:px-2" placeholder="プリセット名"/>
                   <span className="text-[10px] text-slate-400">{preset.values?.length || 0}件</span>
                   <button onClick={(e) => { e.stopPropagation(); if (confirm('このプリセットを削除しますか？')) setLocalComboPresets(localComboPresets.filter(p => p.id !== preset.id)); }} className="text-slate-400 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4"/></button>
                 </div>
                 {expandedPresetId === preset.id && (
                   <div className="p-3 space-y-2 border-t">
                     <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                       {(preset.values || []).map((val, vi) => (
                         <span key={vi} className="inline-flex items-center bg-amber-50 border border-amber-200 text-xs px-2 py-0.5 rounded gap-1">
                           {val}
                           <button onClick={() => { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], values: np[pIdx].values.filter((_, i) => i !== vi) }; setLocalComboPresets(np); }} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                         </span>
                       ))}
                     </div>
                     <div className="flex gap-2">
                       <input id={`combo-preset-add-${preset.id}`} className="flex-1 border rounded px-2 py-1.5 text-sm" placeholder="値を追加..." onKeyDown={e => { if (e.key === 'Enter') { const el = e.target; if (el.value.trim()) { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], values: [...(np[pIdx].values || []), el.value.trim()] }; setLocalComboPresets(np); el.value = ''; } } }}/>
                       <button onClick={() => { const el = document.getElementById(`combo-preset-add-${preset.id}`); if (el && el.value.trim()) { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], values: [...(np[pIdx].values || []), el.value.trim()] }; setLocalComboPresets(np); el.value = ''; } }} className="bg-amber-500 text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-amber-600">追加</button>
                     </div>
                     <div className="flex gap-2 pt-1 border-t">
                       <button onClick={() => { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], values: BLOCK_GAUGE_PRESETS.map(String) }; setLocalComboPresets(np); }} className="text-[10px] bg-teal-100 text-teal-700 px-2 py-1 rounded font-bold hover:bg-teal-200">ブロックゲージ規格を設定</button>
                       <button onClick={() => { const np = [...localComboPresets]; np[pIdx] = { ...np[pIdx], values: [] }; setLocalComboPresets(np); }} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold hover:bg-slate-200">全てクリア</button>
                     </div>
                   </div>
                 )}
               </div>
             ))}
           </div>
         </div>

         {/* 休憩・終了アラート設定 */}
         <BreakAlertSettings alerts={localBreakAlerts} onChange={setLocalBreakAlerts} />

         {/* 操作取り消し設定 */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-lg font-bold mb-4">操作取り消し設定</h3>
           <div className="flex items-center gap-3">
             <label className="text-sm font-bold text-slate-700">取り消し猶予時間</label>
             <input type="number" min="1" max="30" value={settings.undoTimeout || 5} onChange={e => saveSettings({ undoTimeout: parseInt(e.target.value) || 5 })} className="w-20 border rounded p-2 text-center" />
             <span className="text-sm text-slate-500">秒</span>
           </div>
           <p className="text-xs text-slate-400 mt-2">ボタン押し間違い時に、この秒数以内であれば取り消しが可能です</p>
         </div>

         {/* 文字サイズ設定 */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Type className="w-5 h-5 text-blue-600" /> 文字サイズ設定</h3>
           <p className="text-xs text-slate-400 mb-4">各エリアの文字サイズを調整できます（100%が標準）</p>
           <div className="space-y-4">
             {FONT_SIZE_AREAS.map(area => {
               const currentVal = (settings.fontSizes || {})[area.key] || area.default;
               return (
                 <div key={area.key} className="flex items-center gap-4">
                   <div className="w-40 shrink-0">
                     <div className="text-sm font-bold text-slate-700">{area.label}</div>
                     <div className="text-[10px] text-slate-400">{area.desc}</div>
                   </div>
                   <input
                     type="range"
                     min={area.min} max={area.max} step={5}
                     value={currentVal}
                     onChange={e => {
                       const newFontSizes = { ...(settings.fontSizes || {}), [area.key]: parseInt(e.target.value) };
                       saveSettings({ fontSizes: newFontSizes });
                     }}
                     className="flex-1 h-2 accent-blue-600"
                   />
                   <div className="w-16 flex items-center gap-1">
                     <input
                       type="number" min={area.min} max={area.max} step={5}
                       value={currentVal}
                       onChange={e => {
                         const v = Math.min(area.max, Math.max(area.min, parseInt(e.target.value) || area.default));
                         const newFontSizes = { ...(settings.fontSizes || {}), [area.key]: v };
                         saveSettings({ fontSizes: newFontSizes });
                       }}
                       className="w-14 border rounded p-1 text-center text-sm"
                     />
                     <span className="text-xs text-slate-400">%</span>
                   </div>
                   {currentVal !== 100 && (
                     <button
                       onClick={() => {
                         const newFontSizes = { ...(settings.fontSizes || {}), [area.key]: 100 };
                         saveSettings({ fontSizes: newFontSizes });
                       }}
                       className="text-xs text-slate-400 hover:text-blue-600 px-1"
                       title="リセット"
                     >
                       <Undo2 className="w-3.5 h-3.5" />
                     </button>
                   )}
                 </div>
               );
             })}
           </div>
           <div className="mt-4 pt-3 border-t flex justify-end">
             <button
               onClick={() => {
                 const reset = {};
                 FONT_SIZE_AREAS.forEach(a => { reset[a.key] = 100; });
                 saveSettings({ fontSizes: reset });
               }}
               className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-bold flex items-center gap-1"
             >
               <Undo2 className="w-3 h-3" /> 全てリセット
             </button>
           </div>
         </div>

         {/* 作業エリア設定 */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <div className="flex justify-between items-center mb-6">
             <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800"><MapIcon className="w-6 h-6 text-blue-600" /> 作業エリア設定</h3>
           </div>
           <div className="mb-6 flex gap-2">
             <button onClick={handleAddZone} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-emerald-700 flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> 新しいエリアを追加</button>
           </div>
           <div className="space-y-3">
             {localZones.map((zone, idx) => (
               <div key={zone.id} className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50 hover:bg-white transition-colors">
                 <div className="flex flex-col gap-1 items-center w-10 shrink-0">
                   <button disabled={idx === 0} onClick={() => { const nz = [...localZones]; [nz[idx - 1], nz[idx]] = [nz[idx], nz[idx - 1]]; setLocalZones(nz); }} className="text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                   <button disabled={idx === localZones.length - 1} onClick={() => { const nz = [...localZones]; [nz[idx + 1], nz[idx]] = [nz[idx], nz[idx + 1]]; setLocalZones(nz); }} className="text-slate-400 hover:text-blue-600 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                 </div>
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                   <div>
                     <label className="text-xs font-bold text-slate-500 block mb-1">エリア名</label>
                     <input value={zone.name} onChange={(e) => handleUpdateZone(zone.id, 'name', e.target.value)} className="w-full border rounded p-2 text-sm font-bold" />
                   </div>
                   <div className="flex gap-2">
                     <div className="flex-1">
                       <label className="text-xs font-bold text-slate-500 block mb-1">幅(%)</label>
                       <input type="number" value={Math.round(zone.w)} onChange={(e) => handleUpdateZone(zone.id, 'w', Number(e.target.value))} className="w-full border rounded p-2 text-sm text-right" />
                     </div>
                     <div className="flex-1">
                       <label className="text-xs font-bold text-slate-500 block mb-1">高さ(%)</label>
                       <input type="number" value={Math.round(zone.h)} onChange={(e) => handleUpdateZone(zone.id, 'h', Number(e.target.value))} className="w-full border rounded p-2 text-sm text-right" />
                     </div>
                   </div>
                   <div>
                     <label className="text-xs font-bold text-slate-500 block mb-1">カラーテーマ</label>
                     <div className="flex gap-1">
                       {ZONE_COLORS.map(c => (
                         <button key={c.name} onClick={() => handleUpdateZone(zone.id, 'color', c.class)} className={`w-6 h-6 rounded-full border-2 ${c.class.split(' ')[0]} ${zone.color === c.class ? 'ring-2 ring-slate-800 border-white' : 'border-transparent'}`} title={c.name} />
                       ))}
                     </div>
                   </div>
                 </div>
                 <button onClick={() => handleDeleteZone(zone.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-5 h-5" /></button>
               </div>
             ))}
           </div>
         </div>

         {/* 音声アシスタント設定 */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Mic className="w-5 h-5 text-blue-500" /> 音声アシスタント設定</h3>
           <div className="space-y-4">
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">音声の選択 (日本語)</label>
               <select
                 value={localVoiceSettings.voiceName}
                 onChange={e => setLocalVoiceSettings(prev => ({ ...prev, voiceName: e.target.value }))}
                 className="w-full border rounded p-2 text-sm"
               >
                 <option value="">自動選択 (デフォルト)</option>
                 {availableVoices.map(v => (
                   <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                 ))}
               </select>
               {availableVoices.length === 0 && (
                 <p className="text-xs text-slate-400 mt-1">日本語の音声が見つかりません。ブラウザの音声設定を確認してください。</p>
               )}
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">読み上げ速度: {localVoiceSettings.rate.toFixed(1)}</label>
               <input
                 type="range"
                 min="0.5"
                 max="2.0"
                 step="0.1"
                 value={localVoiceSettings.rate}
                 onChange={e => setLocalVoiceSettings(prev => ({ ...prev, rate: parseFloat(e.target.value) }))}
                 className="w-full"
               />
               <div className="flex justify-between text-[10px] text-slate-400"><span>遅い (0.5)</span><span>標準 (1.1)</span><span>速い (2.0)</span></div>
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-500 mb-1">音量: {Math.round(localVoiceSettings.volume * 100)}%</label>
               <input
                 type="range"
                 min="0"
                 max="1"
                 step="0.05"
                 value={localVoiceSettings.volume}
                 onChange={e => setLocalVoiceSettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }))}
                 className="w-full"
               />
               <div className="flex justify-between text-[10px] text-slate-400"><span>無音 (0)</span><span>最大 (100%)</span></div>
             </div>
             <button
               onClick={() => {
                 speak('これはテスト音声です。音量と速度を確認してください。', null, {
                   rate: localVoiceSettings.rate,
                   volume: localVoiceSettings.volume,
                   voiceName: localVoiceSettings.voiceName,
                 });
               }}
               className="w-full py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-100 text-sm"
             >
               <Play className="w-4 h-4" /> テスト再生
             </button>

             {/* 音声コマンドマッピング */}
             <div className="mt-6 pt-4 border-t border-slate-200">
               <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-slate-500"/> 音声コマンド設定</h4>
               <p className="text-xs text-slate-400 mb-3">各機能に対応する言葉をカンマ区切りで登録してください。認識しやすい言葉を追加できます。</p>
               <div className="space-y-3">
                 {localVoiceCommands.map((cmd, idx) => (
                   <div key={cmd.id} className="bg-slate-50 rounded-lg p-3">
                     <div className="flex items-center gap-2 mb-1">
                       <span className="font-bold text-sm text-slate-700">{cmd.label}</span>
                       <span className="text-[10px] text-slate-400">— {cmd.description}</span>
                     </div>
                     <input
                       value={cmd.keywords}
                       onChange={e => {
                         const updated = [...localVoiceCommands];
                         updated[idx] = { ...cmd, keywords: e.target.value };
                         setLocalVoiceCommands(updated);
                       }}
                       className="w-full border rounded p-2 text-sm font-mono"
                       placeholder="カンマ区切りで単語を入力..."
                     />
                   </div>
                 ))}
               </div>
               <button
                 onClick={() => { setLocalVoiceCommands(DEFAULT_VOICE_COMMANDS); }}
                 className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline"
               >
                 デフォルトに戻す
               </button>
             </div>
           </div>
         </div>

         {/* 全設定保存ボタン */}
         <div className="flex justify-end">
           <button onClick={handleSaveZoneSettings} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2"><Save className="w-5 h-5" /> 全設定を保存する</button>
         </div>
       </>
     )}
   </div>
 );
};

// --- Completed History View ---
const InspectionListView = ({ lots, workers, templates, settings, onEditLot, onDeleteLot, setExecutionLotId }) => {
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('entry_asc');

  const mapZones = settings?.mapZones || INITIAL_MAP_ZONES;

  const activeLots = useMemo(() => {
    return lots.filter(l => l.status !== 'completed' && l.location !== 'completed');
  }, [lots]);

  const filteredLots = useMemo(() => {
    let result = activeLots;
    if (selectedZoneFilter !== 'all') {
      result = result.filter(l => l.mapZoneId === selectedZoneFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.orderNo && l.orderNo.toLowerCase().includes(q)) ||
        (l.model && l.model.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeLots, selectedZoneFilter, searchQuery]);

  const sortedLots = useMemo(() => {
    return [...filteredLots].sort((a, b) => {
      if (sortOrder === 'entry_asc') return (a.entryAt || 0) - (b.entryAt || 0);
      if (sortOrder === 'entry_desc') return (b.entryAt || 0) - (a.entryAt || 0);
      if (sortOrder === 'due_asc') {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      return 0;
    });
  }, [filteredLots, sortOrder]);

  return (
    <div data-fs="tables" className="flex flex-col h-full gap-4">
      <div className="flex flex-wrap justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-slate-200 shrink-0 gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <MapPin className="w-4 h-4" /> エリア:
            <select value={selectedZoneFilter} onChange={(e) => setSelectedZoneFilter(e.target.value)} className="border rounded px-2 py-1 bg-slate-50 text-slate-800 max-w-[10rem] md:max-w-[12rem] truncate">
              <option value="all">すべて</option>
              {mapZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <ArrowUpDown className="w-4 h-4" /> 並び替え:
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="border rounded px-2 py-1 bg-slate-50 text-slate-800">
              <option value="entry_asc">入荷日時 (早い順)</option>
              <option value="entry_desc">入荷日時 (遅い順)</option>
              <option value="due_asc">納期 (近い順)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border shadow-sm ml-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="指図・型式で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm outline-none w-32 md:w-48 font-bold text-slate-700"
            />
          </div>
        </div>
        <div className="flex bg-slate-100 rounded p-1">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="グリッド表示"><LayoutGrid className="w-5 h-5" /></button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="リスト表示"><List className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {sortedLots.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Package className="w-16 h-16 mb-4 opacity-20" />
            <p>検査待ちの製品はありません</p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start pb-10">
              {sortedLots.map(lot => {
                const isPaused = Object.values(lot.tasks || {}).some(t => t.status === 'paused');
                const zoneName = mapZones.find(z => z.id === lot.mapZoneId)?.name || '';
                const workerName = workers.find(w => w.id === lot.workerId)?.name || '';
                return (
                  <div key={lot.id} onClick={() => setExecutionLotId(lot.id)} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer group relative">
                    <div className="absolute top-1 right-1 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); onEditLot(lot); }} className="p-1 bg-white rounded border hover:bg-blue-50 text-slate-500"><Pencil className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); onDeleteLot(lot.id); }} className="p-1 bg-white rounded border hover:bg-red-50 text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs text-slate-500 font-bold">指図: {lot.orderNo}</div>
                        <div className="text-lg font-black text-slate-800">{lot.model}</div>
                      </div>
                      <span className="text-xs font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{lot.quantity}台</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {lot.entryAt && <span>入庫: {toDateShort(lot.entryAt)}</span>}
                      {lot.dueDate && <span className="ml-2 text-blue-600 font-bold">納期: {lot.dueDate}</span>}
                    </div>
                    {(zoneName || workerName) && (
                      <div className="flex gap-2 text-[10px] items-center">
                        {zoneName && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><MapPin className="w-3 h-3" />{zoneName}</span>}
                        {workerName && <WorkerBadge id={lot.workerId} workers={workers} />}
                      </div>
                    )}
                    <div className="mt-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${lot.status === 'processing' ? (isPaused ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700') : 'bg-slate-100 text-slate-500'}`}>
                        {lot.status === 'processing' ? (isPaused ? '一時停止' : '作業中') : '待機'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="p-3 font-bold border-b">指図番号</th>
                    <th className="p-3 font-bold border-b">型式</th>
                    <th className="p-3 font-bold border-b text-center">台数</th>
                    <th className="p-3 font-bold border-b">入荷日時</th>
                    <th className="p-3 font-bold border-b">納期</th>
                    <th className="p-3 font-bold border-b">場所/担当</th>
                    <th className="p-3 font-bold border-b text-center">状態</th>
                    <th className="p-3 font-bold border-b text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {sortedLots.map(lot => {
                    const isPaused = Object.values(lot.tasks || {}).some(t => t.status === 'paused');
                    return (
                      <tr key={lot.id} onClick={() => setExecutionLotId(lot.id)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="p-3 font-bold text-slate-800">{lot.orderNo}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-700">{lot.model}</div>
                        </td>
                        <td className="p-3 text-center">{lot.quantity}</td>
                        <td className="p-3 text-slate-500 text-xs">{lot.entryAt ? `${toDateShort(lot.entryAt)} ${new Date(lot.entryAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : '-'}</td>
                        <td className="p-3 text-xs font-bold text-blue-600">{lot.dueDate || '-'}</td>
                        <td className="p-3 text-xs text-slate-500">{mapZones.find(z => z.id === lot.mapZoneId)?.name || '-'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${lot.status === 'processing' ? (isPaused ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700') : 'bg-slate-100 text-slate-500'}`}>
                            {lot.status === 'processing' ? (isPaused ? '一時停止' : '作業中') : '待機'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onEditLot(lot)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => onDeleteLot(lot.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};


// --- EditTimeModal: 作業時間の編集 ---
const EditTimeModal = ({ lot, onClose, onSave }) => {
  const [localTasks, setLocalTasks] = useState(() => JSON.parse(JSON.stringify(lot.tasks || {})));
  const handleDurationChange = (key, value) => {
    const val = parseInt(value, 10);
    if (!isNaN(val) && val >= 0) setLocalTasks(prev => ({ ...prev, [key]: { ...prev[key], duration: val } }));
  };
  const handleSave = () => { onSave({ tasks: localTasks }); onClose(); };
  const taskKeys = Object.keys(localTasks).filter(k => localTasks[k].status === 'completed' || localTasks[k].status === 'skipped');
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b bg-slate-50 font-bold flex justify-between items-center">
          <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600" /> 作業時間の編集: {lot.orderNo}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-sm text-slate-500 mb-2">各項目の作業時間（秒）を修正できます。</div>
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="bg-slate-100 border-b"><th className="p-2 font-bold">項目</th><th className="p-2 font-bold">ユニット</th><th className="p-2 font-bold w-32 text-right">時間(秒)</th></tr></thead>
            <tbody>
              {taskKeys.map(key => {
                const parts = key.split('-');
                const unitIdxStr = parts.pop();
                const stepIdOrIdx = parts.join('-');
                const step = (lot.steps || []).find(s => s.id === stepIdOrIdx) || (lot.steps || [])[parseInt(stepIdOrIdx)];
                const title = step ? step.title : '不明な項目';
                const isSkipped = localTasks[key].status === 'skipped';
                return (
                  <tr key={key} className="border-b">
                    <td className="p-2 truncate max-w-[200px]" title={title}>{title}</td>
                    <td className="p-2 font-mono text-slate-600">#{parseInt(unitIdxStr) + 1}</td>
                    <td className="p-2 text-right">
                      {isSkipped ? <span className="text-slate-400 text-xs">該当なし</span> : (
                        <input type="number" value={localTasks[key].duration || 0} onChange={(e) => handleDurationChange(key, e.target.value)} className="w-20 border rounded p-1 text-right font-mono focus:ring-2 focus:ring-blue-500 outline-none" min="0" />
                      )}
                    </td>
                  </tr>
                );
              })}
              {taskKeys.length === 0 && <tr><td colSpan="3" className="p-4 text-center text-slate-500">編集可能なタスクがありません</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold border rounded hover:bg-white">キャンセル</button>
          <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">保存して更新</button>
        </div>
      </div>
    </div>
  );
};

// --- EditMeasurementModal: 測定結果の編集 ---
const EditMeasurementModal = ({ lot, onClose, onSave }) => {
  const [localMR, setLocalMR] = useState(() => JSON.parse(JSON.stringify(lot.measurementResults || {})));
  const steps = lot.steps || [];
  const measSteps = steps.filter(s => s.type === 'measurement' && s.measurementConfig);

  const updateValue = (stepId, unitIdx, inputId, rawVal) => {
    const key = `${stepId}-${unitIdx}`;
    const valuesKey = `${key}-values`;
    const newMR = { ...localMR };
    const prevValues = newMR[valuesKey] || newMR[key]?.values || {};
    const newValues = { ...prevValues, [inputId]: rawVal === '' ? null : parseFloat(rawVal) };
    newMR[valuesKey] = newValues;

    // 再計算
    const step = measSteps.find(s => s.id === stepId);
    if (step) {
      const calcResults = calculateMeasurementResults(newValues, step.measurementConfig);
      newMR[key] = { values: newValues, calcResults, timestamp: Date.now() };
    }
    setLocalMR(newMR);
  };

  const handleSave = () => {
    onSave({ measurementResults: localMR });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b bg-slate-50 font-bold flex justify-between items-center">
          <div className="flex items-center gap-2"><Ruler className="w-5 h-5 text-emerald-600" /> 測定結果の編集: {lot.orderNo}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {measSteps.length === 0 ? (
            <div className="text-center text-slate-400 py-10">この作業には測定項目がありません</div>
          ) : measSteps.map(step => {
            const config = step.measurementConfig;
            const inputs = config.inputs || [];
            const calcs = config.calculations || [{ id: 'default', label: '計算結果', method: config.calculation, toleranceUpper: config.toleranceUpper, toleranceLower: config.toleranceLower, unit: config.unit }];

            return (
              <div key={step.id} className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 font-bold text-sm border-b">{step.title}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 text-left border-b font-bold w-32">入力項目</th>
                        {Array.from({ length: lot.quantity || 1 }).map((_, i) => (
                          <th key={i} className="p-2 text-center border-b font-bold">
                            #{i+1} {lot.unitSerialNumbers?.[i] ? <span className="font-normal text-slate-400">({lot.unitSerialNumbers[i]})</span> : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.map(inp => (
                        <tr key={inp.id} className="border-b">
                          <td className="p-2 font-bold text-slate-700">{inp.label}</td>
                          {Array.from({ length: lot.quantity || 1 }).map((_, i) => {
                            const key = `${step.id}-${i}`;
                            const meas = localMR[key] || localMR[step.id];
                            const val = meas?.values?.[inp.id] ?? localMR[`${key}-values`]?.[inp.id] ?? '';
                            return (
                              <td key={i} className="p-1 text-center">
                                <input
                                  type="number" step="any"
                                  value={val === null ? '' : val}
                                  onChange={e => updateValue(step.id, i, inp.id, e.target.value)}
                                  className="w-20 border rounded p-1 text-center font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* 計算結果表示 */}
                      {calcs.map(calc => (
                        <tr key={calc.id} className="bg-yellow-50 border-b">
                          <td className="p-2 font-bold text-blue-800">
                            {calc.label || '計算結果'}
                            {calc.toleranceLower != null && calc.toleranceUpper != null && (
                              <div className="text-[10px] font-normal text-slate-500">{calc.toleranceLower}~{calc.toleranceUpper} {calc.unit || ''}</div>
                            )}
                          </td>
                          {Array.from({ length: lot.quantity || 1 }).map((_, i) => {
                            const key = `${step.id}-${i}`;
                            const meas = localMR[key];
                            const cr = meas?.calcResults?.find(c => c.id === calc.id) || meas?.calcResults?.[0];
                            return (
                              <td key={i} className="p-2 text-center font-mono font-bold">
                                {cr && cr.result != null ? (
                                  <span className={cr.isOk ? 'text-green-700' : 'text-red-600'}>
                                    {cr.result.toFixed(3)} <span className="text-[10px]">{cr.isOk ? 'OK' : 'NG'}</span>
                                  </span>
                                ) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold border rounded hover:bg-white">キャンセル</button>
          <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded shadow hover:bg-emerald-700">保存して更新</button>
        </div>
      </div>
    </div>
  );
};

// --- ReportPreview: フルスクリーン成績表プレビュー (最終検査アプリ方式) ---
const ReportPreview = ({ lot, workers, onClose }) => {
  const [customReportNo, setCustomReportNo] = useState(lot.orderNo || '');
  const [reportMode, setReportMode] = useState('table'); // 'table' or 'visual'
  const toMs = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (val.seconds) return val.seconds * 1000 + (val.nanoseconds || 0) / 1e6;
    if (val.toMillis) return val.toMillis();
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  };
  const worker = workers.find(w => w.id === lot.workerId)?.name || '未割当';
  const steps = lot.steps || [];
  const displayQuantity = Math.max(10, lot.quantity || 1);
  const formatSec = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const toDateTimeJp = (ts) => { const m = toMs(ts); if (!m) return '-'; const d = new Date(m); return isNaN(d.getTime()) ? '-' : d.toLocaleString('ja-JP'); };

  const defects = useMemo(() => {
    if (!lot.interruptions || lot.interruptions.length === 0) return null;
    return lot.interruptions.filter(i => i.type === 'defect').map(i => {
      let line = `・${i.label} (担当: ${i.workerName || '-'})`;
      if (i.causeProcess) line += ` [原因: ${i.causeProcess}]`;
      return line;
    }).join('\n');
  }, [lot]);

  const stepsByCategory = useMemo(() => {
    const groups = {};
    steps.forEach(step => {
      const cat = step.category || '工程';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(step);
    });
    return groups;
  }, [steps]);

  // 測定結果をユニット別に取得するヘルパー
  const getMeasForUnit = (stepId, unitIdx) => {
    const mr = lot.measurementResults;
    if (!mr) return null;
    return mr[`${stepId}-${unitIdx}`] || mr[stepId] || null;
  };

  const measSteps = useMemo(() => {
    return steps.filter(s => s.type === 'measurement' && s.measurementConfig);
  }, [steps]);

  const PRINT_STYLES = `
    .print-pages { width: 210mm; margin: 0 auto; background: white; }
    .print-page { position: relative; width: 210mm; min-height: 297mm; padding: 15mm 5mm 15mm 5mm; margin-bottom: 20px; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); overflow: hidden; color: #000; }
    .print-page-no { position: absolute; right: 5mm; top: 5mm; font-size: 10px; font-family: monospace; }
    .print-report-no { position: absolute; right: 5mm; bottom: 5mm; font-size: 10px; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { margin: 0; padding: 0; background: white; }
      .print-pages { margin: 0 auto; width: 100%; max-width: 210mm; }
      .print-page { box-shadow: none; margin-bottom: 0; page-break-after: always; }
      .print-page:last-child { page-break-after: auto; }
      .no-print { display: none !important; }
    }
  `;

  const handlePrint = () => {
    const pw = window.open('', '_blank');
    if (!pw) { alert("ポップアップがブロックされました。"); return; }
    const content = document.getElementById('report-preview-content');
    if (!content) { pw.close(); return; }
    const title = `${lot.orderNo || '不明'}_${lot.model || '不明'}`;
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><script src="https://cdn.tailwindcss.com"><\/script><style>${PRINT_STYLES} body { font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .border, .border-b, .border-t, .border-l, .border-r { border-color: black !important; }</style></head><body>${content.outerHTML}<script>window.onload = () => { setTimeout(() => { window.print(); }, 500); };<\/script></body></html>`);
    pw.document.close();
  };

  const handlePdf = () => {
    alert("【PDF保存の方法】\n開いた別タブの印刷画面で「送信先」を「PDFに保存」に変更し、「保存」ボタンを押してください。");
    handlePrint();
  };

  const handleExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('検査成績表', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const totalCols = 2 + displayQuantity;
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 38;
    for (let i = 3; i <= totalCols; i++) ws.getColumn(i).width = 5.5;
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const allBorder = { top: thin, bottom: thin, left: thin, right: thin };
    const grayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    const darkGrayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    let R = 1;

    ws.mergeCells(R, 1, R, totalCols);
    const titleCell = ws.getRow(R).getCell(1);
    titleCell.value = '製品検査チェックシート';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    R += 2;

    const infoItems = [['指図番号', lot.orderNo || ''], ['型式', lot.model || ''], ['台数', `${lot.quantity || 1} 台`], ['作業者', worker], ['完了日時', toDateTimeJp(lot.updatedAt)]];
    infoItems.forEach(([label, value]) => {
      const lbl = ws.getRow(R).getCell(1); lbl.value = label; lbl.font = { size: 9, bold: true }; lbl.fill = grayFill; lbl.border = allBorder;
      const val = ws.getRow(R).getCell(2); val.value = value; val.font = { size: 10, bold: true }; val.border = allBorder;
      R++;
    });

    ws.mergeCells(R, 1, R, totalCols);
    const reportCell = ws.getRow(R).getCell(1);
    reportCell.value = `帳票番号：${customReportNo || ''}`;
    reportCell.font = { size: 9 }; reportCell.alignment = { horizontal: 'right' };
    R += 2;

    const hdr = ws.getRow(R);
    hdr.getCell(1).value = '検査項目'; hdr.getCell(2).value = '確認方法';
    for (let i = 0; i < displayQuantity; i++) {
      const sn = lot.unitSerialNumbers?.[i];
      hdr.getCell(3 + i).value = sn ? { richText: [{ text: `${i+1}\n`, font: { size: 7, color: { argb: 'FF888888' } } }, { text: sn, font: { size: 6, bold: true } }] } : (i + 1);
    }
    for (let c = 1; c <= totalCols; c++) {
      const cell = hdr.getCell(c); cell.font = { size: 8, bold: true }; cell.fill = darkGrayFill; cell.border = allBorder; cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    R++;

    Object.entries(stepsByCategory).forEach(([cat, catSteps]) => {
      const catRow = ws.getRow(R);
      ws.mergeCells(R, 1, R, totalCols);
      catRow.getCell(1).value = cat;
      catRow.getCell(1).font = { size: 9, bold: true }; catRow.getCell(1).fill = grayFill; catRow.getCell(1).border = allBorder;
      R++;
      catSteps.forEach(step => {
        const stepIdx = steps.findIndex(s => s.id === step.id);
        const isMeas = step.type === 'measurement' && step.measurementConfig;

        if (!isMeas) {
          // 通常の検査項目
          const row = ws.getRow(R);
          row.getCell(1).value = step.title; row.getCell(1).font = { size: 8, bold: true }; row.getCell(1).border = allBorder;
          row.getCell(2).value = step.description || ''; row.getCell(2).font = { size: 7 }; row.getCell(2).border = allBorder; row.getCell(2).alignment = { wrapText: true };
          for (let i = 0; i < displayQuantity; i++) {
            const cell = row.getCell(3 + i);
            if (i < (lot.quantity || 1)) {
              const task = lot.tasks?.[`${step.id}-${i}`] || lot.tasks?.[`${stepIdx}-${i}`];
              cell.value = task?.status === 'completed' ? '✓' : task?.status === 'skipped' ? '－' : '';
            }
            cell.font = { size: 8, bold: true }; cell.alignment = { horizontal: 'center' }; cell.border = allBorder;
            if (i >= (lot.quantity || 1)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } };
          }
          R++;
        } else {
          // 測定項目: ヘッダー + 入力値行 + 計算結果行
          const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FF' } };
          const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
          const measInputs = step.measurementConfig.inputs || [];
          const measCalcs = step.measurementConfig.calculations || [{ id: 'default', label: '計算結果', method: step.measurementConfig.calculation, toleranceUpper: step.measurementConfig.toleranceUpper, toleranceLower: step.measurementConfig.toleranceLower, unit: step.measurementConfig.unit }];

          // 測定項目ヘッダー行
          ws.mergeCells(R, 1, R, totalCols);
          const mhRow = ws.getRow(R);
          mhRow.getCell(1).value = `📐 ${step.title}`;
          mhRow.getCell(1).font = { size: 8, bold: true }; mhRow.getCell(1).fill = blueFill; mhRow.getCell(1).border = allBorder;
          R++;

          // 入力値行
          measInputs.forEach(inp => {
            const row = ws.getRow(R);
            row.getCell(1).value = inp.label; row.getCell(1).font = { size: 7 }; row.getCell(1).border = allBorder;
            row.getCell(2).value = '入力値'; row.getCell(2).font = { size: 7 }; row.getCell(2).border = allBorder;
            for (let i = 0; i < displayQuantity; i++) {
              const cell = row.getCell(3 + i);
              if (i < (lot.quantity || 1)) {
                const meas = getMeasForUnit(step.id, i);
                const val = meas?.values?.[inp.id];
                if (val != null) cell.value = Number(val);
              }
              cell.font = { size: 7 }; cell.alignment = { horizontal: 'center' }; cell.border = allBorder; cell.numFmt = '0.000';
              if (i >= (lot.quantity || 1)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } };
            }
            R++;
          });

          // 計算結果行
          measCalcs.forEach(calc => {
            const row = ws.getRow(R);
            row.getCell(1).value = calc.label || '計算結果'; row.getCell(1).font = { size: 7, bold: true, color: { argb: 'FF1E40AF' } }; row.getCell(1).fill = yellowFill; row.getCell(1).border = allBorder;
            const tolText = (calc.toleranceLower != null && calc.toleranceUpper != null) ? `${calc.toleranceLower}~${calc.toleranceUpper} ${calc.unit || ''}` : calc.unit || '';
            row.getCell(2).value = tolText; row.getCell(2).font = { size: 7 }; row.getCell(2).fill = yellowFill; row.getCell(2).border = allBorder;
            for (let i = 0; i < displayQuantity; i++) {
              const cell = row.getCell(3 + i);
              if (i < (lot.quantity || 1)) {
                const meas = getMeasForUnit(step.id, i);
                const cr = meas?.calcResults?.find(c => c.id === calc.id) || meas?.calcResults?.[0];
                if (cr && cr.result != null) {
                  cell.value = cr.result;
                  cell.font = { size: 7, bold: true, color: { argb: cr.isOk ? 'FF15803D' : 'FFDC2626' } };
                }
              }
              cell.alignment = { horizontal: 'center' }; cell.border = allBorder; cell.numFmt = '0.000';
              cell.fill = i >= (lot.quantity || 1) ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } } : yellowFill;
            }
            R++;
          });
        }
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `${lot.orderNo || '不明'}_${lot.model || '不明'}_成績表.xlsx`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-800 flex flex-col">
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md no-print shrink-0">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Printer className="w-5 h-5" /> 成績表プレビュー
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-700 rounded-lg p-0.5">
            <button onClick={() => setReportMode('table')} className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${reportMode === 'table' ? 'bg-white text-slate-800 shadow' : 'text-slate-300 hover:text-white'}`}>テーブル</button>
            <button onClick={() => setReportMode('visual')} className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${reportMode === 'visual' ? 'bg-white text-slate-800 shadow' : 'text-slate-300 hover:text-white'}`}>ビジュアル</button>
          </div>
          <div className="flex items-center gap-2 bg-slate-700 p-1 rounded px-3">
            <span className="text-xs font-bold text-slate-300">帳票番号:</span>
            <input type="text" value={customReportNo} onChange={(e) => setCustomReportNo(e.target.value)} className="bg-slate-800 text-white border border-slate-600 rounded px-2 py-0.5 text-sm w-40 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:text-white font-bold">閉じる</button>
          <button onClick={handleExcel} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-bold shadow flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          <button onClick={handlePdf} className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-bold shadow flex items-center gap-2"><FileText className="w-4 h-4" /> PDF保存</button>
          <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow flex items-center gap-2"><Printer className="w-4 h-4" /> 印刷</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-500 p-8">
        <style>{PRINT_STYLES}</style>
        {reportMode === 'visual' ? (
          /* ===== ビジュアルモード: 測定ダイアグラム表示 ===== */
          <div className="max-w-5xl mx-auto space-y-6" id="report-preview-content">
            {/* ヘッダーカード */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-xs text-slate-400 font-bold">製品検査</div>
                  <h2 className="text-2xl font-bold text-slate-800">製品検査チェックシート</h2>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <div>完了: {toDateTimeJp(lot.updatedAt)}</div>
                  <div>帳票番号: <span className="font-bold">{customReportNo}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 font-bold">指図</div><div className="font-bold text-lg">{lot.orderNo}</div></div>
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 font-bold">型式</div><div className="font-bold text-lg">{lot.model}</div></div>
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 font-bold">台数</div><div className="font-bold text-lg">{lot.quantity || 1} 台</div></div>
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 font-bold">担当</div><div className="font-bold text-lg">{worker}</div></div>
              </div>
            </div>

            {/* 測定ステップごとのビジュアル表示 */}
            {measSteps.length > 0 ? measSteps.map(step => {
              const config = step.measurementConfig;
              const inputs = config?.inputs || [];
              const calcs = config?.calculations || [{ id: 'default', label: '計算結果', method: config?.calculation, toleranceUpper: config?.toleranceUpper, toleranceLower: config?.toleranceLower, unit: config?.unit }];

              return (
                <div key={step.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-blue-600 text-white px-5 py-3 font-bold flex items-center gap-2">
                    <Ruler className="w-5 h-5" /> {step.title}
                    {step.description && <span className="text-blue-200 text-sm font-normal ml-2">— {step.description}</span>}
                  </div>

                  {/* ユニット別のダイアグラム＋結果カード */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {Array.from({ length: lot.quantity || 1 }).map((_, unitIdx) => {
                      const meas = getMeasForUnit(step.id, unitIdx);
                      const measValues = meas?.values || {};
                      const measCalcResults = meas?.calcResults || [];

                      return (
                        <div key={unitIdx} className="border rounded-xl overflow-hidden bg-slate-50">
                          {/* ユニットヘッダー */}
                          <div className="bg-slate-700 text-white px-4 py-2 text-sm font-bold flex justify-between items-center">
                            <span>#{unitIdx + 1} {lot.unitSerialNumbers?.[unitIdx] || ''}</span>
                            {measCalcResults.length > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${measCalcResults.every(c => c.isOk) ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                {measCalcResults.every(c => c.isOk) ? 'OK' : 'NG'}
                              </span>
                            )}
                          </div>

                          {/* ダイアグラムエリア */}
                          <div className="relative bg-white aspect-[4/3] min-h-[200px] overflow-hidden"
                            style={config?.diagramImage ? {
                              backgroundImage: `url(${config.diagramImage})`,
                              backgroundSize: 'contain',
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'center'
                            } : {}}>
                            {!config?.diagramImage && config?.layout === 'circle-4point' && (
                              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                                <circle cx="50" cy="50" r="35" fill="none" stroke="#cbd5e1" strokeWidth="0.3" strokeDasharray="1.5,1.5"/>
                              </svg>
                            )}
                            {inputs.map(inp => {
                              const val = measValues[inp.id];
                              const isFilled = val != null && val !== '';
                              return (
                                <div key={inp.id} className="absolute flex flex-col items-center" style={{ left: `${inp.x}%`, top: `${inp.y}%`, transform: 'translate(-50%, -50%)' }}>
                                  <span className="text-[9px] font-bold text-slate-500 mb-0.5 bg-white/90 px-1 rounded whitespace-nowrap">{inp.label}</span>
                                  <div className={`w-18 h-7 flex items-center justify-center text-sm font-mono font-bold rounded border-2 px-2 ${isFilled ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-400'}`}>
                                    {isFilled ? Number(val).toFixed(3) : '---'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* 計算結果 */}
                          <div className="border-t bg-white px-4 py-3 space-y-2">
                            {calcs.map((calc, ci) => {
                              const cr = measCalcResults.find(c => c.id === calc.id) || measCalcResults[ci];
                              return (
                                <div key={calc.id || ci} className="flex items-center justify-between">
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-700">{calc.label || '計算結果'}</span>
                                    <span className="text-slate-400 ml-2">{calc.toleranceLower != null ? `${calc.toleranceLower}~${calc.toleranceUpper}` : ''} {calc.unit || ''}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-mono font-black text-slate-800">{cr?.result != null ? cr.result.toFixed(4) : '---'}</span>
                                    {cr?.result != null && (
                                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${cr.isOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {cr.isOk ? 'OK' : 'NG'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }) : (
              <div className="bg-white rounded-xl shadow-lg p-10 text-center text-slate-400">この作業に測定項目はありません</div>
            )}

            {/* 通常検査項目のサマリー */}
            {steps.some(s => s.type !== 'measurement') && (
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-slate-600 text-white px-5 py-3 font-bold">検査項目サマリー</div>
                <div className="p-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-200">
                        <th className="text-left p-2 font-bold text-slate-600">検査項目</th>
                        {Array.from({ length: lot.quantity || 1 }).map((_, i) => (
                          <th key={i} className="text-center p-2 font-bold text-slate-600 w-16">#{i+1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {steps.filter(s => s.type !== 'measurement').map((step, sIdx) => {
                        const stepIdx = steps.findIndex(s => s.id === step.id);
                        return (
                          <tr key={step.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 font-bold text-slate-700">{step.title}</td>
                            {Array.from({ length: lot.quantity || 1 }).map((_, i) => {
                              const task = lot.tasks?.[`${step.id}-${i}`] || lot.tasks?.[`${stepIdx}-${i}`];
                              return (
                                <td key={i} className="text-center p-2">
                                  {task?.status === 'completed' ? <span className="text-emerald-600 font-bold text-lg">✓</span> : task?.status === 'skipped' ? <span className="text-slate-400">－</span> : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 判定 */}
            <div className="bg-white rounded-xl shadow-lg p-6 flex justify-between items-center">
              <div className="text-lg">判定: <span className="text-3xl font-bold ml-3">合格</span></div>
              <div className="text-sm text-slate-400">帳票番号：{customReportNo}</div>
            </div>
          </div>
        ) : (
        <div className="print-pages" id="report-preview-content">
          <div className="print-page">
            <div className="print-page-no">No. 1</div>
            <div className="flex justify-between items-start mb-2 border-b-2 border-black pb-2">
              <div>
                <div className="text-xs font-bold text-gray-500 mb-1">製品検査</div>
                <div className="text-xl font-serif font-bold">製品検査チェックシート</div>
              </div>
              <div className="flex gap-4">
                <div className="text-[10px] border border-black p-1 min-w-[100px]">
                  <div>完了: {toDateTimeJp(lot.updatedAt)}</div>
                </div>
                <div className="flex border border-black text-center text-xs h-14 items-stretch divide-x divide-black">
                  <div className="w-12 flex flex-col"><div className="bg-gray-100 border-b border-black px-1 py-0.5 text-[10px]">承認</div><div className="flex-1"></div></div>
                  <div className="w-12 flex flex-col"><div className="bg-gray-100 border-b border-black px-1 py-0.5 text-[10px]">職長</div><div className="flex-1"></div></div>
                  <div className="w-12 flex flex-col"><div className="bg-gray-100 border-b border-black px-1 py-0.5 text-[10px]">担当</div><div className="flex-1 flex items-center justify-center font-bold break-all p-1 text-[9px] leading-tight">{worker}</div></div>
                </div>
              </div>
            </div>
            <div className="flex border border-black mb-2">
              <div className="w-[30%] border-r border-black p-2 space-y-1 text-xs">
                <div className="flex border-b border-gray-300 pb-1"><span className="font-bold w-12 bg-gray-100 text-center mr-1 shrink-0 text-[10px]">指図</span><span className="font-bold text-sm break-words">{lot.orderNo}</span></div>
                <div className="flex border-b border-gray-300 pb-1"><span className="font-bold w-12 bg-gray-100 text-center mr-1 shrink-0 text-[10px]">型式</span><span className="break-words font-bold text-xs">{lot.model}</span></div>
                <div className="flex"><span className="font-bold w-12 bg-gray-100 text-center mr-1 shrink-0 text-[10px]">台数</span><span className="text-[10px]">{lot.quantity || 1} 台</span></div>
              </div>
              <div className="w-[40%] border-r border-black p-2">
                <div className="font-bold border-b border-black mb-2 text-center bg-gray-100 text-sm">備考欄</div>
                <div className="text-[10px]">
                  {defects && <div className="mb-2"><span className="font-bold text-red-600">【不具合事項】</span><div className="whitespace-pre-wrap ml-1 border border-red-200 p-1 bg-red-50">{defects}</div></div>}
                </div>
              </div>
              <div className="w-[30%] p-2">
                <div className="font-bold border-b border-black mb-2 text-center bg-gray-100 text-xs">機番一覧</div>
                <div className="text-[9px] grid grid-cols-5 gap-1">
                  {Array.from({ length: lot.quantity || 1 }).map((_, i) => (
                    <div key={i} className="text-center">
                      <span className="text-[7px] text-gray-400">#{i+1}</span>
                      <div className="font-bold truncate">{lot.unitSerialNumbers?.[i] || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <table className="w-full border-collapse border border-black text-[10px] table-fixed">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-1 whitespace-nowrap text-[8px]">検査項目</th>
                  <th className="border border-black p-1 whitespace-nowrap text-[8px]">確認方法</th>
                  {Array.from({ length: displayQuantity }).map((_, i) => (
                    <th key={i} className="border border-black p-1 w-5 text-[7px]">
                      <div>{i + 1}</div>
                      {lot.unitSerialNumbers?.[i] && <div className="font-normal text-[6px] text-gray-500 truncate">{lot.unitSerialNumbers[i]}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(stepsByCategory).map(([cat, catSteps]) => (
                  <React.Fragment key={cat}>
                    <tr className="bg-gray-200">
                      <td colSpan={2 + displayQuantity} className="border border-black p-1 font-bold text-left pl-2 text-[9px]">{cat}</td>
                    </tr>
                    {catSteps.map(step => {
                      const stepIdx = steps.findIndex(s => s.id === step.id);
                      const isMeas = step.type === 'measurement' && step.measurementConfig;
                      const measInputs = isMeas ? (step.measurementConfig.inputs || []) : [];
                      const measCalcs = isMeas ? (step.measurementConfig.calculations || [{ id: 'default', label: '計算結果', method: step.measurementConfig.calculation, toleranceUpper: step.measurementConfig.toleranceUpper, toleranceLower: step.measurementConfig.toleranceLower, unit: step.measurementConfig.unit }]) : [];

                      if (!isMeas) {
                        // 通常の検査項目: ✓/－
                        return (
                          <tr key={step.id}>
                            <td className="border border-black p-1 align-middle whitespace-nowrap text-[8px] font-bold">{step.title}</td>
                            <td className="border border-black p-1 text-gray-600 align-middle text-[8px]">{step.description || ''}</td>
                            {Array.from({ length: displayQuantity }).map((_, i) => {
                              const task = lot.tasks?.[`${step.id}-${i}`] || lot.tasks?.[`${stepIdx}-${i}`];
                              let mark = '';
                              if (i < (lot.quantity || 1)) {
                                if (task?.status === 'completed') mark = '✓';
                                else if (task?.status === 'skipped') mark = '－';
                              }
                              return <td key={i} className={`border border-black p-1 text-center align-middle ${i >= (lot.quantity || 1) ? 'bg-slate-100' : ''}`}><span className="text-[8px] font-bold">{mark}</span></td>;
                            })}
                          </tr>
                        );
                      }

                      // 測定項目: 生データ行 + 計算結果行
                      return (
                        <React.Fragment key={step.id}>
                          {/* 測定項目ヘッダー */}
                          <tr className="bg-blue-50">
                            <td colSpan={2 + displayQuantity} className="border border-black p-1 font-bold text-[8px] pl-2">📐 {step.title} {step.description ? `— ${step.description}` : ''}</td>
                          </tr>
                          {/* 生データ行: 各入力項目 */}
                          {measInputs.map(inp => (
                            <tr key={inp.id}>
                              <td className="border border-black p-1 text-[7px] pl-3 text-gray-700">{inp.label}</td>
                              <td className="border border-black p-1 text-[7px] text-gray-500">入力値</td>
                              {Array.from({ length: displayQuantity }).map((_, i) => {
                                if (i >= (lot.quantity || 1)) return <td key={i} className="border border-black p-1 bg-slate-100"></td>;
                                const meas = getMeasForUnit(step.id, i);
                                const val = meas?.values?.[inp.id];
                                return <td key={i} className="border border-black p-1 text-center text-[7px] font-mono">{val != null ? Number(val).toFixed(3) : ''}</td>;
                              })}
                            </tr>
                          ))}
                          {/* 計算結果行 */}
                          {measCalcs.map(calc => (
                            <tr key={calc.id} className="bg-yellow-50">
                              <td className="border border-black p-1 text-[7px] pl-3 font-bold text-blue-800">{calc.label || '計算結果'}</td>
                              <td className="border border-black p-1 text-[7px] text-gray-500">
                                {calc.toleranceLower != null && calc.toleranceUpper != null ? `${calc.toleranceLower}~${calc.toleranceUpper} ${calc.unit || ''}` : calc.unit || ''}
                              </td>
                              {Array.from({ length: displayQuantity }).map((_, i) => {
                                if (i >= (lot.quantity || 1)) return <td key={i} className="border border-black p-1 bg-slate-100"></td>;
                                const meas = getMeasForUnit(step.id, i);
                                const cr = meas?.calcResults?.find(c => c.id === calc.id) || meas?.calcResults?.[0];
                                if (!cr || cr.result == null) return <td key={i} className="border border-black p-1 text-center text-[7px]">-</td>;
                                return (
                                  <td key={i} className={`border border-black p-1 text-center text-[7px] font-bold ${cr.isOk ? 'text-green-700' : 'text-red-600 bg-red-50'}`}>
                                    {cr.result.toFixed(3)}
                                    <div className="text-[6px]">{cr.isOk ? 'OK' : 'NG'}</div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="mt-4 border-t-2 border-black pt-2 flex justify-between text-xs">
              <div>判定: <span className="text-xl font-bold ml-2">合格</span></div>
            </div>
            <div className="print-report-no">帳票番号：{customReportNo}</div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

const HistoryView = ({ lots, workers, templates, saveData, onEditLot, onDeleteLot }) => {
  const completedLots = lots.filter(l => l.location === 'completed' || l.status === 'completed');
  const [viewMode, setViewMode] = useState('grid');
  const [reportLot, setReportLot] = useState(null);
  const [editingTimeLot, setEditingTimeLot] = useState(null);
  const [editingMeasLot, setEditingMeasLot] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', action: null });

  const getTodayStr = () => { const d = new Date(); const pad = (n) => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const [filterStartDate, setFilterStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [filterEndDate, setFilterEndDate] = useState(getTodayStr());
  const [searchQuery, setSearchQuery] = useState('');

  const toMs = (val) => { if (!val) return 0; if (typeof val === 'number') return val; if (val.seconds) return val.seconds * 1000 + (val.nanoseconds || 0) / 1e6; if (val.toMillis) return val.toMillis(); const t = new Date(val).getTime(); return isNaN(t) ? 0 : t; };

  const triggerDelete = (id) => { setConfirmModal({ isOpen: true, title: '削除確認', message: '履歴を削除しますか？この操作は元に戻せません。', action: () => { onDeleteLot(id); setConfirmModal(p => ({ ...p, isOpen: false })); } }); };

  const filteredCompletedLots = useMemo(() => {
    let start = 0, end = Infinity;
    if (filterStartDate) start = new Date(filterStartDate).getTime();
    if (filterEndDate) { const endDate = new Date(filterEndDate); endDate.setHours(23, 59, 59, 999); end = endDate.getTime(); }
    const lowerQuery = searchQuery.toLowerCase();
    return completedLots.filter(lot => { const ts = toMs(lot.updatedAt || lot.createdAt); return ts >= start && ts <= end && (!searchQuery || (lot.orderNo && lot.orderNo.toLowerCase().includes(lowerQuery)) || (lot.model && lot.model.toLowerCase().includes(lowerQuery))); });
  }, [completedLots, filterStartDate, filterEndDate, searchQuery]);

  const sortedCompletedLots = useMemo(() => [...filteredCompletedLots].sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt)), [filteredCompletedLots]);

  const downloadCSV = () => {
    const headers = ['完了日時', '型式', '指図番号', 'ユニットNo', 'カテゴリ', '検査項目', '結果', '作業者', '実績時間(秒)', '目標時間(秒)', '達成率(%)'];
    const rows = [];
    sortedCompletedLots.forEach(lot => {
      const d = new Date(toMs(lot.updatedAt || lot.createdAt) || Date.now());
      const dateStr = isNaN(d.getTime()) ? '-' : d.toLocaleString();
      (lot.steps || []).forEach((step, sIdx) => {
        for (let i = 0; i < (lot.quantity || 1); i++) {
          const task = lot.tasks?.[`${step.id}-${i}`] || lot.tasks?.[`${sIdx}-${i}`];
          if (task?.status === 'completed' || task?.status === 'skipped') {
            const eff = task.duration > 0 ? Math.round(((step.targetTime || 60) / task.duration) * 100) : 0;
            const wName = workers.find(w => w.id === task.workerId)?.name || task.workerName || '-';
            rows.push([dateStr, lot.model, lot.orderNo, `#${i + 1}`, step.category || '', step.title, task.status === 'completed' ? 'OK' : 'N/A', wName, task.duration || 0, step.targetTime || 60, eff].join(','));
          }
        }
      });
    });
    const blob = new Blob(["\uFEFF" + headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `history_${Date.now()}.csv`; link.click();
  };

  const handleHistoryCsvUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const csvRows = text.split(/\r\n|\n/).map(row => row.split(','));
      if (csvRows.length < 2) { alert("CSVのデータがありません。"); return; }
      const hdrs = csvRows[0].map(h => h.replace(/^"|"$/g, '').trim());
      if (hdrs[0] && hdrs[0].charCodeAt(0) === 0xFEFF) hdrs[0] = hdrs[0].substring(1);
      const idxOrderNo = hdrs.indexOf('指図番号'), idxUnitNo = hdrs.indexOf('ユニットNo'), idxTitle = hdrs.indexOf('検査項目'), idxCategory = hdrs.indexOf('カテゴリ'), idxDuration = hdrs.indexOf('実績時間(秒)'), idxWorker = hdrs.indexOf('作業者');
      if (idxOrderNo === -1 || idxUnitNo === -1 || idxTitle === -1) { alert("CSV形式が正しくありません。必須列（指図番号、ユニットNo、検査項目）が見つかりません。"); return; }
      const updates = {};
      for (let i = 1; i < csvRows.length; i++) {
        const row = csvRows[i]; if (row.length < hdrs.length) continue;
        const getVal = (idx) => idx !== -1 && row[idx] ? row[idx].replace(/^"|"$/g, '').trim() : '';
        const orderNo = getVal(idxOrderNo), unitNo = getVal(idxUnitNo), title = getVal(idxTitle), category = getVal(idxCategory), duration = parseInt(getVal(idxDuration), 10) || 0, workerName = getVal(idxWorker);
        if (!orderNo || !unitNo || !title) continue;
        const matchLot = completedLots.find(l => l.orderNo === orderNo); if (!matchLot) continue;
        if (!updates[matchLot.id]) updates[matchLot.id] = { tasks: JSON.parse(JSON.stringify(matchLot.tasks || {})) };
        const stepIndex = (matchLot.steps || []).findIndex(s => s.title === title && (category ? s.category === category : true)); if (stepIndex === -1) continue;
        const step = matchLot.steps[stepIndex];
        let unitIdx = -1; if (unitNo.startsWith('#')) unitIdx = parseInt(unitNo.substring(1), 10) - 1;
        if (unitIdx === -1 || unitIdx >= (matchLot.quantity || 1)) continue;
        const taskKey1 = `${step.id}-${unitIdx}`, taskKey2 = `${stepIndex}-${unitIdx}`;
        const existingTask = updates[matchLot.id].tasks[taskKey1] || updates[matchLot.id].tasks[taskKey2];
        const actualKey = updates[matchLot.id].tasks[taskKey1] ? taskKey1 : taskKey2;
        updates[matchLot.id].tasks[actualKey] = { ...(existingTask || { startTime: null }), status: 'completed', duration, workerName: workerName !== '-' ? workerName : (existingTask?.workerName || '') };
      }
      const updateLotIds = Object.keys(updates);
      if (updateLotIds.length === 0) { alert("更新対象のデータが見つかりませんでした。"); return; }
      if (confirm(`${updateLotIds.length}件のロットの実績を更新します。よろしいですか？`)) {
        for (const lotId of updateLotIds) await saveData('lots', lotId, { tasks: updates[lotId].tasks });
        alert("更新が完了しました。");
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div data-fs="tables" className="h-full flex flex-col p-6 overflow-hidden">
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-600 mb-4">{confirmModal.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmModal(p => ({ ...p, isOpen: false }))} className="px-4 py-2 text-slate-600 font-bold border rounded hover:bg-slate-50">キャンセル</button>
              <button onClick={confirmModal.action} className="px-4 py-2 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700">削除</button>
            </div>
          </div>
        </div>
      )}
      {reportLot && <ReportPreview lot={reportLot} workers={workers} onClose={() => setReportLot(null)} />}
      {editingTimeLot && <EditTimeModal lot={editingTimeLot} onClose={() => setEditingTimeLot(null)} onSave={(data) => { saveData('lots', editingTimeLot.id, data); setEditingTimeLot(null); }} />}
      {editingMeasLot && <EditMeasurementModal lot={editingMeasLot} onClose={() => setEditingMeasLot(null)} onSave={(data) => { saveData('lots', editingMeasLot.id, data); setEditingMeasLot(null); }} />}

      <div className="flex flex-wrap justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200 shrink-0 gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-800 ml-2"><CheckSquare className="text-blue-600" /> 完了履歴</div>
          <div className="h-6 w-px bg-slate-300 mx-2 hidden md:block"></div>
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border">
            <CalendarDays className="w-4 h-4 text-slate-500 ml-1" />
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none" />
            <span className="text-slate-400">~</span>
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg border shadow-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input type="text" placeholder="指図・型式で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-sm outline-none w-32 md:w-48 font-bold text-slate-700" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded p-1">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="グリッド表示"><LayoutGrid className="w-5 h-5" /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="リスト表示"><LayoutList className="w-5 h-5" /></button>
          </div>
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm shadow-sm">
            <Upload className="w-4 h-4" /> CSV取込
            <input type="file" accept=".csv" className="hidden" onChange={handleHistoryCsvUpload} />
          </label>
          <button onClick={downloadCSV} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm shadow-sm"><Download className="w-4 h-4" /> CSV出力</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start pb-10">
            {sortedCompletedLots.map(lot => (
              <div key={lot.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2 h-auto hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-lg text-slate-800 break-all">{lot.model}</div>
                  <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setReportLot(lot)} className="p-1.5 border rounded hover:bg-green-50 text-green-600 transition-colors" title="成績表プレビュー"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => setEditingTimeLot(lot)} className="p-1.5 border rounded hover:bg-amber-50 text-amber-600 transition-colors" title="作業時間編集"><Clock className="w-4 h-4" /></button>
                    <button onClick={() => setEditingMeasLot(lot)} className="p-1.5 border rounded hover:bg-emerald-50 text-emerald-600 transition-colors" title="測定結果編集"><Ruler className="w-4 h-4" /></button>
                    <button onClick={() => onEditLot(lot)} className="p-1.5 border rounded hover:bg-blue-50 transition-colors" title="詳細編集"><Pencil className="w-4 h-4 text-slate-500" /></button>
                    <button onClick={() => triggerDelete(lot.id)} className="p-1.5 border rounded hover:bg-rose-50 transition-colors" title="削除"><Trash2 className="w-4 h-4 text-red-500" /></button>
                  </div>
                </div>
                <div className="text-sm text-slate-600">指図: <span className="font-bold">{lot.orderNo}</span> | <span className="bg-slate-100 px-1.5 rounded">{lot.quantity}台</span></div>
                <div className="text-xs text-slate-500 flex items-center gap-1"><User className="w-3 h-3" /> {workers.find(w => w.id === lot.workerId)?.name || '未割当'}</div>
                <div className="text-xs font-mono text-slate-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatTime(lot.tasks ? Object.values(lot.tasks).reduce((s, t) => s + (t.status === 'completed' ? (t.duration || 0) : 0), 0) : Math.floor((lot.totalWorkTime || 0) / 1000))}
                </div>
                <div className="text-xs text-slate-400 mt-auto pt-3 border-t">{lot.updatedAt ? new Date(toMs(lot.updatedAt)).toLocaleString() : '-'}</div>
              </div>
            ))}
            {sortedCompletedLots.length === 0 && <div className="col-span-full text-center py-20 text-slate-400">表示するデータがありません</div>}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs text-slate-500 uppercase">
                <tr><th className="p-3 font-bold border-b">完了日時</th><th className="p-3 font-bold border-b">指図番号</th><th className="p-3 font-bold border-b">型式</th><th className="p-3 font-bold border-b text-center">台数</th><th className="p-3 font-bold border-b">作業者</th><th className="p-3 font-bold border-b">実績時間</th><th className="p-3 font-bold border-b text-right">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedCompletedLots.map(lot => {
                  const totalActual = lot.tasks ? Object.values(lot.tasks).reduce((s, t) => s + (t.status === 'completed' ? (t.duration || 0) : 0), 0) : Math.floor((lot.totalWorkTime || 0) / 1000);
                  return (
                  <tr key={lot.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{lot.updatedAt ? new Date(toMs(lot.updatedAt)).toLocaleString() : '-'}</td>
                    <td className="p-3 font-bold text-slate-800">{lot.orderNo}</td>
                    <td className="p-3 font-bold text-slate-700">{lot.model}</td>
                    <td className="p-3 text-center"><span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs">{lot.quantity}台</span></td>
                    <td className="p-3 text-xs text-slate-600">{workers.find(w => w.id === lot.workerId)?.name || '未割当'}</td>
                    <td className="p-3 font-mono text-sm">{formatTime(totalActual)}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setReportLot(lot)} className="p-1.5 border rounded hover:bg-green-50 text-green-600 bg-white transition-colors" title="成績表プレビュー"><Printer className="w-4 h-4" /></button>
                        <button onClick={() => setEditingTimeLot(lot)} className="p-1.5 border rounded hover:bg-amber-50 text-amber-600 bg-white transition-colors" title="作業時間編集"><Clock className="w-4 h-4" /></button>
                        <button onClick={() => setEditingMeasLot(lot)} className="p-1.5 border rounded hover:bg-emerald-50 text-emerald-600 bg-white transition-colors" title="測定結果編集"><Ruler className="w-4 h-4" /></button>
                        <button onClick={() => onEditLot(lot)} className="p-1.5 border rounded hover:bg-blue-50 text-slate-500 bg-white transition-colors" title="詳細編集"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => triggerDelete(lot.id)} className="p-1.5 border rounded hover:bg-rose-50 text-rose-500 bg-white transition-colors" title="削除"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {sortedCompletedLots.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-400">表示するデータがありません</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


// --- Main Component ---
 
 export default function App() {
   // State: Current User (端末使用者)
   const [currentUserName, setCurrentUserName] = useState(() => {
     try { return localStorage.getItem('currentUserName') || ''; } catch { return ''; }
   });
   const selectUser = (name) => { setCurrentUserName(name); try { localStorage.setItem('currentUserName', name); localStorage.setItem('lastWorkerName', name); } catch(e) {} };

   // State: System
   const [user, setUser] = useState(null);
   const [db, setDb] = useState(null);
   const [isConnected, setIsConnected] = useState(false);
   const [syncStatus, setSyncStatus] = useState('idle');
   const [errorMsg, setErrorMsg] = useState(null);
      
   // State: App Data
   const [lots, setLots] = useState([]);
   const [templates, setTemplates] = useState([]);
   const [workers, setWorkers] = useState([]);
   const [logs, setLogs] = useState([]);
   const [settings, setSettings] = useState({ mapImage: null, mapZones: INITIAL_MAP_ZONES, defectProcessOptions: DEFAULT_DEFECT_PROCESS_OPTIONS, breakAlerts: [], complaintOptions: DEFAULT_COMPLAINT_OPTIONS, customTargetTimes: {}, targetTimeHistory: [], customLayouts: {} });

   // State: Break Alert
   const [showBreakAlert, setShowBreakAlert] = useState(null);
   const [announceBanner, setAnnounceBanner] = useState(null);

   // State: UI
   const [viewMode, setViewMode] = useState('dashboard');
   const [activeTab, setActiveTab] = useState('main'); 
   const [showLotModal, setShowLotModal] = useState(false);
   const [lotFormQty, setLotFormQty] = useState(1);
   const [selectedWorker, setSelectedWorker] = useState(null);
   const [draggedLotId, setDraggedLotId] = useState(null);
   const mapRef = useRef(null);
   const [moveLot, setMoveLot] = useState(null); // タッチ移動モーダル用
   // グローバルに参照できるようにwindowに設定（タッチD&D用）
   useEffect(() => { window.__setMoveLot = setMoveLot; return () => { delete window.__setMoveLot; }; }, []);
   const lotExcelInputRef = useRef(null);
   const excelInputRef = useRef(null);
   const backupInputRef = useRef(null);
 
   // State: Execution Modal
   const [executionLotId, setExecutionLotId] = useState(null);

   // State: Notes & Announcements (disabled for debug)
   const [notes, setNotes] = useState([]);
   const [announcements, setAnnouncements] = useState([]);

   // State: Indirect Work (間接作業)
   const [indirectWork, setIndirectWork] = useState([]);
   const [showIndirectModal, setShowIndirectModal] = useState(false);
   const [showDailySummary, setShowDailySummary] = useState(false);
   const [activeIndirect, setActiveIndirect] = useState(null); // { id, category, startTime }

   // お知らせ通知タイマー
   useEffect(() => {
     if (!announcements || announcements.length === 0) return;
     const checkNotify = () => {
       const now = new Date();
       const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
       announcements.forEach(ann => {
         if (!ann.notifyTimes?.length) return;
         if (ann.notifyTimes.includes(hhmm)) {
           setAnnounceBanner(ann);
           setTimeout(() => setAnnounceBanner(prev => prev?.id === ann.id ? null : prev), 30000);
         }
       });
     };
     checkNotify();
     const interval = setInterval(checkNotify, 60000);
     return () => clearInterval(interval);
   }, [announcements]);
   const [showNoteModal, setShowNoteModal] = useState(false);
   const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
 
   // State: Template Editor
   const [editingTemplate, setEditingTemplate] = useState(null);
 
   // State: Lot Editing
   const [editingLot, setEditingLot] = useState(null);
 
   // --- Firebase Initialization ---
   useEffect(() => {
     if (!FIREBASE_CONFIG.apiKey) return;
     const app = initializeApp(FIREBASE_CONFIG);
     const auth = getAuth(app);
     const firestore = getFirestore(app);
     setDb(firestore);
 
     const initAuth = async () => {
       // Check if using user-defined config
       const isUserConfig = USER_DEFINED_CONFIG.apiKey && USER_DEFINED_CONFIG.apiKey.length > 0;
       
       if (isUserConfig) {
           // Force anonymous sign-in for user projects (avoids canvas token mismatch)
           await signInAnonymously(auth);
       } else if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
       } else {
            await signInAnonymously(auth);
       }
     };
     initAuth();
 
     onAuthStateChanged(auth, (u) => {
       setUser(u);
       setIsConnected(!!u);
     });
   }, []);
 
   // --- Data Sync ---
   useEffect(() => {
     if (!user || !db) return;
     const getPath = (colName) => collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', colName);
 
     const unsubs = [
       onSnapshot(getPath('lots'), { includeMetadataChanges: true }, (snap) => {
           const data = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
           setLots(data);
         }),
       onSnapshot(getPath('templates'), { includeMetadataChanges: true }, (snap) => {
           const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
           setTemplates(data);
        }),
       onSnapshot(getPath('workers'), { includeMetadataChanges: true }, (snap) => {
           const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
           setWorkers(data);
        }),
       onSnapshot(getPath('logs'), (snap) => setLogs(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.timestamp - a.timestamp))),
       onSnapshot(getPath('notes'), (snap) => setNotes(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))),
       onSnapshot(getPath('announcements'), (snap) => setAnnouncements(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))),
       onSnapshot(getPath('indirectWork'), (snap) => setIndirectWork(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.startTime || 0) - (a.startTime || 0)))),
       onSnapshot(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'settings', 'config'), (snap) => {
         if (snap.exists()) {
            const data = snap.data();
            setSettings({
              mapImage: data.mapImage || null,
              mapZones: data.mapZones || INITIAL_MAP_ZONES,
              defectProcessOptions: data.defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS,
              breakAlerts: data.breakAlerts || [],
              complaintOptions: data.complaintOptions || DEFAULT_COMPLAINT_OPTIONS,
              customTargetTimes: data.customTargetTimes || {},
              targetTimeHistory: data.targetTimeHistory || [],
              customLayouts: data.customLayouts || {},
              fontSizes: data.fontSizes || {},
              undoTimeout: data.undoTimeout || 5,
              voiceSettings: data.voiceSettings || {},
              voiceCommands: data.voiceCommands || null,
              comboPresets: data.comboPresets || []
            });
         }
       })
     ];
     return () => unsubs.forEach(u => u());
   }, [user, db]);

   // --- Font Size Application ---
   useEffect(() => {
     applyFontSizes(settings.fontSizes);
   }, [settings.fontSizes]);

   // --- Break Alert Timer ---
   useEffect(() => {
     const breakAlerts = settings.breakAlerts || [];
     const checkAlerts = () => {
       const now = new Date();
       const currentHour = now.getHours();
       const currentMinute = now.getMinutes();
       breakAlerts.forEach(alert => {
         if (!alert.enabled) return;
         const [alertHour, alertMinute] = alert.time.split(':').map(Number);
         let targetHour = alertHour;
         let targetMinute = alertMinute - 10;
         if (targetMinute < 0) { targetMinute += 60; targetHour -= 1; }
         if (currentHour === targetHour && currentMinute === targetMinute) {
           setShowBreakAlert(alert.message);
         }
       });
     };
     const interval = setInterval(checkAlerts, 60000);
     checkAlerts();
     return () => clearInterval(interval);
   }, [settings.breakAlerts]);

   // --- Actions ---
   // Firestore doesn't accept undefined values - recursively remove them
   const cleanUndefined = (obj) => {
     if (obj === null || obj === undefined) return null;
     if (Array.isArray(obj)) return obj.map(cleanUndefined);
     if (typeof obj === 'object' && obj.constructor === Object) {
       const cleaned = {};
       for (const [k, v] of Object.entries(obj)) {
         if (v !== undefined) cleaned[k] = cleanUndefined(v);
       }
       return cleaned;
     }
     return obj;
   };

   const saveData = async (col, id, data) => {
     if (!user || !db) {
         setErrorMsg("Not authenticated. Cannot save data.");
         return;
     }
     try {
       setSyncStatus('syncing');
       setErrorMsg(null);

       await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', col, id), { ...cleanUndefined(data), updatedAt: serverTimestamp() }, { merge: true });
       setSyncStatus('idle');
     } catch (e) { 
         console.error(e); 
         setSyncStatus('error'); 
         setErrorMsg(e.message || "Unknown error during save");
     }
   };

   

   const saveSettings = async (newSettings) => {
     if (!user || !db) return;
     await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'settings', 'config'), newSettings, { merge: true });
   };
 
   const deleteData = async (col, id) => {
     if (!user || !db) return;
     await deleteDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', col, id));
   };
 
   // --- Worker Management ---
   const handleAddWorker = () => {
     const name = prompt("新しい作業者の名前を入力してください:");
     if (name) {
       saveData('workers', generateId(), { name });
     }
   };
 
   // --- Advanced Import/Export (Restored) ---
   
   // 1. Excel Import (Upload) - compatible with download format
   const handleExcelImport = async (e) => {
     const file = e.target.files?.[0];
     if (!file) return;

     try {
         const wb = new ExcelJS.Workbook();
         await wb.xlsx.load(file);
         const ws = wb.getWorksheet(1);
         if (!ws) throw new Error('シートが見つかりません');

         const importedTitle = ws.getCell('A1').value?.toString() || 'インポート標準書';
         const newSteps = [];

         // Extract embedded images mapped to rows
         const media = wb.model?.media || [];
         const imageMap = new Map();
         if (ws.getImages) {
            ws.getImages().forEach((img) => {
              const rowIdx = Math.round(img.range?.tl?.nativeRow ?? img.range?.tl?.row ?? -1) + 1;
              if (rowIdx < 1) return;
              const mediaItem = media[parseInt(img.imageId)];
              if (mediaItem && mediaItem.buffer) {
                try {
                  const uint8 = new Uint8Array(mediaItem.buffer);
                  let binary = '';
                  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
                  const base64 = `data:image/${mediaItem.extension || 'png'};base64,${window.btoa(binary)}`;
                  if (!imageMap.has(rowIdx)) imageMap.set(rowIdx, []);
                  imageMap.get(rowIdx).push(base64);
                } catch(imgErr) { /* skip */ }
              }
            });
         }

         // Auto-detect format: new (row 4, col B) or legacy (row 6, col E)
         const row4Title = ws.getRow(4).getCell(2).value?.toString();
         const isNewFormat = !!row4Title;
         const startRow = isNewFormat ? 4 : 6;

         ws.eachRow((row, rowNumber) => {
             if (rowNumber < startRow) return;
             let title, desc, targetTime, type;

             if (isNewFormat) {
               // Download format: B=工程名, C=作業内容, D=目標時間, E=種別
               title = row.getCell(2).value?.toString();
               desc = row.getCell(3).value?.toString() || '';
               const rawTime = row.getCell(4).value;
               targetTime = typeof rawTime === 'number' ? rawTime : parseInt(rawTime) || 0;
               type = row.getCell(5).value?.toString() || 'normal';
               if (!['normal','important','danger'].includes(type)) type = 'normal';
             } else {
               // Legacy format: E=title, F=description
               title = row.getCell(5).value?.toString();
               desc = row.getCell(6).value?.toString() || '';
               targetTime = 0;
               type = 'normal';
             }

             if (title && title.trim()) {
                 newSteps.push({
                     id: generateId(),
                     title: title.trim(),
                     description: desc,
                     type,
                     targetTime,
                     images: imageMap.get(rowNumber) || []
                 });
             }
         });

         if (newSteps.length > 0) {
             // Same name exists - offer update or copy
             const existing = templates.find(t => t.name === importedTitle);
             if (existing) {
               const overwrite = window.confirm(
                 '「' + importedTitle + '」は既に存在します。\n上書き更新しますか？\n（キャンセルで新規コピー作成）'
               );
               if (overwrite) {
                 // Preserve original images when uploaded file has no images for that step
                 const mergedSteps = newSteps.map((ns, i) => {
                   const origStep = existing.steps?.[i];
                   if (ns.images.length === 0 && origStep?.images?.length > 0) {
                     return { ...ns, images: origStep.images };
                   }
                   return ns;
                 });
                 saveData('templates', existing.id, { ...existing, name: importedTitle, steps: mergedSteps });
                 alert('「' + importedTitle + '」を更新しました (' + mergedSteps.length + '工程)');
               } else {
                 const id = generateId();
                 saveData('templates', id, { id, name: importedTitle + ' (コピー)', steps: newSteps });
                 alert('「' + importedTitle + ' (コピー)」を新規作成しました');
               }
             } else {
               const id = generateId();
               saveData('templates', id, { id, name: importedTitle, steps: newSteps });
               alert('「' + importedTitle + '」を取り込みました (' + newSteps.length + '工程)');
             }
         } else {
             alert('有効なデータが見つかりませんでした。\nRow 4以降に工程データがあるか確認してください。');
         }
     } catch (err) {
         console.error(err);
         alert('Excelの読み込みに失敗しました: ' + err.message);
     }
     e.target.value = '';
   };
 
   // 1b. Excel Download (Export template as XLSX) - format matches upload
   const handleExcelDownload = async (template) => {
     if (!template || !template.steps) return;
     try {
       const wb = new ExcelJS.Workbook();
       const ws = wb.addWorksheet(template.name || 'テンプレート');

       const thin = { style: 'thin', color: { argb: 'FF000000' } };
       const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

       // Row 1: Template name (A1, merged)
       ws.mergeCells('A1:F1');
       const titleCell = ws.getCell('A1');
       titleCell.value = template.name || 'テンプレート';
       titleCell.font = { bold: true, size: 16 };
       titleCell.alignment = { vertical: 'middle' };

       // Row 2: Instructions
       ws.mergeCells('A2:F2');
       ws.getCell('A2').value = '※ この行以下を編集してください。行の追加・削除も可能です。画像列は再アップロード時に元の画像が保持されます。';
       ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

       // Row 3: Headers
       const headers = ['No.', '工程名', '作業内容/注意事項', '目標時間(秒)', '種別', '画像枚数'];
       const headerRow = ws.getRow(3);
       headers.forEach((h, i) => {
         const cell = headerRow.getCell(i + 1);
         cell.value = h;
         cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
         cell.border = allBorder;
         cell.alignment = { vertical: 'middle', horizontal: 'center' };
       });

       // Column widths
       ws.getColumn(1).width = 6;
       ws.getColumn(2).width = 28;
       ws.getColumn(3).width = 50;
       ws.getColumn(4).width = 14;
       ws.getColumn(5).width = 18;
       ws.getColumn(6).width = 12;

       // Row 4+: Step data with embedded images
       for (let idx = 0; idx < template.steps.length; idx++) {
         const step = template.steps[idx];
         const rowNum = 4 + idx;
         const row = ws.getRow(rowNum);
         row.getCell(1).value = idx + 1;
         row.getCell(2).value = step.title || '';
         row.getCell(3).value = step.description || '';
         row.getCell(4).value = step.targetTime || 0;
         row.getCell(5).value = step.type || 'normal';

         const imgCount = step.images?.length || 0;
         row.getCell(6).value = imgCount;
         if (imgCount > 0) {
           row.getCell(6).font = { color: { argb: 'FF2563EB' } };
         }

         // Embed first image per step into column G
         if (step.images && step.images.length > 0) {
           try {
             const imgData = step.images[0];
             const ext = imgData.startsWith('data:image/png') ? 'png' : 'jpeg';
             const base64Only = imgData.split(',')[1];
             if (base64Only) {
               const imageId = wb.addImage({ base64: base64Only, extension: ext });
               ws.addImage(imageId, {
                 tl: { col: 6, row: rowNum - 1 },
                 ext: { width: 120, height: 90 }
               });
               row.height = 72;
               if (!ws.getColumn(7).width || ws.getColumn(7).width < 18) ws.getColumn(7).width = 18;
             }
           } catch (imgErr) { /* skip broken image */ }
         }

         for (let c = 1; c <= 6; c++) {
           row.getCell(c).border = allBorder;
           row.getCell(c).alignment = { vertical: 'middle', wrapText: c === 3 };
         }
       }

       const buf = await wb.xlsx.writeBuffer();
       const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
       const a = document.createElement('a');
       a.href = URL.createObjectURL(blob);
       a.download = `${template.name || 'template'}_template.xlsx`;
       a.click();
     } catch (err) {
       console.error(err);
       alert('Excelファイルの生成に失敗しました');
     }
   };

   // 2. Backup Export
   const handleBackupExport = () => {
     const data = { templates, workers, settings, savedAt: Date.now() };
     const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `product_inspection_backup_${new Date().toISOString().slice(0,10)}.json`;
     a.click();
   };
 
   // 3. Backup Import
   const handleBackupImport = (e) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (ev) => {
       try {
         const data = JSON.parse(ev.target?.result);
         if (confirm('現在のデータを上書きして復元しますか？')) {
           if (data.templates) data.templates.forEach(t => saveData('templates', t.id, t));
           if (data.workers) data.workers.forEach(w => saveData('workers', w.id, w));
           if (data.settings) saveSettings(data.settings);
           alert('復元が完了しました');
         }
       } catch {
         alert('ファイルの読み込みに失敗しました');
       }
     };
     reader.readAsText(file);
     e.target.value = '';
   };
 
   const handleAddLot = async (formData) => {
     const { model, orderNo, quantity, templateId, priority, dueDate, entryAt } = formData;
     
     let steps = DEMO_STEPS;
     const template = templates.find(t => t.id === templateId);
     if (template && template.steps) {
       steps = template.steps;
     }
 
     // 機番を収集
     const qty = Number(quantity) || 1;
     const serials = [];
     for (let i = 0; i < qty; i++) {
       serials.push(formData[`serial_${i}`] || `#${i + 1}`);
     }

     const batchId = generateId();
     const timestamp = Date.now();
     const entryTimestamp = entryAt ? new Date(entryAt).getTime() : timestamp;
     
     if (editingLot) {
        await saveData('lots', editingLot.id, {
          model, orderNo, templateId, priority, dueDate, steps, quantity: qty,
          entryAt: entryTimestamp, unitSerialNumbers: serials
        });
        setEditingLot(null);
     } else {
        // Single document for the batch, with quantity field
        const id = generateId();
        const lot = {
            id, batchId, model, orderNo,
            serialNo: `${orderNo}`,
            quantity: qty,
            unitSerialNumbers: serials,
            templateId, priority: priority || 'normal',
            dueDate: dueDate || '',
            entryAt: entryTimestamp, 
            status: 'waiting', 
            location: 'arrival', 
            mapZoneId: null, 
            x: 0, y: 0, 
            workerId: null, 
            createdAt: timestamp,
            currentStepIndex: 0,
            steps: steps,
            totalWorkTime: 0,
            workStartTime: null,
            tasks: {},
            stepTimes: {},
            interruptions: []
        };
        await saveData('lots', id, lot);
        await saveData('logs', generateId(), { timestamp, type: 'CREATE', batchId, count: Number(quantity), model });
     }
     setShowLotModal(false);
   };

   // === Excel一括登録: テンプレートダウンロード ===
   const handleLotExcelDownload = async () => {
     const wb = new ExcelJS.Workbook();
     const ws = wb.addWorksheet('入荷登録');
     const headers = ['型式', '指図番号', '台数', 'テンプレートID', '優先度', '納期', '入庫日時', '機番1', '機番2', '機番3', '機番4', '機番5', '機番6', '機番7', '機番8', '機番9', '機番10'];
     ws.addRow(headers);
     const headerRow = ws.getRow(1);
     headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
     headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
     headerRow.alignment = { horizontal: 'center' };
     headers.forEach((_, i) => { headerRow.getCell(i + 1).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });

     // 既存ロットを記載
     const existingLots = lots.filter(l => l.location !== 'completed');
     if (existingLots.length > 0) {
       existingLots.forEach(lot => {
         const row = [lot.model, lot.orderNo, lot.quantity, lot.templateId || '', lot.priority === 'high' ? '急ぎ' : '通常', lot.dueDate || '', lot.entryAt ? new Date(lot.entryAt).toISOString().slice(0, 16).replace('T', ' ') : ''];
         for (let i = 0; i < (lot.quantity || 1); i++) row.push(lot.unitSerialNumbers?.[i] || `#${i+1}`);
         ws.addRow(row);
       });
     } else {
       // サンプル行（ロットがない場合のみ）
       ws.addRow(['A-100', 'M-001', 2, templates[0]?.id || 'demo', '通常', '2026-04-01', '', 'SN-001', 'SN-002']);
     }

     // テンプレート一覧シート
     const ws2 = wb.addWorksheet('テンプレート一覧');
     ws2.addRow(['テンプレートID', 'テンプレート名']);
     ws2.getRow(1).font = { bold: true };
     ws2.addRow(['demo', '詳細デモ手順 (4工程)']);
     templates.forEach(t => ws2.addRow([t.id, t.name]));

     // 列幅
     ws.columns = headers.map((h, i) => ({ width: i < 7 ? 18 : 12 }));
     // 注意書き
     ws.addRow([]);
     ws.addRow(['※ 優先度: 通常 or 急ぎ']);
     ws.addRow(['※ 入庫日時: 空欄の場合は現在日時が設定されます']);
     ws.addRow(['※ テンプレートIDは「テンプレート一覧」シートを参照']);

     const buf = await wb.xlsx.writeBuffer();
     const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = `入荷登録テンプレート_${new Date().toISOString().slice(0, 10)}.xlsx`;
     a.click();
   };

   // === Excel一括登録: アップロード処理 ===
   const handleLotExcelUpload = async (e) => {
     const file = e.target.files[0];
     if (!file) return;
     e.target.value = '';
     try {
       const wb = new ExcelJS.Workbook();
       const buf = await file.arrayBuffer();
       await wb.xlsx.load(buf);
       const ws = wb.getWorksheet('入荷登録') || wb.getWorksheet(1);
       if (!ws) { alert('シートが見つかりません'); return; }

       const rows = [];
       ws.eachRow((row, rowNum) => {
         if (rowNum === 1) return; // ヘッダースキップ
         const model = row.getCell(1).value?.toString?.() || row.getCell(1).value;
         const orderNo = row.getCell(2).value?.toString?.() || row.getCell(2).value;
         if (!model || !orderNo) return; // 空行スキップ
         const qty = parseInt(row.getCell(3).value) || 1;
         const templateId = row.getCell(4).value?.toString?.() || 'demo';
         const priorityRaw = row.getCell(5).value?.toString?.() || '通常';
         const priority = priorityRaw === '急ぎ' ? 'high' : 'normal';
         const dueDate = row.getCell(6).value?.toString?.() || '';
         const entryAtRaw = row.getCell(7).value;
         const entryAt = entryAtRaw ? new Date(entryAtRaw).getTime() : Date.now();

         const serials = [];
         for (let i = 0; i < qty; i++) {
           const sn = row.getCell(8 + i).value?.toString?.() || '';
           serials.push(sn || `#${i + 1}`);
         }
         rows.push({ model, orderNo, qty, templateId, priority, dueDate, entryAt, serials });
       });

       if (rows.length === 0) { alert('有効なデータ行がありません'); return; }

       // 重複チェック: 指図番号で既存ロットと照合
       let newCount = 0, updateCount = 0, skipCount = 0;
       const details = [];

       for (const row of rows) {
         const existing = lots.find(l => l.orderNo === row.orderNo);

         if (existing && existing.status === 'processing') {
           // 作業中のロットは無視
           skipCount++;
           details.push(`⏭ ${row.orderNo} — 作業中のため無視`);
           continue;
         }

         let steps = DEMO_STEPS;
         const template = templates.find(t => t.id === row.templateId);
         if (template?.steps) steps = template.steps;

         if (existing) {
           // 既存ロットを上書き（作業中以外）
           const updates = {
             model: row.model, quantity: row.qty,
             unitSerialNumbers: row.serials,
             templateId: row.templateId, priority: row.priority,
             dueDate: row.dueDate, entryAt: row.entryAt, steps
           };
           await saveData('lots', existing.id, updates);
           updateCount++;
           details.push(`🔄 ${row.orderNo} — 上書き更新`);
         } else {
           // 新規登録
           const id = generateId();
           const lot = {
             id, batchId: generateId(), model: row.model, orderNo: row.orderNo,
             serialNo: row.orderNo, quantity: row.qty, unitSerialNumbers: row.serials,
             templateId: row.templateId, priority: row.priority, dueDate: row.dueDate,
             entryAt: row.entryAt, status: 'waiting', location: 'arrival',
             mapZoneId: null, x: 0, y: 0, workerId: null, createdAt: Date.now(),
             currentStepIndex: 0, steps, totalWorkTime: 0, workStartTime: null,
             tasks: {}, stepTimes: {}, interruptions: []
           };
           await saveData('lots', id, lot);
           newCount++;
           details.push(`✅ ${row.orderNo} — 新規登録`);
         }
       }

       const msg = [`処理完了:`, `  新規: ${newCount}件`, `  上書き: ${updateCount}件`, `  無視(作業中): ${skipCount}件`, '', ...details].join('\n');
       if (!confirm(msg + '\n\nOKで確定')) return;
       alert(`✅ 完了 — 新規${newCount}件 / 上書き${updateCount}件 / 無視${skipCount}件`);
     } catch (err) {
       console.error(err);
       alert('Excelファイルの読み込みに失敗しました: ' + err.message);
     }
   };

   const handleMoveLot = async (lotId, newLocation, workerId = null) => {
     const lot = lots.find(l => l.id === lotId);
     if (!lot) return;
 
     // Location Logic for Dual Display (List & Map)
     // 1. Move to "Worker Planned" (Buffer)
     if (newLocation === 'planned') {
        // Updates: location='planned', workerId=workerId, mapZoneId=keep existing(if any)
        const updates = { location: 'planned' };
        if (workerId) updates.workerId = workerId;
        await saveData('lots', lotId, updates);
     } 
     // 2. Move to Map Zone (from Planned or Map)
     else if (newLocation !== 'arrival' && newLocation !== 'completed' && newLocation !== 'planned') {
        // This is a zone ID.
        // Updates: mapZoneId=zoneId, workerId=keep or auto-assign, location='planned' (to keep in list)
        const updates = { mapZoneId: newLocation };
        if (!lot.workerId && selectedWorker) updates.workerId = selectedWorker.id;
        // Ensure it stays in 'planned' list so it's visible in both
        if (lot.location === 'arrival') updates.location = 'planned'; 
        
        await saveData('lots', lotId, updates);
     }
     // 3. Move to Completed
     else if (newLocation === 'completed') {
        await saveData('lots', lotId, { location: 'completed', status: 'completed', workStartTime: null });
     }
     // 4. Move back to Arrival
     else if (newLocation === 'arrival') {
        await saveData('lots', lotId, { location: 'arrival', mapZoneId: null, workerId: null });
     }
   };
   // タッチD&D用にグローバル公開
   useEffect(() => { window.__handleMoveLot = handleMoveLot; return () => { delete window.__handleMoveLot; }; });
 
   const handleDropOnMap = (e) => {
       e.preventDefault();
       // Drop handling is now done by individual Zone/InteractiveMap components
   };
 
   const getWorkerName = (id) => workers.find(w => w.id === id)?.name || '未割当';
 
   // --- Export ---
   const exportToCSV = () => {
     const headers = ['ID', '型式', '指図番号', '数量', '状態', '場所', '現在工程', '作業時間(秒)', '担当者', '登録日時', '入庫日時'];
     const rows = lots.map(l => [
       l.id, l.model, l.orderNo, l.quantity, l.status, l.location,
       l.steps?.[l.currentStepIndex]?.title || '-',
       Math.floor((l.totalWorkTime || 0) / 1000),
       getWorkerName(l.workerId),
       new Date(l.createdAt).toLocaleString(),
       l.entryAt ? new Date(l.entryAt).toLocaleString() : '-'
     ]);
     const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
     const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `product_inspection_${new Date().toISOString().slice(0,10)}.csv`;
     link.click();
   };
 
   const handleImageUpload = (e) => {
     const file = e.target.files[0];
     if (file) {
         const reader = new FileReader();
         reader.onloadend = () => {
             saveSettings({ mapImage: reader.result });
         };
         reader.readAsDataURL(file);
     }
   };
 
   // --- Template Management ---
   const handleSaveTemplate = (templateData) => {
     const id = templateData.id || generateId();
     saveData('templates', id, { ...templateData, id });
     setEditingTemplate(null);
   };
   
   // --- Lot Edit Handlers ---
   const onEditLot = (lot) => {
     setEditingLot(lot);
     setLotFormQty(lot.quantity || 1);
     setShowLotModal(true);
   };
   
   const onDeleteLot = (id) => {
     if(confirm('このロットを削除しますか？\n（関連する作業ログは残ります）')) {
        deleteData('lots', id);
     }
   };
 
   return (
     <div className="h-screen bg-slate-100 font-sans flex flex-col text-slate-900 overflow-hidden relative">
       {showBreakAlert && (
         <div className="absolute top-0 left-0 right-0 bg-orange-500 text-white z-[100] p-4 flex justify-between items-center shadow-lg">
           <div className="flex items-center gap-3 text-lg font-bold"><Bell className="w-6 h-6 animate-bounce" />{String(showBreakAlert)}</div>
           <button onClick={() => setShowBreakAlert(null)} className="bg-white/20 hover:bg-white/30 rounded-full p-1"><X className="w-6 h-6" /></button>
         </div>
       )}
       {/* お知らせ通知バナー */}
       {announceBanner && (
         <div className="absolute top-0 left-0 right-0 bg-purple-600 text-white z-[100] p-4 flex justify-between items-center shadow-lg animate-pulse">
           <div className="flex items-center gap-3">
             <Megaphone className="w-6 h-6 shrink-0"/>
             <div>
               <div className="text-lg font-black">{announceBanner.title}</div>
               {announceBanner.content && <div className="text-sm opacity-90">{announceBanner.content}</div>}
             </div>
           </div>
           <button onClick={() => setAnnounceBanner(null)} className="bg-white/20 hover:bg-white/30 rounded-full p-2 shrink-0"><X className="w-6 h-6" /></button>
         </div>
       )}
       <header data-fs="header" className="h-14 bg-slate-800 text-white flex items-center justify-between px-6 shadow-md z-50 shrink-0">
         <div className="flex items-center gap-3">
           <div className="bg-blue-600 p-1.5 rounded"><Layout className="w-5 h-5 text-white" /></div>
           <h1 className="font-bold text-lg tracking-tight">製品検査アプリ <span className="text-xs font-normal text-slate-400 ml-1">Pro</span></h1>
           <div className="h-6 w-px bg-slate-600 mx-1"/>
           {currentUserName ? (
             <div className="flex items-center gap-1.5 bg-slate-700 rounded-full pl-2 pr-1 py-0.5">
               <User className="w-3.5 h-3.5 text-emerald-400"/>
               <span className="text-sm font-bold text-emerald-300">{currentUserName}</span>
               <button onClick={() => selectUser('')} className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-600"><X className="w-3 h-3"/></button>
             </div>
           ) : (
             <select onChange={e => selectUser(e.target.value)} value="" className="bg-transparent border border-red-400 rounded px-2 py-0.5 text-sm font-bold text-red-400 animate-pulse cursor-pointer">
               <option value="" className="text-slate-800">⚠ 使用者選択</option>
               {workers.map(w => <option key={w.id} value={w.name} className="text-slate-800">{w.name}</option>)}
               <option value="フリー" className="text-slate-800">フリー</option>
               <option value="管理者" className="text-slate-800">管理者</option>
             </select>
           )}
         </div>
         <div className="flex items-center gap-4">
           <div className="flex bg-slate-200 p-1 rounded-lg">
              {[
                { id: 'main', label: '現場マップ', icon: MapIcon },
                { id: 'inspection', label: '検査リスト', icon: ListChecks },
                { id: 'analysis', label: '分析', icon: BarChart3 },
                { id: 'history', label: '完了履歴', icon: CheckSquare },
                { id: 'template-mgr', label: '工程テンプレート', icon: ClipboardList },
                { id: 'templates', label: 'マスタ設定', icon: Settings },
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setViewMode('dashboard'); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <tab.icon className="w-4 h-4" /> {tab.label}
                </button>
              ))}
           </div>
           <div className="flex items-center gap-1">
             <button onClick={() => activeIndirect ? setShowIndirectModal(true) : setShowIndirectModal(true)} className={`relative px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 shadow-sm ${activeIndirect ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse' : 'bg-amber-600 hover:bg-amber-700 text-white'}`} title="間接作業">
               <Coffee className="w-3.5 h-3.5" /> {activeIndirect ? `${activeIndirect.category}...` : '間接作業'}
             </button>
             <button onClick={() => setShowDailySummary(true)} className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 shadow-sm" title="日次集計">
               <Clock className="w-3.5 h-3.5" /> 日次集計
             </button>
             <button onClick={() => setShowNoteModal(true)} className="relative bg-slate-600 hover:bg-slate-500 text-white px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 shadow-sm" title="個人ノート">
               <FileText className="w-3.5 h-3.5" /> ノート
               {notes.filter(n => n.isPersonal && n.author === selectedWorker?.name).length > 0 && <span className="absolute -top-1 -right-1 bg-amber-400 text-[9px] text-white rounded-full w-4 h-4 flex items-center justify-center font-black">{notes.filter(n => n.isPersonal && n.author === selectedWorker?.name).length}</span>}
             </button>
             <button onClick={() => setShowAnnouncementModal(true)} className="relative bg-purple-600 hover:bg-purple-500 text-white px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 shadow-sm" title="お知らせ">
               <Megaphone className="w-3.5 h-3.5" /> お知らせ
               {(() => { const unread = announcements.filter(a => (a.mode || 'confirm') === 'confirm' && !(a.confirmedBy || []).includes(currentUserName)).length; return unread > 0 ? <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] text-white rounded-full w-4 h-4 flex items-center justify-center font-black">{unread}</span> : null; })()}
             </button>
             <button onClick={() => { setEditingLot(null); setLotFormQty(1); setShowLotModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm">
               <Plus className="w-4 h-4" /> 入荷登録
             </button>
           </div>
         </div>
       </header>
       
       <main className="flex-1 overflow-hidden relative bg-slate-100 p-4 h-[calc(100vh-3.5rem)]">
         {activeTab === 'main' && (
           <div className="h-full">
             {viewMode === 'dashboard' && <DashboardView onSetMode={setViewMode} lots={lots} workers={workers} handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} setExecutionLotId={setExecutionLotId} settings={settings} templates={templates} onEditLot={onEditLot} onDeleteLot={onDeleteLot} handleImageUpload={handleImageUpload} saveSettings={saveSettings} mapZones={settings.mapZones} currentUserName={currentUserName} />}
             {viewMode === 'arrival-planning' && <ArrivalPlanningView onBack={() => setViewMode('dashboard')} lots={lots} workers={workers} templates={templates} handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} handleAddWorker={handleAddWorker} onEditLot={onEditLot} onDeleteLot={onDeleteLot} mapZones={settings.mapZones} />}
             {viewMode === 'planning-execution' && <PlanningExecutionView onBack={() => setViewMode('dashboard')} workers={workers} lots={lots} templates={templates} handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} setSelectedWorker={setSelectedWorker} handleImageUpload={handleImageUpload} settings={settings} mapRef={mapRef} handleDropOnMap={handleDropOnMap} setExecutionLotId={setExecutionLotId} onEditLot={onEditLot} onDeleteLot={onDeleteLot} saveSettings={saveSettings} mapZones={settings.mapZones} currentUserName={currentUserName} />}
             {viewMode === 'completed-list' && <CompletedListView onBack={() => setViewMode('dashboard')} lots={lots} workers={workers} templates={templates} mapZones={settings.mapZones} saveData={saveData} onEditLot={onEditLot} onDeleteLot={onDeleteLot} />}
             {viewMode === 'map-only' && <MapOnlyView onBack={() => setViewMode('dashboard')} lots={lots} workers={workers} templates={templates} handleMoveLot={handleMoveLot} saveData={saveData} setDraggedLotId={setDraggedLotId} draggedLotId={draggedLotId} setExecutionLotId={setExecutionLotId} settings={settings} handleImageUpload={handleImageUpload} saveSettings={saveSettings} mapZones={settings.mapZones} onEditLot={onEditLot} onDeleteLot={onDeleteLot} />}
           </div>
         )}
         {activeTab === 'inspection' && <InspectionListView lots={lots} workers={workers} templates={templates} settings={settings} onEditLot={onEditLot} onDeleteLot={onDeleteLot} setExecutionLotId={setExecutionLotId} />}
         {activeTab === 'analysis' && <AnalysisView lots={lots} logs={logs} workers={workers} saveData={saveData} settings={settings} saveSettings={saveSettings} currentUserName={currentUserName} indirectWork={indirectWork} />}
         {activeTab === 'history' && <HistoryView lots={lots} workers={workers} templates={templates} saveData={saveData} onEditLot={onEditLot} onDeleteLot={onDeleteLot} />}
         {activeTab === 'template-mgr' && (
           editingTemplate ? (
             <div className="p-4 h-full flex flex-col overflow-hidden">
               <TemplateEditor template={editingTemplate} onSave={handleSaveTemplate} onCancel={() => setEditingTemplate(null)} customLayouts={settings?.customLayouts || {}} onSaveLayouts={(layouts) => saveSettings({ customLayouts: layouts })} comboPresets={settings?.comboPresets || []} />
             </div>
           ) : (
             <div className="p-8 max-w-5xl mx-auto space-y-6 h-full overflow-y-auto">
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardList className="w-5 h-5" /> 工程テンプレート管理</h3>
                   <div className="flex gap-2">
                     <label className="text-xs flex items-center gap-1 cursor-pointer bg-green-50 text-green-700 px-3 py-2 rounded border border-green-200 hover:bg-green-100"><FileUp className="w-4 h-4"/> Excel取込<input type="file" ref={excelInputRef} accept=".xlsx" onChange={handleExcelImport} className="hidden"/></label>
                     <button onClick={handleBackupExport} className="text-xs flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-2 rounded border hover:bg-slate-200"><DownloadCloud className="w-4 h-4"/> バックアップ</button>
                     <label className="text-xs flex items-center gap-1 cursor-pointer bg-slate-100 text-slate-600 px-3 py-2 rounded border hover:bg-slate-200"><RefreshCw className="w-4 h-4"/> 復元<input type="file" ref={backupInputRef} accept=".json" onChange={handleBackupImport} className="hidden"/></label>
                   </div>
                 </div>
                 <button onClick={() => setEditingTemplate({ id: '', name: '', steps: [] })} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 font-bold mb-4">+ 新規テンプレート作成</button>
                 <div className="space-y-3">
                   {templates.map(t => (
                     <div key={t.id} className="border rounded-lg p-4 flex justify-between items-center group hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setEditingTemplate(t)}>
                       <div><div className="font-bold text-slate-800 group-hover:text-blue-600">{t.name}</div><div className="text-xs text-slate-500 mt-1">全 {t.steps?.length || 0} 工程</div></div>
                       <div className="flex items-center gap-2">
                         <button onClick={(e) => { e.stopPropagation(); handleExcelDownload(t); }} className="p-2 text-slate-400 hover:text-emerald-600 bg-slate-50 rounded" title="Excel出力"><FileSpreadsheet className="w-4 h-4"/></button>
                         <button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ ...t, id: '', name: t.name + ' (コピー)', steps: t.steps?.map(s => ({...s, id: generateId()})) || [] }); }} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded" title="複製"><Copy className="w-4 h-4"/></button>
                         <button onClick={(e) => { e.stopPropagation(); setEditingTemplate(t); }} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded" title="編集"><Pencil className="w-4 h-4"/></button>
                         <button onClick={(e) => { e.stopPropagation(); deleteData('templates', t.id); }} className="p-2 text-slate-400 hover:text-rose-600 bg-slate-50 rounded" title="削除"><Trash2 className="w-4 h-4"/></button>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           )
         )}
         {activeTab === 'templates' && <TemplatesView editingTemplate={editingTemplate} setEditingTemplate={setEditingTemplate} handleSaveTemplate={handleSaveTemplate} workers={workers} saveData={saveData} deleteData={deleteData} templates={templates} handleExcelImport={handleExcelImport} handleExcelDownload={handleExcelDownload} handleBackupExport={handleBackupExport} handleBackupImport={handleBackupImport} excelInputRef={excelInputRef} backupInputRef={backupInputRef} settings={settings} saveSettings={saveSettings} mapZones={settings.mapZones} />}
       </main>
       
       {/* Note Modal */}
       {/* Indirect Work Modal */}
       {showIndirectModal && <IndirectWorkModal
         categories={settings.indirectCategories || DEFAULT_INDIRECT_CATEGORIES}
         activeIndirect={activeIndirect}
         onStart={(cat) => {
           const id = `iw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
           const entry = { id, category: cat, startTime: Date.now(), workerName: currentUserName };
           setActiveIndirect(entry);
           setShowIndirectModal(false);
         }}
         onStop={() => {
           if (activeIndirect) {
             const dur = Math.floor((Date.now() - activeIndirect.startTime) / 1000);
             saveData('indirectWork', activeIndirect.id, { ...activeIndirect, duration: dur, endTime: Date.now(), createdAt: Date.now() });
             setActiveIndirect(null);
           }
           setShowIndirectModal(false);
         }}
         onClose={() => setShowIndirectModal(false)}
       />}
       {/* Daily Summary Modal */}
       {showDailySummary && <DailySummaryModal lots={lots} indirectWork={indirectWork} currentUserName={currentUserName} workers={workers} settings={settings} saveData={saveData} onClose={() => setShowDailySummary(false)} />}

       {showNoteModal && <NoteModal notes={notes} templates={templates} workers={workers} selectedWorker={selectedWorker} saveData={saveData} deleteData={deleteData} onClose={() => setShowNoteModal(false)} currentUserName={currentUserName} />}

       {/* Announcement Modal */}
       {showAnnouncementModal && <AnnouncementModal announcements={announcements} workers={workers} selectedWorker={selectedWorker} saveData={saveData} deleteData={deleteData} onClose={() => setShowAnnouncementModal(false)} currentUserName={currentUserName} />}

       {/* Execution Modal */}
       {executionLotId && (
         <WorkExecutionModal
           lot={lots.find(l => l.id === executionLotId)}
           onClose={() => setExecutionLotId(null)}
           onSave={(updates) => saveData('lots', executionLotId, updates)}
           onFinish={() => { setExecutionLotId(null); setActiveTab('history'); }}
           defectProcessOptions={settings.defectProcessOptions}
           complaintOptions={settings.complaintOptions}
           lots={lots}
           comboPresets={settings.comboPresets || []}
           voiceSettingsConfig={settings.voiceSettings || {}}
           voiceCommandsConfig={settings.voiceCommands || null}
           undoTimeout={settings.undoTimeout || 5}
           sharedNotes={notes.filter(n => !n.isPersonal)}
         />
       )}
 
       {showLotModal && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
           <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> {editingLot ? 'ロット情報編集' : '新規ロット登録'}</h2>
               <div className="flex gap-2">
                 <button onClick={handleLotExcelDownload} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded text-xs font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5"/> Excel雛形</button>
                 <label className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"><Upload className="w-3.5 h-3.5"/> Excel取込<input type="file" ref={lotExcelInputRef} accept=".xlsx" onChange={handleLotExcelUpload} className="hidden"/></label>
               </div>
             </div>
             <form onSubmit={(e) => {
               e.preventDefault();
               handleAddLot(Object.fromEntries(new FormData(e.target)));
             }} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">型式 (Model)</label>
                    <input name="model" defaultValue={editingLot?.model} required className="w-full border rounded p-2 bg-slate-50" placeholder="例: A-100" />
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">指図番号</label>
                    <input name="orderNo" defaultValue={editingLot?.orderNo} required className="w-full border rounded p-2 bg-slate-50" placeholder="例: 001" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">台数</label>
                    {/* 編集時は台数変更不可 */}
                    <input name="quantity" type="number" min="1" value={lotFormQty} onChange={e => !editingLot && setLotFormQty(Math.max(1, parseInt(e.target.value) || 1))} disabled={!!editingLot} className="w-full border rounded p-2 bg-slate-50 disabled:opacity-50" />
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">適用テンプレート</label>
                    <select name="templateId" defaultValue={editingLot?.templateId} className="w-full border rounded p-2 bg-slate-50">
                      <option value="demo">詳細デモ手順 (4工程)</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">優先度</label>
                    <select name="priority" defaultValue={editingLot?.priority || 'normal'} className="w-full border rounded p-2 bg-slate-50">
                      <option value="normal">通常</option>
                      <option value="high">急ぎ</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">納期</label>
                    <input name="dueDate" defaultValue={editingLot?.dueDate} type="date" className="w-full border rounded p-2 bg-slate-50" />
                 </div>
               </div>
 
               {/* Added: Entry Date Field */}
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">入庫日時</label>
                  <input
                    name="entryAt"
                    type="datetime-local"
                    defaultValue={editingLot?.entryAt ? toDatetimeLocal(editingLot.entryAt) : toDatetimeLocal(Date.now())}
                    className="w-full border rounded p-2 bg-slate-50"
                  />
               </div>

               {/* 機番入力 */}
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">機番 (台数分)</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2 bg-slate-50">
                    {Array.from({ length: lotFormQty }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-8 text-right shrink-0">#{i+1}</span>
                        <input name={`serial_${i}`} defaultValue={editingLot?.unitSerialNumbers?.[i] || ''} placeholder={`機番 ${i+1}`} className="flex-1 border rounded px-2 py-1 text-sm bg-white" />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">空欄の場合は #1, #2... が自動設定されます</p>
               </div>
 
               <div className="flex justify-end gap-3 mt-8">
                 <button type="button" onClick={() => setShowLotModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded font-bold">キャンセル</button>
                 <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700">{editingLot ? '更新' : '登録実行'}</button>
               </div>
             </form>
           </div>
         </div>
       )}

     </div>
   );
 }