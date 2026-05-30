// ============================================================
//  ControlledScreen.js
//  ・音声ファイルの登録・再生
//  ・再生モード対応: 1回のみ / ループ / 指定時刻まで
//  ・バイブレーション受信
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Vibration,
  StyleSheet, Alert, SafeAreaView, ActivityIndicator, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { database } from './firebaseConfig';
import { ref, set, onValue, push, remove } from 'firebase/database';

const DEFAULT_VOLUME = 0.8;

// ── バイブレーション実行 ──────────────────────────────────────
const executeVibration = async (pattern) => {
  if (Platform.OS === 'ios') {
    switch (pattern) {
      case 'short':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'long':
        for (let i = 0; i < 3; i++) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          if (i < 2) await new Promise(r => setTimeout(r, 150));
        }
        break;
      case 'pattern':
        for (let i = 0; i < 3; i++) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (i < 2) await new Promise(r => setTimeout(r, 200));
        }
        break;
    }
  } else {
    switch (pattern) {
      case 'short':   Vibration.vibrate(200); break;
      case 'long':    Vibration.vibrate([0, 400, 150, 400, 150, 400]); break;
      case 'pattern': Vibration.vibrate([0, 200, 100, 200, 100, 200]); break;
    }
  }
};

// ── 指定時刻までのミリ秒を計算（過去なら翌日として計算）───────
const msUntilTime = (hhmm) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
};

