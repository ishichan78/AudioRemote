// ============================================================
//  firebaseConfig.js
//  ⚠️  YOUR_... の部分を Firebase コンソールの値に置き換えてください
// ============================================================
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  // apiKey:            "AIzaSyD6xNhmCT2d3phjg7SORD4ZoVSofjxqISo",
  // authDomain:        "realtime-database-1ac16.firebaseapp.com",
  // // ↓ リージョンに合わせて変更してください
  // //   アジア: https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app
  // //   米国  : https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
  // databaseURL:       "https://realtime-database-1ac16-default-rtdb.firebaseio.com",
  // projectId:         "realtime-database-1ac16",
  // storageBucket:     "realtime-database-1ac16.appspot.com",
  // messagingSenderId: "1046993065050",
  // appId:             "1:1046993065050:web:cb090126cabfe3910cf463",
  apiKey:            "AIzaSyD6xNhmCT2d3phjg7SORD4ZoVSofjxqISo",
  authDomain:        "realtime-database-1ac16.firebaseapp.com",
  projectId:         "realtime-database-1ac16",
  databaseURL:       "https://realtime-database-1ac16-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket:     "realtime-database-1ac16.firebasestorage.app",
  messagingSenderId: "1046993065050",
  appId:             "1:1046993065050:web:cb090126cabfe3910cf463"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);