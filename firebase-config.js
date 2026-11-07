// الصق إعدادات تطبيق الويب من Firebase هنا.
// Firebase Console → Project settings → Your apps → firebaseConfig
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOpOEFKkwDo3CM_-Hdx9cdkXQPsw3zdiw",
  authDomain: "sulstore.firebaseapp.com",
  projectId: "sulstore",
  storageBucket: "sulstore.firebasestorage.app",
  messagingSenderId: "380037287029",
  appId: "1:380037287029:web:2a8fee4c2ea892fd393c3c"
};

/*
قواعد Firestore — الصقها في Firestore → Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}

قواعد Storage — الصقها في Storage → Rules:

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{allPaths=**} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
*/
