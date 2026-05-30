// ============================================================
//  ControllerScreen.js
//  ・再生 / 停止 / バイブコマンドを送信
//  ・音量スライダー
//  ・再生モード選択モーダル（1回 / ループ / 指定時刻まで）
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { database } from './firebaseConfig';
import { ref, onValue, set } from 'firebase/database';

const DEFAULT_VOLUME = 0.8;

const VIBRATE_PATTERNS = [
  { key: 'short',   label: '短い',     icon: '・', desc: '1回'   },
  { key: 'long',    label: '長い',     icon: '―', desc: '3回'   },
  { key: 'pattern', label: 'パターン', icon: '∿',  desc: '3連続' },
];

const PLAY_MODES = [
  { key: 'once',  label: '1回のみ再生',        icon: '▶',  desc: '最後まで再生して終了' },
  { key: 'loop',  label: '止めるまでリピート', icon: '🔁', desc: '停止コマンドまでループ' },
  { key: 'until', label: '指定時刻まで再生',   icon: '⏰', desc: '設定した時刻に自動停止' },
];

// ── 時刻選択コンポーネント ─────────────────────────────────────
const TimeUnit = ({ value, max, onChange, label }) => (
  <View style={ts.unit}>
    <TouchableOpacity
      style={ts.btn}
      onPress={() => onChange(value === max ? 0 : value + 1)}
    >
      <Text style={ts.arrow}>▲</Text>
    </TouchableOpacity>
    <Text style={ts.digit}>{value.toString().padStart(2, '0')}</Text>
    <TouchableOpacity
      style={ts.btn}
      onPress={() => onChange(value === 0 ? max : value - 1)}
    >
      <Text style={ts.arrow}>▼</Text>
    </TouchableOpacity>
    <Text style={ts.label}>{label}</Text>
  </View>
);

