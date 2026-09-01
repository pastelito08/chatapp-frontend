function wsBase() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
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