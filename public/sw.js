/* PT 관리 서비스 워커: 웹 푸시 수신과 알림 클릭 (오프라인 캐시는 M9) */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PT 관리", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PT 관리";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
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
    const accept = (event.notification.actions || []).some(
      (a) => a.action === "confirm" && a.title === "수락",
    );
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
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
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
