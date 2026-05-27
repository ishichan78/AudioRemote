// ============================================================
//  App.js  — エントリーポイント
//  プラットフォームを自動判定して画面を切り替えます
// ============================================================
import React from 'react';
import { Platform, StatusBar } from 'react-native';
import AndroidScreen from './AndroidScreen';
import IPhoneScreen from './IPhoneScreen';

export default function App() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#080812" />
      {Platform.OS === 'android' ? <AndroidScreen /> : <IPhoneScreen />}
    </>
  );
}