export default function ControllerScreen({ onReset }) {
  const [audioFiles,    setAudioFiles]   = useState([]);
  const [playingId,     setPlayingId]    = useState(null);
  const [playingMode,   setPlayingMode]  = useState(null);
  const [playingUntil,  setPlayingUntil] = useState(null);
  const [connected,     setConnected]    = useState(false);
  const [volume,        setVolume]       = useState(DEFAULT_VOLUME);

  // モーダル用
  const [modalVisible,  setModalVisible] = useState(false);
  const [selectedFile,  setSelectedFile] = useState(null);
  const [playMode,      setPlayMode]     = useState('once');
  const [untilHour,     setUntilHour]    = useState(() => new Date().getHours());
  const [untilMinute,   setUntilMinute]  = useState(() => {
    const m = new Date().getMinutes();
    return m < 55 ? m + 5 : 0;  // 現在時刻の5分後をデフォルトに
  });

  // ── Firebase 監視 ──────────────────────────────────────────
  useEffect(() => {
    return onValue(
      ref(database, 'audioFiles'),
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

  useEffect(() => {
    return onValue(ref(database, 'command'), (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      if (cmd.action === 'play') {
        setPlayingId(cmd.fileId);
        setPlayingMode(cmd.mode || 'once');
        setPlayingUntil(cmd.untilTime || null);
      }
      if (cmd.action === 'stop') {
        setPlayingId(null);
        setPlayingMode(null);
        setPlayingUntil(null);
      }
    });
  }, []);

  useEffect(() => {
    return onValue(ref(database, 'volume'), (snapshot) => {
      const v = snapshot.val();
      if (v !== null && typeof v === 'number') setVolume(v);
    });
  }, []);

  // ── コマンド送信 ──────────────────────────────────────────
  const sendCommand = async (action, fileId = null, mode = 'once', untilTime = null) => {
    await set(ref(database, 'command'), {
      action, fileId, mode, untilTime, timestamp: Date.now(),
    });
    if (action === 'play') {
      setPlayingId(fileId);
      setPlayingMode(mode);
      setPlayingUntil(untilTime);
    } else {
      setPlayingId(null);
      setPlayingMode(null);
      setPlayingUntil(null);
    }
  };

  const sendVibrate = async (pattern) => {
    await set(ref(database, 'command'), {
      action: 'vibrate', pattern, timestamp: Date.now(),
    });
  };

  const handleVolumeChange = async (value) => {
    setVolume(value);
    await set(ref(database, 'volume'), value);
  };

  // ── ファイルタップ ─────────────────────────────────────────
  const handleFilePress = (item) => {
    if (playingId === item.id) {
      sendCommand('stop');
      return;
    }
    setSelectedFile(item);
    setPlayMode('once');
    setModalVisible(true);
  };

  // ── 再生開始（モーダルから） ──────────────────────────────
  const handlePlay = () => {
    if (!selectedFile) return;
    const untilTime = playMode === 'until'
      ? `${untilHour.toString().padStart(2, '0')}:${untilMinute.toString().padStart(2, '0')}`
      : null;
    sendCommand('play', selectedFile.id, playMode, untilTime);
    setModalVisible(false);
  };

  // ── 再生中バッジのテキスト ────────────────────────────────
  const playingBadgeText = () => {
    if (playingMode === 'loop')  return '🔁 ループ';
    if (playingMode === 'until') return `⏰ 〜${playingUntil}`;
    return '▶ 再生中';
  };

  // ── UI ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📱 コントローラー</Text>
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

      {/* 音量 */}
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

      {/* 全停止 */}
      {playingId && (
        <TouchableOpacity style={s.stopAllBtn} onPress={() => sendCommand('stop')} activeOpacity={0.8}>
          <Text style={s.stopAllText}>⏹  すべて停止</Text>
        </TouchableOpacity>
      )}

      {/* ファイル一覧 */}
      <Text style={s.listLabel}>{audioFiles.length > 0 ? '再生する音声を選択' : ''}</Text>
      <FlatList
        data={audioFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const isPlaying = playingId === item.id;
          return (
            <TouchableOpacity
              style={[s.fileRow, isPlaying && s.fileRowPlaying]}
              onPress={() => handleFilePress(item)}
              activeOpacity={0.7}
            >
              <View style={[s.playIcon, isPlaying && s.playIconActive]}>
                <Text style={s.playIconText}>{isPlaying ? '⏹' : '▶'}</Text>
              </View>
              <Text style={s.fileName} numberOfLines={2}>{item.name}</Text>
              {isPlaying && (
                <View style={s.playingBadge}>
                  <Text style={s.playingBadgeText}>{playingBadgeText()}</Text>
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

      {/* ── 再生モード選択モーダル ───────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            {/* モーダルヘッダー */}
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>再生モード</Text>
            {selectedFile && (
              <Text style={s.modalFileName} numberOfLines={1}>
                🎵 {selectedFile.name}
              </Text>
            )}

            {/* モード選択 */}
            <View style={s.modeList}>
              {PLAY_MODES.map((m) => {
                const selected = playMode === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[s.modeRow, selected && s.modeRowSelected]}
                    onPress={() => setPlayMode(m.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.radio, selected && s.radioSelected]}>
                      {selected && <View style={s.radioDot} />}
                    </View>
                    <Text style={s.modeIcon}>{m.icon}</Text>
                    <View style={s.modeText}>
                      <Text style={[s.modeName, selected && s.modeNameSelected]}>{m.label}</Text>
                      <Text style={s.modeDesc}>{m.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 時刻選択（指定時刻モード時のみ表示） */}
            {playMode === 'until' && (
              <View style={s.timePicker}>
                <Text style={s.timePickerLabel}>停止時刻</Text>
                <View style={s.timePickerRow}>
                  <TimeUnit value={untilHour}   max={23} onChange={setUntilHour}   label="時" />
                  <Text style={s.timeColon}>:</Text>
                  <TimeUnit value={untilMinute} max={59} onChange={setUntilMinute} label="分" />
                </View>
                <Text style={s.timeNote}>
                  ※ 現在時刻より前の場合は翌日の同時刻まで再生
                </Text>
              </View>
            )}

            {/* ボタン */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={s.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.playBtn} onPress={handlePlay}>
                <Text style={s.playBtnText}>▶ 再生</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── TimeUnit スタイル ────────────────────────────────────────
const ts = StyleSheet.create({
  unit:   { alignItems: 'center', marginHorizontal: 8 },
  btn: {
    width: 44, height: 36, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#1a1a30',
    borderRadius: 8,
  },
  arrow:  { color: '#7c6af7', fontSize: 14, fontWeight: '700' },
  digit: {
    color: '#ffffff', fontSize: 36, fontWeight: '800',
    marginVertical: 4, minWidth: 52, textAlign: 'center',
  },
  label:  { color: '#3a3a5a', fontSize: 11, marginTop: 4 },
});

// ── メインスタイル ────────────────────────────────────────────
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
    marginTop: 20, marginBottom: 10, textTransform: 'uppercase',
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
    backgroundColor: '#1a2a1a', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10,
    borderWidth: 1, borderColor: '#00e5a0',
  },
  playingBadgeText: { color: '#00e5a0', fontSize: 11, fontWeight: '700' },

  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyIcon:   { fontSize: 48, marginBottom: 20 },
  emptyTitle:  { color: '#3a3a5a', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  emptyDesc:   { color: '#2a2a3a', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // モーダル
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0e0e1a', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, paddingHorizontal: 24,
    paddingBottom: 40, paddingTop: 12,
    borderWidth: 1, borderColor: '#1a1a2e',
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#2a2a4a',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle:    { color: '#ffffff', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  modalFileName: { color: '#5a5a7a', fontSize: 13, marginBottom: 20 },

  modeList:    { gap: 10, marginBottom: 8 },
  modeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#141422', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#1e1e30',
  },
  modeRowSelected: { borderColor: '#00e5a0', backgroundColor: '#071410' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#2a2a4a',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radioSelected: { borderColor: '#00e5a0' },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00e5a0' },
  modeIcon:      { fontSize: 20, marginRight: 12 },
  modeText:      { flex: 1 },
  modeName:      { color: '#ccccdd', fontSize: 14, fontWeight: '600' },
  modeNameSelected: { color: '#00e5a0' },
  modeDesc:      { color: '#4a4a6a', fontSize: 11, marginTop: 2 },

  // 時刻ピッカー
  timePicker: {
    backgroundColor: '#0a0a18', borderRadius: 14,
    padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#7c6af7',
  },
  timePickerLabel: { color: '#7c6af7', fontSize: 12, fontWeight: '600', marginBottom: 12 },
  timePickerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
  },
  timeColon: {
    color: '#ffffff', fontSize: 36, fontWeight: '800',
    marginHorizontal: 4, marginBottom: 8,
  },
  timeNote:  { color: '#3a3a5a', fontSize: 11, textAlign: 'center', marginTop: 10 },

  // モーダルボタン
  modalBtns: {
    flexDirection: 'row', gap: 12, marginTop: 20,
  },
  cancelBtn: {
    flex: 1, backgroundColor: '#141422', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a3a',
  },
  cancelText:    { color: '#5a5a7a', fontSize: 15, fontWeight: '600' },
  playBtn: {
    flex: 2, backgroundColor: '#00e5a0', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  playBtnText:   { color: '#000000', fontSize: 15, fontWeight: '800' },
});