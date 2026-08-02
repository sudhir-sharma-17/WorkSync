export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}

interface RequestOptions extends RequestInit {
  json?: any;
}

export async function apiFetch(path: string, options: RequestOptions = {}) {
  let session_id = "";
  if (typeof window !== "undefined") {
    session_id = sessionStorage.getItem("session_id") || "";
  }

  const headers = new Headers(options.headers || {});
  
  if (session_id) {
    headers.set("X-Session-ID", session_id);
  }

  if (options.json && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }

  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "API Error" }));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