export default function ControlledScreen({ onReset }) {
  const [audioFiles,  setAudioFiles]  = useState([]);
  const [playingId,   setPlayingId]   = useState(null);
  const [playingMode, setPlayingMode] = useState(null);
  const [statusMsg,   setStatusMsg]   = useState('待機中');
  const [loading,     setLoading]     = useState(false);
  const [volume,      setVolume]      = useState(DEFAULT_VOLUME);
  const [lastVibrate, setLastVibrate] = useState(null);

  const soundRef         = useRef(null);
  const audioFilesRef    = useRef([]);
  const lastTimestampRef = useRef(0);
  const volumeRef        = useRef(DEFAULT_VOLUME);
  const stopTimerRef     = useRef(null);  // 指定時刻モードの停止タイマー

  // ── 初期化 ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
    })();
    // アンマウント時にタイマー解除
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  useEffect(() => { audioFilesRef.current = audioFiles; }, [audioFiles]);

  // ── Firebase: ファイル一覧 ───────────────────────────────
  useEffect(() => {
    return onValue(ref(database, 'audioFiles'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const files = Object.entries(data)
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
        setAudioFiles(files);
      } else {
        setAudioFiles([]);
      }
    });
  }, []);

  // ── Firebase: 音量 ──────────────────────────────────────
  useEffect(() => {
    return onValue(ref(database, 'volume'), async (snapshot) => {
      const v = snapshot.val();
      if (v === null || typeof v !== 'number') return;
      volumeRef.current = v;
      setVolume(v);
      if (soundRef.current) {
        try { await soundRef.current.setVolumeAsync(v); } catch (_) {}
      }
    });
  }, []);

  // ── Firebase: コマンド受信 ───────────────────────────────
  useEffect(() => {
    return onValue(ref(database, 'command'), async (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      if (cmd.timestamp <= lastTimestampRef.current) return;
      lastTimestampRef.current = cmd.timestamp;

      if (cmd.action === 'play' && cmd.fileId) {
        const file = audioFilesRef.current.find(f => f.id === cmd.fileId);
        if (file) {
          await playAudio(file, cmd.mode || 'once', cmd.untilTime || null);
        } else {
          setStatusMsg('⚠️ ファイルが見つかりません');
        }
      } else if (cmd.action === 'stop') {
        await stopAudio();
      } else if (cmd.action === 'vibrate') {
        await executeVibration(cmd.pattern);
        const labels = { short: '短い', long: '長い', pattern: 'パターン' };
        setLastVibrate(`📳 ${labels[cmd.pattern] || ''} バイブ受信`);
        setTimeout(() => setLastVibrate(null), 2000);
      }
    });
  }, []);

  // ── 再生 ────────────────────────────────────────────────
  const playAudio = async (file, mode, untilTime) => {
    // 既存タイマーをリセット
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setStatusMsg('読み込み中…');

      const isLooping = (mode === 'loop' || mode === 'until');

      const { sound } = await Audio.Sound.createAsync(
        { uri: file.uri },
        { shouldPlay: true, volume: volumeRef.current, isLooping },
        (status) => {
          // 1回再生モードで終端まで再生した場合
          if (status.didJustFinish && mode === 'once') {
            setPlayingId(null);
            setPlayingMode(null);
            setStatusMsg('待機中');
          }
        }
      );

      soundRef.current = sound;
      setPlayingId(file.id);
      setPlayingMode(mode);

      // モード別ステータスメッセージとタイマー設定
      if (mode === 'loop') {
        setStatusMsg(`🔁 ループ再生中: ${file.name}`);
      } else if (mode === 'until' && untilTime) {
        const ms = msUntilTime(untilTime);
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const remaining = h > 0 ? `約${h}時間${m}分後に停止` : `約${m}分後に停止`;
        setStatusMsg(`⏰ ${untilTime}まで再生中: ${file.name}（${remaining}）`);

        stopTimerRef.current = setTimeout(async () => {
          await stopAudio();
          setStatusMsg(`⏰ ${untilTime} に自動停止しました`);
          setTimeout(() => setStatusMsg('待機中'), 3000);
        }, ms);
      } else {
        setStatusMsg(`▶ 再生中: ${file.name}`);
      }
    } catch (e) {
      setPlayingId(null);
      setPlayingMode(null);
      setStatusMsg('⚠️ 再生エラー');
      Alert.alert('再生エラー', e.message);
    }
  };

  // ── 停止 ────────────────────────────────────────────────
  const stopAudio = async () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(null);
    setPlayingMode(null);
    setStatusMsg('⏹ 停止しました');
    setTimeout(() => setStatusMsg('待機中'), 2000);
  };

  // ── ファイル登録 ─────────────────────────────────────────
  const pickAndRegisterFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const picked = result.assets[0];
      setLoading(true);

      const newRef = push(ref(database, 'audioFiles'));
      await set(newRef, {
        name: picked.name, uri: picked.uri, registeredAt: Date.now(),
      });
      Alert.alert('登録完了', `「${picked.name}」を登録しました`);
    } catch (e) {
      Alert.alert('エラー', 'ファイルの登録に失敗しました:\n' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── ファイル削除 ─────────────────────────────────────────
  const deleteFile = (id, name) => {
    Alert.alert('削除の確認', `「${name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          if (playingId === id) await stopAudio();
          await remove(ref(database, `audioFiles/${id}`));
        },
      },
    ]);
  };

  // ── モードバッジ表示テキスト ─────────────────────────────
  const modeBadge = () => {
    if (playingMode === 'loop')  return '🔁 ループ';
    if (playingMode === 'until') return '⏰ 時刻指定';
    return '▶ 1回';
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>🔊 被制御端末</Text>
          <Text style={s.headerSub}>音声管理</Text>
        </View>
        <TouchableOpacity onPress={onReset} style={s.resetBtn}>
          <Text style={s.resetText}>役割変更</Text>
        </TouchableOpacity>
      </View>

      {/* ステータス */}
      <View style={s.statusCard}>
        <View style={[s.statusDot,
          playingMode === 'loop'  ? s.dotLoop  :
          playingMode === 'until' ? s.dotUntil :
          playingId               ? s.dotPlaying : s.dotIdle
        ]} />
        <Text style={s.statusText} numberOfLines={2}>
          {lastVibrate || statusMsg}
        </Text>
        <Text style={s.volumeDisplay}>🔈 {Math.round(volume * 100)}%</Text>
      </View>

      {/* 登録ボタン */}
      <TouchableOpacity
        style={[s.addBtn, loading && s.addBtnDisabled]}
        onPress={pickAndRegisterFile}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#00e5a0" />
          : <Text style={s.addBtnText}>＋ 音声ファイルを登録</Text>
        }
      </TouchableOpacity>

      <Text style={s.listLabel}>登録済みファイル ({audioFiles.length} 件)</Text>

      <FlatList
        data={audioFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const isPlaying = playingId === item.id;
          return (
            <View style={[s.fileRow, isPlaying && s.fileRowActive]}>
              <View style={s.fileIcon}>
                <Text style={s.fileIconText}>{isPlaying ? '▶' : '♪'}</Text>
              </View>
              <View style={s.fileInfo}>
                <Text style={s.fileName} numberOfLines={2}>{item.name}</Text>
                {isPlaying && (
                  <Text style={s.modeBadgeText}>{modeBadge()}</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => deleteFile(item.id, item.name)}
                style={s.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.deleteBtnText}>削除</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🎵</Text>
            <Text style={s.emptyText}>上のボタンで音声ファイルを{'\n'}登録してください</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#080812' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 4,
  },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  headerSub:      { fontSize: 13, color: '#4a4a6a', marginTop: 2 },
  resetBtn: {
    backgroundColor: '#1a1a2a', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a2a3a', marginTop: 2,
  },
  resetText:      { color: '#5a5a7a', fontSize: 11 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e0e20', borderRadius: 12,
    marginHorizontal: 20, marginTop: 16, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#1a1a30',
  },
  statusDot:      { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },
  dotIdle:        { backgroundColor: '#2a2a4a' },
  dotPlaying:     { backgroundColor: '#00e5a0' },
  dotLoop:        { backgroundColor: '#7c6af7' },
  dotUntil:       { backgroundColor: '#f7a44a' },
  statusText:     { color: '#8888aa', fontSize: 12, flex: 1, lineHeight: 17 },
  volumeDisplay:  { color: '#4a4a6a', fontSize: 12, flexShrink: 0 },

  addBtn: {
    marginHorizontal: 20, marginBottom: 20,
    borderRadius: 14, paddingVertical: 16,
    borderWidth: 1.5, borderColor: '#00e5a0',
    alignItems: 'center', backgroundColor: '#0a1a14',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText:     { color: '#00e5a0', fontSize: 15, fontWeight: '700' },

  listLabel: {
    color: '#3a3a5a', fontSize: 11, fontWeight: '600',
    letterSpacing: 1, marginHorizontal: 20, marginBottom: 8,
    textTransform: 'uppercase',
  },
  list:           { paddingHorizontal: 20, paddingBottom: 40 },

  fileRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e0e20', borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#1a1a30',
  },
  fileRowActive:  { borderColor: '#00e5a0', backgroundColor: '#071410' },
  fileIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a30', alignItems: 'center',
    justifyContent: 'center', marginRight: 12, flexShrink: 0,
  },
  fileIconText:   { fontSize: 18 },
  fileInfo:       { flex: 1 },
  fileName:       { color: '#ccccdd', fontSize: 13, lineHeight: 19 },
  modeBadgeText:  { color: '#00e5a0', fontSize: 11, marginTop: 3 },
  deleteBtn: {
    backgroundColor: '#1a0a10', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#40101a', marginLeft: 10,
  },
  deleteBtnText:  { color: '#cc3355', fontSize: 12, fontWeight: '600' },

  empty:          { alignItems: 'center', paddingTop: 60 },
  emptyIcon:      { fontSize: 40, marginBottom: 14 },
  emptyText:      { color: '#2a2a4a', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});