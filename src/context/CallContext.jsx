import { createContext, useContext, useEffect, useRef, useState } from "react";
import { connectToNotifications } from "../api/socket";
import { logCall } from "../api/chats";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:standard.relay.metered.ca:80", username: "3fd618b18fd8a3e4bbf95cad", credential: "yJ3/aYEoWZsBCfzZ" },
    { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "3fd618b18fd8a3e4bbf95cad", credential: "yJ3/aYEoWZsBCfzZ" },
    { urls: "turn:standard.relay.metered.ca:443", username: "3fd618b18fd8a3e4bbf95cad", credential: "yJ3/aYEoWZsBCfzZ" },
    { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: "3fd618b18fd8a3e4bbf95cad", credential: "yJ3/aYEoWZsBCfzZ" },
  ],
};

function getMediaConstraints(wantsVideo) {
  return {
    audio: true,
    video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  };
}

const CallContext = createContext(null);

export function useCall() {
  return useContext(CallContext);
}

export default function CallProvider({ me, children }) {
  const [callState, setCallState] = useState("idle"); // idle | calling | ringing | connected
  const [callType, setCallType] = useState(null);
  const [partnerName, setPartnerName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringtoneRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const isCallerRef = useRef(false);
  const didConnectRef = useRef(false);
  const connectedAtRef = useRef(null);
  const loggedRef = useRef(false);
  const partnerUserIdRef = useRef(null); // who we're calling / who's calling us
  const chatIdRef = useRef(null);
  const incomingOfferRef = useRef(null);

  useEffect(() => {
    if (!me) return;

    const socket = connectToNotifications((data) => {
      if (data.type === "message_notification") {
        // don't beep for a message notification if it's actually a live call ringing
        if (callState === "idle") {
          const audio = new Audio("/notification.mp3");
          audio.play().catch(() => {});
        }
        return;
      }

      if (data.type !== "call_signal") return;

      if (data.signal_type === "call_offer") {
        incomingOfferRef.current = data;
        partnerUserIdRef.current = data.from_user_id;
        chatIdRef.current = data.chat_id;
        setPartnerName(data.from_username);
        setCallType(data.call_type);
        isCallerRef.current = false;
        setCallState("ringing");
      } else if (data.signal_type === "call_answer") {
        handleAnswer(data.payload);
      } else if (data.signal_type === "ice_candidate") {
        handleRemoteIce(data.payload);
      } else if (data.signal_type === "call_reject") {
        finishCall("declined");
      } else if (data.signal_type === "call_end") {
        finishCall(didConnectRef.current ? "completed" : "missed");
      }
    });

    socketRef.current = socket;
    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Ringtone: loops while ringing (incoming) or calling (outgoing ringback)
  useEffect(() => {
    const el = ringtoneRef.current;
    if (!el) return;
    if (callState === "ringing" || callState === "calling") {
      el.currentTime = 0;
      el.play().catch((err) => console.error("RINGTONE FAILED:", err.name, err.message));
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [callState]);

  useEffect(() => {
    if (callState !== "connected") return;
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    if (remoteAudioRef.current && remoteStreamRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
  }, [callState]);

  function sendSignal(type, extra = {}) {
    socketRef.current?.send(JSON.stringify({
      type,
      target_user_id: partnerUserIdRef.current,
      chat_id: chatIdRef.current,
      ...extra,
    }));
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal("ice_candidate", { payload: { candidate: e.candidate } });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        didConnectRef.current = true;
        connectedAtRef.current = Date.now();
        setCallState("connected");
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        finishCall(didConnectRef.current ? "completed" : "missed");
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function addOrQueueCandidate(payload) {
    const pc = pcRef.current;
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
    } else {
      pendingCandidatesRef.current.push(payload);
    }
  }

  async function flushPendingCandidates() {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const payload of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
    }
  }

  // Called from a chat page's call buttons
  async function startCall(partnerUserId, name, chatId, type) {
    setErrorMsg("");
    partnerUserIdRef.current = partnerUserId;
    chatIdRef.current = chatId;
    setPartnerName(name);
    setCallType(type);
    setCallState("calling");
    isCallerRef.current = true;
    didConnectRef.current = false;
    loggedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(type === "video"));
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal("call_offer", { call_type: type, payload: { sdp: offer.sdp, type: offer.type } });
    } catch (err) {
      setErrorMsg("Couldn't access your camera/microphone. Check browser permissions.");
      setCallState("idle");
    }
  }

  async function acceptCall() {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(callType === "video"));
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current.payload));
      await flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal("call_answer", { payload: { sdp: answer.sdp, type: answer.type } });
      setCallState("connected");
      didConnectRef.current = true;
      connectedAtRef.current = Date.now();
    } catch (err) {
      setErrorMsg("Couldn't access your camera/microphone. Check browser permissions.");
      declineCall();
    }
  }

  function declineCall() {
    sendSignal("call_reject");
    cleanup();
    setCallState("idle");
  }

  async function handleAnswer(payload) {
    if (!pcRef.current) return;
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload));
    await flushPendingCandidates();
  }

  async function handleRemoteIce(payload) {
    if (!payload?.candidate) return;
    await addOrQueueCandidate(payload);
  }

  function cleanup() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    incomingOfferRef.current = null;
  }

  function finishCall(status) {
    if (isCallerRef.current && !loggedRef.current && chatIdRef.current) {
      loggedRef.current = true;
      const duration =
        status === "completed" && connectedAtRef.current
          ? Math.round((Date.now() - connectedAtRef.current) / 1000)
          : null;
      logCall(chatIdRef.current, { call_type: callType, call_status: status, duration_seconds: duration }).catch(() => {});
    }
    cleanup();
    setCallState("idle");
  }

  function hangUp() {
    sendSignal("call_end");
    finishCall(didConnectRef.current ? "completed" : "missed");
  }

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}

      <audio ref={ringtoneRef} src="/ringtone.mp3" loop />

      {callState !== "idle" && (
        <div style={styles.overlay}>
          {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}

          {callState === "ringing" && (
            <div style={styles.centerBox}>
              <div style={styles.avatar}>{partnerName[0]?.toUpperCase()}</div>
              <div style={styles.callText}>{partnerName} is calling ({callType})...</div>
              <div style={styles.actionRow}>
                <button onClick={acceptCall} style={{ ...styles.roundBtn, background: "#31a24c" }}>✓</button>
                <button onClick={declineCall} style={{ ...styles.roundBtn, background: "#e41e3f" }}>✕</button>
              </div>
            </div>
          )}

          {callState === "calling" && (
            <div style={styles.centerBox}>
              <div style={styles.avatar}>{partnerName[0]?.toUpperCase()}</div>
              <div style={styles.callText}>Calling {partnerName}...</div>
              <button onClick={hangUp} style={{ ...styles.roundBtn, background: "#e41e3f" }}>✕</button>
            </div>
          )}

          {callState === "connected" && (
            <div style={styles.connectedBox}>
              {callType === "video" ? (
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideo} />
                  <video ref={localVideoRef} autoPlay playsInline muted style={styles.localVideo} />
                </>
              ) : (
                <>
                  <audio ref={remoteAudioRef} autoPlay />
                  <div style={styles.avatar}>{partnerName[0]?.toUpperCase()}</div>
                  <div style={styles.callText}>On call with {partnerName}</div>
                </>
              )}
              <button onClick={hangUp} style={{ ...styles.roundBtn, background: "#e41e3f", position: "absolute", bottom: 30 }}>✕</button>
            </div>
          )}
        </div>
      )}
    </CallContext.Provider>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 },
  centerBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  connectedBox: { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  avatar: { width: 100, height: 100, borderRadius: "50%", background: "#0084ff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 600 },
  callText: { color: "#fff", fontSize: 18 },
  actionRow: { display: "flex", gap: 24 },
  roundBtn: { width: 56, height: 56, borderRadius: "50%", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" },
  remoteVideo: { width: "100%", height: "100%", objectFit: "contain" },
  localVideo: { position: "absolute", bottom: 100, right: 20, width: 120, height: 160, borderRadius: 12, objectFit: "cover", border: "2px solid #fff" },
  errorBanner: { position: "absolute", top: 20, background: "#ffe5e9", color: "#e41e3f", padding: "8px 16px", borderRadius: 8, fontSize: 13, zIndex: 10 },
};