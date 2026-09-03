function wsBase() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const url = new URL(apiUrl, window.location.origin);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}`;
}

export function connectToChat(chatId, onMessage) {
  const token = localStorage.getItem("access_token");
  const socket = new WebSocket(`${wsBase()}/ws/chats/${chatId}/?token=${token}`);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  return socket;
}

export function connectToNotifications(onNotification) {
  const token = localStorage.getItem("access_token");
  const socket = new WebSocket(`${wsBase()}/ws/notifications/?token=${token}`);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onNotification(data);
  };

  return socket;
}