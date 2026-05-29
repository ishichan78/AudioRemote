// ============================================================
//  ControllerScreen.js（旧 IPhoneScreen）
//  ・再生 / 停止コマンドを送信
//  ・音量スライダー
//  ・バイブレーションコマンドを送信
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { database } from './firebaseConfig';
import { ref, onValue, set } from 'firebase/database';

const DEFAULT_VOLUME = 0.8;

// バイブレーションパターン定義
const VIBRATE_PATTERNS = [
  { key: 'short',   label: '短い',   icon: '・',  desc: '1回'  },
  { key: 'long',    label: '長い',   icon: '―',  desc: '3回'  },
  { key: 'pattern', label: 'パターン', icon: '∿', desc: '3連続' },
];

export default function ControllerScreen({ onReset }) {
  const [audioFiles, setAudioFiles] = useState([]);
  const [playingId,  setPlayingId]  = useState(null);
  const [connected,  setConnected]  = useState(false);
  const [volume,     setVolume]     = useState(DEFAULT_VOLUME);

  // ── Firebase: ファイル一覧を監視 ─────────────────────────────
  useEffect(() => {
    const filesRef = ref(database, 'audioFiles');
    return onValue(
      filesRef,
      (snapshot) => {
        setConnected(true);
        const data = snapshot.val();
        if (data) {
          const files = Object.entries(data)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
          setAudioFiles(files);
        } else {
          setAudioFiles([]);
        }
      },
      () => setConnected(false)
    );
  }, []);

  // ── Firebase: コマンドを監視して UI を同期 ───────────────────
  useEffect(() => {
    return onValue(ref(database, 'command'), (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      if (cmd.action === 'play')  setPlayingId(cmd.fileId);
      if (cmd.action === 'stop')  setPlayingId(null);
    });
  }, []);

  // ── Firebase: 音量を監視 ─────────────────────────────────────
  useEffect(() => {
    return onValue(ref(database, 'volume'), (snapshot) => {
      const v = snapshot.val();
      if (v !== null && typeof v === 'number') setVolume(v);
    });
  }, []);

  // ── コマンド送信（再生 / 停止） ───────────────────────────────
  const sendCommand = async (action, fileId = null) => {
    await set(ref(database, 'command'), {
      action, fileId, timestamp: Date.now(),
    });
    setPlayingId(action === 'play' ? fileId : null);
  };

  // ── バイブレーションコマンド送信 ─────────────────────────────
  const sendVibrate = async (pattern) => {
    await set(ref(database, 'command'), {
      action: 'vibrate', pattern, timestamp: Date.now(),
    });
  };

  // ── 音量送信（スライダーを離したとき） ───────────────────────
  const handleVolumeChange = async (value) => {
    setVolume(value);
    await set(ref(database, 'volume'), value);
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>📱 コントローラー</Text>
        </View>
        <View style={s.rightHeader}>
          <View style={s.badge}>
            <View style={[s.badgeDot, connected ? s.dotOn : s.dotOff]} />
            <Text style={s.badgeText}>{connected ? 'オンライン' : '接続中…'}</Text>
          </View>
          <TouchableOpacity onPress={onReset} style={s.resetBtn}>
            <Text style={s.resetText}>役割変更</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 音量スライダー */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardLabel}>🔈 音量</Text>
          <Text style={s.volumeValue}>{Math.round(volume * 100)}%</Text>
        </View>
        <Slider
          style={s.slider}
          minimumValue={0} maximumValue={1} step={0.01}
          value={volume}
          onValueChange={setVolume}
          onSlidingComplete={handleVolumeChange}
          minimumTrackTintColor="#00e5a0"
          maximumTrackTintColor="#1a1a30"
          thumbTintColor="#00e5a0"
        />
        <View style={s.sliderTicks}>
          <Text style={s.tick}>0%</Text>
          <Text style={s.tick}>50%</Text>
          <Text style={s.tick}>100%</Text>
        </View>
      </View>

      {/* バイブレーション */}
      <View style={s.card}>
        <Text style={s.cardLabel}>📳 バイブレーション</Text>
        <View style={s.vibrateRow}>
          {VIBRATE_PATTERNS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={s.vibrateBtn}
              onPress={() => sendVibrate(p.key)}
              activeOpacity={0.7}
            >
              <Text style={s.vibrateIcon}>{p.icon}</Text>
              <Text style={s.vibrateName}>{p.label}</Text>
              <Text style={s.vibrateDesc}>{p.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 全停止ボタン */}
      {playingId && (
        <TouchableOpacity
          style={s.stopAllBtn}
          onPress={() => sendCommand('stop')}
          activeOpacity={0.8}
        >
          <Text style={s.stopAllText}>⏹  すべて停止</Text>
        </TouchableOpacity>
      )}

      {/* ファイル一覧 */}
      <Text style={s.listLabel}>
        {audioFiles.length > 0 ? '再生する音声を選択' : ''}
      </Text>

      <FlatList
        data={audioFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const isPlaying = playingId === item.id;
          return (
            <TouchableOpacity
              style={[s.fileRow, isPlaying && s.fileRowPlaying]}
              onPress={() => isPlaying ? sendCommand('stop') : sendCommand('play', item.id)}
              activeOpacity={0.7}
            >
              <View style={[s.playIcon, isPlaying && s.playIconActive]}>
                <Text style={s.playIconText}>{isPlaying ? '⏹' : '▶'}</Text>
              </View>
              <Text style={s.fileName} numberOfLines={2}>{item.name}</Text>
              {isPlaying && (
                <View style={s.playingBadge}>
                  <Text style={s.playingBadgeText}>再生中</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📱</Text>
            <Text style={s.emptyTitle}>ファイル未登録</Text>
            <Text style={s.emptyDesc}>被制御端末で音声ファイルを{'\n'}登録してください</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#060608' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  rightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e0e18', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1a1a28',
  },
  badgeDot:    { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  dotOn:       { backgroundColor: '#00e5a0' },
  dotOff:      { backgroundColor: '#2a2a3a' },
  badgeText:   { color: '#5a5a7a', fontSize: 11 },
  resetBtn: {
    backgroundColor: '#1a1a2a', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#2a2a3a',
  },
  resetText:   { color: '#5a5a7a', fontSize: 11 },

  card: {
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: '#0e0e1a', borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderWidth: 1, borderColor: '#1a1a2e',
  },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:   { color: '#8888aa', fontSize: 13, fontWeight: '600' },
  volumeValue: { color: '#00e5a0', fontSize: 18, fontWeight: '800' },
  slider:      { width: '100%', height: 40 },
  sliderTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  tick:        { color: '#2a2a4a', fontSize: 10 },

  // バイブレーション
  vibrateRow:  { flexDirection: 'row', gap: 10, marginTop: 12 },
  vibrateBtn: {
    flex: 1, backgroundColor: '#16162a', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#7c6af7',
  },
  vibrateIcon: { fontSize: 20, marginBottom: 4 },
  vibrateName: { color: '#c0b8ff', fontSize: 13, fontWeight: '700' },
  vibrateDesc: { color: '#4a4a6a', fontSize: 10, marginTop: 2 },

  stopAllBtn: {
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: '#cc2244', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  stopAllText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  listLabel: {
    color: '#3a3a5a', fontSize: 11, fontWeight: '600',
    letterSpacing: 1, marginHorizontal: 20,
    marginTop: 20, marginBottom: 10,
    textTransform: 'uppercase',
  },
  list:        { paddingHorizontal: 20, paddingBottom: 50 },

  fileRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0c0c16', borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#181828',
  },
  fileRowPlaying: { borderColor: '#00e5a0', backgroundColor: '#040f0b' },
  playIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#00e5a0', alignItems: 'center',
    justifyContent: 'center', marginRight: 14,
  },
  playIconActive: { backgroundColor: '#cc2244' },
  playIconText:   { fontSize: 18, color: '#000000' },
  fileName:       { flex: 1, color: '#ccccdd', fontSize: 14, lineHeight: 20 },
  playingBadge: {
    backgroundColor: '#00e5a0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10,
  },
  playingBadgeText: { color: '#000000', fontSize: 11, fontWeight: '800' },

  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyIcon:   { fontSize: 48, marginBottom: 20 },
  emptyTitle:  { color: '#3a3a5a', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  emptyDesc:   { color: '#2a2a3a', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});