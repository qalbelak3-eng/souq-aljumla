'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Trophy, Gift, ArrowDown, Volume2, VolumeX, Check, Copy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface LuckyWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Prize {
  id: string;
  label: string;
  subLabel: string;
  type: 'cashback' | 'coupon' | 'delivery' | 'try_again';
  value: number | string;
  color: string;
  textColor: string;
  probability: number; // weight
  couponCode?: string;
}

const PRIZES: Prize[] = [
  {
    id: 'p1',
    label: '500 د.ع',
    subLabel: 'رصيد أرباح 💰',
    type: 'cashback',
    value: 500,
    color: '#16a34a', // emerald
    textColor: '#ffffff',
    probability: 25,
  },
  {
    id: 'p2',
    label: 'توصيل مجاني',
    subLabel: 'كوبون شحن 🚚',
    type: 'coupon',
    value: 'LUCKYFREE',
    couponCode: 'LUCKYFREE',
    color: '#0284c7', // sky
    textColor: '#ffffff',
    probability: 20,
  },
  {
    id: 'p3',
    label: '1,000 د.ع',
    subLabel: 'رصيد أرباح 🎁',
    type: 'cashback',
    value: 1000,
    color: '#7c3aed', // purple
    textColor: '#ffffff',
    probability: 15,
  },
  {
    id: 'p4',
    label: 'حظ أوفر',
    subLabel: 'حاول غداً 🍀',
    type: 'try_again',
    value: 0,
    color: '#64748b', // slate
    textColor: '#ffffff',
    probability: 15,
  },
  {
    id: 'p5',
    label: '250 د.ع',
    subLabel: 'رصيد أرباح 💵',
    type: 'cashback',
    value: 250,
    color: '#ea580c', // orange
    textColor: '#ffffff',
    probability: 25,
  },
  {
    id: 'p6',
    label: 'خصم 5%',
    subLabel: 'كوبون للطلبية 🏷️',
    type: 'coupon',
    value: 'LUCKY5',
    couponCode: 'LUCKY5',
    color: '#d97706', // amber
    textColor: '#ffffff',
    probability: 15,
  },
  {
    id: 'p7',
    label: '2,500 د.ع',
    subLabel: 'جائزة ذهبية 👑',
    type: 'cashback',
    value: 2500,
    color: '#e11d48', // rose
    textColor: '#ffffff',
    probability: 5,
  },
  {
    id: 'p8',
    label: 'هدية فورية',
    subLabel: 'مع طلبيتك القادمة ✨',
    type: 'try_again',
    value: 0,
    color: '#0d9488', // teal
    textColor: '#ffffff',
    probability: 10,
  },
];

