// ============================================================
//  IPhoneScreen.js
//  ・Firebase から登録済み音声ファイルの一覧を取得
//  ・ボタンタップで Android に再生/停止コマンドを送信
//  ・音量スライダーで Android の再生音量をリアルタイム制御
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

export default function IPhoneScreen() {
  const [audioFiles, setAudioFiles] = useState([]);
  const [playingId,  setPlayingId]  = useState(null);
  const [connected,  setConnected]  = useState(false);
  const [volume,     setVolume]     = useState(DEFAULT_VOLUME);  // 0.0〜1.0

  // ── Firebase: 登録済みファイル一覧を監視 ────────────────────
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

  // ── Firebase: コマンドノードを監視して UI を同期 ─────────────
  useEffect(() => {
    const commandRef = ref(database, 'command');
    return onValue(commandRef, (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      setPlayingId(cmd.action === 'play' ? cmd.fileId : null);
    });
  }, []);

  // ── Firebase: 音量ノードを監視（他端末からの変更も反映）───────
  useEffect(() => {
    const volumeRef = ref(database, 'volume');
    return onValue(volumeRef, (snapshot) => {
      const v = snapshot.val();
      if (v !== null && typeof v === 'number') {
        setVolume(v);
      }
    });
  }, []);

  // ── コマンド送信 ──────────────────────────────────────────
  const sendCommand = async (action, fileId = null) => {
    await set(ref(database, 'command'), {
      action,
      fileId,
      timestamp: Date.now(),
    });
    setPlayingId(action === 'play' ? fileId : null);
  };

  const handlePress = (item) => {
    if (playingId === item.id) {
      sendCommand('stop');
    } else {
      sendCommand('play', item.id);
    }
  };

  // ── 音量変更：スライダーを離したときに Firebase へ書き込み ────
  const handleVolumeChange = async (value) => {
    setVolume(value);
    await set(ref(database, 'volume'), value);
  };

  // ── UI ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>🎮 iPhone</Text>
          <Text style={s.headerSub}>リモコン</Text>
        </View>
        <View style={s.badge}>
          <View style={[s.badgeDot, connected ? s.dotOn : s.dotOff]} />
          <Text style={s.badgeText}>{connected ? 'オンライン' : '接続中…'}</Text>
        </View>
      </View>

      {/* 音量コントロール */}
      <View style={s.volumeCard}>
        <View style={s.volumeHeader}>
          <Text style={s.volumeLabel}>🔈 音量</Text>
          <Text style={s.volumeValue}>{Math.round(volume * 100)}%</Text>
        </View>
        <Slider
          style={s.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={volume}
          onValueChange={setVolume}          // ローカル UI をリアルタイム更新
          onSlidingComplete={handleVolumeChange} // 離したときだけ Firebase に書き込み
          minimumTrackTintColor="#00e5a0"
          maximumTrackTintColor="#1a1a30"
          thumbTintColor="#00e5a0"
        />
        <View style={s.volumeTicks}>
          <Text style={s.volumeTick}>0%</Text>
          <Text style={s.volumeTick}>50%</Text>
          <Text style={s.volumeTick}>100%</Text>
        </View>
      </View>

      {/* 再生中の場合のみ「全停止」ボタンを表示 */}
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
              onPress={() => handlePress(item)}
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
            <Text style={s.emptyDesc}>
              Android 端末のアプリで{'\n'}音声ファイルを登録してください
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── スタイル ─────────────────────────────────────────────────
const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#060608' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 8,
  },
  headerTitle:    { fontSize: 26, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  headerSub:      { fontSize: 13, color: '#3a3a5a', marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e0e18', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1a1a28',
  },
  badgeDot:       { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOn:          { backgroundColor: '#00e5a0' },
  dotOff:         { backgroundColor: '#2a2a3a' },
  badgeText:      { color: '#5a5a7a', fontSize: 11 },

  // 音量カード
  volumeCard: {
    marginHorizontal: 20, marginTop: 14, marginBottom: 6,
    backgroundColor: '#0e0e1a', borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    borderWidth: 1, borderColor: '#1a1a2e',
  },
  volumeHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  volumeLabel:    { color: '#8888aa', fontSize: 13, fontWeight: '600' },
  volumeValue:    { color: '#00e5a0', fontSize: 18, fontWeight: '800', minWidth: 46, textAlign: 'right' },
  slider:         { width: '100%', height: 40 },
  volumeTicks:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  volumeTick:     { color: '#2a2a4a', fontSize: 10 },

  stopAllBtn: {
    marginHorizontal: 20, marginTop: 12, marginBottom: 4,
    backgroundColor: '#cc2244', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  stopAllText:    { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  listLabel: {
    color: '#3a3a5a', fontSize: 11, fontWeight: '600',
    letterSpacing: 1, marginHorizontal: 20,
    marginTop: 20, marginBottom: 10,
    textTransform: 'uppercase',
  },
  list:           { paddingHorizontal: 20, paddingBottom: 50 },

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

  empty:          { alignItems: 'center', paddingTop: 80 },
  emptyIcon:      { fontSize: 48, marginBottom: 20 },
  emptyTitle:     { color: '#3a3a5a', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  emptyDesc:      { color: '#2a2a3a', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});