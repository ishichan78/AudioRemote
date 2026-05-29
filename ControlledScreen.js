// ============================================================
//  ControlledScreen.js（旧 AndroidScreen を iOS/Android 両対応に拡張）
//  ・音声ファイルの登録・再生
//  ・バイブレーションの受信・実行（iOS: expo-haptics / Android: Vibration）
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

// ── バイブレーション実行（iOS: Haptics / Android: Vibration API）──
const executeVibration = async (pattern) => {
  if (Platform.OS === 'ios') {
    switch (pattern) {
      case 'short':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'long':
        // 重い振動を3回繰り返す
        for (let i = 0; i < 3; i++) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          if (i < 2) await new Promise(r => setTimeout(r, 150));
        }
        break;
      case 'pattern':
        // 短い振動を3連続
        for (let i = 0; i < 3; i++) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (i < 2) await new Promise(r => setTimeout(r, 200));
        }
        break;
    }
  } else {
    // Android: Vibration API（ms 単位でパターン指定可能）
    switch (pattern) {
      case 'short':
        Vibration.vibrate(200);
        break;
      case 'long':
        Vibration.vibrate([0, 400, 150, 400, 150, 400]);
        break;
      case 'pattern':
        Vibration.vibrate([0, 200, 100, 200, 100, 200]);
        break;
    }
  }
};

export default function ControlledScreen({ onReset }) {
  const [audioFiles, setAudioFiles]   = useState([]);
  const [playingId,  setPlayingId]    = useState(null);
  const [statusMsg,  setStatusMsg]    = useState('待機中');
  const [loading,    setLoading]      = useState(false);
  const [volume,     setVolume]       = useState(DEFAULT_VOLUME);
  const [lastVibrate, setLastVibrate] = useState(null); // 最後のバイブ種別を表示用に保持

  const soundRef         = useRef(null);
  const audioFilesRef    = useRef([]);
  const lastTimestampRef = useRef(0);
  const volumeRef        = useRef(DEFAULT_VOLUME);

  // ── 初期化 ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
    })();
  }, []);

  useEffect(() => { audioFilesRef.current = audioFiles; }, [audioFiles]);

  // ── Firebase: ファイル一覧を監視 ─────────────────────────────
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

  // ── Firebase: 音量を監視 ─────────────────────────────────────
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

  // ── Firebase: コマンドを監視（再生 / 停止 / バイブ）──────────
  useEffect(() => {
    return onValue(ref(database, 'command'), async (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      if (cmd.timestamp <= lastTimestampRef.current) return;
      lastTimestampRef.current = cmd.timestamp;

      if (cmd.action === 'play' && cmd.fileId) {
        const file = audioFilesRef.current.find(f => f.id === cmd.fileId);
        if (file) await playAudio(file);
        else setStatusMsg('⚠️ ファイルが見つかりません');

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

  // ── 再生 ──────────────────────────────────────────────────
  const playAudio = async (file) => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setStatusMsg('読み込み中…');
      const { sound } = await Audio.Sound.createAsync(
        { uri: file.uri },
        { shouldPlay: true, volume: volumeRef.current },
        (status) => {
          if (status.didJustFinish) {
            setPlayingId(null);
            setStatusMsg('待機中');
          }
        }
      );
      soundRef.current = sound;
      setPlayingId(file.id);
      setStatusMsg(`▶ 再生中: ${file.name}`);
    } catch (e) {
      setPlayingId(null);
      setStatusMsg('⚠️ 再生エラー');
      Alert.alert('再生エラー', e.message);
    }
  };

  // ── 停止 ──────────────────────────────────────────────────
  const stopAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(null);
    setStatusMsg('⏹ 停止しました');
    setTimeout(() => setStatusMsg('待機中'), 2000);
  };

  // ── ファイル登録 ──────────────────────────────────────────
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

  // ── ファイル削除 ──────────────────────────────────────────
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
        <View style={[s.statusDot, playingId ? s.dotPlaying : s.dotIdle]} />
        <Text style={s.statusText}>{lastVibrate || statusMsg}</Text>
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
        renderItem={({ item }) => (
          <View style={[s.fileRow, playingId === item.id && s.fileRowActive]}>
            <View style={s.fileIcon}>
              <Text style={s.fileIconText}>{playingId === item.id ? '▶' : '♪'}</Text>
            </View>
            <Text style={s.fileName} numberOfLines={2}>{item.name}</Text>
            <TouchableOpacity
              onPress={() => deleteFile(item.id, item.name)}
              style={s.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.deleteBtnText}>削除</Text>
            </TouchableOpacity>
          </View>
        )}
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
  statusDot:      { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  dotIdle:        { backgroundColor: '#2a2a4a' },
  dotPlaying:     { backgroundColor: '#00e5a0' },
  statusText:     { color: '#8888aa', fontSize: 13, flex: 1 },
  volumeDisplay:  { color: '#4a4a6a', fontSize: 12 },

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
    justifyContent: 'center', marginRight: 12,
  },
  fileIconText:   { fontSize: 18 },
  fileName:       { flex: 1, color: '#ccccdd', fontSize: 13, lineHeight: 19 },
  deleteBtn: {
    backgroundColor: '#1a0a10', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#40101a',
  },
  deleteBtnText:  { color: '#cc3355', fontSize: 12, fontWeight: '600' },

  empty:          { alignItems: 'center', paddingTop: 60 },
  emptyIcon:      { fontSize: 40, marginBottom: 14 },
  emptyText:      { color: '#2a2a4a', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});