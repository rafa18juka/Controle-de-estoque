import { AppUser, UserRole } from "./types";

const FIREBASE_VERSION = "10.12.2";

interface FirebaseBundle {
  app: any;
  auth: any;
  firestore: any;
  appInstance: any;
  authInstance: any;
  db: any;
}

let bundlePromise: Promise<FirebaseBundle> | null = null;

async function dynamicImport(url: string) {
  // eslint-disable-next-line no-eval
  return (0, eval)(`import(${JSON.stringify(url)})`);
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
}

export async function ensureFirebase(): Promise<FirebaseBundle> {
  if (typeof window === "undefined") {
    throw new Error("Firebase SDK só pode ser usado no cliente");
  }
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const [appModule, authModule, firestoreModule] = await Promise.all([
        dynamicImport(`${base}/firebase-app.js`),
        dynamicImport(`${base}/firebase-auth.js`),
        dynamicImport(`${base}/firebase-firestore.js`)
      ]);

      const config = getFirebaseConfig();
      if (!config.apiKey) {
        throw new Error("Variáveis de ambiente do Firebase não configuradas");
      }

      const { initializeApp, getApps, getApp } = appModule;
      const appInstance = getApps().length ? getApp() : initializeApp(config);
      const authInstance = authModule.getAuth(appInstance);
      const db = firestoreModule.getFirestore(appInstance);

      return {
        app: appModule,
        auth: authModule,
        firestore: firestoreModule,
        appInstance,
        authInstance,
        db
      };
    })();
  }
  return bundlePromise;
}

export async function signIn(email: string, password: string) {
  const bundle = await ensureFirebase();
  return bundle.auth.signInWithEmailAndPassword(bundle.authInstance, email, password);
}

export async function signOut() {
  const bundle = await ensureFirebase();
  return bundle.auth.signOut(bundle.authInstance);
}

export async function onAuthChanged(callback: (user: any | null) => void) {
  const bundle = await ensureFirebase();
  return bundle.auth.onAuthStateChanged(bundle.authInstance, callback);
}

export async function fetchUserRole(uid: string): Promise<AppUser | null> {
  const bundle = await ensureFirebase();
  const { firestore } = bundle;
  const usersRef = firestore.doc(firestore.collection(bundle.db, "users"), uid);
  const snapshot = await firestore.getDoc(usersRef);
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as { role?: UserRole; email?: string; displayName?: string };
  return {
    uid,
    email: data.email ?? "",
    displayName: data.displayName,
    role: (data.role ?? "staff") as UserRole
  };
}

export async function upsertUser(user: any, role: UserRole) {
  const bundle = await ensureFirebase();
  const { firestore } = bundle;
  const usersRef = firestore.doc(firestore.collection(bundle.db, "users"), user.uid);
  await firestore.setDoc(
    usersRef,
    {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? user.email ?? "",
      role
    },
    { merge: true }
  );
}