export default function LuckyWheelModal({ isOpen, onClose }: LuckyWheelModalProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [canSpin, setCanSpin] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sound generator using Web Audio API
  const playBeep = (freq: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const playVictoryFanfare = () => {
    if (isMuted) return;
    playBeep(440, 0.15, 'triangle');
    setTimeout(() => playBeep(554.37, 0.15, 'triangle'), 150);
    setTimeout(() => playBeep(659.25, 0.15, 'triangle'), 300);
    setTimeout(() => playBeep(880, 0.4, 'triangle'), 450);
  };

  // Check 24-hour daily spin limit
  const checkSpinEligibility = () => {
    const storageKey = user?.id ? `lucky_spin_${user.id}` : 'lucky_spin_guest';
    const lastSpinTime = localStorage.getItem(storageKey);
    if (!lastSpinTime) {
      setCanSpin(true);
      setTimeLeft('');
      return;
    }

    const diff = Date.now() - parseInt(lastSpinTime, 10);
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours

    if (diff < cooldown) {
      setCanSpin(false);
      const remaining = cooldown - diff;
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours} ساعة و ${minutes} دقيقة`);
    } else {
      setCanSpin(true);
      setTimeLeft('');
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkSpinEligibility();
      setWonPrize(null);
    }
  }, [isOpen, user]);

  // Draw wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;
    const totalSlices = PRIZES.length;
    const sliceAngle = (2 * Math.PI) / totalSlices;

    ctx.clearRect(0, 0, size, size);

    // Outer glow border
    ctx.beginPath();
    ctx.arc(center, center, radius + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, radius + 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    // Slices
    PRIZES.forEach((prize, index) => {
      const startAngle = index * sliceAngle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = prize.color;
      ctx.fill();

      // Border between slices
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = prize.textColor;

      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(prize.label, radius - 20, 0);

      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillText(prize.subLabel, radius - 20, 14);

      ctx.restore();
    });

    // Center Gold Pin
    ctx.beginPath();
    ctx.arc(center, center, 26, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    ctx.font = 'bold 14px system-ui';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁', center, center);
  }, []);

  const handleSpin = () => {
    if (isSpinning || !canSpin) return;

    setIsSpinning(true);
    setWonPrize(null);

    // Pick prize based on weighted probability
    const totalProb = PRIZES.reduce((sum, p) => sum + p.probability, 0);
    let rand = Math.random() * totalProb;
    let selectedIndex = 0;

    for (let i = 0; i < PRIZES.length; i++) {
      if (rand < PRIZES[i].probability) {
        selectedIndex = i;
        break;
      }
      rand -= PRIZES[i].probability;
    }

    const prize = PRIZES[selectedIndex];
    const sliceDeg = 360 / PRIZES.length;
    
    // Top pointer points to 270 deg (or 90 offset from standard 0 at 3 o'clock).
    // Target rotation to land slice at 270 degrees
    const sliceCenterAngle = selectedIndex * sliceDeg + sliceDeg / 2;
    const targetOffset = 270 - sliceCenterAngle;
    const fullSpins = (5 + Math.floor(Math.random() * 3)) * 360; // 5 to 7 full revolutions
    const finalRotation = rotation + fullSpins + ((targetOffset - (rotation % 360) + 360) % 360);

    setRotation(finalRotation);

    // Play ticking sounds
    const tickInterval = setInterval(() => {
      playBeep(800 + Math.random() * 200, 0.04, 'sine');
    }, 120);

    setTimeout(() => {
      clearInterval(tickInterval);
      setIsSpinning(false);
      setWonPrize(prize);
      playVictoryFanfare();

      // Record spin time in localStorage
      const storageKey = user?.id ? `lucky_spin_${user.id}` : 'lucky_spin_guest';
      localStorage.setItem(storageKey, Date.now().toString());
      checkSpinEligibility();

      // Handle prize reward
      if (prize.type === 'cashback' && typeof prize.value === 'number') {
        toast.success(`🎉 مبروك! ربحت ${prize.value.toLocaleString()} د.ع في رصيد أرباحك!`);
      } else if (prize.type === 'coupon') {
        toast.success(`🎉 مبروك! ربحت كود الخصم: ${prize.couponCode}`);
      }
    }, 4200);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('تم نسخ كود الخصم بنجاح! يمكنك لصقه في سلة التسوق');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs select-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-fadeIn" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl max-w-sm sm:max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl z-10 border border-amber-500/30 overflow-hidden my-auto animate-scaleUp">
        
        {/* Top Controls */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
              🎡
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-amber-400">چرخ الحظ والمكافآت 🎁</h3>
              <p className="text-[10px] text-slate-400">دوّر العجلة واربح رصيد وكوبونات يومية مجاناً!</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Wheel Container */}
        <div className="relative flex flex-col items-center justify-center py-2">
          {/* Top Indicator Arrow */}
          <div className="absolute top-0 z-20 text-amber-400 drop-shadow-[0_4px_8px_rgba(245,158,11,0.6)] animate-bounce">
            <ArrowDown className="w-8 h-8 fill-amber-400 text-amber-500 stroke-[2.5]" />
          </div>

          {/* Rotating Wheel Canvas */}
          <div className="relative p-2">
            <canvas
              ref={canvasRef}
              width={310}
              height={310}
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning ? 'transform 4.2s cubic-bezier(0.15, 0.95, 0.35, 1)' : 'none',
              }}
              className="rounded-full shadow-[0_0_35px_rgba(245,158,11,0.25)] max-w-[280px] max-h-[280px] sm:max-w-[310px] sm:max-h-[310px]"
            />
          </div>
        </div>

        {/* Result Announcement Box */}
        {wonPrize && (
          <div className="bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border-2 border-amber-400 p-3 rounded-2xl text-center space-y-2 animate-bounce">
            <div className="flex items-center justify-center gap-1.5 text-amber-300 font-black text-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{wonPrize.type === 'try_again' ? '🍀 حظ أوفر!' : '🎉 ألف مبروك الفوز!'}</span>
            </div>
            
            <p className="text-white font-bold text-xs">
              {wonPrize.label} - {wonPrize.subLabel}
            </p>

            {wonPrize.couponCode && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="bg-slate-950 font-mono font-black text-amber-400 px-3 py-1 rounded-xl border border-amber-500/50 text-xs tracking-wider">
                  {wonPrize.couponCode}
                </span>
                <button
                  onClick={() => handleCopyCode(wonPrize.couponCode!)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-2.5 py-1 rounded-xl flex items-center gap-1 text-[11px] transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ الكود'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Button & Timer */}
        <div className="space-y-2 text-center pt-1">
          <button
            onClick={handleSpin}
            disabled={isSpinning || !canSpin}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm transition transform active:scale-95 shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
              isSpinning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : canSpin
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 hover:brightness-110 shadow-amber-500/30 ring-2 ring-amber-300'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
            }`}
          >
            {isSpinning ? (
              <span>جاري تدوير العجلة... 🎡</span>
            ) : canSpin ? (
              <>
                <span>دوّر العجلة الآن مجاناً 🚀</span>
                <Sparkles className="w-4 h-4" />
              </>
            ) : (
              <span>استخدمت لفة اليوم المجانية ⏳</span>
            )}
          </button>

          {!canSpin && timeLeft && (
            <p className="text-[11px] text-amber-400/90 font-bold">
              ⏰ اللفة المجانية القادمة ستتاح بعد: <span className="font-mono">{timeLeft}</span>
            </p>
          )}

          <p className="text-[10px] text-slate-400">
            💡 يحصل كل مستخدم على لفة حظ يومية مجانية لكسب رصيد أرباح أو كوبونات خصم فورية.
          </p>
        </div>

      </div>
    </div>
  );
}
