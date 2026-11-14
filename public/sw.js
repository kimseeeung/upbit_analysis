/* 머슬매니아 서비스 워커: 화면 파일 캐시(오프라인 열기), 웹 푸시 수신과 알림 클릭 (명세 8, 11) */

const CACHE = "pt-shell-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!sameOrigin(url)) return;
  // 데이터는 화면이 IndexedDB 백업에서 읽는다 (API는 캐시하지 않음)
  if (url.pathname.startsWith("/api/")) return;

  // 빌드된 정적 파일: 캐시 우선
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // 화면: 네트워크 우선, 끊기면 마지막으로 연 화면, 그것도 없으면 오프라인 안내
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname + url.search, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname + url.search)
            .then((hit) => hit || caches.match(url.pathname))
            .then((hit) => hit || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // 그 밖(아이콘·RSC 등): 네트워크 우선, 끊기면 캐시
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !url.searchParams.has("_rsc")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "머슬매니아", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "머슬매니아";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-48.png",
      tag: data.id,
      data: { id: data.id, url: data.url || "/" },
      actions: Array.isArray(data.actions) ? data.actions : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const { id, url } = event.notification.data || {};
  event.notification.close();
  if (event.action === "confirm" && id) {
    // "확인했어요" / "수락": 앱을 열지 않고 서버에 기록
    const accept = (event.notification.actions || []).some((a) => a.action === "confirm" && a.title === "수락");
    event.waitUntil(
      fetch(`/api/notifications/${id}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept }),
      }).catch(() => undefined),
    );
    return;
  }
  const target = new URL(url || "/", self.location.origin);
  if (id) target.searchParams.set("n", id);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(target.href);
          return c.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
