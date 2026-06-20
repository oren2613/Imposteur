import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ICE_SERVERS, type VoiceSignalPayload } from '../utils/webrtcConfig';

interface PeerEntry {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  makingOffer: boolean;
}

interface UseVoiceChatOptions {
  getSocket: () => Socket | null;
  /** Phase discussion active */
  active: boolean;
  myPlayerId: string | null;
  peerPlayerIds: string[];
  isMyTurn: boolean;
  micEnabled: boolean;
}

function isPolite(localId: string, remoteId: string): boolean {
  return localId > remoteId;
}

export function useVoiceChat({
  getSocket,
  active,
  myPlayerId,
  peerPlayerIds,
  isMyTurn,
  micEnabled,
}: UseVoiceChatOptions) {
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isMicLive, setIsMicLive] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const peerIdsKey = peerPlayerIds.slice().sort().join(',');

  const emitSignal = useCallback(
    (toPlayerId: string, signal: VoiceSignalPayload) => {
      getSocket()?.emit('voice_signal', { toPlayerId, signal });
    },
    [getSocket]
  );

  const removePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (!entry) return;
    entry.pc.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
    entry.audio.remove();
    peersRef.current.delete(peerId);
  }, []);

  const stopLocalStream = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setIsMicLive(false);
  }, []);

  const cleanupAll = useCallback(() => {
    for (const peerId of peersRef.current.keys()) {
      removePeer(peerId);
    }
    stopLocalStream();
  }, [removePeer, stopLocalStream]);

  const syncMicTrack = useCallback(() => {
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0];
    if (track) {
      track.enabled = micEnabled && isMyTurn;
    }
  }, [micEnabled, isMyTurn]);

  const ensureLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError('Micro non supporté par ce navigateur.');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setPermissionError(null);
      setIsMicLive(true);
      syncMicTrack();
      return stream;
    } catch {
      setPermissionError('Accès au micro refusé. Autorise le micro dans le navigateur.');
      return null;
    }
  }, [syncMicTrack]);

  const attachLocalTracks = useCallback(async (pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const senders = pc.getSenders().filter((s) => s.track?.kind === 'audio');
    if (senders.length > 0) return;
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }
  }, []);

  const createOffer = useCallback(
    async (peerId: string, entry: PeerEntry) => {
      if (!myPlayerId || myPlayerId >= peerId) return;
      const socket = getSocket();
      if (!socket) return;

      try {
        entry.makingOffer = true;
        if (micEnabled && localStreamRef.current) {
          await attachLocalTracks(entry.pc);
        }
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        emitSignal(peerId, { type: 'offer', sdp: offer });
      } catch (err) {
        console.warn('[voice] createOffer failed', err);
      } finally {
        entry.makingOffer = false;
      }
    },
    [myPlayerId, getSocket, micEnabled, attachLocalTracks, emitSignal]
  );

  const ensurePeer = useCallback(
    (peerId: string): PeerEntry => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('autoplay', '');
      audio.setAttribute('playsinline', '');
      document.body.appendChild(audio);

      const entry: PeerEntry = { pc, audio, makingOffer: false };
      peersRef.current.set(peerId, entry);

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) audio.srcObject = stream;
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        emitSignal(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      };

      pc.onnegotiationneeded = () => {
        void createOffer(peerId, entry);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      };

      if (micEnabled && localStreamRef.current) {
        void attachLocalTracks(pc);
      }

      void createOffer(peerId, entry);
      return entry;
    },
    [attachLocalTracks, createOffer, emitSignal, micEnabled]
  );

  const handleSignal = useCallback(
    async (fromPlayerId: string, signal: VoiceSignalPayload) => {
      if (!myPlayerId || !active) return;
      if (!peerPlayerIds.includes(fromPlayerId)) return;

      if (signal.type === 'hangup') {
        removePeer(fromPlayerId);
        return;
      }

      const entry = ensurePeer(fromPlayerId);
      const { pc } = entry;
      const polite = isPolite(myPlayerId, fromPlayerId);

      try {
        if (signal.type === 'offer') {
          const offerCollision =
            entry.makingOffer || pc.signalingState !== 'stable';
          if (offerCollision && !polite) return;
          if (offerCollision && polite) {
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(signal.sdp);
          if (micEnabled && localStreamRef.current) {
            await attachLocalTracks(pc);
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitSignal(fromPlayerId, { type: 'answer', sdp: answer });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(signal.sdp);
        } else if (signal.type === 'ice-candidate') {
          if (signal.candidate) {
            await pc.addIceCandidate(signal.candidate);
          }
        }
      } catch (err) {
        console.warn('[voice] handleSignal failed', err);
      }
    },
    [
      myPlayerId,
      active,
      peerPlayerIds,
      removePeer,
      ensurePeer,
      micEnabled,
      attachLocalTracks,
      emitSignal,
    ]
  );

  // Écoute des signaux WebRTC
  useEffect(() => {
    if (!active || !myPlayerId) return;
    const socket = getSocket();
    if (!socket) return;

    const onVoiceSignal = (payload: {
      fromPlayerId?: string;
      signal?: VoiceSignalPayload;
    }) => {
      if (!payload?.fromPlayerId || !payload.signal) return;
      void handleSignal(payload.fromPlayerId, payload.signal);
    };

    socket.on('voice_signal', onVoiceSignal);
    return () => {
      socket.off('voice_signal', onVoiceSignal);
    };
  }, [active, myPlayerId, getSocket, handleSignal]);

  // Mesh : synchroniser les pairs actifs
  useEffect(() => {
    if (!active || !myPlayerId) {
      cleanupAll();
      return;
    }

    const desired = new Set(peerPlayerIds);
    for (const peerId of peersRef.current.keys()) {
      if (!desired.has(peerId)) {
        emitSignal(peerId, { type: 'hangup' });
        removePeer(peerId);
      }
    }
    for (const peerId of peerPlayerIds) {
      ensurePeer(peerId);
    }
  }, [
    active,
    myPlayerId,
    peerIdsKey,
    peerPlayerIds,
    cleanupAll,
    ensurePeer,
    removePeer,
    emitSignal,
  ]);

  // Activation / désactivation du micro
  useEffect(() => {
    if (!active) return;

    if (!micEnabled) {
      syncMicTrack();
      for (const entry of peersRef.current.values()) {
        entry.pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === 'audio') {
            entry.pc.removeTrack(sender);
          }
        });
      }
      stopLocalStream();
      return;
    }

    void (async () => {
      const stream = await ensureLocalStream();
      if (!stream) return;
      syncMicTrack();
      for (const [peerId, entry] of peersRef.current) {
        await attachLocalTracks(entry.pc);
        if (myPlayerId && myPlayerId < peerId) {
          try {
            entry.makingOffer = true;
            const offer = await entry.pc.createOffer();
            await entry.pc.setLocalDescription(offer);
            emitSignal(peerId, { type: 'offer', sdp: offer });
          } catch (err) {
            console.warn('[voice] renegotiate failed', err);
          } finally {
            entry.makingOffer = false;
          }
        }
      }
    })();
  }, [
    active,
    micEnabled,
    ensureLocalStream,
    syncMicTrack,
    attachLocalTracks,
    myPlayerId,
    emitSignal,
    stopLocalStream,
  ]);

  useEffect(() => {
    syncMicTrack();
  }, [syncMicTrack, isMyTurn]);

  useEffect(() => {
    if (!active) {
      cleanupAll();
    }
  }, [active, cleanupAll]);

  useEffect(() => () => cleanupAll(), [cleanupAll]);

  const clearPermissionError = useCallback(() => setPermissionError(null), []);

  return {
    permissionError,
    isMicLive,
    clearPermissionError,
  };
}
