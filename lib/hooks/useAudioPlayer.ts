'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * WAV の Object URL を <audio> 要素で再生する。
 *
 * AudioBufferSourceNode を自前で走らせるより <audio> に任せた方が、
 * シーク・一時停止・音量・ended の扱いをブラウザに寄せられて実装が単純になる。
 * ダウンロード用の Blob も同じものを使い回せるのでメモリも二重に持たない。
 */
export function useAudioPlayer(url: string | null, fallbackDuration = 0) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [volume, setVolumeState] = useState(0.9);

  // <audio> は DOM に載せず、インスタンスだけ持つ
  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const a = getAudio();
    const onEnded = () => setIsPlaying(false);
    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    a.addEventListener('ended', onEnded);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('durationchange', onLoaded);
    a.addEventListener('pause', onPause);
    a.addEventListener('play', onPlay);
    return () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('durationchange', onLoaded);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('play', onPlay);
    };
  }, [getAudio]);

  // 再生中だけ rAF で現在位置を追う（timeupdate より滑らか）
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const a = audioRef.current;
      if (a) setCurrentTime(a.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

  // 音源の差し替え。停止に伴う state の更新は pause イベント経由で行われる
  // （曲ごとに key を付けてこのフックごと作り直すので、ここでは初期化だけでよい）
  useEffect(() => {
    const a = getAudio();
    if (url) {
      a.src = url;
      a.load();
    } else {
      a.removeAttribute('src');
    }
    return () => {
      a.pause();
    };
  }, [url, getAudio]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = volume;
  }, [volume]);

  const play = useCallback(async () => {
    const a = getAudio();
    if (!a.src) return;
    try {
      await a.play();
      setIsPlaying(true);
    } catch {
      // 自動再生ポリシーで弾かれた場合など。ユーザー操作からもう一度呼べば通る
      setIsPlaying(false);
    }
  }, [getAudio]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  const seek = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    const clamped = Math.max(0, Math.min(a.duration || sec, sec));
    a.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0, Math.min(1, v)));
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    play,
    pause,
    toggle,
    seek,
    setVolume,
  };
}
