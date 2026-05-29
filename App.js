// ============================================================
//  App.js  — 起動時に役割を選択する
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, SafeAreaView,
} from 'react-native';
import ControllerScreen from './ControllerScreen';
import ControlledScreen from './ControlledScreen';

export default function App() {
  const [role, setRole] = useState(null); // null | 'controller' | 'controlled'

  if (role === 'controller') {
    return <ControllerScreen onReset={() => setRole(null)} />;
  }
  if (role === 'controlled') {
    return <ControlledScreen onReset={() => setRole(null)} />;
  }

  // 役割選択画面
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#060610" />
      <View style={s.content}>
        <Text style={s.appIcon}>🎮</Text>
        <Text style={s.title}>AudioRemote</Text>
        <Text style={s.subtitle}>この端末の役割を選択してください</Text>

        <TouchableOpacity
          style={s.roleCard}
          onPress={() => setRole('controller')}
          activeOpacity={0.8}
        >
          <Text style={s.roleIcon}>📱</Text>
          <View style={s.roleText}>
            <Text style={s.roleName}>コントローラー</Text>
            <Text style={s.roleDesc}>別の端末の音声を再生・停止{'\n'}バイブレーションを送る側</Text>
          </View>
          <Text style={s.roleArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.roleCard, s.roleCardSecondary]}
          onPress={() => setRole('controlled')}
          activeOpacity={0.8}
        >
          <Text style={s.roleIcon}>🔊</Text>
          <View style={s.roleText}>
            <Text style={s.roleName}>被制御端末</Text>
            <Text style={s.roleDesc}>音声ファイルを登録・再生する側{'\n'}バイブレーションを受け取る側</Text>
          </View>
          <Text style={s.roleArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#060610' },
  content: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: 28,
  },
  appIcon:     { fontSize: 52, textAlign: 'center', marginBottom: 12 },
  title: {
    fontSize: 32, fontWeight: '800', color: '#ffffff',
    textAlign: 'center', letterSpacing: -0.5, marginBottom: 8,
  },
  subtitle:    { color: '#3a3a5a', fontSize: 14, textAlign: 'center', marginBottom: 48 },

  roleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e0e20', borderRadius: 18,
    padding: 20, marginBottom: 16,
    borderWidth: 1.5, borderColor: '#00e5a0',
  },
  roleCardSecondary: { borderColor: '#7c6af7' },
  roleIcon:    { fontSize: 32, marginRight: 16 },
  roleText:    { flex: 1 },
  roleName:    { color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  roleDesc:    { color: '#5a5a7a', fontSize: 12, lineHeight: 18 },
  roleArrow:   { color: '#3a3a5a', fontSize: 24, marginLeft: 8 },
});