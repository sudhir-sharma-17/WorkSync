import { create } from "zustand";

interface User {
  id: string;
  email: string;
  role: "admin" | "manager" | "viewer";
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  clearAuth: () => void;
}

// Safe sessionStorage helpers — enforces session-wise logins
const storage = {
  get: (key: string): string | null => {
    try {
      return typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
    } catch { return null; }
  },
  set: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined") sessionStorage.setItem(key, value);
    } catch { }
  },
  remove: (key: string): void => {
    try {
      if (typeof window !== "undefined") sessionStorage.removeItem(key);
    } catch { }
  },
};

export const useAuthStore = create<AuthState>((set) => {
  const storedToken       = storage.get("token");
  const storedRefreshToken = storage.get("refresh_token");
  const storedUserRaw     = storage.get("user");
  let storedUser: User | null = null;
  try {
    storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
  } catch { storedUser = null; }

  return {
    token:        storedToken,
    refreshToken: storedRefreshToken,
    user:         storedUser,

    setAuth: (token, refreshToken, user) => {
      console.log("[AUTH] setAuth called — storing session for:", user?.email);
      storage.set("token", token);
      storage.set("refresh_token", refreshToken);
      storage.set("user", JSON.stringify(user));
      set({ token, refreshToken, user });
    },

    clearAuth: () => {
      console.log("[AUTH] clearAuth called — wiping session");
      storage.remove("token");
      storage.remove("refresh_token");
      storage.remove("user");
      // Verify removal
      const remaining = storage.get("token");
      console.log("[AUTH] Token after removal:", remaining ?? "null ✓");
      set({ token: null, refreshToken: null, user: null });
      console.log("[AUTH] Zustand store cleared ✓");
    },
  };
});
