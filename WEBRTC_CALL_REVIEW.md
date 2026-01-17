# WebRTC Call Feature Review

## Target Architecture Requirements
- ✅ Backend: NestJS (TypeScript) - **CONFIRMED**
- ✅ Frontend: React + TypeScript - **CONFIRMED**
- ✅ WebRTC for peer-to-peer communication - **CONFIRMED**
- ✅ Self-hosted SFU support (mediasoup) - **CONFIRMED** (optional, feature-flagged)
- ✅ Backend handles signaling only (NO media streams) - **CONFIRMED**
- ❌ Media: Audio + screen share only (camera video disabled by default) - **NOT IMPLEMENTED**
- ❌ No recording - **CONFIRMED** (no recording code found)
- ✅ 1:1 calls only (tutor ↔ student) - **CONFIRMED**

## Implementation Status Checklist

### ✅ Correctly Implemented

1. **Backend Signaling Only**
   - ✅ `webrtc.gateway.ts` - WebSocket gateway for signaling
   - ✅ No media processing in backend
   - ✅ Handles SDP offer/answer exchange
   - ✅ Handles ICE candidate exchange
   - ✅ Handles participant management
   - ✅ Handles chat messages
   - ✅ Handles whiteboard updates

2. **Peer-to-Peer WebRTC**
   - ✅ RTCPeerConnection setup
   - ✅ STUN/TURN server support
   - ✅ ICE candidate handling
   - ✅ SDP offer/answer handling
   - ✅ Connection state management

3. **1:1 Calls**
   - ✅ Booking-based call sessions
   - ✅ Participant validation
   - ✅ Only 2 participants per booking

4. **Whiteboard Integration**
   - ✅ Whiteboard component integrated
   - ✅ Real-time synchronization via WebSocket

### ❌ Missing or Incorrect

1. **Camera Video Disabled by Default**
   - ❌ `getLocalMedia(true)` requests video by default (line 377 in `call/index.tsx`)
   - ❌ `useWebrtcCall.ts` `requestMedia()` requests video: true (line 27)
   - ❌ SDP offer includes `offerToReceiveVideo: true` (line 420)
   - **Required Fix**: Request audio-only by default, fallback to video only if user explicitly enables camera

2. **Screen Sharing Restrictions**
   - ❌ `startScreenShare()` function has no `isTutor` check (line 430)
   - ❌ ControlBar shows screen share button to everyone (line 1061-1069)
   - **Required Fix**: Only allow tutors to share screen, hide/disable button for students

3. **Screen Share Bitrate/FPS Limits**
   - ❌ `getDisplayMedia()` has no constraints (line 435)
   - **Required Fix**: Add bitrate (e.g., max 2Mbps) and FPS (e.g., max 30fps) constraints

4. **Audio Bitrate Configuration**
   - ❌ No explicit Opus bitrate configuration (uses browser defaults ~50kbps)
   - **Optional Fix**: Explicitly set low bitrate (e.g., 32-48kbps) for better bandwidth efficiency

5. **Error Handling**
   - ⚠️ Partial: ICE failure handling exists, but camera permission failures could be better handled

## Required Code Changes

### 1. Disable Camera Video by Default

**File**: `Frontend/src/pages/call/index.tsx`
- Change `getLocalMedia(true)` to `getLocalMedia(false)` (line 377)
- Change SDP offer to `offerToReceiveVideo: false` (line 420)

**File**: `Frontend/src/hooks/useWebrtcCall.ts`
- Change `requestMedia()` to request `video: false` (line 27)

### 2. Restrict Screen Sharing to Tutors

**File**: `Frontend/src/pages/call/index.tsx`
- Add `isTutor` check in `startScreenShare()` (line 430)
- Pass `isTutor` prop to `ControlBar` and conditionally show/disable screen share button

### 3. Add Bitrate/FPS Limits to Screen Share

**File**: `Frontend/src/pages/call/index.tsx`
- Add constraints to `getDisplayMedia()` call (line 435):
  ```typescript
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { max: 30 },
    },
    audio: false,
  });
  ```
- Add RTCRtpSender bitrate constraints after track is added

### 4. (Optional) Explicit Audio Bitrate

**File**: `Frontend/src/pages/call/index.tsx`
- Add RTCRtpSender constraints for audio track after adding to peer connection

## Summary

**Status**: ⚠️ Mostly correct, but camera video should be disabled by default and screen sharing should be tutor-only.

**Critical Issues**:
1. Camera video is enabled by default (should be audio-only)
2. Students can share screen (should be tutor-only)
3. Screen share has no bitrate/FPS limits

**Recommended Actions**:
1. Fix camera video default (change to audio-only)
2. Add tutor-only screen sharing restriction
3. Add bitrate/FPS limits to screen share
4. (Optional) Add explicit audio bitrate configuration
