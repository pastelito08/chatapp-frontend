import api from "./client";

export async function getChats() {
  const response = await api.get("/chats/");
  return response.data.results;
}

export async function getOrCreateDirectChat(userId) {
  const response = await api.post(`/chats/direct/${userId}/`);
  return response.data;
}

export async function getMessages(chatId, before = null) {
  const url = before
    ? `/chats/${chatId}/messages/?before=${before}`
    : `/chats/${chatId}/messages/`;
  const response = await api.get(url);
  return response.data; // now { results, has_more } instead of a bare array
}

export async function searchUsers(query) {
  const response = await api.get(`/users/search/?q=${encodeURIComponent(query)}`);
  return response.data.results;
}

export async function blockUser(userId) {
  await api.post("/blocks/", { blocked: userId });
}

export async function unblockUser(userId) {
  await api.delete(`/blocks/${userId}/`);
}

export async function clearConversation(chatId) {
  await api.post(`/chats/${chatId}/clear/`);
}

export async function getChatPartner(chatId) {
  const response = await api.get(`/chats/${chatId}/partner/`);
  return response.data;
}

export async function uploadAttachment(chatId, file, content = "") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("content", content);
  const response = await api.post(`/chats/${chatId}/attachments/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function reactToMessage(messageId, emoji) {
  const response = await api.post(`/messages/${messageId}/react/`, { emoji });
  return response.data;
}

export async function unsendMessage(messageId) {
  await api.delete(`/messages/${messageId}/`);
}

export async function logCall(chatId, payload) {
  const response = await api.post(`/chats/${chatId}/call-log/`, payload);
  return response.data;
}

export async function deleteForMe(messageId) {
  await api.post(`/messages/${messageId}/delete-for-me/`);
}