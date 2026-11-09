/** Decode before the first shot; schedule audio synchronously in the shutter gesture. */
export function createShutterSound(url: string) {
  let context: AudioContext | undefined,
    buffer: AudioBuffer | undefined,
    bytes: Promise<ArrayBuffer> | undefined,
    disposed = false,
    prepared = false,
    offset = 0;
  const fallback = new Audio(url);
  fallback.preload = "auto";
  fallback.volume = 0.45;
  function preload() {
    if (bytes || disposed) return;
    fallback.load();
    bytes = fetch(url).then((r) => r.arrayBuffer());
    bytes.catch(() => {});
  }
  function prepare() {
    if (prepared || disposed) return;
    prepared = true;
    preload();
    try {
      context = new AudioContext({ latencyHint: "interactive" });
      bytes!
        .then((bytes) => context!.decodeAudioData(bytes))
        .then((decoded) => {
          if (!disposed) {
            buffer = decoded;
            if (typeof decoded.getChannelData === "function") {
              const channels = Array.from(
                { length: decoded.numberOfChannels },
                (_, i) => decoded.getChannelData(i),
              );
              let first = 0;
              while (
                first < decoded.length &&
                channels.every((channel) => Math.abs(channel[first]) < 0.002)
              )
                first++;
              offset = Math.max(0, first / decoded.sampleRate - 0.002);
            }
          }
        })
        .catch(() => {});
    } catch {
      /* Older browsers use the preloaded media element. */
    }
  }
  function unlock() {
    prepare();
    if (context?.state === "suspended") context.resume().catch(() => {});
  }
  return {
    preload,
    prepare,
    unlock,
    play() {
      if (disposed) return;
      unlock();
      if (context && buffer) {
        const source = context.createBufferSource(),
          gain = context.createGain();
        gain.gain.value = 0.45;
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(context.destination);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
        source.start(0, offset);
      } else {
        fallback.currentTime = 0;
        fallback.play().catch(() => {});
      }
    },
    dispose() {
      disposed = true;
      fallback.pause();
      if (context && context.state !== "closed")
        context.close().catch(() => {});
    },
  };
}
